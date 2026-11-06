# Virta Phase 2a 详细设计与实施计划：Agent 实用性补强（长内容、时间契约、缺失值、组合文档、计划与实际）

> 状态：待实施 · 编写：2026-11-05
> 位置：插在 Phase 2（`docs/plan/NEXT_PHASE.md` M0–M8）之后。M9（legacy 归档）只取决于用户确认对等清单，与本期互不阻塞。
> 输入：外部使用反馈《Virta 需求建议》（不入库）（研发截止日报的真实使用反馈：69 单、11 人、6 个指标）
> 读者：实施 Agent 与维护者。§0 规则沿用 `NEXT_PHASE.md` §0（R1–R8、§0.3），本文只写增量。

---

## 0. 定位与边界

### 0.1 为什么要有 2a

Phase 2 已具备 KPI、条形图、甘特图、报告页、组合页和 SVG/PNG 导出，真实日报也已经用上。但有 5 类问题，目前只能靠外层脚本手写 HTML 来绕开：

1. 长报告、长明细表会被截断。
2. 没有"报告时刻"和时区的概念，截止状态判断无法复现。
3. 时序数据缺失的值被自动补成 0，图上出现伪造的观测点。
4. 组合页里的 report 面板实际渲染不出来。
5. 甘特图无法表达"基线截止 / 当前截止 / 实际完成"三个时间点。

另外收录一个用户反馈的缺陷：折线图阶梯样式的最后一个点没连上（F7）。

2a 的目标是把这些能力收回到 Virta 里，让 Agent 不需要再写外层展示适配。

### 0.2 本期不做（与需求文档"源码依据与边界"一致）

- 不做研发管理平台、任务平台等业务数据连接器，不做业务截止口径对账，不做定时发送。这些属于调用方的领域逻辑。
- 不做 PDF 导出（需要新依赖）。打印走浏览器 `@media print`。
- 不做地图（仍按 `NEXT_PHASE.md` §13 搁置）。
- 不引入任何新的第三方依赖。时区计算只用 `Intl.DateTimeFormat`，它在 Node 和浏览器里都可用，符合同构约束 D7。

### 0.3 准入条件

- Phase 2 的 M8 已经完成并提交，`git status` 干净。当前工作区里 `packages/cli/src/{compose,main}.ts` 的修改和 `demo.ts`、`gallery.ts` 都是 M8 在途改动，2a 必须等它们落地后再开工（R8）。
- 已读本文全部内容、`NEXT_PHASE.md` 的 §4（契约）、§5.5–5.8，以及需求文档原文。

---

## 1. 现状核对（源码证据，2026-11-05 实读）

