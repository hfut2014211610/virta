# Virta Phase 2b 详细设计与实施计划：一致性、安全与正确性加固

> 状态：待实施 · 编写：2026-11-07
> 位置：Phase 2a（`docs/plan/PHASE_2A.md`）与 M9 均已完成（HEAD `b91b840`），本期紧随其后。
> 输入：2026-11-07 第三轮审查。证据在 维护者本机审查目录（不入库）（`REPORT.md`、`round2/REPORT2.md`、`shots/`、`edge/`）。
> 读者：实施 Agent 与维护者。规则沿用 `NEXT_PHASE.md` §0（R1–R8、§0.3），本文只写增量。
> **本期对 R4 的修订（用户 2026-11-07 授权）**：允许 push。每个里程碑在本地 `npm run typecheck && npm test` 全绿并提交后，以 fast-forward 方式推送到 `origin/main`。禁止 force push，禁止改写已推送的历史。push 后由 GitHub Actions 的 Linux 环境跑视觉回归。注意：`main` 目前领先 `origin/main` 16 个提交（M1–M9 和 2a），第一次 push 会把它们一并推上去。

---

## 0. 定位与边界

### 0.1 为什么要有 2b

命令行导出的静态图已经稳定：

- 75 组渲染全部成功，SVG 路径语法检查 0 问题。
- 181 个 HTML 页面没有 JS 报错，也没有网络请求。
- 跨时区导出的结果逐字节一致。

问题集中在**交互页**。浏览器打开 HTML 后会重新计算一遍数据，这一步和 CLI 导出走的是两套代码，而现有测试几乎只覆盖 CLI 静态路径，没有一项断言"浏览器画的和导出的一样"，也没有 XSS 端到端用例。2b 要解决三件事：

1. 交互页和导出图使用同一条计算路径，并且有测试兜底。
2. 消除数据驱动的 XSS。
3. 把参数校验和数据解析中会静默出错的地方改为显式报错。

### 0.2 本期不做

- 不加新图表，不加新功能型能力（Markdown 内嵌图表、MCP Server、地图、npm 发布放到 §9 的远期方向）。
- 不引入新的第三方依赖。spec 校验、模型哈希、CSP 哈希都自己实现，Node 用 `node:crypto`，浏览器用简单的 FNV-1a 哈希。

### 0.3 准入条件

- `git status` 中只允许出现已知的、他人的未跟踪目录 `.workbuddy-ai/`（R8：不动、不提交）。出现其他改动先停下来记录。
- 已读本文、`PHASE_2A.md` 的 §2–§4，以及上面两份审查报告。

### 0.4 安全热修可以先行

B1（XSS）是安全问题，M2b.0 可以不等其他里程碑，单独完成并提交。

---

## 1. 缺陷清单（审查实测，均有复现证据）

