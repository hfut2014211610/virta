# Virta 下阶段详细设计与实施计划（Phase 2 · Rev 2）

> 状态：已定稿，待实施 · 编写：2026-11-05
> Rev 2 变更：地图本期搁置（设计保留在 §13，不实施）；字体下载已获授权，列为 M1 必做任务
> 读者：实施 Agent（新会话）与维护者
> 本文是下阶段唯一的设计与计划来源。实施中如与本文冲突，以本文为准；本文未覆盖的细节按 §0.3 处理。

---

## 0. 给实施者的约定

### 0.1 先读

1. 本文全部章节（尤其 §1 决策、§4 契约、§10 里程碑）。
2. `README.md`、`legacy-vizscape/docs/ARCHITECTURE.md`、`legacy-vizscape/docs/STYLE_GUIDE.md`、`legacy-vizscape/docs/ADVANCED_MODES.md`、`legacy-vizscape/docs/DATA_QUALITY.md`。
3. 迁移某个图族前，先读 `legacy-vizscape/vizlib/charts/<family>.py`、`legacy-vizscape/templates/<tpl>/template.html` 和 `legacy-vizscape/docs/<FAMILY>_CHART.md`。

### 0.2 硬性规则

| # | 规则 |
|---|---|
| R1 | `legacy-vizscape/` **冻结**：不加功能、不修 bug。唯一例外是 M0.1 收口当前未提交的 `_shared.css` 重构。它只作参考实现和 golden 数据来源 |
| R2 | 依赖只允许用 §3.3 白名单里的包，并锁定精确版本（不用 `^`/`~`）。新增依赖必须是发布满 7 天的版本，且要写进 ADR |
| R3 | 产物 HTML 必须**离线可开**：不引 CDN，不请求网络；字体、脚本、数据全部内联 |
| R4 | 每个里程碑结束时，`npm run typecheck && npm test` 全绿，然后在本地提交（可以分多次），**不 push** |
| R5 | 本期**不实施地图**（§13 仅作预留设计），不安装 d3-geo、topojson-client、mapshaper，不下载任何地图边界数据。字体**已授权联网下载**，按 §5.2 的流程执行 |
| R6 | UI 文案用简体中文，集中放在 `packages/viewer/src/i18n/zh-CN.ts` 和各图族的 contract 文案里，代码标识符用英文 |
| R7 | 任何契约级变更（contracts 包的类型、CLI 参数、JSON 回执结构）都要在 `docs/adr/` 里新增或更新 ADR |
| R8 | 不删除、不覆盖用户的未提交改动；遇到 `git status` 有非本人改动时先停下记录 |

### 0.3 本文未覆盖时

选择**最简单、可逆**的方案并继续推进，在 `docs/adr/IMPLEMENTATION_NOTES.md` 里追加一条（日期、问题、选择、理由）。不要因为小的设计问题停下来。

---

## 1. 决策摘要

| # | 决策 | 来源 |
|---|---|---|
| D1 | **方案 B**：在 `packages/*` 用 TypeScript 重写，legacy 只作参考 | 用户 |
| D2 | **CLI 优先**：包名 `virta`，命令 `virta`，短命令 `vt`；本期不做 MCP，也不做 Python API | 用户 |
| D3 | **地图本期搁置**。远期方案是内置中国省级数据，同时支持 `--geo` 覆盖（预留设计见 §13）；本期契约和代码都不包含 map | 用户 |
| D4 | **静态导出**：必须支持 PNG 和 SVG | 用户 |
| D5 | **legacy**：迁移期冻结；17 个图族达到对等并经用户确认后，归档到 `archive/legacy-vizscape/` | 用户 |
| D6 | **分发**：暂不发布 npm，本地用 `npm link` 或 `npx` 在仓库内使用；`package.json` 按可发布标准写，但保留 `"private": true` | 用户 |
| D7 | data-engine **同构**：核心不依赖 Node API，浏览器里也能跑（为联动筛选、页面内改映射）；文件 I/O 放在 `@virta/data-engine/node` 子路径 | 设计 |
| D8 | **场景图 + 双渲染器**：几何层只产出与平台无关的 Scene，再分别交给 Canvas（交互）和 SVG（静态）渲染；PNG 由 SVG 经 resvg 光栅化。交互版和静态版共用同一份几何 | 设计 |
| D9 | **确定性文字度量**：布局统一用内置字宽表测文字，Node 和浏览器得到一致的布局，不依赖 DOM 或 Canvas 的 `measureText` | 设计 |
| D10 | spec 和 dashboard 只用 **JSON**，不引 YAML 依赖 | 设计 |
| D11 | **golden 对拍**：从 legacy 导出各图族的数据模型 JSON，作为 TS adapter 的验收基准 | 设计 |
| D12 | 运行环境 Node ≥ 22（本机 24）、npm workspaces、TypeScript 5.9.2（不升 7.x）、纯 ESM | 设计 |
| D13 | 视图 ID 改用完整名（`heatmap`、`boxplot`、`fishbone`），legacy 的短名（`heat`、`box`、`fish`）作为别名保留 | 设计 |
| D14 | 3D 图（pie3d / line3d / scatter3d / matrix3d）原样迁移，不再增强；推荐引擎里给低分 | 设计 |

M0 阶段要把 D1–D14 拆成 ADR 写进 `docs/adr/`（见 M0.7）。

---

## 2. 目标与非目标

### 2.1 本期目标

1. TS 新架构可用，17 个 legacy 图族达到功能对等，交互页和静态导出（SVG/PNG）都能产出。
2. CLI 对 Agent 友好：结构化回执和错误、stdin 和内联数据、ViewSpec 精确控制、全图族推荐、契约校验、自动洞察、组合页、自带 Agent 指南。
3. 视觉统一：只有一份设计 token；默认阅读态（图表在首屏）；编辑态用抽屉；有叙事层（标题/副标题/洞察/来源/标注）；字体真实生效；标签避让。
4. 新增图表：T1 六类加分面；T2 四类（§7）。
5. 5 个场景 Demo 包、1 个边界用例集、真实缩略图画廊、故事页和仪表盘。
6. 完整测试体系：单元测试、golden 对拍、CLI 端到端、视觉回归、性能预算，并接入 CI。

### 2.2 非目标

**地图（§13）**；npm 发布；MCP Server；Python API；T3 图表（弦图、马赛克、K 线、词云、Bump、河流图、时间线）；3D 图增强；多语言（只保证文案集中，方便以后做）；服务端或在线编辑器。

---

## 3. 总体架构

### 3.1 目录结构（目标态）

```text
packages/
  contracts/       @virta/contracts      类型契约 + 各图族 contract 常量（纯数据，无运行时依赖）
  design-system/   @virta/design-system  token、主题、配色、色阶、字体、CSS 生成
  data-engine/     @virta/data-engine    读取 / 解析 / 画像 / 适配 / 质量 / 推荐 / 校验 / 洞察（同构）
                                         子路径 @virta/data-engine/node：文件、stdin、xlsx 读取
  chart-core/      @virta/chart-core     Scene 图元、比例尺、文字度量、SVG/Canvas 渲染器、命中测试、补间、标签避让
  chart-skin/      @virta/chart-skin     坐标轴、网格、图例、tooltip 内容、标注、数字格式、静态卡片框
  charts/          @virta/charts         各图族 layout（model + state → Scene）与控件声明
  viewer/          @virta/viewer         浏览器运行时：页面壳、阅读/编辑态、状态与 hash、导出、组合页
  cli/             virta                 命令行（bin: virta, vt）
apps/playground/                         开发用：esbuild serve 预览所有样例（不进产物）
examples/
  basic/                                 每个图族的最小样例（从 legacy/examples 迁移）
  packs/<id>/                            场景包（§8）
  edge-cases/                            边界用例（不进画廊）
scripts/
  golden/                                legacy 模型导出（Python）
  packs/                                 场景数据生成器（TS，固定种子）
  fonts/                                 字体下载与子集化（一次性，Python fonttools）
  build.mjs                              esbuild 构建 viewer 分图族 bundle 与 cli
snapshots/                               Playwright 视觉基线
docs/adr/  docs/agent/  docs/charts/  docs/design/  docs/plan/
```

### 3.2 包依赖方向（只能自上而下，禁止反向和循环）

```text
contracts
   ├── design-system
   ├── data-engine ───────────────────────────┐
   └── chart-core (← design-system)           │
          └── chart-skin                      │
                 └── charts                   │
                        └── viewer (← data-engine)
                               └── cli (← data-engine/node, @resvg/resvg-js)
```

- `charts` 不依赖 `data-engine`：它只接收 adapter 产出的 model。
- `viewer` 依赖 `data-engine`，用于浏览器内重新适配（联动筛选、改映射、切变体）。
- 用一个 vitest 测试检查依赖方向：解析每个包 `package.json` 的 dependencies，与上图对照。

### 3.3 第三方依赖白名单（精确版本）

| 包 | 版本 | 用途 | 位置 |
|---|---|---|---|
| typescript | 5.9.2 | 类型检查（已在用） | root dev |
| esbuild | 0.28.2 | 构建 viewer 分图族 bundle 与 cli | root dev |
| vitest | 4.1.12 | 单元测试与集成测试 | root dev |
| @playwright/test | 1.64.1 | 仅用于视觉回归和首屏验收，不进产物链路 | root dev |
| tsx | 4.23.15 | 运行 TS 脚本（packs 生成、构建） | root dev |
| papaparse | 5.7.0 | CSV 解析 | data-engine |
| read-excel-file | 9.3.12 | xlsx 解析（`read-excel-file/node`） | data-engine（仅 node 子路径） |
| @resvg/resvg-js | 2.6.2 | SVG → PNG | cli |

Markdown 和纯文本解析**不引依赖**：移植 `legacy-vizscape/docmd.py`，保持指标抽取语义。以上之外的依赖需要先写 ADR 说明理由。地图相关依赖见 §13，本期不安装。

开发工具（不进 npm 依赖）：Python 3.12 + `fonttools`、`brotli`，只用于 `scripts/fonts/` 和 `scripts/golden/`，通过 `pip install` 安装即可。

### 3.4 数据流

