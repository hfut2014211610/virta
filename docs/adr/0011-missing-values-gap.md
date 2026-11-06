# ADR-0011 缺失值策略：gap 默认不补 0

> 状态：已采纳 · 2026-11-06 · 依据 `docs/plan/PHASE_2A.md` §2 A6/A9、§4.3

## 决策

- `BarlineSeries.values` 改 `(number|null)[]`：无行或空单元格 = 未观测（null），不伪造 0。x 轴取各系列并集——计划线可延伸到未来、实际线停在最后观测日。
- 选项：line/combo/control/compare/kpi(迷你趋势)/rank 加 `missingValue: gap|zero`（默认 `gap`，U2a-1）与 `connectGaps: boolean`（默认 false）；bar 加 `missingValue`（gap 时不画柱不显示标签）。`connectGaps` 开时连接段画虚线。
- 渲染器/洞察/tooltip/值域跳过 null；tooltip 显示「未观测」；观测点 <2 不输出趋势洞察；契约 inference 文案改为"缺失/NA 默认不绘制（gap）"。
- 质量码：`GAP_VALUES`（info，记未观测点数，hint 指 `--set options.missingValue=zero`）；zero 模式仍用 `MISSING_VALUES` warn。
- golden：`scripts/golden/cases.json` 涉 line/bar 用例显式 `missingValue='zero'`，锁住 legacy 补 0 行为，对拍不变。
- 阶梯线统一 step-middle（F7/A9）：chart-core 新增 `linePath(points, style, {connectGaps})`，null 分段、首尾补半格（相邻点中点跳变 + 末端水平延伸）；line/combo/面积填充共用，删除两处各写一套的实现；渲染层加全视图 SVG 路径语法检查（拦 `M x V y`）。