| # | 级别 | 问题 | 位置 | 证据 |
|---|---|---|---|---|
| B1 | P0 | 交互页的图例、tooltip、数据明细表、组合页筛选标签把数据直接拼进 `innerHTML`。`xss-label.csv` 实测会弹出 `alert`，构造的列名也能触发。画廊里的 `demo-xss-label_csv-grid` 卡片已经带着可触发的载荷 | `viewer/src/runtime.ts:231,258,557`、`runtime-compose.ts:137` | `REPORT.md` 中的 XSS 一节 |
| B2 | P0 | 浏览器端的 adapt 只做了列映射复制，然后直接调用 `toModel`，跳过了三步：派生列、`missingValue`、gantt 的 asOf 今日线。结果是：<br>• grid 的"截止状态"列和 tone 着色在交互页里消失<br>• `missingValue=zero` 在交互页里仍然断线<br>• gantt 今日线按打开页面时的 `Date.now()` 计算，超出时间跨度时整条消失<br>• "数据截至"脚注缺失 | `cli/src/render.ts:73`、`scripts/build.mjs:23`；正确路径在 `data-engine/src/families/index.ts:88-153` | `round2/REPORT2.md` 的 H1a–c |
| B3 | P0 | 组合页运行期的 adapt 连 `spec.mapping` 都不处理（`compose.ts:47`）。之所以看起来正常，是因为 CLI 预检阶段**直接修改了共享的行对象**，映射后的键被写进了 payload（实测 payload 行里多出 `"label":"1月"`）。另外，compose 没有解析 `time`，所以没有写回 asOf 和 tz | `cli/src/compose.ts`、`families/index.ts:96-102`（原地改行） | H1d |
| B4 | P1 | `--data` 传入无法解析的内容时，抛出未捕获的 SyntaxError，打印堆栈，退出码 1，没有 JSON 回执。stdin 路径在同样情况下能正确报 PARSE_ERROR | `cli/src/main.ts:56-58` | `edge/data-inline-json.stderr.txt` |
| B5 | P1 | `--set` 不做任何校验：非法枚举值（`options.lineStyle=zap`）、不存在的键（`bogus.deep.key=1`）都被静默接受，并原样写进回执 | `main.ts:41-50` `applySet` | `REPORT.md` |
| B6 | P1 | `--palette nonsense` 报的是 `RENDER_FAILED: Cannot read properties of undefined`，退出码 5。正确行为是 INVALID_OPTION，退出码 2 | `main.ts:101` | H6 |
| B7 | P1 | 视图别名 `heat`、`box`、`fish`、`pivot`、`spc` 全部报 UNKNOWN_VIEW。`VIEW_ALIASES` 没有任何地方引用，"pivot → grid 透视变体"从未实现 | `contracts/src/views.ts:14` | H2 |
| B8 | P1 | 非流式视图加 `--height auto`：`Number('auto')` 得到 NaN，SVG 中出现 `height="NaN"`，PNG 只有 2329×1 像素，但退出码是 0 | `main.ts:227` | H3 |
| B9 | P1 | 派生列只能解析 `YYYY-MM-DD`：<br>• `2026/11/05`、`2026年11月5日` → unknown，且没有任何警告<br>• `20261105`、`45966`（Excel 序列号）被当作 epoch 毫秒处理，结果判成 **overdue** | `data-engine/src/time/zoned.ts:53` | H4 |
| B10 | P1 | `dateDiff` 按工作日计算时，起点晚于终点返回 0，不会返回负数 | `time/workday.ts:17-21` | H5 |
| B11 | P1 | grid 统计非法数字时把文本列也算进去：干净的 `ledger.csv` 报 2400 个，100k 行数据报 40 万个，导致 confidence 被压成 low | `data-engine/src/families/grid.ts:44` | `REPORT.md` |
| B12 | P1 | flow-table 排序比较的是**格式化后的显示文本**，`Number("1.2万")` 是 NaN，于是退化为字符串比较。升序结果为 `1.1万, 1.2万, 15万, 800, 9,000` | `viewer/src/flow-table.ts:95-103` | H7 |
| B13 | P1 | compose 回执里 html 文件记为 `bytes: 0`，实际 531KB | `cli/src/compose.ts`（导出循环） | H1d |
| B14 | P1 | 1280×800 视口下有 15 个视图首屏溢出：combo、matrix3d 908px，line3d 902，kpi 867，gantt 859，bar 856 | 阅读态布局 | `test:visual` 日志 |
| B15 | P1 | 每个视图的 bundle 约 385KB（report 392KB），预算是 150KB，`test:perf` 失败 | 构建 | `test:perf` 日志 |
| B16 | P2 | 推荐首选不准：<br>• showcase-pie → bar（0.6 > 0.55）<br>• histogram-group → boxplot（同分时输了）<br>• rank → bar<br>• tree-levels → sunburst<br>• kpi → bullet | `data-engine/src/score.ts` | `edge/inspect-results.json` |
| B17 | P2 | 杂项：<br>• report 洞察的 importance 是 50/40，其他图族都是 0–1<br>• flow-table 每次渲染都追加一个 `beforeprint` 监听<br>• hash 能恢复排序方向，但恢复不了排序列<br>• `guide --agent` 的 `--agent` 实际不起作用<br>• 两个视觉用例对 grid/report 断言存在 `#chart-box svg`，但这两个视图现在渲染的是 DOM | 各处 | `REPORT.md` |

---

## 2. 决策