```text
input(file | - | --data)
  → read()                    Table {columns, rows, source}
  → profile()                 TableProfile
  → resolveView()             spec.view，或 auto → recommend() 排名第一的候选
  → adapt(table, spec)        { model, quality }
  → insights(model, spec)     Insight[]
  → 输出
      html : 内联 viewer 的分图族 bundle + payload JSON（含 table 或 model）
      svg  : charts.layout(model, state, ctx) → Scene → toSVG()（含静态卡片框）
      png  : svg → resvg（scale 倍率）
  → JSON 回执（RenderReceipt）
```

---

## 4. 核心契约（`@virta/contracts` v1）

下列类型是定稿的**接口形状**，实施时字段名不得改动；可以增加可选字段，但要记入 ADR。

### 4.1 数据与画像

```ts
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type SourceFormat = 'csv' | 'json' | 'xlsx' | 'md' | 'txt' | 'inline' | 'stdin';
export interface SourceMeta { name: string; format: SourceFormat; rows: number; sheet?: string; encoding?: string }
export interface Table { columns: string[]; rows: Row[]; source: SourceMeta; passthrough?: { kind: 'echarts'; data: unknown } }

export type ColumnType = 'number' | 'percent' | 'date' | 'temporal-label' | 'category' | 'text' | 'boolean' | 'empty';
export interface ColumnProfile {
  name: string; type: ColumnType; ratio: number;          // 主类型占非空值比例
  distinct: number; missing: number; invalid: number; negative: number;
  min?: number; max?: number; sample: Cell[];             // 最多 5 个
  monotonic: 'asc' | 'desc' | null;
  roleHints: string[];                                    // 命中的别名角色，如 ['label','stage']
}
export interface TableProfile {
  rows: number; columns: ColumnProfile[];
  dims: string[]; measures: string[]; temporal: string[];
  hierarchy: string[] | null;                             // 检测到的父 → 子维度链
}
```

### 4.2 视图 ID

```ts
export const VIEW_IDS = [
  // legacy 对等（17 图族 / 20 模板）
  'bar', 'line', 'matrix3d', 'bullet', 'report', 'scatter', 'pie', 'pie3d', 'funnel', 'radar',
  'treemap', 'gantt', 'scatter3d', 'line3d', 'fishbone', 'heatmap', 'sankey', 'boxplot', 'sunburst', 'grid',
  // 本期新增
  'combo', 'rank', 'histogram', 'kpi', 'compare', 'cohort', 'tree', 'network', 'control', 'parallel',
  // 'map' 本期搁置，见 §13；届时作为契约变更新增
] as const;
export type ViewId = typeof VIEW_IDS[number];
export const VIEW_ALIASES: Record<string, ViewId> = { heat: 'heatmap', box: 'boxplot', fish: 'fishbone', pivot: 'grid', spc: 'control' };
// pivot 映射为 grid，并默认 variant='pivot'
```

### 4.3 图族契约（机器可读，替代 legacy 的 CONTRACT）

```ts
export type RoleType = 'number' | 'category' | 'date' | 'text' | 'any';
export interface RoleSpec {
  role: string; label: string; type: RoleType; required: boolean;
  multiple?: boolean;                 // 可映射多列，如 radar 的多个系列、sunburst 的 level1..N
  aliases: string[];                  // 原始别名（中英文），比较前统一 normKey
  note?: string;
}
export interface ModeSpec { id: string; label: string; requires: string[]; when: string }   // 互斥的输入模式（取代伪列名）
export interface VariantSpec { id: string; label: string; description: string; requires?: string[]; disabledWhen?: string }
export interface OptionSpec {
  key: string; label: string; type: 'enum' | 'boolean' | 'number' | 'string';
  values?: { value: string; label: string }[]; min?: number; max?: number;
  default: string | number | boolean;
  group: 'view' | 'style' | 'display' | 'data';    // 编辑抽屉里的分组
  static: boolean;                                 // 静态导出是否生效
  description?: string;
}
export interface ChartContract {
  version: 1; view: ViewId; aliases: string[]; title: string; summary: string;
  roles: RoleSpec[]; modes?: ModeSpec[]; variants: VariantSpec[]; options: OptionSpec[];
  inference: string[];                              // 自动判定与清洗规则（人类可读）
  example: { csv: string; spec?: Partial<ViewSpec> };
  staticExport: boolean; legacyTemplate?: string;
}
```

示例：热力图用 `modes` 表达日历和矩阵两种模式，不再写成"date（日历模式）"这类伪列名：

```ts
modes: [
  { id: 'calendar', label: '日历', requires: ['date', 'value'], when: '存在可解析日期列' },
  { id: 'matrix',   label: '矩阵', requires: ['x', 'y', 'value'], when: '无日期列，存在两个维度列' },
]
```

### 4.4 ViewSpec v1

```ts
export type Theme = 'light' | 'dark';
export type PaletteId = 'signal' | 'cinnabar' | 'patina' | 'blueprint' | 'inkwash' | 'mono' | 'sundown' | 'dunhuang' | 'aurora' | 'morandi';
export interface ViewSpec {
  version: 1;
  view: ViewId | 'auto';
  variant?: string;                                   // 如 bar: grouped|stacked|pct|pareto|waterfall
  mode?: string;                                      // 强制输入模式，如 heatmap: calendar|matrix
  mapping?: Record<string, string | string[]>;        // role → 列名，覆盖自动识别
  theme?: Theme; palette?: PaletteId;
  options?: Record<string, string | number | boolean>;   // 必须在 contract.options 中声明
  state?: Partial<ViewState>;
  text?: { title?: string; subtitle?: string; note?: string; source?: string; unit?: string };
  annotations?: Annotation[];
  format?: NumberFormat;
  facet?: { column: string; columns?: number; sharedScale?: boolean };
  layout?: 'read' | 'edit';
  size?: { width: number; height: number };           // 静态导出尺寸（CSS px），默认 1200×675
}
export type Annotation =
  | { type: 'refLine'; axis: 'x' | 'y' | 'y2'; value: number | string; label?: string }
  | { type: 'band'; axis: 'x' | 'y'; from: number | string; to: number | string; label?: string }
  | { type: 'marker'; at: { label?: string; series?: string; x?: number | string; y?: number }; text: string }
  | { type: 'event'; at: string; text: string };      // 时间轴上的事件竖线
export interface NumberFormat { style?: 'auto' | 'raw' | 'thousands' | 'wan' | 'percent' | 'currency'; currency?: 'CNY' | 'USD' | 'EUR'; decimals?: number }
export interface ViewState {
  sort?: 'none' | 'asc' | 'desc';
  hiddenSeries?: string[];                            // ⚠ 由 legacy 的 number[] 改为系列名（更稳定），需记入 ADR
  filter?: Record<string, string[]>;                  // 列 → 保留值（联动筛选）
  range?: [number, number];                           // 时间或类目窗口（索引）
  focus?: string | null;                              // 高亮项
  azimuth?: number; tilt?: number; zoom?: number;     // 3D
  time?: string | number;                             // 动态排行、时间滑块的当前帧
}
```

`format.style = 'auto'` 的规则：绝对值 ≥ 1e8 显示为"亿"，≥ 1e4 显示为"万"，其余用千分位；percent 类型列显示 `%`。

### 4.5 质量、洞察与错误

```ts
export type QualityCode =
  | 'MISSING_VALUES' | 'INVALID_NUMBERS' | 'PERCENT_SCALE' | 'NEGATIVE_VALUES' | 'DUPLICATE_KEYS'
  | 'UNKNOWN_TYPE_MARKER' | 'KIND_CONFLICT' | 'SPARSE_GRID' | 'CYCLE_REMOVED' | 'UNPARSABLE_DATES'
  | 'ROWS_SKIPPED' | 'TRUNCATED' | 'VARIANT_DISABLED' | 'FONT_FALLBACK' | 'LOW_CONFIDENCE_MAPPING';
export interface QualityIssue { code: QualityCode; level: 'info' | 'warn' | 'error'; message: string; column?: string; count?: number; examples?: string[] }
export interface QualityReport {
  rows: number; kept: number; mode?: string;
  mapping: Record<string, string | string[]>;
  confidence: 'high' | 'medium' | 'low';
  issues: QualityIssue[];                             // message 为纯文本；HTML 转义只在渲染层做
  stats: Record<string, string | number>;             // 识别报告里的芯片
}

export type InsightKind = 'peak' | 'trough' | 'trend' | 'change' | 'share' | 'concentration' | 'outlier'
  | 'gap' | 'correlation' | 'bottleneck' | 'critical-path' | 'target' | 'retention' | 'distribution';
export interface Insight { kind: InsightKind; text: string; value?: number; ref?: { label?: string; series?: string; column?: string }; importance: number }

export type ErrorCode =
  | 'INPUT_NOT_FOUND' | 'UNSUPPORTED_FORMAT' | 'PARSE_ERROR' | 'EMPTY_DATA'
  | 'MISSING_COLUMN' | 'AMBIGUOUS_MAPPING' | 'UNKNOWN_VIEW' | 'INVALID_SPEC' | 'INVALID_OPTION'
  | 'UNSUPPORTED_EXPORT' | 'RENDER_FAILED' | 'EXPORT_FAILED' | 'INTERNAL';
export interface VizError {
  code: ErrorCode; message: string; hint?: string; recoverable: boolean;
  details?: { missingRoles?: string[]; ambiguous?: { role: string; columns: string[] }[]; column?: string; candidates?: string[] };
}
export const EXIT_CODES = { OK: 0, INTERNAL: 1, USAGE: 2, INPUT: 3, DATA: 4, RENDER: 5 } as const;
```

错误码到退出码的映射：
- USAGE（2）：UNKNOWN_VIEW、INVALID_SPEC、INVALID_OPTION
- INPUT（3）：INPUT_NOT_FOUND、UNSUPPORTED_FORMAT、PARSE_ERROR、EMPTY_DATA
- DATA（4）：MISSING_COLUMN、AMBIGUOUS_MAPPING
- RENDER（5）：UNSUPPORTED_EXPORT、RENDER_FAILED、EXPORT_FAILED
- INTERNAL（1）：INTERNAL

### 4.6 CLI 回执

所有带 `--json` 的命令，stdout **只输出一个 JSON 对象**，日志和进度一律写 stderr：

