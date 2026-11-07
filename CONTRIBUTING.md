# CONTRIBUTING · 开发者文档

面向维护者与贡献者。使用者请读 `README.md`。

## 安装与构建

```bash
npm install          # 安装依赖（npm workspaces）
npm run build        # tsx scripts/build.ts → packages/cli/dist/{cli.js,runtime/,fonts/,skill/,packs/,samples/}
npm run typecheck    # tsc -b 全仓类型检查
```

开发期直接跑源码（source 模式，无需构建）：

```bash
npm run virta -- <命令>      # 等价于 tsx packages/cli/src/main.ts
```

`npm pack`（packages/cli 下）会触发 `prepack` → `npm run build --prefix ../..` 自动重建。

## 快速开始（开发模式）

```bash
npm run virta -- inspect examples/basic/sample.csv --json
npm run virta -- validate examples/basic/sample.csv --view sankey --json
npm run virta -- render examples/basic/sample.csv --view auto --export html,svg,png --out out/
npm run virta -- preview out/sample-line-light.html
npm run virta -- compose examples/packs/retail/compose.json --export html --out out/
npm run virta -- demo retail --out out/demo
npm run gallery                                    # → out/gallery/index.html
```

stdin / 内联数据：

```bash
cat examples/basic/sample.csv | npm run virta -- render - --format csv --view line --export png --out out/
npm run virta -- render --data '[{"月":"1月","额":120},{"月":"2月","额":240}]' --view bar --export html --out out/
```

## 场景包与画廊

`examples/packs/` 五个场景包（retail / saas / quality / delivery / finance），由 `npm run packs:gen` 确定性生成、`npm run packs:check` 字节级比对；`pack.json` 的 `expectTop`/`expectInsight` 驱动推荐与洞察断言。画廊缩略图为真实 PNG 渲染（`npm run gallery` 可重复生成），`npm run qa` 生成视觉 QA 矩阵到 `out/qa/`。

## 测试

```bash
npm test               # 单元/集成/golden 对拍
npm run test:e2e       # CLI 端到端（envelope/退出码/错误码/compose/demo/gallery）
npm run test:dist      # dist 冒烟（前置 npm run build）：pack → 仓库外安装 → .bin 命令链路
npm run test:visual    # Playwright 视觉回归（基线在 snapshots/，以 Linux CI 为准）
npm run test:perf      # 性能预算：10k 散点 <3s、100k grid <8s、bundle ≤150KB、compose ≤300KB
npm run packs:check    # 场景包确定性比对
npm run qa             # 视觉 QA 矩阵 → out/qa/index.html
```

CI（`.github/workflows/ci.yml`）：npm ci → typecheck → test → build → e2e → visual；
`dist` job 三平台（ubuntu/windows/macos）跑 build + test:dist。
`release.yml`：推 `v*` tag → 全门禁 → GitHub Release（tgz + SHA256SUMS）。

## 仓库结构

```text
packages/contracts      契约 v1：ChartContract / ViewSpec / Envelope / 错误码
packages/design-system  token / 主题 / signal·patina·mono 配色 / OKLCH 色阶 / 子集字体
packages/data-engine    读取（CSV/JSON/XLSX·GB18030 回退）/ 画像 / 适配 / 推荐 / 校验 / 洞察（node 子路径做文件 IO）
packages/chart-core     Scene 图元 / 比例尺 / 确定性文字度量 / SVG·Canvas 渲染器 / 命中 / 补间 / 标签避让
packages/chart-skin     轴 / 图例 / 标注 / 数字格式 / 卡片框
packages/charts         图族 layout 渲染器（纯函数 → Scene）
packages/viewer         单文件 HTML 组装 / 交互运行期 / facet / compose 运行期
packages/cli            virta/vt：唯一发布单元（ADR-0015 单包分发）
examples/basic|packs|edge-cases   样例 / 场景包 / 边界用例
scripts/golden|packs|fonts|qa     golden 导出 / 场景包生成器 / 字体管线 / QA 矩阵
archive/legacy-vizscape/        冻结的 Python 参考实现（勿改）
docs/adr|docs/plan|docs/agent     ADR 与实施笔记 / 计划 / Agent 指南
```

依赖只能自上而下（contracts→…→cli），由 `test/deps-direction.test.ts` 强制。规则与里程碑状态见 `AGENTS.md`。

## 发布

版本号单一来源：`packages/cli/package.json` 的 `version`（semver 0.x；回执/CLI 不兼容变更升 minor 并写 CHANGELOG Breaking）。发布流程见 `docs/plan/PHASE_2C.md` §4.5 与 `.github/workflows/release.yml`。