| # | 需求 | 现状与证据 | 结论 |
|---|---|---|---|
| F1 | 长报告和长表流式排版 | `packages/viewer/src/runtime.ts:63-64` 把画布高度钳制在 `min(640, max(360, 0.58×视口高))`。`packages/charts/src/b3.ts` 的 `reportRenderer` 在 `y > plot.h - 30` 时直接 `break`，同时只取前 8 个指标、每张表前 30 行；`gridRenderer` 按 `plot.h` 计算 `maxRows`，并显示"共 N 行，显示前 M"。静态导出固定为 `size`（默认 1200×675） | 长内容**必然截断**，在 HTML、SVG、PNG 三端都会发生 |
| F2 | 报告里的链接 | `docmd.ts` 的 `inlineHtml` 会生成安全的 `<a href>`，但 `reportRenderer` 把 `bt.text` 原文写进 SVG 的 `text` 节点，结果显示的是 `[T-1](url)` 这串源码，链接丢失。grid 没有链接角色 | 链接在**所有输出里都不可用** |
| F3 | `asOf` 与时区 | 全仓只有 `data-engine/src/families/gantt.ts:13` 用到 `Date.now()`，取的是 `floor(Date.now()/86400000)`，也就是 **UTC 日**。北京时间 00:00–08:00 之间"今日线"会落在前一天。契约里没有 asOf/tz 字段，日期只精确到天，没有"截止日按当天末时刻计"的规则 | 无法复现；有时区 bug |
| F4 | 缺失值补 0 | `contracts/src/families/line.ts:48` 的 inference 写明"缺失/NA 按 0 计并警告"；`barline.ts:132` 用 `pyInt(g[lab] ?? 0)` 实现。`BarlineSeries.values` 的类型是 `number[]`，表达不了"未观测" | 会**伪造观测点**；model 类型需要扩展 |
| F5 | 组合页里的 report 面板 | `cli/src/compose.ts:45-46` 给 report 注入的是 `buildDoc` 而不是 `adapt`；`viewer/src/runtime-compose.ts:62` 对所有面板统一调用 `view.adapt(ft)`。`adapt` 不存在会抛 TypeError，被 catch 后显示成"筛选后无数据"。面板高度固定为 `width×0.56` | CLI 返回成功，**但 HTML 里这个面板是坏的**；错误文案还会误导排查 |
| F6 | 计划与实际 | gantt 契约只有一组 `start/end` 加 `progress/status`（`contracts/src/families/gantt.ts`），而且 `end` 的别名里同时包含 `due/deadline/截止日期/完成日期`，"计划截止"和"实际完成"会被混到同一个字段里 | 需要新的角色，并收紧 `end` 的别名 |
| F7 | 折线阶梯样式最后一个点没连上（用户反馈） | 实际渲染 `sample-multi.csv` 和 `sample-combo.csv` 后核对，有三处问题：① **combo**：`charts/src/t1.ts:65-66` 生成的路径以 `M<x> V<y>` 开头，`M` 后面只有一个坐标，不符合 SVG 语法，整条阶梯线**完全不显示**（PNG 中只剩标记点）。② **line**：`charts/src/line.ts:20-23` 在下一个点处才跳变（step-after），而 legacy `line-basic` 是在两点中间跳变（step-middle）。两者语义不一致，属于对等偏差。step-after 下最后一个点没有自己的水平段，只有一段竖线接到标记点，标记点外圈的底色描边又在交接处压出一道缝，看起来像断开。③ **legacy**：`line-basic/template.html:140` 的循环只画到最后一个中点，最后半格水平段缺失，这是真断开。legacy 冻结（R1），不修 | 统一阶梯路径的生成，补全首尾两个半格，并加 SVG 路径语法检查 |

实施第一步（M2a.0）要先把 F1–F7 各写成一个**失败的测试**，确认能复现，再开始修。

---

## 2. 决策

| # | 决策 | 理由 |
|---|---|---|
| A1 | 新增**流式视图**的概念：report、grid 声明 `flow: true`，内容高度由内容本身决定，不再受画布钳制 | 长内容是这类视图的本质特征，不应当让它适配固定画布 |
| A2 | 流式视图在 **HTML 里用 DOM 渲染**（语义化的 `<table>`、`<a>`、`<h*>`），在 **SVG/PNG 里继续用 Scene**，高度自动，并支持分页 | 搜索、筛选、粘性表头、可点击链接、打印分页都是 DOM 的原生能力，在 SVG 里重新实现成本高且效果差。这是对 D8（交互版和静态版共用同一份几何）的**有限例外**，只适用于 `flow` 视图；图形类视图仍然严格遵守 D8。写入 ADR-0008 |
| A3 | ViewSpec 新增 `time` 段：`asOf` 和 `tz` 两个字段。CLI 在缺省时把当前时刻和系统时区**解析后写回**回执里的 `spec` | 有了它，同一份数据加同一份 spec 必然得到相同结果，重放可以复现 |
| A4 | 只有日期的值按角色语义落到具体时刻：截止类角色取**当天 23:59:59.999（tz）**，开始类角色取当天 00:00 | 对应需求里"11/05 截止的任务在 11/05 17:00 算今日待交，11/06 00:00 才算超期" |
| A5 | 新增通用的**派生列**（`spec.derive`），本期提供 `dueStatus` 和 `dateDiff` 两种 | 截止状态和偏差天数在 grid、kpi、bar、gantt 里都要用，放在适配之前统一计算，避免每个图族各算一遍。只提供通用规则，不包含任何业务口径 |
| A6 | 缺失值策略做成选项 `options.missingValue = gap | zero`，时序类视图**默认 `gap`**；golden 对拍在 `cases.json` 里显式指定 `zero` | 默认不伪造数据。legacy 对等已经在 M4 确认过，golden 用显式参数锁定旧行为，不会被破坏 |
| A7 | 统一适配入口 `adaptInput(input, view, spec)`，供 render、compose CLI 和 compose 运行期共用。输入可以是表格，也可以是文档 | 从根上消除 F5 这类"CLI 和运行期各走一套逻辑"的分叉 |
| A9 | 阶梯线统一用 **step-middle**（与 legacy 交互一致），首尾各补半格：从第一个点出发，在每两个相邻点的中点跳变，最后水平延伸到最后一个点。line、combo 和面积填充共用 chart-core 中的同一个路径生成函数 | 修复 F7，并消除各图族各写一套路径的分叉；顺带满足 §4.3 缺口分段的需要 |
| A8 | gantt 新增 `baseline`（基线截止）和 `actual`（实际完成）两个角色；`end` 的别名去掉 `完成日期`。`actual` 的别名**禁止**包含"更新时间/modified/updated" | 三个时间点各占一个字段，不混装；缺少实际完成时间就标"未知"，不能拿更新时间顶替 |