| # | 决策 | 理由 |
|---|---|---|
| C1 | **单一适配管线**：在 data-engine 新增 `runPipeline(table, spec, view, toModel)`，依次执行派生列 → 映射（**不修改原数据**）→ toModel → 缺失值处理 → 视图后处理钩子（gantt 今日线、line3d curve）。`ADAPTERS`、per-view bundle、compose bundle 三处**都只调用它** | 从根上消除 B2/B3，以后新增的处理步骤不会再漏掉某一端 |
| C2 | 视图后处理钩子放在独立模块 `families/post.ts`，以 `view` 为键注册，per-view bundle 只打包本视图的钩子 | 不能因为统一管线把全部图族都打进每个 bundle，否则会加剧 B15 |
| C3 | 适配输入必须不可变：管线内先浅拷贝每一行再写入派生键和映射键。测试中对输入执行 `Object.freeze` 并做深比较 | 消除 B3 中"错误碰巧掩盖错误"的情况 |
| C4 | 新增**运行期一致性**测试：运行期在 `window.__virta` 上暴露 `modelHash`（对稳定序列化后的 model 求 FNV-1a 哈希，与宽度无关），Playwright 拿它和 Node 端用 `adaptInput` 算出的哈希对比 | 静态图和交互页的几何依赖宽度，无法直接比较；model 是两端唯一应当完全相等的中间量 |
| C5 | 交互页中所有来自数据的文本一律经过转义。新增带标签的模板 `html\`…\``，插值默认转义；只有 `toSVG` 和 `inlineHtml` 的输出可以用 `raw()` 标记为可信。用测试禁止在 `packages/viewer/src` 中出现"未经 `html` 模板就赋值给 `innerHTML`"的写法 | 修复 B1，并防止回退 |
| C6 | 生成的 HTML 加 CSP 作为纵深防御：<br>`default-src 'none'; script-src 'sha256-<运行期脚本哈希>'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'`<br>脚本哈希在构建时计算。没有 `'unsafe-inline'` 时，内联事件处理器（`onerror=`）会被浏览器直接拦截 | 即使将来某个 sink 漏了转义，注入的脚本也执行不了；`connect-src 'none'` 顺便在浏览器层面强制离线（R3） |
| C7 | **严格的 spec 校验**：`validateSpec(spec, contract)` 对 `--spec`、`--set`、各类专用参数、compose 面板、pack.json **统一执行**，任何不合法项都报 INVALID_OPTION 或 INVALID_SPEC（退出码 2），hint 中给出最接近的合法写法 | 修复 B5/B6。Agent 必须得到明确的失败，否则会把错误的 spec 当成成功的结果继续用 |
| C8 | 视图别名统一由 `resolveView(id) → { view, variant? }` 解析，CLI、compose、schema、validate 共用；回执中的 `spec.view` 一律写规范 ID | 修复 B7 |
| C9 | 日期解析只保留一个实现：派生列和 gantt 都复用 `legacy-core.ts:183` 的 `parseGanttDate` 来识别格式。纯数字的处理规则见 §4.4，无法判定的值输出 null，并报 `UNPARSABLE_DATES` | 修复 B9。日期判错比报错危险得多 |
| C10 | flow-table 的单元格保留原始排序键，排序按原始值进行，空值无论升序降序都排在最后。ViewState 新增 `sortBy?: string`（列名） | 修复 B12 和 B17 中排序列无法恢复的问题。这是契约增量，需要写 ADR |
| C11 | 推荐准确度改为**语料驱动**：用一份标注语料加一份基线结果锁定。之前判对的文件不允许变错，首选准确率不低于 0.9 | 修复 B16，并防止以后调分时此消彼长 |
| C12 | 打印范围采用"所见即所打"：打印当前筛选结果，表头上方注明"已筛选：…（N / M 行）"。PHASE_2A §4.1 原写的是"打印时忽略筛选"，以本条为准 | 用户筛选后打印，期望拿到的是筛选后的内容；同时在 IMPLEMENTATION_NOTES 中记录这次口径变更 |

---

## 3. 契约增量

```ts
// ViewState
export interface ViewState { /* ... */ query?: string; sortBy?: string }   // query 在 2a 已实现，本期补写进 ADR
// QualityCode：复用已有的 'UNPARSABLE_DATES'，派生列与 gantt 都按列计数，并附最多 5 个 examples
// Insight.importance：明确取值范围为 [0, 1]（契约注释 + 测试强制），report 改为 0.5 / 0.4
// RenderReceipt：不变（modelHash 只暴露在运行期的 window.__virta 上，不进回执）
// ErrorCode：不新增；B5/B6 用 INVALID_OPTION，B8 用 INVALID_OPTION
```

ADR：

- 新增 `0012-single-adapt-pipeline.md`（C1–C4）
- 新增 `0013-html-security-csp.md`（C5、C6）
- 新增 `0014-strict-spec-validation.md`（C7、C8，以及"严格模式下旧 spec 的处理"）
- 更新 `0004`（ViewState 增量、importance 取值范围）、`0010`（日期解析规则、dateDiff 带符号）、`0009`（打印口径 C12）

---

## 4. 分项设计

### 4.1 安全（B1，C5/C6）

- 新增 `viewer/src/html.ts`，导出两个工具：
  - `html` 模板标签：插值默认用 `escHtml` 转义，数组插值会先拼接再逐项转义；
  - `raw(s)`：标记可信 HTML。
- 改写这几处：
  - `runtime.ts:231`（图例 chip）、`:258`（tooltip）、`:557`（`buildTable`）；
  - `runtime-compose.ts:137`（筛选 chip）。
  - 能用 `textContent` 的地方优先用 `textContent`。
  - `style="background:${color}"` 中的颜色先过白名单：只允许 `#hex` 或 `rgb()`、`oklch()`。