```ts
export type Envelope<T> =
  | { ok: true; command: string; version: string; data: T; warnings: QualityIssue[] }
  | { ok: false; command: string; version: string; error: VizError };

export interface RenderReceipt {
  view: ViewId; variant?: string; mode?: string; reason: string;     // reason: 'explicit' 或推荐理由
  files: { format: 'html' | 'svg' | 'png'; path: string; bytes: number; width?: number; height?: number }[];
  counts: Record<string, number>;                                     // 取代 legacy 的 SUMMARY_KEYS
  quality: Pick<QualityReport, 'confidence' | 'issues' | 'mapping'>;
  insights: Insight[];
  spec: ViewSpec;                                                     // 解析补全后的完整 spec，可原样复用
  summaryMd: string;                                                  // 1–3 行 Markdown 摘要，供 Agent 直接引用
}
export interface InspectReceipt {
  input: string; format: SourceFormat; rows: number;
  profile: TableProfile;
  candidates: { view: ViewId; variant?: string; mode?: string; score: number; reason: string; mapping: Record<string, string | string[]>; missingRoles: string[] }[];  // 前 5 名
  doc?: { sections: number; headings: number; tables: number; metrics: number; confidence: string };
}
export interface ValidateReceipt {
  view: ViewId; valid: boolean; mode?: string;
  mapping: Record<string, string | string[]>; missingRoles: string[];
  ambiguous: { role: string; columns: string[] }[];
  issues: QualityIssue[]; suggestions: string[];                      // 可执行的修复建议，如"把列「金额」映射为 value：--set mapping.value=金额"
}
```

---

## 5. 各包详细设计

### 5.1 `@virta/data-engine`

**读取（`/node` 子路径）**
- CSV：papaparse，去 BOM，自动识别分隔符（`,` `\t` `;`）。读 UTF-8 失败（出现替换字符比例 > 1%）时尝试 GB18030（用 `TextDecoder('gb18030')`），并在 `source.encoding` 里标注。
- JSON：数组；或 `{data|rows|result}` 对象；ECharts 风格（含 `xAxis` + `series`，或 `series` 但无 `labels`）放进 `Table.passthrough`，语义同 legacy 的 `read_raw`。
- xlsx：`read-excel-file/node`，读第一个 sheet（`--sheet` 可指定）；首行为表头，跳过全空行。
- stdin（`-`）：按 `--format` 解析；未指定时依次嗅探 JSON 和 CSV。
- `--data '<json>'`：内联 JSON，按 JSON 规则解析。
- `.md` / `.txt`：交给 doc 管线（移植 `docmd.py` 的 `parse_markdown`、`extract_metrics`、`build_doc`、`profile_doc`）。

**数值解析 `parseNumber`**：逐条对齐 `legacy-vizscape/vizlib/core.py` 的 `parse_number`：缺失标记集合、括号负数、全角逗号、货币符号、百分号**保留原刻度**（10% 记为 10，状态为 percent）、千分位。用表驱动测试覆盖 legacy 的全部分支。

**别名表**：迁移 `core.py` 里的全部 `RAW_*_ALIAS` 和各图族模块里的私有别名（如 `HEAT_X_ALIAS`），统一放到 `src/aliases.ts`；`normKey` 的语义与 legacy 一致（只保留 `[0-9a-zA-Z\u4e00-\u9fff]`，转小写）。

**画像 `profile`**：
- 数值列：可解析比例 ≥ 0.8（`NUM_RATIO`）。
- 日期列：用 `parseGanttDate` 的移植版，可解析为 date 的比例 ≥ 0.8。
- temporal-label：命中 `TEMPORAL_RE` 的比例 ≥ 0.8 且 ≥ 3 行。
- hierarchy：维度列两两检查"子 → 父"是否唯一（每个子值只对应一个父值），串成最长链。

**适配器**：每个图族一个文件 `src/families/<view>.ts`，导出：

```ts
export interface FamilyAdapter<M> {
  view: ViewId;
  adapt(table: Table, spec: ViewSpec): { model: M; quality: QualityReport };   // 失败时抛 VizError
  score(profile: TableProfile, table: Table): { score: number; reason: string; mapping: Record<string, string | string[]>; variant?: string; mode?: string; missingRoles: string[] };
  insights(model: M, spec: ViewSpec): Insight[];
  counts(model: M): Record<string, number>;
}
```

legacy 图族的 model 字段**结构与 legacy `to_*` 的返回值一致**（键名可以改成 camelCase，在 golden 比对层做映射），以便对拍。

**推荐引擎**：对所有图族调用 `score()`，按分数降序取前 5。各图族的打分规则见下表，`score ∈ [0,1]`：

| 视图 | 触发信号 | 基础分 |
|---|---|---|
| report | 输入为 .md/.txt | 1.00 |
| tree | 有 id + parent 列 | 0.95 |
| gantt | 有任务类目列 + 开始日期（+ 结束日期或工期） | 0.95 |
| boxplot（summary 模式） | 有 min/q1/median/q3/max 列 | 0.95 |
| bar（waterfall 变体） | type 列含 absolute/delta 类标记 | 0.90 |
| bullet | 有 actual + target 别名列 | 0.90 |
| fishbone | category + cause 两个文本列，且无数值列 | 0.90 |
| cohort | 类日期的 cohort 列 + 整数 period 列（0..N）+ value | 0.90 |
| sankey / network | 有 source + target + value；能分层的 DAG 给 sankey 0.90，有环或无层次给 network 0.85 | 0.85–0.90 |
| control | 日期 + 测量值 +（UCL/LCL 列或样本量列） | 0.85 |
| funnel | 3–8 行，≥ 80% 单调递减，标签命中阶段别名 | 0.85 |
| heatmap | 日历：日期列 ≥ 60 个不同日 + 1 个度量 → 0.85；矩阵：两个维度列（各 3–40 个值）+ 度量，网格覆盖率 ≥ 50% → 0.75 | 0.75–0.85 |
| line | temporal-label 或日期作类目 + 度量（≥ 12 个点再加 0.05） | 0.80 |
| boxplot（观测模式） | 1 个维度（≤ 20 组）+ 度量，平均每组 ≥ 5 条观测 | 0.80 |
| histogram | 只有 1 个度量列且 ≥ 30 行 | 0.80 |
| compare | 标签 + 恰好 2 个度量，列名像对比期（年份、前/后、上期/本期、计划/实际） | 0.80 |
| rank | 标签 + 单度量 ≥ 10 行 → 0.65；再加时间列 → race 变体 0.75 | 0.65–0.75 |
| sunburst / treemap | 检测到层级 + 度量；深度 ≥ 3 → sunburst 0.75；深度 2 且叶子 > 20 → treemap 0.75；其余两者都给 0.70 | 0.70–0.75 |
| scatter | ≥ 2 个度量，≥ 8 行，无时间标签（有 size 列时用 bubble 选项） | 0.70 |
| combo | 类目或时间 + 2 个度量，量级相差 > 10 倍或其中之一是百分比 | 0.70 |
| grid | ≥ 3 个维度 + ≥ 1 个度量（pivot 变体） | 0.65 |
| bar | 兜底：单系列 0.50，多系列 0.60 | 0.50–0.60 |
| radar | 宽表 3–12 行 × 2–6 个同量级度量（max/min < 10） | 0.60 |
| kpi | ≤ 8 行，有指标名 + 值（+ 目标/上期） | 0.60 |
| parallel | ≥ 4 个度量且 ≥ 20 行 | 0.60 |
| pie | 1 个维度 ≤ 8 个值 + 非负度量，单系列 | 0.55 |
| scatter3d / line3d / pie3d / matrix3d | 满足输入条件时 | 0.30–0.40 |

验收：`examples/basic/*` 的每个样例，以及每个场景包 `pack.json` 里声明了 `expectTop` 的条目，推荐的第一名都必须与预期一致（作为测试）。

**校验 `validate(table, spec)`**：按 contract 的 roles 和 modes 解析映射，产出 `ValidateReceipt`：缺失角色、歧义（一个角色命中多列）、选项非法（`options` 未声明或值越界）、数据问题（取自 adapter 的 quality）。`suggestions` 必须给出**可直接执行**的写法（`--set mapping.value=金额`）。

**洞察**：每个图族实现 `insights()`，文本模板用中文，数字格式化服从 `spec.format`，`importance` 用来排序。阅读态展示前 3 条，回执里输出全部（最多 8 条）。最低规则：

| 图族 | 至少包含的洞察 |
|---|---|
| line / combo | 首末变化率、峰值和谷值（带标签）、最大环比变化、异常点（相对 3 点滚动均值的残差 \|z\| > 2.5） |
| bar / rank | Top1 占比、Top3 集中度、第 1 与第 2 名差距、负值项数；pareto 变体给出达到 80% 所需的类目数 |
| pie / treemap / sunburst | 最大占比、长尾（占比 < 5% 的项数） |
| funnel | 总转化率、流失最大的环节 |
| scatter | Pearson r（\|r\| ≥ 0.7 强、≥ 0.4 中、其余弱）、离群点数 |
| heatmap / cohort | 最热格或最热日、行/列模式（星期、时段）；cohort 给出第 N 期平均留存和最佳批次 |
| sankey / network | 最大流量、最大汇点或流失点；network 给出度最高的节点 |
| boxplot / histogram | 中位数最高的组、离散度最大（IQR）的组、离群点数；histogram 给出偏度描述 |
| bullet / kpi | 达标数、差距最大的指标 |
| gantt | 关键路径结束日、逾期任务数、整体完成度 |
| waterfall | 最大正贡献和最大负贡献 |
| compare | 变化最大的项、方向反转的项 |
| radar | 每个系列最强和最弱的维度 |
| control | 超出控制限的点、连续 7 点同侧的点 |

### 5.2 `@virta/design-system`

