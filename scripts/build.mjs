#!/usr/bin/env node
// virta 构建：packages/viewer/dist/<view>.js 分图族运行期 bundle（CLI HTML 内联同款）+ cli bundle。
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("packages/viewer/dist", { recursive: true });
mkdirSync("packages/cli/dist", { recursive: true });

// 分图族 bundle：入口共用 runtime.ts，按视图产出文件（M3 bar/line；新图族在 charts 注册即自动覆盖）。
const VIEWS = ["bar", "line"];
for (const view of VIEWS) {
  const res = await build({
    entryPoints: ["packages/viewer/src/runtime.ts"],
    bundle: true, format: "iife", platform: "browser", target: "es2020",
    write: false, minify: true, globalName: "__VIRTA_RT",
    define: { "import.meta.url": '"http://localhost/__bundle__/"' },
  });
  const js = res.outputFiles[0].text + "\n__VIRTA_RT.boot(window.__VIRTA__);";
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
