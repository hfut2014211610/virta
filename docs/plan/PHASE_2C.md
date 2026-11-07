# Virta Phase 2c 详细设计与实施计划：成品化与团队分发

> 状态：待实施 · 编写：2026-11-07
> 位置：Phase 2b 已完成（M2b.6 收尾提交，CI 全绿），本期紧随其后。
> 输入：2026-11-07 第四轮审查（发布就绪审查）。证据在维护者本机的审查目录（不入库）。
> **信息安全前置（2026-11-07 已执行，见 §0.4）**：仓库删除重建，历史中的公司邮箱、内部项目名和本机路径已清除。此后所有提交和文档都必须遵守 §0.4。
> 读者：实施 Agent 与维护者。规则沿用 `NEXT_PHASE.md` §0（R1–R8、§0.3）和 `PHASE_2B.md` 对 R4 的修订（允许 fast-forward push），本文只写增量。
> **目标**：产出一个团队成员拿到即可安装使用的成品。在任意目录执行 `npm i -g <tarball>` 之后，`virta`/`vt` 命令和 Agent 技能都能直接用，不需要 clone 仓库、不需要构建。
> **对 D6 的修订**：`NEXT_PHASE.md` D6 写的是"暂不发布、`npm link` 本地使用"。本期改为：通过 GitHub Release 分发 tarball；包的结构按"可直接 `npm publish`"的标准做，但**本期不发布到 npm 公共仓库**（见 §9）。

---

## 0. 定位与边界

### 0.1 为什么要有 2c

功能和质量已经达到可用水平：7 个门禁全过，CI（含 Linux 视觉回归）全绿，2b 的 B1–B17 全部修复并有测试覆盖。

但**目前只能在仓库目录里用 `npm run virta -- …` 跑**。构建出的产物不能用，也不能脱离仓库安装（§1 的 R1–R6）。原因是所有测试都在仓库根目录用 `npx tsx packages/cli/src/main.ts` 运行，没有任何一项测试跑过构建产物，也没有换过工作目录。

2c 要解决三件事：

1. 产出**自包含**的安装包：只依赖 3 个 npm 运行依赖，运行时不需要源码、esbuild，也不依赖当前目录。
2. 补齐成品所需的外围能力：版本号、自检、Agent 技能安装、面向使用者的文档、许可证。
3. 用 CI 在三个平台上验证"打包 → 安装到空目录 → 运行"的完整链路，打 tag 后自动发布。

### 0.2 本期不做

- 不发布到 npm 公共仓库（包名 `virta` 在 2026-11-07 查询时 npmjs 上**未被占用**，公开发布时再确认），不做 MCP Server、Markdown 内嵌简报、地图，不加新图表。
- 不做单文件可执行程序（Node SEA / pkg）。理由：`@resvg/resvg-js` 是按平台分发的原生模块，打进单文件的收益小于维护成本。
- 不引入新的第三方依赖（R2）。构建脚本改由 `tsx` 运行，`tsx` 已经是 devDependency。

### 0.3 准入条件

- `git status` 中只允许出现他人的未跟踪目录 `.workbuddy-ai/`（R8）。
- §8 中标注"开工前确认"的事项已经有结论。
- `gh auth status` 正常，并且对 `hfut2014211610/virta` 有 Actions 和 Releases 的写权限。

### 0.4 信息安全规则（用户 2026-11-07 要求：内部信息不得泄露）

- **提交身份**：本仓库的所有提交，作者和提交者都只能是 `hfut2014211610 <26618462+hfut2014211610@users.noreply.github.com>`。实施 Agent 不修改 git config，每次提交显式传入：
  `git -c user.name=hfut2014211610 -c user.email=26618462+hfut2014211610@users.noreply.github.com commit …`
- **内容**：入库文件和提交信息中，不得出现公司名、公司邮箱、工号、内部项目名、内部系统名、内部网址，也不得出现维护者本机的绝对路径（盘符路径、`/Users/…`、`/home/…`）。需要引用外部材料时，写"外部使用反馈（不入库）"这类泛化描述。审查证据放在仓库外，文档只写"维护者本机审查目录（不入库）"。
- **两道检查**：
  1. **入库的通用检查**（M2c.0 交付）：`test/security/no-leak.test.ts` 扫描全部已跟踪的文本文件，禁止出现绝对本机路径，禁止出现 noreply 以外的邮箱地址（`example.com`、`example.org` 等保留域名除外）；同时检查 `git log` 中所有作者和提交者邮箱都是 noreply。
  2. **不入库的敏感词检查**：具体的内部名称不能写进仓库，否则检查规则本身就是泄露。由维护者在本机 `.git/hooks/pre-push` 中读取 `~/.config/virta/leak-patterns.txt`，扫描待推送提交的 diff 和提交信息，命中就拒绝推送。hook 和词表由维护者自己管理，实施 Agent 不创建、不读取词表内容。
