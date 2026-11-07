# ADR-0015 分发布局、运行模式与 CLI 成品增量

> 状态：已采纳 · 2026-11-07 · 依据 `docs/plan/PHASE_2C.md` §2（E1–E12）、§3

## 背景

2b 结束时 CLI 只能在仓库根目录用 `tsx` 跑源码：`dist/cli.js` 双 shebang（SyntaxError）、
内置资源按 cwd 解析、运行期脚本每次现场编译、内部包未发布导致 `npm install` E404、
没有 `--version`/`doctor`/技能安装能力（差距清单 R1–R6、G1–G8）。

## 决策

### 1. 单包分发（E1/E6）

只发布 `packages/cli`，包名 `virta`。全部 `@virta/*` 打进 `dist/cli.js` 并从
`dependencies` 移到 `devDependencies`；运行依赖仅 `@resvg/resvg-js`、`papaparse`、
`read-excel-file`（版本同 ADR-0007，精确锁定）。其余 7 个内部包保持 `private`。

tarball 布局（`files` 白名单限定）：

```text
dist/cli.js              单文件 bundle（单 shebang，esbuild banner 唯一负责）
dist/runtime/<view>.js   35 个 per-view 运行期脚本
dist/runtime/compose.js  compose 全视图运行期包
dist/fonts/              3 个内置字体 + metrics.json + OFL + SOURCE.md
dist/skill/SKILL.md      Agent 技能文件
dist/packs/              场景包（demo 数据源）
dist/samples/            内置样例（@samples/ 前缀目标）
README.md LICENSE CHANGELOG.md package.json
```

预算（E9，写进 test:perf / test:dist）：per-view 脚本 ≤150KB；`runtime/compose.js` ≤300KB；
tarball ≤3MB、解压 ≤8MB。

### 2. 两种运行模式（E3/E4/E5）

构建期注入 `__VIRTA_DIST__=true` 判定 dist 模式，不靠文件后缀猜测。

- `packages/cli/src/runtime-entries.ts`：`viewEntrySource`/`composeEntrySource`/
  `RUNTIME_BUILD_OPTIONS` 唯一来源，构建脚本与 source 模式共用（消除三份副本漂移）。
- `packages/cli/src/assets.ts`：资源定位唯一入口（`mode`/`runtimeScript`/`fontsDir`/
  `skillFile`/`packsDir`/`samplesDir`/`viewMap`/`expandSamples`/`VERSION`）。
  - dist：`assets.runtimeDir` 读预构建脚本，CLI 不 import esbuild；
  - source：按 `import.meta.url` 定位仓库根（不按 cwd），esbuild `await import` 动态加载，
    `resolveDir` 为仓库根。
- `design-system/fonts.ts`：`setFontsDir(dir)` 覆盖字体目录，CLI 启动时调用一次。
- 用户传入路径（输入、`--out`、`--spec`、compose 面板）仍按 cwd 解析。
- `gallery` 为仓库开发工具：dist 模式调用报 `INPUT_NOT_FOUND`（退出码 3），
  `guide`/`--help` 不列出（E12）。

### 3. 版本号（E7）

单一来源：`packages/cli/package.json` 的 `version`。dist 构建期 esbuild `define`
注入 `__VIRTA_VERSION__`；source 模式读 package.json。semver 0.x：回执结构和 CLI
参数的不兼容变更升 minor，写进 CHANGELOG "Breaking" 小节。

### 4. CLI 增量（E10/§3）

```text
virta --version | -v | version      纯文本 "virta 0.1.0"；--json → data={version,node,platform,mode}
virta doctor [--json]               环境自检：node/resvg/runtime/fonts/cjk(warn)/tmpWrite；
                                    任一 error → 退出码 1；data={mode,version,checks[]}
virta skill path                    输出内置 SKILL.md 绝对路径
virta skill install --dir <dir> [--force] [--json]
                                    写 <dir>/virta/SKILL.md + YAML front matter（name/description）；
                                    已存在未加 --force → INVALID_OPTION（退出码 2）；data={path,bytes}
@samples/<file>                     输入路径前缀 → 内置样例目录；回执 input 保留原值
virta demo <pack>|--all             场景包读内置 packsDir，与 cwd 无关；--out 默认 ./virta-demo
```

`guide --agent` 输出 `assets.skillFile` 内容（dist 下为 `dist/skill/SKILL.md`）。
`list --json`、`guide --json` 附 `version`；`guide --json` 附 `mode`。错误码不新增。

### 5. 分发渠道（E11）

推 `v*` tag → `release.yml` 全门禁 + 三平台 `test:dist` → GitHub Release 附件
`virta-<ver>.tgz` + `SHA256SUMS`；`-rc` tag 自动 `--prerelease`。本期不发布 npm。

## 理由

- 单包让使用者无需理解 monorepo；内部包边界仍由 `deps-direction.test.ts` 约束。
- 运行期预构建消除「运行环境必须有源码 + esbuild + 现场编译」；compose 全量包实测 228KB（gzip 80KB）。
- 入口源码与 esbuild 选项唯一来源 + T2 逐字节断言，保证 dist 与 source 产物不漂移。

## 影响

- `dist/cli.js` 可直接 `node`/`npm bin` 执行；`npm i -g <tarball>` 即装即用。
- `exports` 仅暴露 `./package.json`：virta 不提供库 API。
- `deps-direction` 白名单不变；cli 的 `dependencies` 只剩 3 个运行依赖。