**token 源**：`src/tokens.ts`（带类型）是唯一来源，导出：
- `themes.light`（Meridian）、`themes.dark`（Pulse）的语义色：`bg paper panel ink muted faint line line2 grid acc neg pos tip tipInk shadow`。初值取自 `legacy-vizscape/templates/line-basic/template.html` 第 9–10 行的 `html[data-theme=…]`，`--neg` 取自 `_shared.css` 里的用法。
- `palettes`：10 套 × light/dark × 8 色，**原样迁移** `legacy-vizscape/templates/bar-basic/template.html` 里的 `PALETTES` 对象（第 121 行起）；同时迁移 `_shared.css` 里各配色的 `--acc` 覆盖值。
- `ramps`：每套配色派生顺序色阶（paper → acc，7 级）和发散色阶（neg → paper → acc，9 级）。在 OKLCH 空间插值（自己实现约 60 行的转换，不引依赖）。
- 间距 `4 8 12 16 24 32 48`；圆角 `6 10 14 20 999`；阴影 `sm md lg`；动效时长 `fast 160 / base 320 / enter 600` ms，缓动 `cubic-bezier(.2,.7,.2,1)`。
- 字体角色：`display`（Fraunces，仅拉丁）、`body`（中文系统栈）、`mono`（JetBrains Mono）。

**CSS 生成**：`buildCss({ fonts: boolean })` 输出 `:root` 变量、`[data-theme]`、`[data-palette]` 规则，以及 §6 的组件基础样式，由 viewer 内联进页面。

**字体**（已获用户授权联网下载，M1 必做）：
1. **下载**：`scripts/fonts/fetch.py` 从官方来源下载，并把原始文件存到 `scripts/fonts/.cache/`（gitignore）：
   - Fraunces：google/fonts 仓库 `ofl/fraunces/` 下的可变字体 TTF 和 `OFL.txt`；
   - JetBrains Mono：JetBrains/JetBrainsMono 仓库的最新 Release 压缩包，取 `fonts/ttf/JetBrainsMono-Regular.ttf` 和 `OFL.txt`。

   每个文件都计算 SHA-256，写入 `packages/design-system/fonts/SOURCE.md`（来源 URL、Release/commit、下载日期、SHA-256）。
2. **实例化与子集化**：`scripts/fonts/subset.py`（依赖 `pip install fonttools brotli`）。
   - 用 `fontTools.varLib.instancer` 把 Fraunces 固定为 `opsz=72, wght=300` 和 `opsz=72, wght=500` 两个静态实例，`SOFT=0, WONK=0`。
   - 三个字体都子集化为 U+0020–007E、U+00A0–00FF、U+2013–2014、U+2018–201D、U+2022、U+2026、U+2030、U+2190–2193、U+00D7、U+2212、U+FFE5，并保留 `kern`、`tnum`、`lnum` 特性。
   - 输出 TTF：`fraunces-light.ttf`、`fraunces-medium.ttf`、`jetbrains-mono-regular.ttf`，每个 ≤ 40KB；超出时去掉 U+00A0–00FF 后重试。
3. **授权文件**：把两份 `OFL.txt` 分别存为 `packages/design-system/fonts/OFL-Fraunces.txt` 和 `OFL-JetBrainsMono.txt`；子集 TTF 和授权文件都要提交。OFL 要求保留版权声明且不得单独售卖，在 SOURCE.md 里注明。
4. **度量表**：`scripts/fonts/metrics.py` 从子集 TTF 导出 advance width（按 unitsPerEm 归一化）到 `packages/design-system/fonts/metrics.json`，供 §5.3 的文字度量使用。
5. **使用**：HTML 内联 base64 的 `@font-face`（`font-display: block`，避免首帧字体闪烁导致重新布局）；resvg 通过 `fontBuffers` 加载同一份 TTF。
6. 中文字体栈：`"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC",sans-serif`。中文字体不内嵌（体积过大）。
7. **测试**：字体文件存在且体积不超标；`metrics.json` 覆盖子集内全部字符；用 resvg 渲染含 Fraunces 的 SVG，检查字体确实被使用（同一文本在指定字体与回退字体下的渲染像素不同）。
8. **兜底**：如果下载确实失败（网络受限），先退回纯系统字体栈继续推进，在 IMPLEMENTATION_NOTES 里记录，并在 M1 的交付说明里**明确列为未完成项**，不得静默跳过。
9. **禁止中文斜体**：标题强调用 `--acc` 颜色加字重，不用 `<em>` 的斜体。

**测试**：
- 每套 palette 前 6 色两两 ΔE76 ≥ 15（mono、inkwash、morandi 豁免，它们依赖纹理和明度，在文档里注明）。
- `ink` 与 `muted` 在 `paper` 上的对比度 ≥ 4.5，`faint` ≥ 3.0。

### 5.3 `@virta/chart-core`

**Scene 图元**（颜色在 layout 阶段就解析成具体色值，渲染器不认识 CSS 变量，这样 SVG/PNG 能独立存在）：

```ts
export interface Scene { width: number; height: number; background?: string; defs: Defs; root: Group; hits: HitRegion[] }
export interface Defs { gradients: LinearGradient[]; radials: RadialGradient[]; patterns: Pattern[]; clips: ClipPath[] }
interface Base { id?: string; fill?: Paint; stroke?: Paint; strokeWidth?: number; opacity?: number; dash?: number[]; clip?: string; shadow?: Shadow; datum?: DatumRef }
export type Paint = string | { ref: string };                    // 色值，或引用 defs 中的渐变/纹理
export type Node =
  | (Base & { type: 'group'; children: Node[]; transform?: [number, number, number, number, number, number] })
  | (Base & { type: 'rect'; x: number; y: number; w: number; h: number; r?: number | [number, number, number, number] })
  | (Base & { type: 'path'; d: string })                          // SVG path 语法；Canvas 端用 Path2D
  | (Base & { type: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (Base & { type: 'circle'; cx: number; cy: number; r: number })
  | (Base & { type: 'text'; x: number; y: number; text: string; font: 'display' | 'body' | 'mono'; size: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom'; rotate?: number });
export interface DatumRef { kind: string; index: number; series?: string; label?: string; value?: number; tooltip: TooltipContent }
export interface HitRegion { shape: Node; datum: DatumRef }
```

**比例尺**：linear（nice ticks）、log、sqrt、band、point、time（按日/周/月/季/年自动选刻度）、color（ordinal、sequential、diverging）。

**文字度量（D9）**：`measureText(text, font, size)`：
- CJK 和全角字符按 1.0em。
- mono 字体按 0.6em。
- display 和 body 的拉丁字符查表：构建时由 `scripts/fonts/metrics.py` 从子集字体导出 advance width 表（`fonts/metrics.json`）；body 拉丁字符用系统 sans 的近似表（平均 0.55em，按窄字符 `il.,:;'|` 和宽字符 `mwMW@` 分组）。
- 浏览器和 Node 用同一个函数做布局；标签避让统一留 4px 余量。

**渲染器**：
- `toSVG(scene): string`：确定性输出，坐标保留 2 位小数，属性顺序固定，便于快照测试；text 节点写 `font-family` 的回退栈。
- `drawCanvas(ctx, scene, dpr)`：支持 devicePixelRatio，`Path2D` 缓存。

**命中测试**：均匀网格空间索引，先按包围盒粗筛，再精确判断（rect、circle 用解析式，path 用 `isPointInPath`）。

**补间**：按节点 `id` 匹配前后两帧 Scene 做插值（数值属性和颜色）；入场动画 600ms；`prefers-reduced-motion` 时直接跳到终态；静态导出不做动画。

**标签避让 `placeLabels(candidates, bounds)`**：贪心算法，按优先级（数值大小）排序，每个标签尝试 4–8 个候选位置；放不下时，可以加引导线的就加，否则隐藏，并在 tooltip 里保留信息。sankey、pie、scatter、treemap、network 都必须使用它。

### 5.4 `@virta/chart-skin`

- **坐标轴**：刻度标签用 11px mono、muted 色；网格线用 `grid` 色；零基线 1.5px ink；轴标题和单位放在左上角（取 `text.unit`）。
- **图例**：静态版作为 Scene 节点；交互版在 viewer 里渲染成 DOM chip（可点击开关系列，状态写入 `hiddenSeries`）。
- **tooltip 内容模型** `TooltipContent { title; rows: { swatch, name, value, share? }[]; footer? }`：交互版由 viewer 渲染成 DOM，静态版不显示。
- **标注**：refLine（acc 色虚线 + 右端标签）、band（acc 8% 透明填充）、marker（圆点 + 引出说明）、event（时间轴上的竖线 + 顶部标签）。
- **数字格式**：`formatNumber(v, NumberFormat, columnType)`，实现 §4.4 的 auto 规则。
- **静态卡片框** `frameStatic(scene, { text, insights, legend, theme, frame })`：
  - `frame=card`（默认）：外层带标题、副标题、最多 3 条洞察、图例、来源和单位脚注，再包住图表。
  - `frame=chart`：只输出绘图区。

### 5.5 `@virta/charts`

每个图族一个目录 `src/<view>/`，导出：

```ts
export interface FamilyRenderer<M> {
  view: ViewId;
  layout(model: M, ctx: LayoutContext): Scene;   // LayoutContext: { width, height, theme, palette, variant, mode, options, state, format, annotations, tokens }
  controls?: ControlHint[];                      // 补充 contract.options 之外的交互（如 3D 拖拽旋转、甘特视图切换）
  interactions?: ('brush' | 'drag-node' | 'rotate' | 'zoom' | 'drill' | 'play')[];
}
```

- 页面里的所有选项都来自 contract 的 `options`，viewer 据此自动生成编辑抽屉；不再像 legacy 那样在每个模板里手写按钮。
- legacy 模板里的每一个按钮或交互，都必须能在新版找到对应项。对等清单见 §7.1。

### 5.6 （地图，本期搁置，见 §13）

### 5.7 `@virta/viewer`

**产物结构**（单文件）：

```html
<!doctype html><html lang="zh-CN" data-theme="light" data-palette="signal">
<head><meta charset="utf-8"><title>…</title><style>/* design-system CSS + viewer CSS */</style></head>
<body><div id="virta-root"></div>
<script type="application/json" id="virta-payload">{…}</script>   <!-- JSON 中的 < 转义为 \u003c -->
<script>/* @virta/viewer 的分图族 bundle（esbuild minify、IIFE） */</script>
</body></html>
```

**payload**：`{ version: 1, meta: { tool: 'virta', version, generatedAt, source }, spec, contract, model, quality, insights, table? }`。当 `rows ≤ 20000` 且 JSON ≤ 5MB 时内嵌 `table`，支持页面内重新适配；超出时只内嵌 model，相关功能置灰，并加 `TRUNCATED` 提示。