---

## 3. 契约增量（`@virta/contracts`，全部为可选字段，向后兼容）

```ts
// ViewSpec 增量
export interface ViewSpec {
  // ...v1 原有字段不变
  time?: {
    asOf?: string;            // ISO 8601，必须带时区偏移或 Z，如 '2026-11-05T17:00:00+08:00'
    tz?: string;              // IANA 时区，如 'Asia/Shanghai'；缺省 = 系统时区（CLI 解析后写回）
    weekStart?: 1 | 7;        // 默认 1（周一）
    workdays?: number[];      // 默认 [1,2,3,4,5]
    holidays?: string[];      // 'YYYY-MM-DD'，不计入工作日
    extraWorkdays?: string[]; // 调休上班日
  };
  derive?: Derive[];
  page?: { height?: number; break?: 'auto' | 'section' | 'none' };  // 流式视图的静态分页，默认 auto
}

export type Derive =
  | { type: 'dueStatus'; due: string; done?: string; soonWorkdays?: number; as?: string }
    // 输出值固定为：done | done-late | overdue | due-today | due-soon | upcoming | unknown
    // done 列为空 → 未完成；due 列为空或无法解析 → unknown；as 缺省为 '截止状态'
  | { type: 'dateDiff'; from: string; to: string; unit?: 'day' | 'workday'; as?: string };
    // to − from，任一端为空 → null（不补 0）

// RoleSpec 增量：日期角色的时刻语义
export interface RoleSpec { /* ... */ instant?: 'start' | 'end' }   // 只有日期时，取当天起点或末时刻

// ChartContract 增量
export interface ChartContract { /* ... */ flow?: boolean }   // 流式视图：内容高度不受画布钳制

// QualityCode 增量
//   'TZ_ASSUMED'      未给 tz，按系统时区处理（info）
//   'ASOF_ASSUMED'    未给 asOf，按当前时刻处理（info，回执 spec 里已写回）
//   'GAP_VALUES'      gap 模式下未观测点的数量（info；zero 模式仍用 MISSING_VALUES warn）
//   'LINK_UNSAFE'     不安全的链接协议已去除（warn）
// ErrorCode 增量
//   'INVALID_TIME'    asOf 或 tz 无法解析（USAGE，退出码 2）
// InsightKind：复用 'gap'（偏差）、'target'（截止达成）；不新增
```

**计算口径（写成单元测试）**

- `dueStatus`：先把 `due` 按 A4 解析为时刻 D，把 `asOf` 解析为时刻 A。
  - 已完成：`done ≤ D` → `done`，否则 → `done-late`。
  - 未完成：
    - `A > D` → `overdue`
    - D 与 A 在 tz 下是同一天 → `due-today`
    - D 落在 A 之后的 `soonWorkdays` 个工作日内（默认 3）→ `due-soon`
    - 其余 → `upcoming`
- 工作日由 `workdays`、`holidays`、`extraWorkdays` 共同决定。全部用 tz 下的"墙上日期"计算，不依赖进程的 `TZ` 环境变量。
- 时区换算：实现 `zonedParts(instant, tz)` 和 `fromZoned(y, m, d, h, mi, s, tz)`，基于 `Intl.DateTimeFormat(...).formatToParts`，迭代修正偏移；夏令时的跳变和重叠用单元测试覆盖（`America/New_York`）。

---

## 4. 分项设计

### 4.1 长内容流式排版（P0）