- **违反时的处理**：发现已经推送了内部信息时，立即停止，并报告用户。不得自行 force push。

---

## 1. 差距清单（审查实测，均有复现）

### 1.1 发布阻断项

| # | 问题 | 现象 | 位置 |
|---|---|---|---|
| R1 | `dist/cli.js` 有两行 shebang | 任何命令都报 `SyntaxError: Invalid or unexpected token`。`npm link` 之后的 `virta`/`vt` 完全不可用 | `scripts/build.mjs:65` 的 banner 加了一行，`packages/cli/src/main.ts:1` 自己还有一行 |
| R2 | 内置资源按当前目录解析 | 在仓库外执行：`ENOENT …\packages\viewer\view-map.json`。用 tsx 直接跑源码也一样 | `render.ts:58`、`compose.ts:36`、`main.ts:288`（SKILL.md）、`main.ts:354`、`demo.ts:12`、`gallery.ts:14-88` |
| R3 | 构建版找不到字体 | `--export html` 和 `compose` 报 `ENOENT packages/cli/fonts/fraunces-light.ttf` | `design-system/src/fonts.ts:25`：`new URL('../fonts/', import.meta.url)` 打包后会指向 `cli.js` 旁边 |
| R4 | 每次渲染都要现场编译 | CLI 渲染时用 esbuild 编译 `./packages/*/src/*.ts`（`resolveDir: process.cwd()`），所以运行环境必须有源码和 devDependency。`build.mjs` 预构建的 `viewer/dist/*.js` 根本没有被 CLI 使用。入口源码有三份副本要靠手工同步 | `render.ts:62-98`、`compose.ts:40-60,257`、`build.mjs:16-38` |
| R5 | 不能独立安装 | 用 tarball 执行 `npm install` 报 `E404 @virta/chart-core@0.0.0`：内部包未发布，而且各包导出的是 `.ts` 源码 | `packages/*/package.json` |
| R6 | 没有 `--version` | 返回"未知命令"，退出码 2 | `main.ts`（`VERSION = '0.0.0'` 硬编码，见 `main.ts:15`） |

### 1.2 成品缺口

| # | 缺口 | 说明 |
|---|---|---|
| G1 | 没有 LICENSE | 仓库是公开的。没有许可证时默认保留所有权利，团队成员严格来说无权使用。字体的 OFL 声明已有，在 `design-system/fonts/` 下 |
| G2 | 版本与变更记录 | 版本号是 0.0.0，没有 CHANGELOG，也没有回执、CLI 不兼容变更的告知机制 |
| G3 | 只验证过 Linux | CI 只有 ubuntu，团队主要用 Windows。npm 在 Windows 上生成的 `.cmd` 启动脚本、路径分隔符、resvg 原生模块都没有在 CI 上验证过 |
| G4 | 文档面向开发者 | README 的"安装"一节是"clone 仓库、构建、`npm link`"。没有面向使用者的快速上手、Agent 接入和排障说明 |
| G5 | Agent 接入要靠仓库 | `guide --agent` 读的是仓库里的 `docs/agent/SKILL.md`。SKILL.md 没有 YAML front matter（`name`/`description`），不能直接作为 Devin、Claude、Codex 的技能安装 |
| G6 | 没有自检 | 用户环境出问题时（Node 版本、resvg 原生模块、Linux 缺中文字体导致 PNG 缺字）无从排查 |
| G7 | 内置样例依赖仓库 | `virta demo` 读当前目录下的 `examples/packs`。装好以后没有任何开箱即用的样例 |
| G8 | 视觉测试偶发失败 | `families.spec.ts` 中 rank-race 的 `beforeAll` 偶发 `Command failed: tsx render …`，单独执行能成功 |

---

## 2. 决策