- 静态检查 `test/security/no-raw-innerhtml.test.ts`：扫描 `packages/viewer/src/**/*.ts`，凡是 `innerHTML =` 或 `insertAdjacentHTML(` 的右侧，必须是 `html\``、`raw(toSVG(` 或 `raw(inlineHtml(` 三种形式之一，否则测试失败。有一个白名单文件，里面每一条都要写明理由。
- CSP：`viewer/src/html.ts` 的页面模板（`singleFileHtml` 和 `composeHtml`）在 `<head>` 中写入 `<meta http-equiv="Content-Security-Policy">`，脚本哈希由 render 和 compose 在拼接页面时对最终内联脚本计算 sha256。
  - **要先核实**：运行期和 esbuild 产物中没有 `eval` 或 `new Function`；没有内联事件属性（`on*=`）。如果有，要先改掉再上 CSP。
- XSS 语料与端到端测试：
  - `examples/edge-cases/xss-*.csv/.md` 覆盖以下注入位置：标签、系列名、列名、数值单元格、链接、Markdown 标题和表格。
  - 每个载荷使用 `<img src=x onerror="window.__xss=1">` 和 `"><svg onload=…>` 两种形式。
  - `test/visual/xss.spec.ts` 对**全部视图**的 HTML 和 compose 页面执行：注册 `page.on('dialog')` 后打开页面，悬停到第一个命中区触发 tooltip，再点击图例，最后断言 `window.__xss` 为 undefined 且没有弹出过 dialog。
- 画廊中保留 xss 卡片，改名为"转义演示"，用来证明转义生效。

### 4.2 单一适配管线（B2/B3/B13，C1–C4）

- `data-engine/src/pipeline.ts`：

  ```ts
  export function runPipeline<M>(table: Table, spec: ViewSpec, view: ViewId, toModel: (raw: Raw) => M,
    post?: PostHook<M>): { model: M; issues: QualityIssue[] }
  ```

  执行顺序：
  1. `applyDerives`，传入 `spec.time` 解析后的 asOf 和 tz；
  2. `tableToRaw`，**逐行浅拷贝**；
  3. 映射复制（与现有规则一致：只写入原本不存在的键）；
  4. `toModel`；
  5. 缺失值处理；
  6. 执行 `post`。

  `makeAdapter` 的 `adapt` 改为调用它。`families/index.ts:140-168` 中的 gantt 和 line3d 包装改写为 `post.ts` 里的钩子。
- 浏览器端：`render.ts:73` 和 `build.mjs:23` 生成的 per-view 入口改为 `adapt: (t, s) => runPipeline(t, s, VIEW, toModel, POST)`，只导入本视图的 `toModel` 和钩子。`compose.ts:47` 同样处理。
- time 写回：
  - compose 在 compose 文件这一层解析 `time`，即 `ComposeFileShape.time?`，面板 spec 会继承它；
  - 没有给出时，按 render 的方式写回 asOf 和 tz，并报 `TZ_ASSUMED` / `ASOF_ASSUMED`；
  - payload 里的每个面板 spec 都带上 `time`。
  - 运行期**任何地方都不能调用 `Date.now()`**。用静态检查强制：`packages/viewer/src` 以及 bundle 引入的 data-engine 模块中，只有 `derive.resolveTime` 的 CLI 分支允许调用 `Date.now()`。
- 一致性测试 `test/visual/parity.spec.ts`：
  - 用例集合：每个视图的主样例 × {默认、带 derive 的 grid、`missingValue=zero` 的 line、带 `--as-of` 的 gantt、带 mapping 的 compose 面板}。
  - Node 端用 `adaptInput` 计算 `modelHash`，浏览器端读取 `window.__virta.modelHash`（compose 读 `panels[i].modelHash`），两者必须相等。
  - 哈希函数放在 `chart-core`，Node 和浏览器共用同一份实现。序列化方式：键排序，数值统一 `toFixed(6)`。
- 不可变性测试：对 `examples/basic` 中的每份样例，先 `Object.freeze` 所有行，再经 `runPipeline` 处理，不得抛错，且原表深比较不变。
- B13：compose 导出循环里，`bytes` 改为对写入的同一个字符串取 `Buffer.byteLength`，并在 e2e 中断言回执中的 `bytes` 等于 `statSync(path).size`。

### 4.3 参数与契约校验（B4–B8，C7/C8）

