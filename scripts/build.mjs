#!/usr/bin/env node
// virta 构建入口：esbuild 构建 viewer 分图族 bundle（packages/viewer/dist/<view>.js）与 cli。
// M3 起实现分图族 bundle；当前先构建 cli 占位产物，保证 npm run build 可用。
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("packages/viewer/dist", { recursive: true });
mkdirSync("packages/cli/dist", { recursive: true });

await build({
  entryPoints: ["packages/cli/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "packages/cli/dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@resvg/resvg-js", "papaparse", "read-excel-file"],
});

console.log("build: cli -> packages/cli/dist/cli.js");
