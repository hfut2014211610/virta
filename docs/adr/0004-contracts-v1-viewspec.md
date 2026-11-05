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
