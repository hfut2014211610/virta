# ADR-0004 契约 v1 与 ViewSpec

- 状态：已接受
- 日期：2026-11-05
- 决策：D10、D13；§4 全部类型

## 决定

- `@virta/contracts` v1 按 `docs/plan/NEXT_PHASE.md` §4 落地：数据/画像（§4.1）、VIEW_IDS + VIEW_ALIASES（§4.2）、ChartContract（§4.3）、ViewSpec（§4.4）、质量/洞察/错误（§4.5）、CLI 回执（§4.6）。
- spec 和 dashboard 只用 JSON，不引 YAML（D10）。
- 视图 ID 用完整名（`heatmap`/`boxplot`/`fishbone`），legacy 短名（`heat`/`box`/`fish`/`pivot`/`spc`）作别名；`pivot` → `grid` 且默认 `variant='pivot'`（D13）。
- 图族输入模式用互斥 `modes` 表达（如热力图 calendar|matrix），不再用伪列名。

## 有意的契约变更（相对 legacy）

- `ViewState.hiddenSeries`：由 legacy 的 `number[]`（系列下标）改为**系列名数组**，重排序/增删系列时更稳定。
- 旧 v0 类型 `Series`/`ChartData` 保留在 `legacy.ts`，仅作 bar/line model 子集；旧 `ViewSpec`/`ViewState`/`VizError` 已被 v1 形状取代并删除。

## 后续

契约级变更（类型、CLI 参数、回执结构）必须更新本文件或新增 ADR；可增加可选字段。

## 2a 增量（ADR-0009/0010/0011）

- `ViewSpec` 新增可选 `time{asOf,tz,weekStart,workdays,holidays,extraWorkdays}`、`derive: Derive[]`、`page{height,break}`（ADR-0010/0009）。
- `ViewState` 新增 `query?: string`、`filter?: Record<string,string[]>`（flow-table 搜索与列筛选）。
- `RoleSpec` 新增 `instant?: 'start'|'end'`（ADR-0010 时刻语义）。
- `ChartContract` 新增 `flow?: boolean`；grid 新增角色 `link`/`tone` 与选项 `agg`（枚举）；gantt 新增角色 `baseline`/`actual` 与选项 `baselineMark`/`varianceLabel`；六个时序视图 + bar 新增 `missingValue`/`connectGaps`。
- 质量码：`TZ_ASSUMED`、`ASOF_ASSUMED`、`GAP_VALUES`、`LINK_UNSAFE`。

## 2b 增量（ADR-0012/0014、C7/C10）

- `ViewState` 新增 `sortBy?: string`——flow-table 排序列按**列名**写入与恢复（B17 修复）；
  与既有 `sort` 方向字段配合使用。
- `Insight.importance` 明确取值范围 [0,1]（契约注释 + 测试强制）；report 洞察
  由 50/40 修正为 0.5/0.4。
- `ViewSpec` 顶层键白名单由 `validate-spec.ts` 强制（含 `time`/`derive`/`page`/
  `state.sortBy`/`state.query`/`size.height:'auto'`），与 `VIEW_SPEC_SCHEMA` 测试锁定。
- 质量码新增 `UNPARSABLE_DATES`（derive 日期列解析失败按列计数）。