**chart-core / charts**
- `FamilyRenderer` 新增可选方法 `measure(model, ctx) → { height: number; breaks: number[] }`，返回自然高度和可分页的位置（标题、表格行之间）。`layout` 在 `flow` 视图下使用 `ctx.height = measure().height`。
- `reportRenderer`：
  - 去掉 `y > plot.h` 的截断、指标的 8 个上限和表格的 30 行上限。
  - 文字改为按 `measureText` 换行。现在是按字符数硬切，中英混排时会溢出。
  - `[文字](url)` 只显示文字部分。SVG 里输出 `<a href>`，这需要在 Scene 中新增 `link?: string` 节点属性，由 `toSVG` 包一层 `<a>`；PNG 无法点击，属于预期。
- `gridRenderer`：静态导出按 `page.height` 分页，每页重复表头；单页 SVG 也可以超长（`page.break = 'none'`）。

**viewer（HTML，A2）**
- 新增 `flow-doc.ts` 和 `flow-table.ts`：用 DOM 渲染 DocModel 和 GridModel。正文直接使用 `inlineHtml` 已经转义好的安全 HTML，不重复实现。
- 表格交互：
  - 顶部搜索框，对全部列做子串匹配，结果同步到 `state.query`。这是 ViewState 的新增字段，需要记入 ADR。
  - 列筛选下拉：对 `distinct ≤ 30` 的类目列自动生成，写入已有的 `state.filter`。
  - 点击表头排序。
  - 粘性表头。
  - 行数徽章："显示 12 / 69 行"。
- 新增 grid 角色：
  - `link`：URL 列，使对应的 `label` 列（或 `linkText` 选项指定的列）渲染为链接。只允许 `http(s)` 和 `mailto`，其他协议去掉链接并报 `LINK_UNSAFE`。
  - `tone`：取值为 `danger | warn | ok | info | muted`，以及中文同义词"高/中/低/严重/提示"，用来给行着色。无法识别的值不着色，并报一条 info。
- 首屏：report 先显示指标卡和目录，表格在其后。阅读态不再限制图表区高度，页面自然滚动。
- 打印：`@media print` 隐藏抽屉和工具栏，展开全部行（忽略当前筛选，并打印一行"已忽略筛选"的说明），`thead { display: table-header-group }` 让每页重复表头，`tr { break-inside: avoid }`，章节标题 `break-after: avoid`。

**CLI**
- `render` 遇到流式视图时：
  - `--size` 的高度可以写成 `auto`，此时 SVG 使用自然高度。
  - PNG 超过 `page.height`（默认 1600）时按 `breaks` 拆成多页，输出 `<stem>-p1.png`、`<stem>-p2.png`……
  - 回执 `files[]` 逐页列出，并新增 `page`、`pages` 字段（属于回执的增量，需要记入 ADR）。

### 4.2 `asOf` 与时区（P0）

- data-engine 新增 `time/zoned.ts`（时区换算）、`time/workday.ts`（工作日计算）和 `derive.ts`（派生列）。派生列在 `adaptInput` 开头执行，生成的新列进入 `Table.columns`，之后可以被 mapping 引用，也能被 inspect 看到。
- `gantt` adapter：用 `time.asOf` 和 `tz` 计算今日线，修掉 F3 的 UTC bug。没有 `asOf` 时用 CLI 写回的值。浏览器打开旧 HTML 时也使用 payload 里固化的 asOf，**不在打开时取当前时间**。
- 叙事层：只要 spec 里有 `time.asOf`，标题区和静态卡片的脚注都显示"数据截至 2026-11-05 17:00（Asia/Shanghai）"。
- CLI：新增 `--as-of <ISO>` 和 `--tz <IANA>` 两个参数，等价于 `--set time.asOf=…` 和 `--set time.tz=…`。无法解析时报 `INVALID_TIME`，hint 中给出合法示例。
- `inspect`：识别到截止类列（通过 gantt 的 `end`/`baseline` 别名）时，在候选结果中附带 `derive` 建议，例如 `--set derive=[{"type":"dueStatus","due":"截止日期","done":"实际完成"}]`。
- 确定性：同一份数据加同一份 spec（含 asOf 和 tz），分别在 `TZ=UTC` 和 `TZ=Asia/Shanghai` 两个进程环境下输出，SVG 必须**逐字节一致**。

### 4.3 缺失值不补 0（P1）

