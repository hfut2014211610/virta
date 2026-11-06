# ADR-0009 流式视图与 DOM 渲染器（flow views）

> 状态：已采纳 · 2026-11-06 · 依据 `docs/plan/PHASE_2A.md` §2 A1/A2、§4.1

## 决策

- `ChartContract` 新增 `flow?: boolean`；report、grid 声明 `flow: true`，内容高度由内容决定，不再受画布钳制。
- `FamilyRenderer` 新增可选 `measure(model, ctx) → { height: number; breaks: number[] }`：返回自然高度与可分页位置（标题/表格行边界）。`preferredHeight` 保留作行数驱动的兼容别名；flow 视图以 `measure` 为准。
- **A2（D8 的有限例外）**：flow 视图在 HTML 产物中用 **DOM** 渲染（语义化 `<table>`、`<a>`、`<h*>`），获得原生搜索/筛选/排序/粘性表头/可点链接/打印分页；SVG/PNG 继续走 Scene，二者共用同一 model 与 design token。图形类视图仍严格遵守 D8（交互与静态共用几何）。
- viewer 新增 `flow-doc.ts`（DocModel→DOM）与 `flow-table.ts`（GridModel→DOM：搜索 `state.query`、distinct≤30 列筛选 `state.filter`、点击表头排序、粘性表头、行数徽章、`link`/`tone` 角色）。
- grid 新角色：`link`（URL 列，配 `linkText` 选项指定显示列；仅 http(s)/mailto，其他协议去除并报 `LINK_UNSAFE`）与 `tone`（`danger|warn|ok|info|muted` + 中文同义词 高/中/低/严重/提示，给行着色）。
- Scene `Node` 新增可选 `link?: string`：`toSVG` 包一层 `<a href>`；PNG 端链接不可点为预期。`[文字](url)` 在 SVG 输出中只显示文字。
- CLI：`--size Wxauto` 用自然高度；PNG 超过 `spec.page.height`（默认 1600）按 `breaks` 拆 `<stem>-pN.png`；回执 `files[]` 新增 `page`/`pages`。`spec.page.break: auto|section|none`（默认 auto）。
- 打印：阅读态不限制图表区高度；`@media print` 隐藏抽屉/工具栏、展开全部行（打印一行"已忽略筛选"说明）、`thead` 每页重复、`tr{break-inside:avoid}`、章节标题 `break-after:avoid`。
- 行数 >20000 沿用预聚合；DOM 表格分批渲染（500 行/批，`requestIdleCallback`）。

## 约束与后果

- DOM/Scene 两路渲染允许存在细节偏差，但同一 model/token 下不得丢信息；视觉回归同时覆盖 HTML 阅读态与 SVG。
- ViewState 增量：`query?: string`、`filter?: Record<string, string[]>`（见 ADR-0004 增补）。