| # | 决策 | 理由 |
|---|---|---|
| E1 | **单包分发**：只发布 `packages/cli` 这一个包，包名 `virta`。所有 `@virta/*` 都打进 `dist/cli.js`，并从 `dependencies` 移到 `devDependencies`。运行依赖只有 `@resvg/resvg-js`、`papaparse`、`read-excel-file` 三个，版本与 ADR-0007 一致，精确锁定。其余 7 个内部包保持 `private` | 使用者不需要理解 monorepo；内部包的边界由 `deps-direction.test.ts` 继续约束，不必对外暴露 |
| E2 | **运行期脚本预构建**：构建时产出 `dist/runtime/<view>.js`（35 个）和 `dist/runtime/compose.js`（包含全部视图）。**dist 模式下 CLI 只读这些文件，不 import esbuild** | 消除 R4。compose 全量包已实测：34 个视图合计 **228KB，gzip 后 80KB**，可以接受。预算见 E9 |
| E3 | **入口源码只保留一份**：新增 `packages/cli/src/runtime-entries.ts`，导出 `viewEntrySource(view, viewMap)`、`composeEntrySource(views, viewMap, flowOf)` 和 `RUNTIME_BUILD_OPTIONS`（esbuild 选项）。构建脚本改为 `scripts/build.ts`，用 `tsx` 运行并引用这个模块；`render.ts`、`compose.ts` 删除各自的副本 | 消除三份副本的漂移风险。esbuild 选项也只保留一份，保证两种模式的产物完全相同（T2 用测试锁定） |
| E4 | **两种运行模式**：<br>• **dist 模式**：`import.meta.url` 以 `.js` 结尾，资源全部从 `dist/` 读取；<br>• **source 模式**：以 `.ts` 结尾，也就是 tsx 跑源码，供开发和测试使用。资源从仓库目录读取（按 `import.meta.url` 定位仓库根，**不按 cwd**）；运行期脚本仍用 esbuild 现场编译，用 `await import('esbuild')` 动态加载，并且只在这个分支里加载 | 开发体验不变：改了 viewer 源码不用重新构建就能看到效果，现有测试也不用改。成品里没有 esbuild；在 cli bundle 中 esbuild 保持 external，而且 dist 模式永远不会执行到那个分支 |
| E5 | **资源定位只有一个入口**：新增 `packages/cli/src/assets.ts`，提供 `mode`、`runtimeScript(view \| 'compose')`、`fontsDir`、`skillFile`、`packsDir`、`samplesDir`、`viewMap`。`design-system/fonts.ts` 新增 `setFontsDir(dir)` 覆盖默认位置，CLI 启动时调用一次。用户传入的路径（输入文件、`--out`、`--spec`、compose 面板）仍然按 cwd 解析，规则不变 | 消除 R2、R3。用静态检查防止回退（T3） |
| E6 | **dist 目录布局**（tarball 里只有这些）：<br>`dist/cli.js`、`dist/runtime/*.js`、`dist/fonts/`（3 个 ttf、`metrics.json`、OFL 文本、`SOURCE.md`）、`dist/skill/SKILL.md`、`dist/packs/`（复制自 `examples/packs`，229KB）、`dist/samples/`（复制自 `examples/basic`，107KB），再加包根目录下的 `README.md`、`LICENSE`、`CHANGELOG.md`、`package.json`。`package.json` 中用 `files` 白名单限定 | 自包含；开箱即可运行 `virta demo retail` 和样例渲染。整包预计在 3MB 以内（预算见 E9） |
| E7 | **版本号单一来源**：`packages/cli/package.json` 的 `version`。dist 模式下，构建时通过 esbuild `define` 注入 `__VIRTA_VERSION__`；source 模式下读取 package.json。首个版本是 `0.1.0`，遵循 semver 0.x：回执结构和 CLI 参数的不兼容变更必须升 minor，并写进 CHANGELOG 的 "Breaking" 小节。根目录的 `package.json` 版本号不变（仍为 `private`） | 消除 R6、G2。回执中的 `version` 字段从此有意义 |
| E8 | **支持矩阵**：Node `>=22`（cli bundle 的 target 是 node22），平台为 Windows x64、macOS arm64/x64、Linux x64（与 resvg 预编译平台一致）。`package.json` 写 `engines`。CI 在 ubuntu、windows、macos 三个平台上跑 dist 冒烟 | 消除 G3 |
| E9 | **预算**：<br>• per-view 运行期脚本 ≤150KB（不变）<br>• `runtime/compose.js` ≤300KB（新增）<br>• tarball ≤3MB，解压后 ≤8MB（新增）<br>都写进 `test:perf` 和 `test:dist` | compose 实测 228KB，留出余量；包体积防止误把大文件打进去 |
| E10 | **新增 CLI 能力**（契约增量，写 ADR-0015）：`--version` / `-v` / `version`、`doctor`、`skill install`、`skill path`；`demo` 和 `render` 能引用内置样例。见 §3 | 消除 G5、G6、G7 |
| E11 | **分发渠道**：推送 `v*` tag 后，由 `release.yml` 跑全部门禁、打包，然后创建 GitHub Release，附件为 `virta-<ver>.tgz` 和 `SHA256SUMS`。团队安装命令：`npm i -g https://github.com/hfut2014211610/virta/releases/download/v<ver>/virta-<ver>.tgz`。3 个运行依赖从团队已配置的 npm 镜像下载（本机实测为 `registry.npmmirror.com`） | 仓库已公开，GitHub Release 不需要额外的基础设施；以后公开发布到 npm 时，包结构不用改 |
| E12 | `gallery` 和 `qa` 属于仓库开发工具，**在 dist 模式下不提供**：调用时报 `INPUT_NOT_FOUND`（退出码 3），hint 为"gallery 仅在源码仓库内可用：npm run gallery"；dist 模式下 `guide` 和 `--help` 也不列出它们 | gallery 依赖 `examples/gallery` 和 `edge-cases`，并且会写回仓库，不适合放进成品 |