- 契约：line、combo、control、compare、kpi（迷你趋势线）、rank 新增选项 `missingValue: gap | zero`（默认 `gap`）和 `connectGaps: boolean`（默认 false）。bar 也新增 `missingValue`，`gap` 时不画柱、不显示标签。
- model：`BarlineSeries.values` 改为 `(number | null)[]`。各渲染器、洞察、tooltip、y 轴值域计算都要跳过 null；tooltip 显示"未观测"。
- 语义：
  - 长表里某个 (x, series) 组合**没有行**，或者单元格为空，都算未观测。
  - x 轴取所有系列的并集，所以计划线可以延伸到未来日期，而实际线停在最后一个观测日。
  - 中间缺失时，线在缺口处断开；只有开启 `connectGaps` 才连起来，而且连接段画成虚线以示区别。
- 洞察：trend、change、peak 只基于真实观测计算。观测点少于 2 个时不输出趋势。
- 契约 inference 文案改为"缺失/NA 默认不绘制（gap），可设 `options.missingValue=zero` 恢复旧行为"。
- golden：`scripts/golden/cases.json` 中 line、bar 系列的用例显式加上 `spec.options.missingValue = 'zero'`，原有对拍结果保持不变。

**阶梯线修复（F7 / A9，与缺口分段一起实现）**
- chart-core 新增 `linePath(points: ({ x: number; y: number } | null)[], style: 'smooth' | 'straight' | 'step', opts?: { connectGaps?: boolean }) → string[]`。null 表示未观测点；返回值按缺口切成多段子路径，用于描边。面积填充基于同样的分段闭合。
- step 的生成规则：
  - 每段子路径从 `M x0 y0` 开始；
  - 对每个 i ≥ 1，令 `mx = (x[i-1] + x[i]) / 2`，依次画 `H mx`、`V y[i]`；
  - 最后补一段 `H x[last]`。
  - 只有一个点的子路径不画线，只保留标记点。
- 删除 `charts/src/line.ts` 里的 `linePath` 和 `charts/src/t1.ts:65-66` 里的内联阶梯拼接，两处都改为调用 chart-core 的实现。
- 标记点外圈的底色描边保持不变：用 step-middle 后，每个点两侧都有水平段穿过，不会再出现末端的缝。

### 4.4 组合页原生支持 report（P1）

- data-engine 新增 `adaptInput(input: { table?: Table; doc?: string }, view, spec) → { model, quality, insights, counts }`。render.ts、compose.ts 和 viewer 的运行期全部改为调用它，删除 compose.ts 里对 report 的特判。
- `ComposeViewEntry` 改为统一的 `{ adapt(input) }`。运行期的 `renderPanel` 分三种情况处理：
  1. **文档面板**：不参与联动筛选，面板角标显示"不参与联动"。
  2. **adapt 抛错**：显示真实的错误文案（`.perr` + 错误 message）。
  3. **筛选后为空**：这种情况才显示"筛选后无数据"，同时提供"清除筛选"按钮。
- 高度：
  - 流式面板（report、grid）使用 `measure().height`，不受 `width×0.56` 的限制。
  - grid 布局下的流式面板默认独占一整行。
  - 静态 compose 的 story 布局用 `measure` 的结果排版，SVG 高度自动。
- CLI 回执：compose 的每个面板新增 `rendered: boolean` 和 `error?`。这是 **CLI 端的预渲染校验**：对每个面板跑一遍 `adaptInput` 和 `layout`，任何一个面板失败，回执的 `ok` 就是 false（属于契约变更，需要记入 ADR）。这样"CLI 成功但 HTML 坏"的情况就不会再出现。

### 4.5 计划与实际对比（P1）

- gantt 契约：
  - 新增角色 `baseline`（基线截止）和 `actual`（实际完成），两者 `instant: 'end'`。
    - `baseline` 别名：`baseline`、`planned`、`基线`、`基线截止`、`原截止`、`冻结截止`。
    - `actual` 别名：`actual`、`actualend`、`实际完成`、`实际完成时间`、`提交时间`、`完成时间`。
  - `end` 的别名去掉 `完成日期`，改为 `instant: 'end'`。
  - 新增选项：`baselineMark: ghost | tick | none`（默认 ghost）和 `varianceLabel: boolean`（默认 true）。
  - 在契约 inference 中写明：**`actual` 的别名不包含任何"更新/修改"类字段**。
