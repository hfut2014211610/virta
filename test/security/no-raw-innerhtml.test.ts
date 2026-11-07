// ADR-0013 静态检查（C5/C6）：
// 1. packages/viewer/src 中 innerHTML / insertAdjacentHTML 的右侧只允许三种形式：
//    - `html` 模板标签（插值默认转义）
//    - raw(toSVG(…))   —— Scene 渲染产物，可信
//    - raw(inlineHtml(…)) —— docmd 行内渲染产物，可信
//    其余一律失败。例外须登记在 test/security/innerhtml-allowlist.txt 并写明理由。
// 2. 运行期不得出现 eval / new Function（含 esbuild 产物）。
// 3. 页面模板不得含内联 on*= 事件处理器（CSP 拦截前的源码层兜底）。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { singleFileHtml, composeHtml } from '@virta/viewer';
import { RUNTIME_BUILD_OPTIONS, viewEntrySource, type ViewMap } from '../../packages/cli/src/runtime-entries.js';

const SRC = join(__dirname, '../../packages/viewer/src');
const ALLOWLIST = join(__dirname, 'innerhtml-allowlist.txt');
const REPO = join(__dirname, '../..');
const VIEW_MAP = JSON.parse(readFileSync(join(REPO, 'packages/viewer/view-map.json'), 'utf8')) as ViewMap;

function* walk(dir: string): Generator<string> {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else if (d.name.endsWith('.ts')) yield p;
  }
}

const allowlist = new Set(
  (existsSync(ALLOWLIST) ? readFileSync(ALLOWLIST, 'utf8') : '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]!),
);

const RHS_OK = /^(?:html`|raw\(toSVG\(|raw\(inlineHtml\(|''|"")/;

describe('裸 innerHTML / insertAdjacentHTML 静态检查', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.replace(/\\/g, '/').split('/src/')[1]!;
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const no = i + 1;
      for (const m of line.matchAll(/\.innerHTML\s*=(?!=)\s*/g)) {
        const rhs = line.slice(m.index! + m[0].length);
        if (RHS_OK.test(rhs)) continue;
        const key = `${rel}:${no}`;
        if (!allowlist.has(key)) offenders.push(`${key}  innerHTML = ${rhs.slice(0, 60)}`);
      }
      for (const m of line.matchAll(/\.insertAdjacentHTML\(\s*['"][^'"]+['"]\s*,\s*/g)) {
        const rhs = line.slice(m.index! + m[0].length);
        if (RHS_OK.test(rhs)) continue;
        const key = `${rel}:${no}`;
        if (!allowlist.has(key)) offenders.push(`${key}  insertAdjacentHTML ${rhs.slice(0, 60)}`);
      }
    });
  }
  it('所有 HTML sink 都走 html`` / raw(toSVG|inlineHtml)', () => {
    expect(offenders, `未登记的裸 HTML 写入：\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('运行期禁用动态代码执行', () => {
  it('viewer/src 无 eval / new Function', () => {
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      expect(/\beval\s*\(|new\s+Function\s*\(/.test(src), file).toBe(false);
    }
  });
  it('esbuild 产物无 eval / new Function（抽样 bar/grid/report）', async () => {
    for (const view of ['bar', 'grid', 'report']) {
      const res = await build({
        stdin: { contents: viewEntrySource(view, VIEW_MAP), resolveDir: REPO, loader: 'ts' },
        ...RUNTIME_BUILD_OPTIONS,
      });
      const js = res.outputFiles[0]!.text;
      expect(/\beval\s*\(|new\s+Function\s*\(/.test(js), view).toBe(false);
    }
  });
});

describe('运行期禁用 Date.now（ADR-0012：时间一律走 spec.time 写回值）', () => {
  const DE = join(__dirname, '../../packages/data-engine/src');
  it('viewer/src 无 Date.now', () => {
    for (const file of walk(SRC)) {
      expect(/Date\.now\s*\(/.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
  it('data-engine 中只有 derive.resolveTime 允许 Date.now', () => {
    for (const file of walk(DE)) {
      if (/derive\.ts$/.test(file)) continue;
      expect(/Date\.now\s*\(/.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
});

describe('页面模板无内联事件处理器', () => {
  const payload = {
    spec: { version: 1, view: 'bar' } as never,
    table: { columns: [], rows: [], source: { name: 'x', format: 'csv' as const, rows: 0 } },
    insights: [], reason: '', counts: {},
    quality: { confidence: 'high', issues: [], mapping: {} },
  };
  const stripScripts = (h: string) => h.replace(/<script>[\s\S]*?<\/script>/g, '');
  it('singleFileHtml 无 on*=', () => {
    const h = stripScripts(singleFileHtml({ payload, svg: '<svg/>', runtimeJs: 'void 0', theme: 'light' }));
    expect(/\son[a-z-]+\s*=/i.test(h)).toBe(false);
    expect(h).toContain('Content-Security-Policy');
  });
  it('composeHtml 无 on*=', () => {
    const h = stripScripts(composeHtml({
      payload: { title: 't', layout: 'grid', theme: 'light', palette: 'signal', links: [], panels: [] },
      svgs: [], runtimeJs: 'void 0', theme: 'light',
    }));
    expect(/\son[a-z-]+\s*=/i.test(h)).toBe(false);
    expect(h).toContain('Content-Security-Policy');
  });
});