- `contracts/src/validate-spec.ts`，只依赖 contracts：

  ```ts
  validateSpec(spec: unknown, contract: ChartContract | undefined) → { ok: true; spec: ViewSpec } | { ok: false; error: VizError }
  ```

  - 顶层键必须在 ViewSpec 的字段白名单内（与 `VIEW_SPEC_SCHEMA` 保持一致，用测试锁定两者相同）。
  - `options.*`：键必须在 `contract.options` 中；enum 值必须在 `values` 中；number 必须在 `min` 到 `max` 之间；类型必须匹配。
  - `palette` 必须属于 `PALETTE_IDS`，`theme` 必须属于 `THEME_IDS`，`variant` 必须在 `contract.variants` 中，`mode` 必须在 `contract.modes` 中。
  - `state`、`text`、`time`、`page`、`facet`、`size` 的子键也走白名单。
  - 出错时，hint 中给出编辑距离最近的合法键或值，以及完整的可执行写法，例如 `--set options.lineStyle=step（可选 smooth|straight|step）`。
- 调用点：
  - `buildSpec` 末尾（覆盖 `--spec`、`--set`、专用参数）；
  - compose 的每个面板；
  - `validate` 命令。
  - 另加一个测试，遍历所有 `examples/**/pack.json` 和 `compose.json`，要求全部通过。现有数据中不合法的项要修正数据，不能放宽规则。
- B4：`loadTable` 中处理 `--data` 的分支，与 stdin 分支一样用 try/catch 包起来，报 PARSE_ERROR，hint 为 `--format csv|json`。
- B7：在 `contracts/src/views.ts` 中实现 `resolveView`，并让 `VIEW_ALIASES` 真正生效（`pivot` 解析为 `{ view: 'grid', variant: 'pivot' }`）。`list --json` 的每一项带上 `aliases`。
- B8：
  - `renderJob` 的宽高只从 `spec.size` 解析一次；
  - `'auto'` 只对 flow 视图和定义了 `preferredHeight` 的视图生效，其他视图回退到 675，并报一条 info；
  - `renderChart` 开头断言宽高都是有限正数，否则报 INVALID_OPTION；
  - PNG 导出后再检查一次：宽或高小于 16 像素时报 EXPORT_FAILED。
- B17：`guide` 不带参数时输出 40 行以内的概览；`guide --agent` 输出完整的 Agent 指南，即当前内容；`guide --json` 输出结构化内容。

### 4.4 数据正确性（B9–B12，C9/C10）

- `time/zoned.ts` 的 `instantOf`：
  - **带时区偏移的字符串**：保持现有逻辑。
  - **只有日期、或日期加时间**：先用 `parseGanttDate` 识别格式，支持 `-`、`/`、`.`、中文年月日、紧凑 8 位和 Excel 序列号，然后用 `fromZoned` 按 `start` 或 `end` 落成时刻。实施前先读 `legacy-core.ts:183` 的返回值语义，确认它对上述每种格式的行为，再补齐缺失的格式。
  - **纯数字**：
    - 8 位且能组成合法的年月日，按紧凑日期处理；
    - 范围在 [20000, 80000] 内，按 Excel 序列号处理（1900 日期系统）；
    - 大于等于 1e11，按 epoch 毫秒处理；
    - 其余一律输出 null。
  - 解析失败的值，由 `applyDerives` 按列累计，生成 `UNPARSABLE_DATES` warn，附带 count 和最多 5 个 examples。
- `workdaysBetween` 改为带符号：`to < from` 时返回 `-workdaysBetween(to, from)`。单元测试覆盖反向区间、同一天、跨周末、节假日和调休补班。
- `grid.ts:44`：`invalid` 只统计数值列，即解析率不低于 0.8、在 GridModel 中标记为 `numeric` 的列。用 `ledger.csv` 做回归测试，断言结果为 0。
- flow-table：
  - `Cell` 增加 `key: number | string | null`，明细表取原始值，透视表取聚合值；排序按 `key` 比较，`null` 始终排在最后。
  - `state.sortBy` 写入和恢复都按列名进行。
  - `beforeprint` 监听改用 `AbortController`，每次渲染前先 abort 上一次的监听。
  - 打印口径按 C12 执行。
- report 洞察的 importance 改为 0.5 和 0.4。再加一个契约测试，断言所有视图的洞察 importance 都在 [0, 1] 内。

### 4.5 推荐语料（B16，C11）

- 新增 `test/recommend/corpus.json`，结构为 `[{ file, expect: { view, variant? }, acceptable?: ViewId[], note }]`。
  - 来源：`examples/basic`（按文件名表示的意图标注）、`examples/gallery`、`examples/packs/*/pack.json` 中已有的 `expectTop`。
  - 3D 图族按 D14 不作为首选，因此在语料中标为 `acceptable`。
- 新增 `test/recommend/baseline.json`，记录每个文件的首选视图和 top-3。
- 测试 `recommend.test.ts`：
  1. 首选准确率（`expect` 或 `acceptable` 命中都算对）不低于 0.9；
  2. baseline 中判对的文件不得变错；
  3. 出现新增的正确判断时，提示更新 baseline。