- adapter：每个任务新增 `baselineEnd`、`actualEnd`、`slipDays`（当前截止 − 基线，按工作日或自然日由选项决定）、`lateDays`（实际 − 当前截止）。`actual` 为空时值为 null，tooltip 显示"实际完成：未知"。
- 渲染：
  - 基线画成半透明的幽灵条或竖线刻度，当前计划是主条，实际完成是菱形标记。
  - 偏差标签显示为"+4 天"，相对基线计算。基线改为 11/06、当前改为 11/10 时显示 +4 天（工作日口径另算），并在 tooltip 里写明口径。
  - 今日线使用 asOf（§4.2）。
- 洞察：
  - `gap`："n 项相对基线延期，最大 +k 天（任务 X）"。
  - `target`："按期完成 a / 已完成 b"。
  - 实际完成时间未知的任务单独计数，不计入按期率。
- 其他图族：grid 配合 `dateDiff` 派生列加 `tone` 显示偏差；kpi 可以直接对 `截止状态` 这类派生列做计数（kpi 已经支持类目计数的话直接用，不支持就在 M2a.5 补上 `agg=count` 并 `filter`）。

### 4.6 场景包与 Agent 指南

- 扩展 `delivery` 场景包，新增一个"截止日报"子场景，由生成器用固定种子产出：
  - `deadline_tasks.csv`：69 行，11 名负责人。列包括：编号、标题、链接、负责人、基线截止、当前截止、实际完成、状态。数据中刻意包含基线变更、实际完成缺失、跨午夜截止、节假日后截止等情况。
  - `deadline_snapshots.csv`：逐日快照，只有 11/05 一个观测日；计划线覆盖到 11/16。
  - `deadline_brief.md`：5 个章节，含指标、带链接的表格和长列表。
  - `pack.json` 里的条目都固定 `time.asOf = 2026-11-05T17:00:00+08:00`。
  - 新增 compose 示例：report、kpi、gantt 加 grid。
- `virta guide --agent` 和 `docs/agent/SKILL.md` 新增几节：时间契约（必须显式传 asOf，用于重放）、派生列、缺失值策略、流式视图和分页、compose 文档面板，以及"取数失败不要沿用旧快照"这类调用方纪律的提示。
- 更新 `README.md` 对应的章节（M8 已重写 README，这里只做增量）。

---

## 5. 测试与验收

| 层 | 新增内容 |
|---|---|
| 单元 | `zonedParts`/`fromZoned`（含 DST）、工作日（节假日和调休）、`dueStatus` 七种取值的边界、`dateDiff` 遇空值得到 null、gap 模式下的 y 轴值域和洞察、`measure` 高度单调（行数越多高度越高）、`toSVG` 的 `<a>` 转义和不安全链接处理；`linePath` 的 step 模式下每段子路径的起点等于第一个点、终点等于最后一个点（容差 0.01），1 个点、2 个点和带缺口的情况都要覆盖 |
| 渲染（全视图） | **SVG 路径语法检查**：遍历所有视图的全部变体和 `lineStyle` 组合，对每个 `path.d` 用一个最小解析器做校验（每个命令的参数个数正确、没有 NaN）。F7 中 combo 那种 `M x V y` 的写法会被这一项拦下 |
| 契约 | `coverage.test.ts`：所有 `flow` 视图都实现了 `measure`；gantt 的 `actual` 别名与"更新时间"类别名不相交 |
| golden | 加上 `missingValue=zero` 后，原有全部用例仍然通过 |
| CLI e2e | `--as-of`/`--tz`/`INVALID_TIME`；compose 中某个面板失败时 `ok:false`；PNG 分页文件数量与 `pages` 一致；`TZ=UTC` 和 `TZ=Asia/Shanghai` 两个环境下 SVG 逐字节一致 |
| 视觉 / Playwright | 见下方验收用例；另外每个新视图状态都要有双主题基线 |

**验收用例（需求文档原文转写，全部自动化）**

1. **长内容**：`deadline_brief.md` 加 `deadline_tasks.csv`（69 行，5 个章节）输出 HTML。断言：
   - 首屏（1280×800）内可以看到指标卡；
   - 滚动到底后最后一行任务可见；
   - 打印预览（`page.pdf()` 只用于测试断言，不作为产品功能）中包含第 69 行；
   - 编号链接的 `href` 保留，且只有 http(s)；
   - 搜索"张"、按负责人筛选、按风险筛选后，行数徽章正确。