---

## 3. 契约增量（ADR-0015）

```text
virta --version | -v | version        纯文本输出 "virta 0.1.0"；带 --json 时输出 envelope：data={version,node,platform,mode}
virta doctor [--json]                 逐项检查，任一 error 时退出码 1，只有 warn 时退出码 0
  检查项：
  node        process.versions.node >= 22                                    error
  resvg       能加载 @resvg/resvg-js，并渲染一个 1×1 的 SVG                     error
  runtime     dist/runtime 下 35 个视图脚本和 compose.js 都存在（source 模式：esbuild 可加载）  error
  fonts       3 个内置字体和 metrics.json 存在                                  error
  cjk         沿用 render.ts 的 fontFallbackOk 探测中文字形                      warn（hint：Linux 安装 fonts-noto-cjk，或使用 --font-file）
  tmpWrite    能在 os.tmpdir() 中写入文件                                       error
  data={mode,version,checks:[{id,status:'ok'|'warn'|'error',message,hint?}]}
virta skill path                      输出内置 SKILL.md 的绝对路径
virta skill install --dir <dir> [--force] [--json]
  写入 <dir>/virta/SKILL.md，文件开头加 YAML front matter：
    ---
    name: virta
    description: <固定文案：用 virta CLI 把 CSV/JSON/Excel/Markdown 数据渲染成离线交互 HTML 和 SVG/PNG 图表，包括推荐、校验和组合仪表盘>
    ---
  目标文件已存在且未加 --force 时：报 INVALID_OPTION（退出码 2），hint 提示加 --force
  data={path,bytes}
内置样例引用：输入路径以 "@samples/" 开头时，解析到 dist/samples（source 模式下为 examples/basic）
  例：virta render @samples/sample-multi.csv --export png
virta demo <pack>|--all               场景包从 assets.packsDir 读取，与 cwd 无关；--out 默认 ./virta-demo
```

- `guide --agent` 输出 `assets.skillFile` 的内容。dist 模式下这份文件就是 `dist/skill/SKILL.md`，由构建时从 `docs/agent/SKILL.md` 复制而来。
- `list --json` 和 `guide --json` 中加上 `version`，`guide --json` 中加上 `mode`。
- 错误码不新增。

---

## 4. 分项设计

### 4.1 构建（R1、R4，E2、E3、E6、E7）

