#!/usr/bin/env node
// virta 构建：packages/viewer/dist/<view>.js 分图族运行期 bundle（CLI HTML 内联同款）+ cli bundle。
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("packages/viewer/dist", { recursive: true });
mkdirSync("packages/cli/dist", { recursive: true });

const VIEW_MAP = JSON.parse(readFileSync("packages/viewer/view-map.json", "utf8"));

/** per-view 入口源码：只打包本视图的 renderer + toModel + runtime。 */
export function viewEntrySource(view) {
  const m = VIEW_MAP[view];
  if (!m) throw new Error(`view-map 缺少 ${view}`);
  const isDoc = view === "report";
  return `import { boot } from './packages/viewer/src/runtime.js';
import { ${m.renderer} } from './packages/charts/src/${m.charts}.js';
import { ${m.toModel} } from './packages/data-engine/src/${m.adapter}.js';
const deps = {
  renderer: ${m.renderer},
  ${isDoc
    ? `buildDoc: (text, name) => ${m.toModel}(text, name),`
    : `adapt: (t) => ${m.toModel}(t.passthrough?.kind === 'echarts' ? { __echarts: t.passthrough.data } : t.rows),`}
};
boot(window.__VIRTA__, deps);
`;
}

for (const view of Object.keys(VIEW_MAP)) {
  const res = await build({
    stdin: { contents: viewEntrySource(view), resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "iife", platform: "browser", target: "es2020",
    write: false, minify: true, globalName: "__VIRTA_RT",
    define: { "import.meta.url": '"http://localhost/__bundle__/"' },
  });
  const js = res.outputFiles[0].text;
  writeFileSync(`packages/viewer/dist/${view}.js`, js);
  console.log(`build: viewer/${view}.js ${(js.length / 1024).toFixed(0)}KB`);
}

await build({
  entryPoints: ["packages/cli/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "packages/cli/dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@resvg/resvg-js", "papaparse", "read-excel-file", "esbuild"],
});
console.log("build: cli -> packages/cli/dist/cli.js");