2. **asOf**：`asOf = 2026-11-05T17:00+08:00`、`tz = Asia/Shanghai` 时，截止 `2026-11-05` 的任务为 `due-today`；asOf 改为 `2026-11-06T00:00+08:00` 后变为 `overdue`。同一快照重放两次，SVG 逐字节一致。
3. **缺失值**：快照数据只有 11/05 一天有实际值 0/69，11/06–11/16 没有实际数据。断言：
   - 实际线只有 11/05 一个点，没有画到 0 的线段；
   - 计划线延伸到 11/16；
   - 洞察中没有"实际趋势"这一条。
4. **组合 report**：compose 包含 report 和 kpi 两个面板。断言：
   - Playwright 打开后两个面板都有内容；
   - 页面上不出现 `.perr`；
   - 长 report 的最后一个标题可见；
   - 回执中每个面板 `rendered: true`。
5. **计划与实际**：某任务基线截止 11/06、当前截止 11/10。断言：
   - tooltip 和标签显示相对 11/06 的偏差；
   - 实际完成时间缺失的任务显示"未知"，且没有使用任何其他时间列。
6. **阶梯线**：`sample-multi.csv`（line）和 `sample-combo.csv`（combo）都设置 `lineStyle=step`，导出 SVG 和 PNG。断言：
   - 每条线路径的终点等于最后一个数据点的坐标；
   - combo 的折线可见：路径非空，且 PNG 中折线颜色的像素数超过阈值；
   - 视觉基线中可以看到最后一个点两侧都有水平段，没有缝。

---

## 6. 里程碑

每个里程碑的结束条件同 `NEXT_PHASE.md` §10：任务清单全部勾选、DoD 命令通过、更新 `IMPLEMENTATION_NOTES.md`、本地提交，不 push。

### M2a.0 准入与复现

- [ ] 确认 §0.3 的准入条件已满足。
- [ ] 把 F1–F7 各写成一个失败用例（标记 `it.fails`，或放在 `test/repro/` 下），作为后续里程碑的回归锚点。
- [ ] 写 ADR：
  - `0008-flow-views-dom-renderer.md`（A1/A2，以及 D8 例外的范围）；
  - `0009-time-contract-asof-tz-derive.md`（A3/A4/A5）；
  - `0010-missing-values-gap.md`（A6，以及 golden 的处理）。
  - 同时更新 0004（ViewSpec/ViewState 增量）和 0005（回执增量与 `INVALID_TIME`）。

**DoD**：`npm run typecheck && npm test` 通过（复现用例为预期失败）；ADR 已提交。

### M2a.1 时间契约（P0）

- [ ] 实现 §3 中的契约类型、`time/zoned.ts`、`time/workday.ts` 和 `derive.ts`（只做 `dueStatus` 和 `dateDiff`）。
- [ ] 给 RoleSpec 加 `instant`，并标注 gantt、bullet 等图族里已有的日期角色。
- [ ] CLI 新增 `--as-of`/`--tz`，回执写回 `time`；实现 `INVALID_TIME`；inspect 给出 derive 建议。
- [ ] 修复 gantt 今日线（F3）；叙事层显示"数据截至"。

**DoD**：
```bash
npm run virta -- render examples/packs/delivery/deadline_tasks.csv --view grid --as-of 2026-11-05T17:00:00+08:00 --tz Asia/Shanghai --set 'derive=[{"type":"dueStatus","due":"当前截止","done":"实际完成"}]' --export svg --json
npm run virta -- render x.csv --view gantt --as-of bad --json     # ok:false，INVALID_TIME，退出码 2
```
验收用例 2 通过；TZ 双环境逐字节一致的测试通过。

### M2a.2 流式排版与文档/表格（P0）

- [ ] `measure` 接口；report 和 grid 去掉截断；按度量换行；Scene 节点支持 `link`。
- [ ] viewer 的 `flow-doc` 和 `flow-table`（搜索、筛选、排序、粘性表头、行数徽章、`link`/`tone` 角色）和打印样式。
- [ ] CLI 支持 `--size …xauto` 和 PNG 分页；回执中的 `page`/`pages`。

