// T3 静态检查（PHASE_2C §5）：packages/cli/src 的资源引用与 esbuild 使用约束。
// 唯一例外是 assets.ts（内置资源定位的唯一入口，见 E5）。
// M2c.0 骨架：当前违反项以 it.fails 锚定复现，实现落地后转为普通断言。
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../packages/cli/src');
const EXEMPT = new Set(['assets.ts']);

interface Scanned { file: string; src: string }
const scanned: Scanned[] = readdirSync(SRC)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: f, src: readFileSync(join(SRC, f), 'utf8') }));

/** 命中行收集：返回 `${file}:${line} 摘录` 列表。 */
function hits(re: RegExp, exempt = EXEMPT): string[] {
  const out: string[] = [];
  for (const { file, src } of scanned) {
    if (exempt.has(file)) continue;
    src.split('\n').forEach((line, i) => {
      if (re.test(line)) out.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  return out;
}

describe('T3·内置资源定位唯一入口（E5）', () => {
  it.fails('除 assets.ts 外不得出现 packages/examples/docs 的 cwd 相对引用', () => {
    const bad = [
      // join('packages/…' | join('packages','…' | join('docs','…' 等
      ...hits(/join\(\s*['"](?:packages|examples|docs)[\\/']/),
      ...hits(/join\(\s*['"](?:packages|examples|docs)['"]\s*,/),
      // 裸字符串 'packages/x' 'examples/x' 'docs/x'
      ...hits(/['"](?:packages|examples|docs)\/[^'"]+['"]/),
    ];
    expect(bad, `cwd 相对内置资源引用：\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('T3·esbuild 只在 source 分支动态加载（E4）', () => {
  it.fails('packages/cli/src 不得静态 import esbuild', () => {
    const bad = hits(/(?:from|import)\s+['"]esbuild['"]/);
    expect(bad, `静态 esbuild 依赖：\n${bad.join('\n')}`).toEqual([]);
  });

  it.fails('esbuild resolveDir 不得为 process.cwd()', () => {
    const bad = hits(/resolveDir:\s*process\.cwd\(\)/);
    expect(bad, `resolveDir=cwd：\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('T3·入口单 shebang（R1）', () => {
  it.fails('main.ts 第一行不得是 shebang（bundle 的 shebang 由构建 banner 唯一负责）', () => {
    const main = scanned.find((s) => s.file === 'main.ts')!;
    expect(main.src.startsWith('#!'), 'main.ts:1 仍是 #!/usr/bin/env node').toBe(false);
  });
});