- 新增 `npm run recommend:baseline` 用于重新生成 baseline。
- 本期必须修正的 5 项。每项先判断是语料标注不合理还是打分问题，判断结论写进语料的 `note`：
  - **pie**：识别"部分与整体"信号，满足以下全部条件时 pie 胜过 bar：单度量；值全部为正；类目数为 2–8；列名或标题命中"占比/构成/份额/share"类词，或者数值之和接近 100 / 1。
  - **同分处理**：先比较角色别名命中数，再按契约中的优先级表排序，排序结果必须确定。histogram-group 与 boxplot 同分的情况，按"每组原始观测数不少于 20 且没有分位数列"判给 histogram。
  - **rank**：命中"排名/rank/名次"类别名，或者"类目 + 度量 + 时间且至少 2 期"时，判为 rank（含 race）。
  - **tree-levels**：`tree` 只认领 id + parent 形式（M7 的既有口径）。如果样例本意就是多列层级，那么语料改为 `acceptable: ['sunburst', 'treemap']`。
  - **kpi 与 bullet**：数据含 target 列时 bullet 是合理的首选；只有"指标名 + 值（可带同比）"且没有 target 时才判为 kpi。按这条规则核对样例，再决定改语料还是改打分。

### 4.6 首屏、体积与视觉基线（B14/B15/B17）

- **首屏（B14）**：
  - 阅读态图表高度改为 `clamp(视口高 − 实测页头、洞察、图例的高度 − 24, 360, 640)`。页头部分用渲染后测量的 DOM 高度，不再按 `0.58 × innerHeight` 估算。
  - 对于 `preferredHeight` 超出可用高度的视图（gantt 及其他行数驱动的视图），图表区改为内部滚动容器，轴保持 sticky，页面本身不被撑高。
  - 首屏断言保持不变：图表区底边不超过 800。
- **体积（B15）**：
  - `scripts/build.mjs` 增加 `--analyze` 参数，输出 esbuild metafile 到 `out/bundle-meta/<view>.json`，并给出前 10 个最大的模块。
  - **待核实的假设**：每个 bundle 都打包了全部 35 份契约（运行期通过 `getContract` 引用）、全部主题和配色，以及 chart-skin 的全部内容。
  - 对应措施：payload 只携带本视图的契约 JSON，运行期不再 import `CONTRACTS`；主题和配色只打包当前使用的那一套，同时保留切换能力（另外几套作为数据内联，不打包代码）。
  - 做完后重新测量。**先瘦身，看效果再决定**：仍然超过 150KB 时不要自行修订预算，把瘦身前后各视图的体积、`--analyze` 列出的前 10 大模块和剩余的优化空间整理好，报告给用户，由用户决定继续优化还是修订预算。决定之前，`test:perf` 的体积项保持失败，M2b.5 不能结束。
- **视觉基线**：
  - 修正 2 个测试设计问题：grid 和 report 的断言改为检查 `#chart-box .flow-table` 或 `.flow-doc`。
  - 另外 25 项截图差异放到 CI（ubuntu-latest）上重跑，确认是平台差异还是真实回归。
  - 基线只在 Linux 上更新，流程如下：
    1. `.github/workflows/ci.yml` 增加 `workflow_dispatch`，输入参数 `update_snapshots: boolean`。为 true 时执行 `npm run test:visual:update`，并把 `snapshots/` 作为 artifact 上传；
    2. 用 `gh workflow run ci.yml -f update_snapshots=true` 触发；
    3. 用 `gh run download` 取回 artifact，在本地逐张对比新旧基线；
    4. 把 25 项逐一归类为"平台差异"或"真实回归"，写进 IMPLEMENTATION_NOTES；
    5. 真实回归先修代码，再重新生成基线；
    6. 提交并 push。
  - 现有 CI 的视觉步骤是 `npx playwright test --pass-with-no-tests`，改为 `npm run test:visual`。
  - 前置检查：开工时先运行 `gh auth status`，确认对 `hfut2014211610/virta` 有 Actions 的读写权限。不可用时停下来报告，不要改用其他方式绕过。

---

## 5. 测试新增一览