**页面功能**（详细视觉规范见 §6）：
- 阅读态和编辑态切换；编辑抽屉由 `contract.options` 自动生成，分组为视图、样式、显示、数据。
- 状态同步：spec 中的 `variant`、`options`、`state`、`theme`、`palette` 与 URL hash（`#s=<base64url(JSON)>`）双向同步，刷新后保持。
- 编辑抽屉底部有「复制 spec」按钮（复制解析后的完整 ViewSpec JSON），方便"人在页面上调好 → Agent 复用"；另有「重置」按钮。
- 导出菜单：PNG（Canvas 2×，`toBlob`）、SVG（浏览器内用同一个 `toSVG`）、CSV（当前视图的数据表）、spec.json。
- 全屏、打印样式（`@media print`：隐藏控件，图表铺满）。
- 键盘：Tab 进入图表后，方向键在数据点间移动，Enter 固定 tooltip，Esc 取消；tooltip 区域设 `aria-live="polite"`；数据表折叠区作为读屏的后备。
- 响应式：容器宽度变化时用 ResizeObserver 重新 layout；宽度 < 720px 时编辑抽屉变为底部面板。
- **分图族 bundle**：`scripts/build.mjs` 为每个视图生成 `packages/viewer/dist/<view>.js`；CLI 只内联当前视图的 bundle。预算：每个 bundle（minify 后）≤ 150KB；内联字体合计 ≤ 160KB（base64 后）。

**组合页**（`compose`）：一个 bundle 包含所需的多个图族。
- 布局：`grid`（12 栏，面板可以声明 w/h）或 `story`（纵向叙事：问题 → 图 → 洞察）。
- 联动：`links: [{ column }]`。在任一面板点击类目或区域，会把同列的筛选写入共享的 `state.filter`，其他面板在浏览器内重新 adapt；需要内嵌 table。

### 5.8 `virta`（CLI）

参数解析用 Node 内置的 `util.parseArgs`，不引参数解析库。

```text
virta list [--json]                                 列出全部视图（id / 别名 / 标题 / 变体 / 静态导出支持）
virta schema [view] [--json] [--spec-schema]        contract（JSON）；--spec-schema 输出 ViewSpec 的 JSON Schema（手写常量）
virta inspect <input|-> [--format csv|json] [--sheet N] [--json]
virta validate <input|-> --view <v> [--spec f|json] [--set k=v]... [--json]
virta render <input|-> [--view <v>|auto] [--variant <id>] [--spec <file|json>] [--set k=v]...
             [--data <json>] [--format csv|json] [--sheet N]
             [--theme light|dark] [--palette <id>]
             [--title ..] [--subtitle ..] [--note ..] [--source ..] [--unit ..]
             [--export html,svg,png] [--out <path|dir>] [--width 1200] [--height 675] [--scale 2] [--frame card|chart]
             [--font-file <ttf>]... [--json]
virta compose <compose.json> [--export html,png] [--out dir] [--json]
virta demo [pack|--all] [--out dir] [--json]          生成场景包的故事页、仪表盘和 PNG
virta gallery [--out dir]                            生成画廊（缩略图由 PNG 导出生成）
virta preview <file.html>                            用系统浏览器打开
virta guide [--agent]                                输出 Agent 使用指南（即 docs/agent/SKILL.md 的内容）
```

- **`--set` 语法**：`key=value`，点号表示路径（`mapping.value=金额`、`options.finish=glass`、`state.sort=desc`、`text.title=…`）；值能解析成 JSON 就按 JSON（数字、布尔、数组），否则当字符串。合并优先级：`--set` > 专用参数（`--theme` 等）> `--spec` > 默认值。
- **输出命名**：未指定 `--out` 时，写到 `./out/<stem>-<view>[-<variant>]-<theme>.<ext>`；`--out` 指向目录时按同样规则命名；导出多种格式时 `--out` 必须是目录或不带扩展名的路径。
- **字体回退**：PNG 导出加载 design-system 的 TTF、`--font-file` 指定的字体和系统字体（`loadSystemFonts: true`）。如果用中文测试串渲染后检测到缺字形（用 resvg 渲染一段固定中文，判断像素是否为空），回执里加 `FONT_FALLBACK` 警告，并提示用 `--font-file` 指定字体。
- 不带 `--json` 时输出人类可读的摘要（风格沿用 legacy 的 `✓ 生成 … · reason`）；出错时输出 `✗ message` 和 `提示：hint`，退出码按 §4.5。
- **`docs/agent/SKILL.md`**（`virta guide --agent` 输出同一份内容）至少包含：
  - 标准流程：inspect → validate → render --json → 读 receipt.insights/summaryMd。
  - spec 速查、全部错误码和修复办法、10 个可复制的完整示例。
  - 推荐的提示语："先 inspect，不要猜列名"。

---

## 6. 视觉规范

### 6.1 设计方向

保留 Virta 现有的"纸面 / 观测站"气质：浅色 Meridian 是暖纸色、墨色和铜绿强调色，深色 Pulse 是炭黑底和荧光绿强调色。在此基础上做"编辑部式"的克制：**数据优先、控件让位、叙事在前**。

### 6.2 阅读态布局（默认）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ VIRTA · BAR · LIGHT (eyebrow, mono 11px, acc)  [☀/☾] [⚙ 编辑] [⤓ 导出] [⛶] │
│ 标题（display/body 40–52px，强调词用 acc 色 + 字重，无斜体）                 │
│ 副标题 / 一句话结论（body 15px，muted，最多 2 行）                          │
├──────────────────────────────────────────────────────────────────────┤
│ ◆ 洞察 1   ◆ 洞察 2   ◆ 洞察 3      （洞察条：chip，点击即在图中高亮 ref）   │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ card ────────────────────────────────────────────────────────────┐ │
│ │ 图例 chips（左）                         变体快捷切换 seg（右）     │ │
│ │                                                                  │ │
│ │          图表  height: clamp(360px, 58vh, 640px)                  │ │
│ │                                                                  │ │
│ │ detail 行（悬停信息，mono 12px）                                   │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ 来源 · 单位 · 注释（mono 11px faint）              可信度徽章 ● 高/中/低   │
│ ▸ 数据表（折叠）    ▸ 数据识别报告（折叠；有 warn 时徽章变 neg 色）          │
└──────────────────────────────────────────────────────────────────────┘
```

- 阅读态**只露出**变体快捷切换（最常用的那一个选项）；配色、表面、形状等全部收进编辑抽屉。
- 验收：在 1280×800 视口下，图表 canvas 的底边 ≤ 800px（Playwright 断言）。
- 编辑态：右侧 360px 抽屉，分组折叠，每个选项旁有一行说明（来自 OptionSpec 的 description）；抽屉不遮挡图表，图表区域收窄后重新 layout。

### 6.3 图表皮肤规则

| 元素 | 规则 |
|---|---|
| 网格 | 只画水平网格线（条形图画竖线），1px `grid` 色；不画外框 |
| 坐标轴 | 不画轴线（零基线除外）；刻度 mono 11px muted；刻度数 ≤ 6 |
| 数值标签 | mono 11px；多系列柱宽 < 18px 时自动隐藏，只在 hover 时显示 |
| 系列色 | 按 palette 顺序取色；超过 8 个系列时，第 9 个起合并为"其他"（可在选项里关闭） |
| 强调 | 有 `state.focus` 或洞察高亮时，非焦点元素透明度降到 0.25 |
| 负值 | 用 `neg` 色或发散色阶；零基线加粗 |
| 空状态 | 居中显示一句说明和一个修复建议（如"所有系列都被隐藏，点击图例恢复"） |
| tooltip | ink 底、paper 字，圆角 10px；标题 + 色块行（名称、值、占比）；跟随指针，避开视口边缘 |

### 6.4 动效与无障碍

- 入场动画只做一次，600ms，按系列交错 40ms；状态切换补间 320ms；hover 不做位移动画。
- 全部尊重 `prefers-reduced-motion`。
- 按钮都设 `aria-pressed` 或 `aria-expanded`；`:focus-visible` 用 2px `acc` 描边。
- mono 配色 + 纹理表面（hatch / dotted）作为"不依赖颜色"的组合，在编辑抽屉里提供一键切换。

### 6.5 静态导出

- 默认 1200×675（16:9），`--scale 2` 时 PNG 为 2400×1350；背景用 `paper` 色（不透明）。
- `frame=card` 的版式与阅读态一致（标题、副标题、洞察、图表、图例、脚注），但没有控件。
- SVG 必须能被 resvg、Chrome、Inkscape 正确打开（测试里至少验证 resvg 和 Chromium）。

### 6.6 画廊

- `virta gallery` 生成 `out/gallery/index.html`，有两个标签页："按场景"（5 个场景包）和"按图族"（全部视图）。
- 卡片缩略图使用 PNG 导出的真实图（640×360），点击打开交互版。
- 统计数字（图族数、模板数）从 `virta list` 的数据生成，不手写。
- 保留现有画廊的 hero 风格（大标题、网格纸背景），但删除手写的 CSS 示意缩略图。

---

## 7. 图表清单与本期范围

### 7.1 legacy 对等（必须）

| 视图 | 别名 | 变体 / 模式 | 对等要点（全部来自 legacy 模板和文档） | 批次 |
|---|---|---|---|---|
| bar | — | grouped / stacked / pct / pareto / waterfall；表面 11 种、形状 9 种；伪 3D | 负值零基线、排序、数值标签、重播动画、按规则禁用 pct/pareto（ADVANCED_MODES.md） | M3 |
| line | — | 平滑 / 直线 / 阶梯 × 无填充 / 面积 / 堆叠；窗口（全部 / 前 6 / 近 6 / 近 12） | 图例开关、hover 十字线 | M3 |
| matrix3d | — | 3 截面 × 3 棱边 × 4 顶帽，浓淡、雾化、软阴影 | 旋转、缩放、负值保护 | M4-B1 |
| scatter | — | 趋势线、log X/Y、均值线、置信椭圆、刷选、5 种标记、3 种点大小、按 size 列、离群标签 | — | M4-B1 |
| pie | — | 环形 / 实心、3 种环厚、标签（无 / 扇内 / 引导线）、"其他"合并 | 引导线必须走标签避让 | M4-B1 |
| bullet | — | 阈值带、目标线、缺失值处理 | — | M4-B1 |
| funnel | — | 单系列 / 多系列、非递减告警、负值处理 | — | M4-B1 |
| heatmap | heat | calendar / matrix；顺序 / 发散色阶；舒适 / 紧凑密度；数值标注 | 多年份切换 | M4-B2 |
| treemap | — | 一层 / 两层、负值处理 | 下钻 | M4-B2 |
| sunburst | — | N 层 | 下钻、面包屑 | M4-B2 |
| sankey | — | 标签（名称 + 值 / 仅名称 / 隐藏）、密度、流带渐变、拖动节点、去环 | **修复**末列标签碰撞（截图里"支付成功"压住"下单支付"），小节点也要有标签 | M4-B2 |
| boxplot | box | 观测聚合 / 五数汇总 | 离群点 | M4-B2 |
| radar | — | 多系列 | **补齐** palette 支持 | M4-B2 |
| gantt | — | 时间轴 / 日历双视图、依赖箭头、里程碑、进度、状态 | 脏日期处理（GANTT_CHART.md） | M4-B3 |
| fishbone | fish | 6M 分类、二级原因、负责人 | — | M4-B3 |
| grid | pivot | 明细 / 透视 | 行列拖拽、汇总、排序 | M4-B3 |
| report | — | md / txt；KPI 卡、目录、篇幅条、指标表、识别报告 | 链接协议校验、图片占位（TEXT_REPORT.md） | M4-B3 |
| pie3d / line3d / scatter3d | — | 原样对等 | **补齐** palette 支持；拖拽旋转 | M4-B3 |

### 7.2 本期新增

| 优先级 | 视图 | 变体 | 角色 | 说明 | 里程碑 |
|---|---|---|---|---|---|
| T1 | combo | bar+line / bar+bar / line+line | label, value(multiple), axis | 双轴，`options.y2Series` 指定哪些系列走右轴；右轴为百分比时自动用 % 格式 | M6 |
| T1 | rank | static / race | label, value, time? | 横向排行；race 带播放、暂停、拖动时间轴，帧间补间，`state.time` 表示当前帧 | M6 |
| T1 | histogram | count / density / cumulative | value, group? | 分箱用 Freedman–Diaconis 规则，可手动设分箱数；多组时叠加半透明 | M6 |
| T1 | kpi | cards / cards+spark | metric, value, target?, previous?, trend? | 大数字 + 环比箭头 + 迷你趋势线，也是组合页的基础组件 | M6 |
| T1 | compare | slope / dumbbell | label, from, to | 前后对比，突出方向反转的项 | M6 |
| T1 | cohort | retention% / absolute | cohort, period, value | 三角热力图，按第 0 期归一化 | M6 |
| T1 | facet（spec 层能力） | — | — | `spec.facet` 作用于 bar / line / scatter / histogram / compare 的小多图，可选共享比例尺 | M6 |
| T2 | tree | tidy / org / mindmap / indented | id+parent 或 level1..N, value? | 可折叠，节点上显示汇总 | M7 |
| T2 | network | force / circular | source, target, value?, group? | 力导向图自己实现（velocity Verlet 积分 + Barnes–Hut 可选），静态导出前先预迭代 300 步并固定种子 | M7 |
| T2 | control | I / X̄ / p | date, value, n?, ucl?, lcl? | 自动计算控制限；高亮 Western Electric 规则中的规则 1 和规则 2 | M7 |
| T2 | parallel | — | 多个 measure, group? | 轴可拖动排序，每根轴上可刷选，多轴刷选取交集 | M7 |

跨图交互（M5 / M6 完成）：组合页联动筛选、层级图下钻（treemap / sunburst / tree）、时间滑块（rank race）、图表与数据表双向高亮。

---

## 8. Demo 场景包

### 8.1 结构

```text
examples/packs/<id>/
  pack.json        元数据：故事、问题、图表条目、组合页
  README.md        场景故事与"每张图回答什么问题"（由 pack.json 生成）
  *.csv / *.md     数据（由生成器产出并提交）