- `scripts/build.mjs` 改为 `scripts/build.ts`，`npm run build` 改为 `tsx scripts/build.ts`，原有的 `--analyze` 保留。执行顺序：
  1. 清空 `packages/cli/dist/`。目前 dist 中残留着 `tsc` 产出的 `*.d.ts`、`*.js.map`（如 `render.js`、`main.js`），这些不能进 tarball。
  2. 构建 35 个 per-view 运行期脚本，写到 `packages/cli/dist/runtime/<view>.js`，同时也写一份到 `packages/viewer/dist/<view>.js`，让现有的 `test:perf` 路径继续可用；也可以把 perf 测试改为读新路径，二选一，在 IMPLEMENTATION_NOTES 中记录选择。
  3. 构建 `runtime/compose.js`：调用 `composeEntrySource(全部视图)`，其中 `flow` 标志在构建时通过 `getContract` 写死。
  4. 构建 cli bundle：
     - `banner` 保留 shebang，**删掉 `main.ts:1` 的 shebang**。理由：tsx 不需要它，而 bundle 需要的 shebang 由 banner 唯一负责。
     - `define: { __VIRTA_VERSION__: JSON.stringify(pkg.version), __VIRTA_DIST__: 'true' }`。
     - `external` 只包含 3 个运行依赖和 `esbuild`（只在 source 分支动态加载）。
  5. 复制资源：`design-system/fonts/*` → `dist/fonts/`，`docs/agent/SKILL.md` → `dist/skill/`，`examples/packs` → `dist/packs/`，`examples/basic` → `dist/samples/`。
  6. 构建完成后自检：`node dist/cli.js --version` 的退出码必须为 0，且输出与 package.json 的版本一致，否则构建失败。这一步用来拦住 R1 这类问题。
- 判断运行模式时优先用 `__VIRTA_DIST__`（构建时注入），不靠文件后缀猜测；source 模式下这个常量未定义，`typeof` 判断为 undefined。
- `packages/cli/package.json`：
  - 删除 `private`；
  - `version` 改为 `0.1.0`；
  - `bin` 不变；
  - 加 `files: ["dist", "README.md", "LICENSE", "CHANGELOG.md"]`、`engines: { node: ">=22" }`、`license`、`repository`、`description`、`keywords`；
  - `@virta/*` 移到 `devDependencies`；`exports` 删除，或改为 `"./package.json"`。这个包只提供命令行，不提供库 API；
  - 加 `prepack` 脚本，执行 `npm run build --prefix ../..`，或者明确要求在仓库根目录先构建，二选一并写进 CONTRIBUTING。
- 包根目录的 `README.md`、`LICENSE`、`CHANGELOG.md`：构建时从仓库根目录复制到 `packages/cli/`，并加进 `.gitignore`，避免同一份文档维护两份。

### 4.2 资源定位（R2、R3，E4、E5）

- `assets.ts`（参考写法）：

  ```ts
  declare const __VIRTA_DIST__: boolean | undefined;
  export const mode: 'dist' | 'source' = typeof __VIRTA_DIST__ !== 'undefined' && __VIRTA_DIST__ ? 'dist' : 'source';
  const here = dirname(fileURLToPath(import.meta.url));          // dist: <pkg>/dist；source: <repo>/packages/cli/src
  const repo = resolve(here, '../../..');
  export const assets = mode === 'dist'
    ? { fontsDir: join(here, 'fonts'), skillFile: join(here, 'skill/SKILL.md'), packsDir: join(here, 'packs'),
        samplesDir: join(here, 'samples'), runtimeDir: join(here, 'runtime') }
    : { fontsDir: join(repo, 'packages/design-system/fonts'), skillFile: join(repo, 'docs/agent/SKILL.md'),
        packsDir: join(repo, 'examples/packs'), samplesDir: join(repo, 'examples/basic'), viewMapFile: join(repo, 'packages/viewer/view-map.json') };
  export async function runtimeScript(key: string): Promise<string> { /* dist：readFileSync(runtimeDir/key.js)；source：动态 import esbuild + runtime-entries，并在内存中缓存 */ }
  ```

  - source 模式下 esbuild 的 `resolveDir` 改为 `repo`，不再用 `process.cwd()`。
  - dist 模式下 runtime 文件缺失时报 `INTERNAL`（退出码 1），hint 为"安装包不完整，重新安装或运行 virta doctor"。
- `fonts.ts`：新增 `setFontsDir(dir: string)`，用模块级变量覆盖 `fontsDirUrl`。`fontsDir()`、`fontPath()`、`loadMetrics()` 都改为优先使用覆盖值。`main.ts` 启动时调用 `setFontsDir(assets.fontsDir)`。浏览器侧不受影响。
- 替换所有 cwd 相对的内置资源引用（§1.1 R2 列出的位置）。`gallery.ts` 在 source 模式下也改为基于 `repo` 定位。
- `@samples/` 前缀在 `loadTable` 和 `readInput` 的入口统一展开，回执中的 `input` 字段保留用户写的原值。

### 4.3 新增命令（G5、G6、G7，E10、E12）

按 §3 实现。补充说明：

