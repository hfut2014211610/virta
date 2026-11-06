# Virta

> Data in motion.

**Virta** 是一个离线优先、Agent 友好的可视化工具：读一份 CSV/JSON/XLSX（或 Markdown 文档），自动识别结构、推荐视图、给出中文洞察，产出**零依赖单文件 HTML**（离线可开、可交互）与 SVG/PNG 静态图。

- CLI：`virta` / `vt`（`packages/cli`，npm 包名 `virta`）
- 包命名空间：`@virta/*`（纯 ESM TypeScript monorepo）
- 上一代 Python 实现 `archive/legacy-vizscape/` 已冻结，仅作参考与 golden 数据来源

## 安装与构建

```bash
npm install          # 安装依赖（npm workspaces）
npm run build        # esbuild → packages/viewer/dist/<view>.js + packages/cli/dist/cli.js
npm run typecheck    # tsc -b 全仓类型检查
```

开发期直接跑源码（无需构建）：

```bash
npm run virta -- <命令>      # 等价于 tsx packages/cli/src/main.ts
```

安装 `virta`/`vt` 命令到 PATH：

```bash
npm run build && cd packages/cli && npm link
virta list && vt list
```

## 快速开始

```bash
# 1. 识别数据：列画像 + 候选视图打分 + 推荐 mapping
npm run virta -- inspect examples/basic/sample.csv --json

# 2. 校验 spec（失败时 suggestions 是可执行的 --set 命令）
npm run virta -- validate examples/basic/sample.csv --view sankey --json

# 3. 渲染：默认导出单文件 HTML；可加 svg,png
npm run virta -- render examples/basic/sample.csv --view auto --export html,svg,png --out out/

# 4. 本地打开 / 组合页 / 场景包 demo / 画廊
npm run virta -- preview out/sample-line-light.html
npm run virta -- compose examples/packs/retail/compose.json --export html --out out/
npm run virta -- demo retail --out out/demo
npm run virta -- demo --all --out out/demo          # 全部 5 个场景包 + 首页
npm run gallery                                    # → out/gallery/index.html（30 图族 × 5 场景真图缩略图）
```

stdin / 内联数据也可以：

```bash
cat examples/basic/sample.csv | npm run virta -- render - --format csv --view line --export png --out out/
npm run virta -- render --data '[{"月":"1月","额":120},{"月":"2月","额":240}]' --view bar --export html --out out/
```

常用参数：`--theme light|dark`、`--palette signal|patina|mono`、`--set <dotted.path>=<json>`（如 `--set variant=stacked --set state.sort=desc`）、`--spec <file.json>`（数组 mapping 请用 spec 文件）、`--scale 2`、`--font-file <ttf>`、`--json`（机器可读 envelope，错误码见 `virta guide`）。

## 30 个图族

`virta list` 查看全部视图与别名。legacy 对等 20 个：bar / line / matrix3d / bullet / report / scatter / pie / pie3d / funnel / radar / treemap / gantt / scatter3d / line3d / fishbone / heatmap / sankey / boxplot / sunburst / grid；本期新增 10 个：combo / rank（含 race）/ histogram / kpi / compare / cohort / tree / network / control / parallel；另有 spec 层 `facet` 小多图能力（bar/line/scatter/histogram/compare）。地图本期不做（§13 预留）。

## 给 Agent 用

`docs/agent/SKILL.md`（`virta guide` 内联输出同文）：inspect → 取第一候选 mapping → validate → render --json 的标准流程、Envelope 结构、退出码表、错误 hint 语义。`--json` 下 stdout 只有一个 envelope，日志全走 stderr。

Phase 2a（Agent 实用性）：`--as-of/--tz` 时间契约 + `derive`（dueStatus/dateDiff）、缺失值默认 gap（`options.missingValue`/`connectGaps`，step-middle 阶梯线）、grid/report 流式排版（HTML 语义 DOM + `--height auto`/静态分页 + 回执 `page/pages`）、compose 文档面板与面板级 `rendered/error`（失败 `ok:false`）、甘特 `baseline`/`actual` 三时间点（幽灵基线 + 滑期洞察）。示例：`examples/packs/delivery/deadline.*`（`npm run virta -- demo delivery`）。

## 场景包与画廊

`examples/packs/` 五个场景包（retail / saas / quality / delivery / finance），由 `npm run packs:gen` 确定性生成、`npm run packs:check` 字节级比对；`pack.json` 的 `expectTop`/`expectInsight` 驱动推荐与洞察断言。画廊缩略图为真实 PNG 渲染（`npm run gallery` 可重复生成），`npm run qa` 生成 30 图族 × 2 主题 × 3 配色的视觉 QA 矩阵到 `out/qa/`。

## 测试

```bash
npm test               # 单元/集成/golden 对拍（legacy model JSON 深比较）
npm run test:e2e       # CLI 端到端（envelope/退出码/错误码/compose/demo/gallery）
npm run test:visual    # Playwright 视觉回归（基线在 snapshots/，以 Linux CI 为准）
npm run test:perf      # 性能预算：10k 散点 <3s、100k grid <8s、bundle ≤150KB
npm run packs:check    # 场景包确定性比对
npm run qa             # 视觉 QA 矩阵 → out/qa/index.html
```

CI（`.github/workflows/ci.yml`）：npm ci → typecheck → test → build → e2e → visual。

## 仓库结构

```text
packages/contracts      契约 v1：ChartContract / ViewSpec / Envelope / 错误码
packages/design-system  token / 主题 / signal·patina·mono 配色 / OKLCH 色阶 / 子集字体
packages/data-engine    读取（CSV/JSON/XLSX·GB18030 回退）/ 画像 / 适配 / 推荐 / 校验 / 洞察（node 子路径做文件 IO）
packages/chart-core     Scene 图元 / 比例尺 / 确定性文字度量 / SVG·Canvas 渲染器 / 命中 / 补间 / 标签避让
packages/chart-skin     轴 / 图例 / 标注 / 数字格式 / 卡片框
packages/charts         30 图族 layout 渲染器（纯函数 → Scene）
packages/viewer         单文件 HTML 组装 / 交互运行期 / facet / compose 运行期
packages/cli            virta/vt：list/schema/inspect/validate/render/compose/demo/gallery/preview/guide
examples/basic|packs|edge-cases   样例 / 场景包 / 边界用例
scripts/golden|packs|fonts|qa     golden 导出 / 场景包生成器 / 字体管线 / QA 矩阵
archive/legacy-vizscape/        冻结的 Python 参考实现（勿改）
docs/adr|docs/plan|docs/agent     ADR 与实施笔记 / NEXT_PHASE 计划 / Agent 指南
```

依赖只能自上而下（contracts→…→cli），由 `test/deps-direction.test.ts` 强制。规则与里程碑状态见 `AGENTS.md`。