```

`pack.json` 结构：

```json
{
  "id": "retail", "title": "零售电商 · 2025 年度经营复盘",
  "story": "全年 GMV 增长 18%，但 Q3 承压……",
  "charts": [
    { "id": "trend", "file": "monthly_sales.csv", "question": "销售从什么时候开始承压？",
      "spec": { "version": 1, "view": "line", "options": { "fill": "stack" },
                "text": { "title": "月度销售额", "subtitle": "8 月线下渠道同比 -22%", "unit": "万元", "source": "演示数据" },
                "annotations": [{ "type": "event", "at": "2025-08", "text": "华南门店调整" }] },
      "expectTop": "line", "expectInsight": "change" }
  ],
  "compose": { "layout": "grid", "title": "经营总览", "panels": [{ "chart": "trend", "w": 8, "h": 4 }], "links": [{ "column": "渠道" }] }
}
```

- `expectTop`：推荐引擎测试用。
- `expectInsight`：洞察测试用，断言该图的洞察里包含这一类型。

### 8.2 生成器

- `scripts/packs/generate.ts`：用 mulberry32 固定种子；时间序列 = 趋势 + 季节性 + 噪声 + 刻意埋入的事件。
- 命令：`npm run packs:gen` 写入数据；`npm run packs:check` 生成到临时目录再与已提交的文件比较，作为确定性测试。
- 所有数值保留 1 位或 0 位小数；中文列名为主，每个包至少有 1 个英文列名的文件（验证别名识别）。

### 8.3 五个场景包与边界用例集

**① retail · 零售电商年度复盘**
故事：全年 GMV 同比 +18%；8 月华南线下门店调整，加上大促的加购→下单转化下降 9 个百分点，Q3 承压；配件品类贡献主要增量。

| 文件 | 列 | 行数 | 埋点 | 视图 |
|---|---|---|---|---|
| monthly_sales.csv | 月份(2024-01..2025-12), 渠道(线上/线下/社群), 销售额, 订单数 | 72 | 11 月双 11 峰值、2 月春节低谷、2025-08 线下 -22% | line(stack), combo, bar(stacked) |
| category_tree.csv | 一级品类, 二级品类, 系列, 销售额 | ~40 | 配件增速最高 | sunburst, treemap |
| funnel_jul_aug.csv | 阶段(曝光/点击/加购/下单/支付), 月份(7月/8月), 人数 | 10 | 8 月加购→下单下降 9pt | funnel(multi) |
| traffic_paths.csv | source, target, value | ~20 | 社媒→活动页流量大，但转化低 | sankey |
| store_hours.csv | 星期, 时段(8–22 时), 客流 | 105 | 周末晚高峰 | heatmap(matrix) |
| profit_bridge.csv | 阶段, 金额, 类型 | 9 | 营销费用是最大负项 | bar(waterfall) |
| kpi.csv | 指标, 实际, 目标, 较差线, 良好线, 量程, 上期 | 6 | 2 项未达标 | bullet, kpi |
| price_volume.csv | SKU, 均价, 销量, 毛利, 品类 | 60 | 2 个高价高量离群 | scatter(bubble) |
| order_values.csv | 渠道, 客单价 | ~600 | 社群右偏 | boxplot, histogram |
| city_rank_monthly.csv | 月份, 城市, 销售额 | 144 | 成都在 9 月进入前三 | rank(race) |
| channel_yoy.csv | 渠道, 2024, 2025 | 8 | 线下反向 | compare |

**② saas · 产品增长**
故事：6 月 15 日上线"协作空间"后，新用户第 4 周留存从 38% 提升到 46%；企业版 CAC 上升 30%，LTV/CAC 逼近 3 倍警戒线。

| 文件 | 列 | 行数 | 埋点 | 视图 |
|---|---|---|---|---|
| dau_daily.csv | date, dau | 365 | 6/15 阶跃上升、国庆低谷、工作日与周末周期 | heatmap(calendar), line |
| cohort_retention.csv | cohort(2025-01..12), period(0..11), users | 78 | 6 月及以后的批次留存更高 | cohort |
| feature_usage.csv | 维度(协作/文档/自动化/集成/报表/移动端), 基础版, 专业版, 企业版 | 6 | 企业版集成维度突出 | radar |
| onboarding_paths.csv | source, target, value | ~18 | 邀请环节流失大 | sankey |
| arr_bridge.csv | 阶段, 金额, 类型 | 7 | 扩容 > 新签 | bar(waterfall) |
| channel_unit_econ.csv | channel, cac, ltv, customers, tier（英文列名） | 12 | 企业版付费渠道 LTV/CAC < 3 | scatter + refLine 标注 |
| nps_scores.csv | 版本, 评分 | ~900 | 专业版双峰 | boxplot, histogram |
| roadmap.csv | task, start, end, group, progress, status, owner, deps, milestone | ~16 | 含里程碑和依赖链 | gantt |
| mrr_metrics.csv | 月份, MRR, 付费客户数, ARPA | 12 | ARPA 在 Q3 下降 | combo, kpi |
| plans_compare.csv | 套餐, 上半年, 下半年 | 5 | — | compare(dumbbell) |

**③ quality · 制造质量**
故事：3 号线 9 月不良率超出控制上限；Pareto 显示"焊点虚焊"占 46%；鱼骨图定位到夜班新员工和回流焊温区漂移。

| 文件 | 列 | 行数 | 埋点 | 视图 |
|---|---|---|---|---|
| defects.csv | 缺陷类型, 数量 | 10 | 前 3 类占 78% | bar(pareto) |
| fishbone.csv | category(人/机/料/法/环/测), cause, sub, owner | ~16 | — | fishbone |
| daily_defect_rate.csv | 日期(90 天), 产线, 不良率, 样本量 | 270 | 3 号线 9 月有 3 点超 UCL，并有连续 8 点同侧 | control, line |
| line_shift_heat.csv | 产线, 小时(0–23), 不良数 | 120 | 夜班 2–5 点高 | heatmap(matrix) |
| process_times.csv | 工序, 耗时秒 | ~800 | 回流焊离散度大 | boxplot, histogram |
| yield_kpi.csv | 产线, 实际良率, 目标, 较差线, 良好线 | 5 | 3 号线未达标 | bullet |
| line_month_output.csv | 产线, 月份, 产量 | 60 | — | matrix3d, bar |
| sensor_batches.csv | 批次, 温度, 压力, 速度, 湿度, 不良率, 产线 | ~200 | 高温 + 高速组合的不良率高 | parallel, scatter, scatter3d |

**④ delivery · 研发交付**
故事：V3.0 有延期风险：关键路径上的"支付网关改造"滞后 6 天；缺陷回流集中在集成测试阶段。

| 文件 | 列 | 行数 | 埋点 | 视图 |
|---|---|---|---|---|
| plan.csv | task, start, end, group, progress, status, owner, deps, milestone | ~24 | 关键路径任务滞后 | gantt |
| burndown.csv | 日期, 计划剩余, 实际剩余 | 30 | 第 3 周偏离 | line + band 标注 |
| bug_flow.csv | source, target, value（状态流转，含回流） | ~14 | 集成测试→重新打开 | network（有环）, sankey（去环） |
| effort_tree.csv | 团队, 模块, 任务类型, 工时 | ~45 | — | treemap, sunburst |
| req_funnel.csv | 阶段, 需求数 | 6 | — | funnel |
| team_skill.csv | 维度, 前端组, 后端组, 测试组 | 6 | — | radar |
| service_deps.csv | source, target, calls, latency_ms（英文列名） | ~30 | 网关是核心枢纽 | network |
| org.csv | id, parent, name, role, headcount | ~25 | — | tree(org) |
| defect_density.csv | 模块, 千行代码, 缺陷数, 严重缺陷 | 15 | 支付模块离群 | scatter |
| weekly_report.md | 周报（含 KPI 句式和表格） | — | ≥ 10 个可抽取指标 | report |

**⑤ finance · 预算执行**
故事：年度费用超预算 6.8%，主要来自市场投放（+32%）；Q4 经营现金流承压。

| 文件 | 列 | 行数 | 埋点 | 视图 |
|---|---|---|---|---|
| budget_vs_actual.csv | 部门, 实际, 预算, 较差线, 良好线 | 8 | 市场部超支 | bullet, compare(dumbbell) |
| profit_bridge.csv | 阶段, 金额, 类型 | 10 | — | bar(waterfall) |
| expense_tree.csv | 部门, 科目, 明细, 金额 | ~50 | — | sunburst, treemap |
| ledger.csv | 月份, 部门, 科目, 区域, 金额, 预算 | ~600 | 多维 | grid(pivot) |
| revenue_margin.csv | 月份, 营收, 毛利率 | 12 | 毛利率在 Q4 下滑 | combo |
| cashflow_daily.csv | date, net_cash | 365 | Q4 为负的天数多 | heatmap(calendar, 发散色阶), line |

**⑥ edge-cases · 鲁棒性**（不进画廊，只用于测试）
- 从 legacy 迁移：mixed（货币、千分位）、negative、wide、waterfall 未知标记、xss 标签、gantt 脏日期、scatter 缺失值、sankey 有环。
- 新增：超长标签（60 字）、单行、全零、全负、重复键、缺必需列、GBK 编码 CSV、空文件、只有表头、Excel 日期序列号、混合日期格式。
- 大数据量：10k 和 100k 行的散点和明细数据，由测试运行时生成，**不提交**。

**basic**：把 `legacy-vizscape/examples/*` 原样复制到 `examples/basic/`，作为 contract 示例和 golden 对拍的输入。

### 8.4 Demo 输出

`virta demo retail` 生成 `out/demo/retail/`，包括：
- `index.html`：story 布局，每一节是"问题 → 交互图 → 洞察"。
- `dashboard.html`：grid 布局，带联动。
- `png/*.png`：每张图的卡片版。

`virta demo --all` 额外生成 demo 首页。

---

## 9. 测试与质量门禁

| 层 | 工具 | 内容 | 命令 |
|---|---|---|---|
| 单元 | vitest | parseNumber、日期、别名、画像、比例尺、文字度量、标签避让、数字格式、token、依赖方向 | `npm test` |
| golden 对拍 | vitest | 每个 basic 样例：TS adapter 的 model 与 legacy 导出的 JSON 深比较（数值容差 1e-6；数组顺序必须一致）；质量问题只比较 code 和 count | `npm test` |
| 推荐 / 洞察 | vitest | basic 样例和 pack 条目的 `expectTop`、`expectInsight` | `npm test` |
| 渲染 | vitest | 每个视图 × 双主题：HTML、SVG、PNG 都成功；PNG 非空白（像素方差 > 阈值）；选取若干 SVG 做文本快照 | `npm test` |
| CLI 端到端 | vitest + child_process | 回执结构（运行时校验，手写类型守卫）、退出码、stdin、`--data`、`--set` 合并优先级、错误 hint 非空 | `npm run test:e2e` |
| 视觉回归 | @playwright/test | 每个视图的阅读态 × 双主题截图，与 `snapshots/` 比对（maxDiffPixelRatio 0.01）；首屏断言（1280×800 下图表底边 ≤ 800）；编辑抽屉截图 | `npm run test:visual` |
| 性能 | vitest（单独标签） | 10k 点散点图生成 HTML < 3s；100k 行明细 grid 生成 HTML < 8s；单图族 bundle 大小预算 | `npm run test:perf` |
| 打包 | 脚本 | 每个视图 bundle 的体积，超出 §5.7 预算时失败 | `npm run build` |

**golden 导出**：`scripts/golden/dump_legacy.py`。它从外部 import `legacy-vizscape/vizlib`，不修改 legacy；对一份显式映射表（`scripts/golden/cases.json`：样例文件 → adapter 函数名）逐条执行 `to_*(read_raw(path))`，输出到 `packages/data-engine/test/golden/<case>.json`。report 用 `build_doc` 导出。golden 文件提交进仓库，之后 CI 不再需要 Python。

**Python 与 JS 行为差异（对拍时的常见坑，必须处理）**：
- Python 的 `round()` 是银行家舍入：实现 `pyRound()` 用于对拍字段。
- Python 的 `re` 模式里 `\d` 会匹配 Unicode 数字：TS 端对应正则用 `\p{Nd}` 加 `u` 标志。
- Python 的 `str.lower()` 与 `toLowerCase()` 在少数字符上不同：normKey 只处理 ASCII 和 CJK，可以忽略。
- dict 插入顺序：用数组保序。
- `float` 转字符串：比较时统一为数值。

**CI**：`.github/workflows/ci.yml`，运行在 ubuntu-latest + Node 24：
1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run test:e2e`
6. 安装 `fonts-noto-cjk` 和 Playwright chromium 后，运行 `npm run test:visual`

视觉基线以 Linux 为准，提供 `npm run test:visual:update`。

---

## 10. 里程碑计划

每个里程碑的结束条件 = 任务清单全部勾选 + DoD 命令通过 + 更新 `AGENTS.md` + 本地提交。

### M0 基线收口与工程脚手架

- [ ] **0.1 收口 legacy 的未提交重构**：当前 `git status` 中有 40 个文件的 `_shared.css` 抽取改动。
  1. 用 `git worktree add ../virta-head HEAD` 渲染 HEAD 版本全部 examples × 双主题作为基线。
  2. 用当前工作区渲染同一组。
  3. 用 Playwright 逐对截图比较；肉眼可见的差异必须修复。
  4. 提交 `legacy: extract shared css (final before freeze)`，并删除临时 worktree。
  
  **不得丢弃这些改动。**
- [ ] **0.2 `.gitignore`**：追加 `/out/`、`**/dist/`、`*.tsbuildinfo`、`coverage/`、`playwright-report/`、`test-results/`、`.cache/`。`legacy-vizscape/out/` 继续跟踪（冻结参考），不要动。
- [ ] **0.3 工作区**：建立 §3.1 的全部包骨架（package.json 用 `"type":"module"`，exports 指向 `src/index.ts`，开发期由 tsx 和 vitest 直接用源码；cli 和 viewer 由 esbuild 构建到 dist）。
  - tsconfig 用项目引用；根 `tsconfig.json` 列出全部 references。
  - 安装 §3.3 的 dev 依赖。
  - root scripts：`build`、`typecheck`、`test`、`test:e2e`、`test:visual`、`test:visual:update`、`test:perf`、`packs:gen`、`packs:check`、`golden:dump`、`gallery`、`virta`（等价于 `tsx packages/cli/src/main.ts`）。
- [ ] **0.4 contracts 重组**：用 §4 的类型替换现有的 `series.ts`；旧类型 `ChartData`、`Series` 保留为 bar/line model 的子集。
- [ ] **0.5 golden**：编写 `scripts/golden/cases.json` 和 `dump_legacy.py`，覆盖 17 个图族的全部 basic 样例（含 negative、mixed、wide、waterfall、多年份热力图、boxplot 汇总模式等变体），生成 golden 文件；把 `legacy-vizscape/examples` 复制到 `examples/basic/`。
- [ ] **0.6 CI**：按 §9 编写 workflow；视觉测试步骤暂时允许没有用例。
- [ ] **0.7 ADR**：在 `docs/adr/` 新建 `0001-ts-rewrite-and-legacy-freeze.md`、`0002-package-architecture.md`、`0003-scene-graph-dual-renderer.md`、`0004-contracts-v1-viewspec.md`、`0005-cli-envelope-and-exit-codes.md`、`0006-fonts-and-text-metrics.md`（含字体来源、授权、子集范围；并注明地图搁置及 §13 预留设计）、`0007-dependency-allowlist.md`，以及 `IMPLEMENTATION_NOTES.md`。内容从本文对应章节提炼，每篇 ≤ 1 页。
- [ ] **0.8 `AGENTS.md`**（仓库根目录）：写明常用命令、验证命令、R1–R8 规则，以及本文路径。

**DoD**：`npm run typecheck && npm test` 通过；`packages/data-engine/test/golden/` 覆盖 17 个图族；legacy 重构已提交，`git status` 干净。

### M1 契约与设计系统

- [ ] 完成 §4 的全部类型；`VIEW_IDS` 和别名。
- [ ] 17 个 legacy 图族的 `ChartContract` 常量：roles 和 inference 从 legacy CONTRACT 迁移，modes 和 variants 按 §4.3 改写，options 从对应模板的全部按钮整理而来（每个模板的按钮数可用 `rg -c "<button"` 核对）。
- [ ] 手写 ViewSpec 的 JSON Schema 常量（供 `schema --spec-schema` 使用）。
- [ ] design-system：tokens、palettes（迁移）、ramps（OKLCH）、`buildCss`、对比度和 ΔE 测试。
- [ ] **字体（必做）**：按 §5.2 第 1–7 步，下载 Fraunces 和 JetBrains Mono → 实例化和子集化 → 授权文件和 SOURCE.md（含 SHA-256）→ `metrics.json` → 字体测试。

**DoD**：
- 每个 contract 的 options 数量 ≥ 对应 legacy 模板中非主题类按钮的组数；token 测试通过。
- `packages/design-system/fonts/` 下有 3 个子集 TTF（每个 ≤ 40KB）、2 份 OFL 授权、`SOURCE.md`、`metrics.json`，字体测试通过。

### M2 数据引擎

- [ ] 读取器（csv、json、xlsx、stdin、inline、GBK 回退）、parseNumber、parseDate、别名、画像。
- [ ] 17 个 legacy 图族的 adapter（逐个对拍 golden）和 doc 管线。
- [ ] 推荐引擎（§5.1 打分表，legacy 图族部分）、validate、洞察框架，以及 legacy 图族的 insights 和 counts。
- [ ] 场景数据生成器和 5 个场景包的数据与 `pack.json`（包括本期新图表的数据，这些条目的 `expectTop` 等对应视图实现后再启用）；edge-cases 迁移。

**DoD**：golden 对拍 100% 通过；basic 样例的推荐第一名全部正确；`npm run packs:check` 通过。

### M3 渲染栈纵切（bar + line，端到端打通）

- [ ] chart-core：Scene、比例尺、文字度量、toSVG、drawCanvas、命中测试、补间、标签避让。
- [ ] chart-skin：坐标轴、网格、图例、tooltip 内容、标注、数字格式、静态卡片框。
- [ ] charts：bar（全部变体、表面、形状、伪 3D）、line（全部组合）。
- [ ] viewer：页面壳、阅读/编辑态、抽屉自动生成、hash 同步、复制 spec、导出（PNG/SVG/CSV/spec）、键盘导航、reduced-motion、响应式、分图族构建。
- [ ] cli：`list`、`schema`、`inspect`、`validate`、`render`（html/svg/png）、`preview`、`guide`；JSON envelope、退出码、stdin、`--data`、`--spec`、`--set`、字体回退检测。
- [ ] PNG：resvg 加载 design-system 字体和 `--font-file`。
- [ ] bar 和 line 的视觉基线；与 legacy 同一份数据的截图并排存放到 `snapshots/compare/`，供人工评审。

**DoD**（全部必须成功）：

```bash
npm run virta -- render examples/basic/sample-multi.csv --view bar --set variant=stacked --set state.sort=desc --palette patina --export html,svg,png --out out/m3 --json
npm run virta -- render - --format json --view line --export png --json < examples/basic/sample.json
npm run virta -- render examples/basic/nope.csv --json      # ok:false，code=INPUT_NOT_FOUND，退出码 3
npm run virta -- validate examples/basic/sample.csv --view sankey --json   # valid:false，missingRoles 非空，suggestions 非空
npm run test:visual                                         # 包含首屏断言
```

### M4 legacy 图族迁移（3 批）

每个图族都要完成：layout、contract options 全部生效、insights、静态导出、视觉基线（双主题）、`docs/charts/<view>.md`（从 legacy 文档迁移并更新）、§7.1 的对等要点。

- [ ] **B1**：matrix3d、scatter、pie、bullet、funnel
- [ ] **B2**：heatmap、treemap、sunburst、sankey（修复标签碰撞）、boxplot、radar（补 palette）
- [ ] **B3**：gantt、fishbone、grid/pivot、report、pie3d、line3d、scatter3d（补 palette）

**DoD**：
- `virta list` 显示 17 个 legacy 图族（20 个模板的能力）全部可用。
- 每个 basic 样例 × 双主题导出 HTML/SVG/PNG 都成功。
- `snapshots/compare/` 里有全部图族的新旧对照图。
- 输出对等清单 `docs/plan/PARITY_CHECKLIST.md`（逐个模板列出按钮和交互 → 新版对应项 → ✅），**交给用户确认**。

### M5 Agent 能力收尾与组合页

- [ ] `compose` 命令：grid 和 story 布局，联动筛选，静态导出（把多个面板的 Scene 拼成一张 SVG/PNG）。
- [ ] `docs/agent/SKILL.md` 和 `virta guide --agent`（§5.8 要求的内容）。
- [ ] 错误文案评审：每个 ErrorCode 至少有一个 e2e 用例，hint 非空且可执行。
- [ ] 模拟 Agent 的 e2e 测试：脚本依次执行 inspect → 取第一候选 → validate → render --json → 断言 `summaryMd` 和 insights 非空。全部 basic 样例都要通过。

**DoD**：`npm run test:e2e` 通过；用 retail 包写一个 `compose.json`，能生成带联动的仪表盘。

### M6 T1 新图表与分面

- [ ] combo、rank（含 race）、histogram、kpi、compare、cohort：每个都要完成 contract、adapter、score、insights、layout、视觉基线、文档。
- [ ] `spec.facet` 小多图。
- [ ] 启用场景包中对应条目的 `expectTop` 和 `expectInsight`。

**DoD**：新视图出现在 `virta list`；推荐和洞察测试通过；静态导出成功。

### M7 T2 新图表

- [ ] tree、network、control、parallel：每个都要完成 contract、adapter、score、insights、layout、视觉基线、文档。
- [ ] 启用场景包中对应条目的 `expectTop` 和 `expectInsight`。

**DoD**：4 个 T2 视图出现在 `virta list`；推荐和洞察测试通过；双主题静态导出和视觉基线测试通过。

### M8 Demo、画廊与视觉打磨

- [ ] `virta demo`（5 个包）和 `virta gallery`（真实缩略图）。
- [ ] 视觉 QA 矩阵：全部视图 × 双主题 × 3 套配色（signal、patina、mono）截图，逐张检查标签碰撞、溢出和对比度，修复后更新基线。
- [ ] 性能预算全部达标；bundle 体积预算达标。
- [ ] 重写 README（安装、`npm link`、快速开始、Agent 指南入口、画廊截图）。

**DoD**：`npm run test:perf` 通过；`virta demo --all && virta gallery` 生成成功；README 中的所有命令都能复制运行。

### M9 legacy 归档（需用户确认对等清单后才执行）

- [ ] `git mv legacy-vizscape archive/legacy-vizscape`；修复所有引用路径（golden 脚本、文档）。
- [ ] 确认 CI 不依赖 Python。
- [ ] 更新 ADR-0001 的状态为"已归档"。

---

## 11. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 字宽表与实际渲染有偏差 | 标签溢出或截断 | 统一留 4px 余量；浏览器端可选用真实 `measureText` 校正（不改变布局决策，只截断文字）；视觉 QA 矩阵兜底 |
| resvg 环境缺中文字体 | PNG 中文显示成方块 | CI 安装 fonts-noto-cjk；`--font-file`；检测到时给 `FONT_FALLBACK` 警告 |
| 对拍时 Python 与 JS 语义不一致 | golden 测试误报 | 按 §9 的差异清单处理；确实不一致的字段在 `cases.json` 里写明并给出理由 |
| bundle 体积膨胀 | 单文件 HTML 过大 | 分图族 bundle 和内联字体都加体积预算测试 |
| 字体下载失败或版本变动 | 视觉不一致、度量表失效 | SOURCE.md 记录 URL 和 SHA-256；子集 TTF 提交进仓库，构建不依赖网络；度量表由提交的 TTF 生成 |
| 迁移范围大，旧能力遗漏 | 功能退化 | 用"模板按钮 → contract options"的对等清单在 M4 逐项勾选，并由用户确认 |
| 浏览器内重新适配耗时 | 大数据下联动卡顿 | 超出 20000 行时禁用页面内重新适配，只用预聚合的 model |

---

## 12. 需用户提供或确认的事项

| # | 事项 | 何时需要 | 未到位时的处理 |
|---|---|---|---|
| U2 | M4 结束时的对等清单确认 | M4 结束 | 不执行 M9 |

已解决：字体联网下载已授权（列为 M1 必做）；地图已决定本期搁置（§13）。

---

## 13. 搁置事项：地图（预留设计，本期不实施）

重启时以本节为起点，单独开一个里程碑，并补写 ADR。

- **前置条件**：用户提供中国省级地图的原始 GeoJSON（含南海诸岛插图所需几何），以及来源、许可、审图号。
- **依赖**（重启时重新核对发布时间）：`d3-geo`（投影）、`topojson-client`（解码）、`mapshaper`（构建期简化）。
- **包**：新增 `@virta/geo`，位于 chart-skin 和 charts 之间。
- **数据**：
  - `packages/geo/data/china-provinces.topo.json`：以 GB/T 2260 的 adcode 作 id。
  - `china-provinces.meta.json`：记录 source、license、reviewNo、投影（conicEqualArea，parallels [25, 47]，中心约 105°E / 36°N）、南海插图（右下角）。
  - `scripts/geo/build.mjs`：mapshaper 保拓扑简化，目标 ≤ 300KB。
- **契约增量**：
  - 视图 `map`，变体 `choropleth` 和 `bubble`，角色 region 或 lng+lat、value。
  - `TableProfile.geo`、`QualityCode.REGION_UNMATCHED`、`ErrorCode.GEO_NOT_FOUND`（DATA 类，退出码 4）。
  - CLI 参数 `--geo <file>`、`--geo-key <prop>`。
- **地名匹配**：34 个省级单位的全称、简称和变体（如"内蒙古 / 内蒙 / 内蒙古自治区"）；匹配顺序为精确 → normKey → 去后缀后匹配。
- **推荐与洞察**：省份匹配率 ≥ 0.8 或有 lng/lat 列 → 0.90；洞察给出 Top 地区和负同比地区。
- **合规**：页面脚注和静态卡片里强制显示来源和审图号；缺审图号时标注"示意图"。
- **Demo 增量**：retail 加 `province_sales.csv`（省份, 销售额, 同比；名称混用全称和简称）；finance 加 `city_revenue.csv`（城市, 经度, 纬度, 营收）；edge-cases 加省份名称变体。