- `doctor` 的 cjk 探测复用 `render.ts` 中的 `fontFallbackOk`，把它导出给 doctor 使用，不要复制一份。
- `skill install` 的 description 文案写在 `packages/cli/src/skill.ts` 中，作为常量；同时更新 SKILL.md 正文：
  - 新增"安装与调用"一节：全局命令是 `virta`；在 Windows 上，复杂 spec 一律用 `--spec <file>`，不要在命令行内联 JSON（原因见 IMPLEMENTATION_NOTES 中 M2b.1 的排障记录）；
  - 说明内置样例的 `@samples/` 前缀；
  - 说明 `virta doctor`。
- 常见 Agent 的技能目录，只写在 README 中作为示例，CLI 不内置这些路径：
  - Devin、Codex 等使用 `~/.agents/skills` 的工具：`virta skill install --dir ~/.agents/skills`；
  - Claude Code：`--dir ~/.claude/skills`。
  - **要先核实**：写 README 前查阅各工具当前的官方文档，确认目录和 front matter 格式，查不到就不写。

### 4.4 文档与法务（G1、G2、G4）

- `LICENSE`：仓库根目录，使用 **MIT**（U2c-1），版权行为 `Copyright (c) 2026 hfut2014211610`，不写真实姓名和公司名。`packages/cli/package.json` 中写 `"license": "MIT"`，`author` 字段不写邮箱。字体继续使用 OFL，在 README 和 `dist/fonts/` 中保留 OFL 文本。
- `CHANGELOG.md`：采用 Keep a Changelog 格式，首条为 `0.1.0`，汇总 Phase 2 到 2c 的能力，并列出已知限制：地图未实现，PNG 中文依赖系统字体。
- `README.md` 改为**面向使用者**，结构如下：
  1. 一句话介绍和截图（截图取自画廊）；
  2. 安装：Release tarball 一行命令，以及 `virta doctor`；
  3. 5 分钟上手：`@samples` 渲染、`demo retail`、stdin 输入；
  4. Agent 接入：`skill install`，以及标准的 inspect → validate → render 流程；
  5. 图表目录：35 个视图的表格，与 `virta list` 一致，用测试锁定；
  6. 排障：Linux 中文字体、npm 镜像下载 resvg 失败、Windows 引号问题、HTML 离线和 CSP 说明；
  7. 升级与卸载。
- 原 README 中面向开发者的内容（构建、测试、目录结构、里程碑）移到 `CONTRIBUTING.md`。
- 新增测试 `test/docs/readme.test.ts`：README 中出现的视图 ID 集合必须等于 `VIEW_IDS`；README 中每条 `virta …` 示例命令都要在 dist 冒烟中执行一遍，具体做法是从 README 中按标记提取代码块。

### 4.5 CI 与发布（G3、G8，E8、E11）

- `ci.yml` 新增 job `dist`，`strategy.matrix.os: [ubuntu-latest, windows-latest, macos-latest]`，步骤为 `npm ci`、`npm run build`、`npm run test:dist`。现有的 `test` job 不变。
- `release.yml`：
  - 由 `push` 到 `tags: ['v*']` 触发；
  - 跑全部门禁：typecheck、test、build、e2e、perf、`test:dist` 三平台；
  - 校验 tag 与 `packages/cli/package.json` 的版本一致，不一致就失败；
  - 在 `packages/cli` 中执行 `npm pack`，生成 `SHA256SUMS`；
  - 用 `gh release create v<ver> virta-<ver>.tgz SHA256SUMS --notes-file <CHANGELOG 中本版本的一节>` 发布；
  - tag 中含 `-rc` 时加 `--prerelease`。
- G8：先找出 rank-race 失败的原因再修，不能简单地加重试。可疑点：多个 `beforeAll` 同时执行 `tsx`，并发写同一个输出目录或缓存；超时设置。查明后在 IMPLEMENTATION_NOTES 中写清楚根因。

---

## 5. 测试新增一览