| 层 | 新增 |
|---|---|
| 单元 | `validateSpec`（每类错误各一例，包括最近邻提示）、`resolveView`、`instantOf` 各种格式与纯数字规则、带符号的 `workdaysBetween`、grid 的 invalid 只统计数值列、flow-table 按 `key` 排序（含 null）、FNV 哈希的稳定性、insights importance ∈ [0, 1] |
| 静态检查 | viewer 中禁止裸 `innerHTML`；运行期依赖中禁止 `Date.now()`；HTML 中没有内联 `on*=` 属性，产物中没有 `eval` / `new Function` |
| 管线 | `Object.freeze` 后的输入不变；derive、missingValue、post 钩子在 ADAPTERS 和 per-view 入口两条路径上的输出相同（Node 端直接比较 model） |
| e2e | B4、B6、B7、B8、B13 各一例：`--data` 坏输入报 PARSE_ERROR；`--palette` 非法报 INVALID_OPTION（退出码 2）；五个别名正常渲染；`--height auto` 用在 bar 上得到 675 加 info；compose 回执的 bytes 等于实际文件大小；`--set` 非法键或非法值报退出码 2 且 hint 中含合法值 |
| Playwright | `xss.spec.ts`（全部视图加 compose）、`parity.spec.ts`（modelHash）、首屏断言、CSP 生效（页面中注入的 `onerror` 被拦截，console 出现 CSP violation） |
| 推荐 | 语料准确率不低于 0.9，且相对 baseline 无回退 |

---

## 6. 里程碑

每个里程碑的结束条件：
- 任务清单全部勾选，DoD 命令通过；
- 更新 `IMPLEMENTATION_NOTES.md`；
- 本地提交，然后 fast-forward 推送到 `origin/main`；
- 用 `gh run watch` 或 `gh run view` 确认这次 push 触发的 CI 结果，并把结论（通过，或失败项及原因）记入 IMPLEMENTATION_NOTES。

在 M2b.5 修好视觉用例之前，CI 中的视觉步骤允许失败，但每次都要记录失败数量，且不能比上一次多。

### M2b.0 安全热修与复现锚点（可以先于其他里程碑单独交付）

- [ ] 在 `test/repro/` 中把 B1–B13 各写成一个用例，使用 `it.fails`，或者在 Playwright 中用 `test.fail()`。
- [ ] 完成 §4.1 的全部内容：`html` 模板、四处 sink 改写、颜色白名单、裸 `innerHTML` 静态检查、CSP，以及 XSS 语料和 `xss.spec.ts`。
- [ ] 画廊中的 xss 卡片改为"转义演示"。
- [ ] 写 ADR-0013。

**DoD**：`npm run typecheck && npm test` 通过；`npx playwright test test/visual/xss.spec.ts` 全部视图通过；B1 锚点转为通过。

### M2b.1 单一适配管线

- [ ] 实现 `pipeline.ts` 和 `post.ts`；`makeAdapter`、per-view 入口（`render.ts` 和 `build.mjs`）、compose 入口全部改为调用 `runPipeline`。
- [ ] compose 支持文件级 `time` 的解析、写回和继承；落实运行期禁止 `Date.now()` 的静态检查。
- [ ] 运行期暴露 `window.__virta.modelHash`；实现 `parity.spec.ts` 和不可变性测试。
- [ ] 修复 B13；写 ADR-0012。

**DoD**：B2、B3、B13 锚点转为通过；`parity.spec.ts` 全部通过；`npm run test:e2e` 通过。

### M2b.2 参数与契约校验

- [ ] 实现 `validateSpec` 和 `resolveView`；接入 buildSpec、compose、validate；遍历全部 pack.json 和 compose.json 的校验测试通过（不合法的地方修正数据）。
- [ ] 修复 B4、B6、B7、B8；`guide` 拆分为概览、`--agent`、`--json` 三种输出。
- [ ] 写 ADR-0014；更新 `docs/agent/SKILL.md` 和 `guide --agent`，补充别名、严格校验和常见错误的修正写法。

**DoD**：
```bash
npm run virta -- render examples/basic/sample-multi.csv --view line --set options.lineStyle=zap --json   # 退出码 2，hint 含 smooth|straight|step
npm run virta -- render examples/basic/sample-multi.csv --palette nonsense --json                       # 退出码 2，INVALID_OPTION
npm run virta -- render examples/basic/sample-grid.csv --view pivot --export svg --json                 # ok，spec.view=grid，variant=pivot
npm run virta -- render examples/basic/sample-multi.csv --view bar --height auto --export svg,png --json # ok，height=675，并有 info
npm run virta -- render --data '{bad' --format json --view bar --json                                   # 退出码 3，PARSE_ERROR
```
B4–B8 锚点转为通过。

### M2b.3 数据正确性

- [ ] 实现 `instantOf` 的多格式与纯数字规则，以及 `UNPARSABLE_DATES` 计数；实现带符号的 `workdaysBetween`。
- [ ] 修复 grid 的 invalid 统计；flow-table 按 `key` 排序、支持 `sortBy` 和 AbortController；实现打印口径 C12。
- [ ] 修正 report 的 importance，加上取值范围的契约测试。
- [ ] 更新 ADR-0004、0009、0010。

