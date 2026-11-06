# M9 legacy 归档 · 对等清单（U2，待用户确认）

> 确认通过后执行：`git mv legacy-vizscape archive/legacy-vizscape`、修引用、ADR-0001 标「已归档」、确认 CI 不依赖 Python。

## A. 图族对等（legacy `to_*` → Virta view）

| legacy 模块 | Virta 视图 | golden 对拍 |
|---|---|---|
| barline.to_chart | bar / line / matrix3d / pie / funnel | ✅ bar×7, line, matrix3d |
| boxplot.to_boxplot | boxplot | ✅ ×2 |
| bullet.to_bullet | bullet | ✅ |
| fishbone.to_fishbone | fishbone | ✅ |
| funnel.to_funnel | funnel | ✅ |
| gantt.to_gantt | gantt | ✅ |
| grid.to_grid | grid | ✅ |
| heatmap.to_heatmap | heatmap | ✅ matrix + calendar |
| line3d.to_line3d | line3d | ✅ |
| pie.to_pie | pie | ✅ |
| pie3d.to_pie3d | pie3d | ✅ ×2 |
| radar.to_radar | radar | ✅ |
| sankey.to_sankey | sankey | ✅ |
| scatter.to_scatter | scatter | ✅ |
| scatter3d.to_scatter3d | scatter3d | ✅ |
| sunburst.to_sunburst | sunburst / treemap | ✅ |
| docmd.build_doc / docrender | report | ✅ |

Virta 超出 legacy 的图族：combo, compare, control, cohort, er, flowchart, formula,
histogram, kpi, network, parallel, rank, sequence, burndown, treemap（独立视图）。

## B. CLI 对等（vizscape.py → virta）

| legacy | Virta |
|---|---|
| 渲染单文件 HTML（模板按钮） | `virta render --export html`（模板按钮 → contract options/variant，M4 已逐项对齐） |
| 主题切换 | `--theme` + 交互页内切换（含深色角标重绘） |
| 数据识别报告 | `--json` 回执 quality/mapping + HTML 数据抽屉 |
| PNG 导出 | `--export png`（resvg + 字体管线） |
| —（legacy 无） | inspect/validate/compose/demo/gallery/guide |

## C. 有意差异（不再回 legacy 行为）

1. `BarlineSeries.values` 允许 null：默认 `missingValue=gap`（ADR-0011），
   `options.missingValue=zero` 恢复 legacy 补 0；golden 归一化比对。
2. gantt `end` 不再含「完成日期」别名（归 actual，A8）；新增 baseline/actual/slip/late。
3. report/grid 为 flow 视图：DOM 语义渲染 + 自然高度 + 静态分页，替代 legacy 截断。
4. `time.asOf/tz` 契约：甘特今日线/derive 用 asOf（legacy 固定进程时刻）。
5. step-middle 阶梯线（A9）替代 legacy step-after。
6. 画廊/compose/demo/guide 为 Virta 独有，无对等事项。

## D. 引用点（归档时需改路径）

- `scripts/golden/*`（legacy 导出脚本与 cases.json 的 `legacy-vizscape/` 前缀）
- `packages/data-engine/test/golden.test.ts` 的 `LEGACY` 常量
- `legacy-vizscape/examples` 输入文件（golden 用例依赖，迁移后 golden 用例随 archive 一并移动或改为内嵌）
- 文档中的 `legacy-vizscape/` 提及（AGENTS.md R1、README、NEXT_PHASE）

## E. CI 检查项

- golden 用例 Python 导出是否仍被 CI 调用（`npm run golden:dump`）；归档后 golden
  静态 JSON 已提交仓库，CI 不需要 Python——确认 CI 配置无 Python 依赖即可。

**确认签字**：________（日期）—— 确认后执行 M9 三项任务。