| 层 | 新增 |
|---|---|
| T1 dist 冒烟 `test/dist/smoke.test.ts`<br>（新配置 `vitest.dist.config.ts`，新脚本 `npm run test:dist`，前置条件是已经构建） | 1. 在 `packages/cli` 中执行 `npm pack`；检查 tarball 文件清单只包含 E6 列出的内容，没有 `*.ts`、`*.map`、`*.d.ts`，体积不超过 E9 预算；`package.json` 中没有 `@virta/*` 依赖<br>2. 在**仓库外**的临时目录中执行 `npm i <tgz>`<br>3. 通过 npm 生成的启动脚本（Windows 上是 `node_modules/.bin/virta.cmd`）执行，并以临时目录作为 cwd，依次运行：`--version`、`doctor --json`、`guide`、`guide --agent`、`list --json`、`inspect @samples/sample-multi.csv --json`、`render @samples/sample-multi.csv --export html,svg,png --json`、stdin 输入 render、`demo retail --json`、`compose`（使用复制到临时目录的 compose.json 及其数据）、`skill install --dir <tmp>/skills --json` 以及重复安装时的冲突报错、`gallery` 报错<br>4. 每条命令：stdout 恰好是一个 JSON envelope（带 `--json` 时），退出码符合预期，回执中列出的文件都存在且 `bytes` 等于文件实际大小<br>5. 生成的 HTML 中有 CSP meta，并且不包含 `packages/` 或仓库绝对路径（防止开发路径泄漏） |
| T2 运行期一致 | 对 `bar`、`grid`、`gantt` 三个视图以及 compose：`dist/runtime/<key>.js` 必须与 source 模式在内存中编译的结果**逐字节相同** |
| T3 静态检查 | `packages/cli/src` 中：除 `assets.ts` 外不得出现 `join('packages`、`join('examples`、`join('docs`、`'packages/`、`'examples/`；不得出现静态的 `from 'esbuild'`；不得出现 `process.cwd()` 作为 esbuild 的 `resolveDir`。`main.ts` 第一行不得是 shebang |
| T4 浏览器 | 在 Playwright 中打开一份由 dist 模式生成的 HTML（取自 T1 的产物，或在 visual 中单独生成一份）：没有 pageerror，`window.__VIRTA__.modelHash` 与 source 模式的结果相同 |
| 单元 | `assets` 两种模式的路径解析；`setFontsDir`；`@samples/` 展开；`skill install` 的 front matter；`doctor` 各检查项（用桩模拟失败）；版本号注入 |
| perf | `runtime/compose.js` ≤300KB |
| docs | README 中的视图集合等于 `VIEW_IDS`；README 示例命令能执行 |

---

## 6. 里程碑

每个里程碑的结束条件与 2b 相同：DoD 通过 → 更新 IMPLEMENTATION_NOTES → 本地提交 → fast-forward push → `gh run watch` 确认 CI，并把结论写进 IMPLEMENTATION_NOTES。

### M2c.0 复现锚点

- [ ] 编写 T1 和 T3 的骨架。R1–R6 各对应一个当前失败的断言，用 `it.fails` 标记。
- [ ] 新增 `vitest.dist.config.ts` 和 `npm run test:dist`。
- [ ] 实现 §0.4 中入库的通用检查 `test/security/no-leak.test.ts`。

**DoD**：`npm run test:dist` 能运行，并且 R1–R6 的锚点都确认复现；`no-leak.test.ts` 通过。

### M2c.1 自包含产物（R1–R6）

- [ ] 实现 `runtime-entries.ts`、`scripts/build.ts`、`assets.ts`、`setFontsDir`；删除 `render.ts` 和 `compose.ts` 中的入口副本；dist 模式读取预构建脚本。
- [ ] 实现版本号注入和 `--version`；按 §4.1 调整 `package.json`，并清理 dist 中的残留文件。
- [ ] 实现 T2、T3；把 compose 预算加进 `test:perf`。
- [ ] 写 ADR-0015 的"分发布局与运行模式"部分；修订 ADR-0002（包架构：cli 是唯一发布单元）。

**DoD**：`npm run typecheck && npm test && npm run test:e2e && npm run build && npm run test:perf` 通过；`npm run test:dist` 在本机 Windows 上通过，R1–R6 锚点转为普通断言；在仓库外的目录执行 `npx --prefix <tmp> virta render @samples/sample-multi.csv --export html,png` 能成功。

### M2c.2 成品命令与技能（G5–G7）

- [ ] 实现 `doctor`、`skill install`、`skill path`、`@samples/` 前缀、demo 改读内置包、gallery 和 qa 在 dist 模式下报错。
- [ ] 更新 SKILL.md（安装与调用、Windows 引号、`@samples`、doctor）。
- [ ] 补全 ADR-0015 的 CLI 增量部分；把 T1 中这些命令的断言补齐。

**DoD**：T1 全部通过；`virta skill install --dir <tmp>` 生成的文件带合法的 YAML front matter（用测试解析校验）。

### M2c.3 文档与法务（G1、G2、G4）

