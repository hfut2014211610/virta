// virta 构建（Phase 2c · E1–E9）：
//   packages/cli/dist/runtime/<view>.js × VIEW_MAP + compose.js —— dist 模式唯一运行期来源
//   packages/viewer/dist/<view>.js —— 副本，供 test:perf 沿用既有路径
//   packages/cli/dist/cli.js —— 单包 bundle（@virta/* 全打进；3 个运行依赖 + esbuild 保持 external）
//   dist/fonts|skill|packs|samples 资源复制；README/LICENSE/CHANGELOG 从仓库根复制到包根
// 末尾自检 `node dist/cli.js --version`（拦 R1 类问题：shebang/入口错误当场失败）。
// --analyze：输出 esbuild metafile 到 out/bundle-meta/<view>.json 并打印各视图前 10 大模块（B15）。
import { execFileSync } from 'node:child_process';
import { analyzeMetafile, build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContract, type ViewId } from '@virta/contracts';
import { composeEntrySource, RUNTIME_BUILD_OPTIONS, viewEntrySource, type ViewMap } from '../packages/cli/src/runtime-entries.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'packages', 'cli');
const DIST = join(CLI, 'dist');
const RUNTIME = join(DIST, 'runtime');
const VIEWER_DIST = join(REPO, 'packages', 'viewer', 'dist');
const ANALYZE = process.argv.includes('--analyze');

const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf8')) as { version: string };
const VIEW_MAP = JSON.parse(readFileSync(join(REPO, 'packages', 'viewer', 'view-map.json'), 'utf8')) as ViewMap;
const flowOf = (v: string) => getContract(v as ViewId)?.flow === true;

// 1) 清空 dist：tsc 残留的 *.d.ts/*.js.map（render.js/main.js 等）不得进 tarball
rmSync(DIST, { recursive: true, force: true });
mkdirSync(RUNTIME, { recursive: true });
mkdirSync(VIEWER_DIST, { recursive: true });
if (ANALYZE) mkdirSync(join(REPO, 'out', 'bundle-meta'), { recursive: true });

const runtimeBuild = (contents: string) =>
  build({
    stdin: { contents, resolveDir: REPO, loader: 'ts' },
    ...RUNTIME_BUILD_OPTIONS,
    metafile: ANALYZE,
  });

// 2) per-view 运行期脚本
for (const view of Object.keys(VIEW_MAP)) {
  const res = await runtimeBuild(viewEntrySource(view, VIEW_MAP));
  const js = res.outputFiles[0].text;
  writeFileSync(join(RUNTIME, `${view}.js`), js);
  writeFileSync(join(VIEWER_DIST, `${view}.js`), js);
  console.log(`build: runtime/${view}.js ${(js.length / 1024).toFixed(0)}KB`);
  if (ANALYZE) {
    writeFileSync(join(REPO, 'out', 'bundle-meta', `${view}.json`), JSON.stringify(res.metafile));
    const top = Object.entries(res.metafile!.inputs)
      .sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10)
      .map(([p, i]) => `    ${(i.bytes / 1024).toFixed(1)}KB  ${p}`).join('\n');
    console.log(`  top10 ${view}:\n${top}`);
  }
}

// 3) compose 全视图运行期包（E2：dist 模式 compose 恒用它）
{
  const res = await runtimeBuild(composeEntrySource(Object.keys(VIEW_MAP), VIEW_MAP, flowOf));
  const js = res.outputFiles[0].text;
  writeFileSync(join(RUNTIME, 'compose.js'), js);
  console.log(`build: runtime/compose.js ${(js.length / 1024).toFixed(0)}KB`);
}

// 4) cli bundle：shebang 只由 banner 负责（main.ts 不得自带，R1）
await build({
  entryPoints: [join(CLI, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(DIST, 'cli.js'),
  banner: { js: '#!/usr/bin/env node' },
  define: { __VIRTA_DIST__: 'true', __VIRTA_VERSION__: JSON.stringify(pkg.version) },
  external: ['@resvg/resvg-js', 'papaparse', 'read-excel-file', 'esbuild'],
});
console.log('build: cli -> packages/cli/dist/cli.js');

// 5) 资源复制（E6 dist 布局）
cpSync(join(REPO, 'packages', 'design-system', 'fonts'), join(DIST, 'fonts'), { recursive: true });
mkdirSync(join(DIST, 'skill'), { recursive: true });
cpSync(join(REPO, 'docs', 'agent', 'SKILL.md'), join(DIST, 'skill', 'SKILL.md'));
cpSync(join(REPO, 'examples', 'packs'), join(DIST, 'packs'), { recursive: true });
cpSync(join(REPO, 'examples', 'basic'), join(DIST, 'samples'), { recursive: true });
for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) cpSync(join(REPO, f), join(CLI, f));
console.log('build: dist/{fonts,skill,packs,samples} + 包根文档复制完成');

// 6) 自检：产物必须能跑 --version 且与 package.json 一致（拦 R1 类问题）
let ver: string;
try {
  ver = execFileSync(process.execPath, [join(DIST, 'cli.js'), '--version'], { encoding: 'utf8' }).trim();
} catch (e) {
  console.error(`build 自检失败：node dist/cli.js --version 退出非零\n${(e as { stderr?: string }).stderr ?? e}`);
  process.exit(1);
}
if (ver !== `virta ${pkg.version}`) {
  console.error(`build 自检失败：期望 "virta ${pkg.version}"，实际 "${ver}"`);
  process.exit(1);
}
console.log(`build: 自检通过 ${ver}`);