**DoD**：B9–B12 锚点转为通过；用 5 种日期写法 `2026/11/05`、`20261105`、`2026年11月5日`、`46331`、`2026-11-05` 做回归，在 asOf = 2026-11-05T17:00+08:00 下结果全部为 `due-today`。注意：审查 H4 用的 `45966` 是 **2025-11-05** 的 Excel 序列号，修复后它应判为 `overdue`，并且原因是"去年同日"，而不是"1970 年"；把它作为第 6 条用例保留。

### M2b.4 推荐语料与校准

- [ ] 编写 `corpus.json`、`baseline.json`、`recommend.test.ts` 和 `recommend:baseline` 脚本。
- [ ] 按 §4.5 处理 5 项，每项在 `note` 中写明是语料问题还是打分问题。

**DoD**：首选准确率不低于 0.9，且相对 baseline 无回退；`edge/inspect-results.json` 中的 5 项全部处理完毕。

### M2b.5 首屏、体积与视觉基线

- [ ] 阅读态按实测高度布局；行数驱动的视图改为内部滚动。
- [ ] 实现 `build.mjs --analyze`，按分析结果瘦身 bundle，重新测量。超出预算时按 §4.6 把数据报告给用户，等用户决定。
- [ ] 修正视觉用例的 2 个测试设计问题；CI 增加 `workflow_dispatch` 基线更新流程，视觉步骤改为 `npm run test:visual`；在 CI 上重跑 25 项截图差异并逐项分类，确认后更新基线。

**DoD**：
- `npm run test:perf` 通过。如果用户决定修订预算，就按 ADR-0007 增补后的预算通过。
- 推送后 CI 全部通过，其中包括 `npm run test:visual`。
- 15 个视图的首屏断言通过。

### M2b.6 收尾

- [ ] 复现锚点全部转为普通断言。
- [ ] README 和 SKILL.md 增量更新；`virta demo --all && virta gallery` 生成成功。
- [ ] 用审查脚本（维护者本机审查目录（不入库） 中的渲染矩阵、路径语法检查、181 页运行期检查）再跑一次全量回归，结果附在 IMPLEMENTATION_NOTES 中。

**DoD**：
```bash
npm run typecheck && npm test && npm run test:e2e && npm run build && npm run test:perf && npm run packs:check
git push origin main     # fast-forward
gh run watch             # CI（含 Linux 视觉回归）全绿
```

---

## 7. 风险

| 风险 | 对策 |
|---|---|
| 严格校验导致已有的 spec 或 pack 失效 | M2b.2 用测试遍历全部 pack.json 和 compose.json；报错信息带最近邻修正提示；ADR-0014 写明这是一次有意的不兼容变更 |
| CSP 哈希与最终内联脚本不一致，导致页面整体失效 | 哈希在拼接 HTML 的同一处、基于同一个字符串计算；Playwright 的运行期检查（0 pageerror）兜底 |
| 统一管线后 per-view bundle 变大 | 后处理钩子按视图拆分（C2）；M2b.5 的 `--analyze` 先测量再优化 |
| 修改推荐打分时顾此失彼 | 用 baseline 锁定，已判对的文件不允许变错 |
| Linux 视觉基线需要 Linux 环境 | 用 GitHub Actions（ubuntu-latest）运行，通过 `workflow_dispatch` 生成基线、以 artifact 取回；`gh` 不可用时停下报告 |
| push 后 CI 失败，`main` 处于红灯状态 | 每次 push 前本地门禁必须全绿；CI 失败时，下一个提交优先修复，不能在失败的基础上继续开发新内容；禁止 force push |

---

## 8. 需用户确认

已于 2026-11-07 确认：

| # | 事项 | 结论 |
|---|---|---|
| U2b-1 | Linux 视觉基线在哪里运行 | **允许 push**，由 GitHub Actions 运行，流程见 §4.6 和里程碑结束条件 |
| U2b-2 | 严格校验是否需要提供 `--lenient` 逃生口 | **不提供**（C7） |
| U2b-3 | bundle 瘦身后仍超过 150KB 怎么办 | **先瘦身看效果，再决定**：带着实测数据报告用户，由用户决定是否修订预算，不得自行修订（§4.6） |

仍待确认：无。M2b.5 中的体积数据出来后，需要用户做一次决定。

---

## 9. 远期方向（2b 之后，不在本期范围）

1. **Markdown 内嵌图表**：在文档中用 ```` ```virta ```` 代码块声明图表（数据文件加 spec），由 `virta brief x.md` 生成单文件离线简报。这可以直接替代研发截止日报现在使用的外层 HTML 拼装脚本。
2. **MCP Server**：在已经稳定的 CLI 契约上做一层薄封装，提供 inspect、validate、render、compose 四个工具，回执结构与 CLI 一致。
3. 地图（`NEXT_PHASE.md` §13）、npm 发布、T3 图表：按需重启。