- [ ] 添加 LICENSE（按 U2c-1 的结论），编写 CHANGELOG 0.1.0；重写 README，新建 CONTRIBUTING；实现 `test/docs/readme.test.ts`。

**DoD**：docs 测试通过；用 README 中的命令从零安装、跑上手示例，在 T1 中自动执行一遍并通过。

### M2c.4 CI 与发布流水线（G3、G8）

- [ ] 新增三平台 `dist` job、`release.yml`；修复 rank-race 偶发失败并写明根因。

**DoD**：push 后 CI 的 `test` 和三平台 `dist` 全部通过；连续 3 次 CI 中 rank-race 没有失败（可用 `workflow_dispatch` 重跑）。

### M2c.5 发布演练与试点

- [ ] 打 `v0.1.0-rc.1` tag，确认 `release.yml` 生成了 prerelease，附件齐全，SHA256 校验通过（需要 U2c-3 授权）。
- [ ] 在本机仓库外执行 `npm i -g <Release URL>`，运行 `virta doctor`，再把技能装到本机 Agent 的技能目录。
- [ ] 让 Agent 只依靠技能文档完成一次研发截止日报示例（`demo delivery` 加一次 compose），把问题和改进记进 IMPLEMENTATION_NOTES。如果 U2c-4 同意，再用研发截止日报的真实数据跑一遍。
- [ ] 修完演练中发现的问题后，打 `v0.1.0` tag，正式发布。

**DoD**：GitHub Release `v0.1.0` 存在，附件 `virta-0.1.0.tgz` 可以从 URL 安装；试点记录写进 IMPLEMENTATION_NOTES。

---

## 7. 风险

| 风险 | 对策 |
|---|---|
| 团队机器从 npm 镜像下载 resvg 原生包失败（公司网络或镜像不同步） | 有 `doctor` 检查；README 的排障一节写明如何切换镜像或使用离线 tarball；CI 三平台验证安装 |
| source 和 dist 两种模式的行为发生漂移 | 入口源码和 esbuild 选项各只有一份（E3）；T2 检查逐字节相同；T4 检查浏览器端的 modelHash |
| 打包遗漏资源，安装后才暴露 | 构建末尾自检（§4.1 第 6 步）；T1 在空目录中安装并跑全部命令；`doctor` 检查 runtime 和字体是否完整 |
| esbuild 被意外打进或要求安装 | T3 禁止静态 import；T1 检查 tarball 中没有 esbuild，且 dependencies 只有 3 项 |
| Windows 启动脚本或路径问题 | T1 通过 `.bin/virta.cmd` 执行，CI 中有 windows-latest |
| 后续提交重新带入内部信息 | 遵守 §0.4：固定提交身份、入库的通用检查、维护者本机的敏感词 pre-push hook |

---

## 8. 需用户确认

| # | 事项 | 默认建议 | 时机 |
|---|---|---|---|
| U2c-1 | 代码许可证 | **已定：MIT**（用户同意 MIT 或 Apache 均可，取 MIT：npm 生态最常见，条款最短） | 已确认 |
| U2c-2 | 公开仓库中的内部信息 | **已定：删除仓库重建**。保留里程碑提交，作者统一改为 noreply，历史中的内部名称和本机路径改为泛化描述；清理后重新公开。今后按 §0.4 执行 | 已执行 |
| U2c-3 | 打 tag 和创建 GitHub Release 属于对外发布动作，是否授权实施会话执行 | 授权打 `v0.1.0-rc.*`；正式版 `v0.1.0` 由用户确认后再打 | M2c.5 前 |
| U2c-4 | 试点是否使用研发截止日报的真实数据 | 先用 delivery 场景包，真实数据由用户提供后再跑 | M2c.5 前 |
| U2c-5 | 团队成员的主要平台 | 默认三平台都支持，以 Windows 为主 | 开工前，可沿用默认 |

---

## 9. 之后：公开发布（Phase 3 候选）

2c 完成后，包结构已经满足公开发布的要求。公开发布还需要：

1. 确认 npm 包名（`virta` 目前可用），开启 2FA，在 `release.yml` 中增加 `npm publish --provenance`；
2. 编写英文 README（可以只写简版）；
3. 增加 SECURITY.md（漏洞报告渠道）、issue 和 PR 模板；
4. 把画廊发布到 GitHub Pages，作为在线演示；
5. 根据 2c 试点的反馈，再决定 MCP Server 和 Markdown 内嵌简报（PHASE_2B §9）的优先级。