**DoD**：验收用例 1 通过；视觉基线（双主题、阅读态和打印态）通过；`npm run test:perf` 中"100k 行 grid 生成 HTML < 8s"仍然达标。

### M2a.3 统一适配入口与 compose 文档面板（P1）

- [ ] 实现 `adaptInput`，并迁移 render、compose 和运行期三处调用方；删除 report 特判。
- [ ] `renderPanel` 的三种情况；流式面板按自然高度；静态 story 布局用 measure。
- [ ] compose CLI 的预渲染校验和面板级 `rendered`/`error`。

**DoD**：验收用例 4 通过；`npm run test:e2e` 通过（包括新增的"某个面板失败 → ok:false"用例）。

### M2a.4 缺失值策略（P1）

- [ ] model 的 values 改为可为 null；给六个时序视图加 `missingValue`/`connectGaps`，bar 加 `missingValue`。
- [ ] 渲染器、洞察、tooltip、值域计算适配 null；更新契约 inference 文案。
- [ ] golden 的 `cases.json` 显式设置 `zero`。
- [ ] 阶梯线修复（F7 / A9）：在 chart-core 实现统一的 `linePath`（step-middle，补全首尾半格，按缺口分段）；line、combo 和面积填充改为调用它；增加全视图的 SVG 路径语法检查。

**DoD**：验收用例 3、6 通过；golden 对拍 100% 通过；路径语法检查覆盖全部视图并通过。

### M2a.5 计划与实际对比（P1）

- [ ] gantt 的 `baseline`/`actual` 角色、别名调整、`baselineMark`/`varianceLabel` 选项。
- [ ] adapter 计算 slip/late；渲染幽灵条、标记和偏差标签；洞察 gap 和 target。
- [ ] 检查 kpi 是否支持对类目的计数，不支持就补上。

**DoD**：验收用例 5 通过；gantt 的 golden（默认选项下）仍然通过。

### M2a.6 场景包、指南与总验收

- [ ] 生成 delivery 的截止日报子场景（§4.6）；`pack.json` 的 `expectTop`/`expectInsight`；compose 示例。
- [ ] 更新 `guide --agent`、`SKILL.md` 和 README 增量。
- [ ] 把 M2a.0 的复现用例改为正常断言并全部转绿。
- [ ] 视觉 QA：新增状态 × 双主题 × 3 套配色。

**DoD**：
```bash
npm run typecheck && npm test && npm run test:e2e && npm run test:visual
npm run packs:check
npm run virta -- demo delivery && npm run virta -- compose examples/packs/delivery/deadline.compose.json --export html,svg,png --json
```

---

## 7. 风险

| 风险 | 对策 |
|---|---|
| 流式视图的 DOM 和 Scene 两条渲染路径出现视觉偏差 | 两者共用 GridModel/DocModel 和 design token；视觉回归同时覆盖 HTML 阅读态和 SVG；ADR 中把例外严格限定在 `flow` 视图 |
| `Intl` 时区数据随 Node 或浏览器版本变化 | 测试只使用稳定时区（Asia/Shanghai 没有夏令时；America/New_York 只测已固化的历史日期）；在回执里写明 tz |
| 默认 `gap` 改变了已有用户的产物 | 回执给出 `GAP_VALUES` info，并附 hint `--set options.missingValue=zero`；在 README 的变更说明中写明 |
| 去掉 gantt `end` 的 `完成日期` 别名后，旧数据的识别结果变化 | inspect 对 `完成日期` 列给出"可映射为 actual 或 end"的歧义提示（`AMBIGUOUS_MAPPING` 加 suggestions），不静默猜测 |
| 超长 HTML 体积变大 | grid 超过 20000 行时沿用 Phase 2 的预聚合策略；表格 DOM 用分批渲染（每批 500 行、`requestIdleCallback`），打印时一次性展开 |

---

## 8. 需用户确认

| # | 事项 | 默认处理 |
|---|---|---|
| U2a-1 | 时序视图的缺失值是否默认 `gap`（A6） | 按 `gap` 执行 |
| U2a-2 | 未传 `--tz` 时，是用系统时区还是固定 `Asia/Shanghai` | 用系统时区，并写回回执、报 `TZ_ASSUMED` |
| U2a-3 | 流式视图在 HTML 中用 DOM 渲染（A2，属于 D8 的例外） | 按 A2 执行 |
