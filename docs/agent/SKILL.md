# Virta CLI · Agent 使用指南

> `virta guide` / `virta guide --agent` 输出与本文件相同的内容。

## 标准流程

```bash
virta inspect <input|-> --json     # 1. 画像 + 推荐候选（前 5 名，含 reason/mapping/missingRoles）
virta validate <input> --view <v> --json   # 2. 校验角色/选项；失败时 suggestions 是可执行的 --set 命令
virta render <input> --view <v> --export html,svg,png --out out/ --json   # 3. 渲染并读 receipt
```

读 `receipt.insights`（中文洞察，importance 降序）与 `receipt.summaryMd`（1–3 行摘要）作为报告素材。
**先 inspect，不要猜列名。** 多列 mapping（数组）请用 `--spec` 文件传，不要用 `--set`（shell 会吃掉引号）。
候选的 `mapping`/`variant`/`mode` 可直接写进 spec 传给 validate/render。

## spec 速查（`virta schema --spec-schema` 输出完整 JSON Schema）

```jsonc
{ "version": 1,
  "view": "bar|line|pie|…|auto",
  "variant": "stacked", "mode": "…",
  "mapping": {"value": "金额"},
  "theme": "light|dark", "palette": "signal|patina|…",
  "options": {"finish": "glass"},
  "state": {"sort": "desc", "hiddenSeries": ["政务"]},
  "text": {"title": "…", "subtitle": "…", "source": "…", "unit": "…"},
  "annotations": [{"type": "refLine", "axis": "y", "value": 80, "label": "目标"}],
  "format": {"style": "auto|thousands|wan|percent|currency"},
  "time": {"asOf": "2025-10-20T09:00:00+08:00", "tz": "Asia/Shanghai",
           "weekStart": 1, "workdays": [1,2,3,4,5], "holidays": [], "extraWorkdays": []},
  "derive": [{"type": "dueStatus", "due": "截止日期", "as": "状态"},
             {"type": "dateDiff", "from": "开始", "to": "截止", "unit": "day", "as": "滑期"}],
  "size": {"width": 1200, "height": 675},
  "page": {"height": 1600, "break": "auto|section|none"} }
```

`--set` 语法：`key=value`，点号分层（`options.finish=glass`、`state.sort=desc`），值能 JSON.parse 就按 JSON。
合并优先级：`--set` > 专用参数（`--theme` 等）> `--spec` > 默认值。

## Phase 2a 能力（Agent 直用，无需外部脚本）

- **时间契约**：`--as-of <ISO>` / `--tz <IANA>` 钉死报告时刻与时区，回执 `spec.time` 写回；
  缺省时按系统时区解析并在 `warnings` 给 `TZ_ASSUMED`/`ASOF_ASSUMED`。甘特今日线用 `asOf`。
  `derive`：`dueStatus`（逾期/今日/临期/未到期/已完成/已逾期完成/提前）与 `dateDiff`（天/工作日）。
- **缺失值**：时序视图（line/combo/control/compare/kpi/rank）+ bar 的 `options.missingValue`
  默认 `gap`（未观测不画、洞察跳过、tooltip 显示「未观测」）；`=zero` 恢复补 0。
  `options.connectGaps=true` 用虚线桥接缺口段。阶梯线 `lineStyle=step` 为 step-middle。
- **长内容**：grid/report 为 flow 视图——HTML 里是语义 DOM（`<table>`/搜索/筛选/排序/链接），
  不再截断；静态导出 `--height auto` 给自然高度，或 `page.height`（默认 1600）分页输出多页
  SVG/PNG，回执 `files[]` 带 `page/pages`。
- **compose 三态面板**：md 文档面板（report）整行 DOM 渲染且不参与联动；
  面板级 `rendered/error`——任一面板失败 `ok:false`（RENDER_FAILED）。
- **甘特三时间点**：列 `baseline`（基线截止）画幽灵基线、`actual`（实际完成）画 ◆ 标记；
  `end` 是当前截止（不再当完成日期）；模型出 `slipDays/lateDays`，洞察报滑期与未上报。
  `baselineMark=false`/`varianceLabel=false` 可关。
- **截止日报示例**：`examples/packs/delivery/deadline.{csv,brief.md,compose.json}`
  （asOf 已钉死，可复现）；`virta demo delivery` 一键生成。

## 错误码 → 退出码 → 修复

| code | 退出码 | 修复 |
|---|---|---|
| UNKNOWN_VIEW / INVALID_SPEC / INVALID_OPTION | 2 | `virta list` / `virta schema <view>` |
| INPUT_NOT_FOUND | 3 | 检查路径；stdin 用 `-` |
| UNSUPPORTED_FORMAT / PARSE_ERROR / EMPTY_DATA | 3 | `--format csv|json`；xlsx 用 `--sheet` |
| MISSING_COLUMN / AMBIGUOUS_MAPPING | 4 | 按 suggestions 的 `--set mapping.*=` 修复 |
| UNSUPPORTED_EXPORT / RENDER_FAILED / EXPORT_FAILED | 5 | 导出格式仅 html,svg,png |
| INTERNAL | 1 | 反馈实现方 |

`warnings[].code === 'FONT_FALLBACK'` 时说明 PNG 中文字形缺失：加 `--font-file <ttf>`。

## 组合页（compose）

```bash
virta compose <compose.json> [--export html,svg,png] [--out dir] [--json]
```

`compose.json`：`{ "title", "layout": "grid|story", "theme", "palette", "links": [{"column": "渠道"}],
"panels": [{"chart": "<pack.json charts[].id>", "w": 8, "h": 4} | {"file": "x.csv", "spec": {...}, "w": 4, "h": 4}] }`。

- `chart` 引用同目录 `pack.json` 的 charts 条目（file+spec+question 自动带出）；或直接 `file`+`spec`。
- `links.column`：HTML 里点击图元会把该列值写入共享筛选，含同列的其他面板自动重渲。
- grid 12 栏：w=栏宽、h=高度档（每档 ~130px）；story 纵向叙事（question → 图 → 洞察）。
- 模板见 `examples/packs/retail/compose.json`。

## 可复制的完整示例

```bash
virta list --json
virta schema bar --json
virta inspect examples/basic/sample-multi.csv --json
virta inspect - --format json < examples/basic/sample.json --json
virta validate examples/basic/sample.csv --view sankey --json
virta render examples/basic/sample-multi.csv --view bar --set variant=stacked --set state.sort=desc --palette patina --export html,svg,png --out out/ --json
virta render examples/basic/sample.csv --theme dark --title 月度营收 --unit 万元 --export png --out out/
virta render - --format json --view line --export png --json < examples/basic/sample.json
virta render examples/basic/sample.csv --view auto --export html --out out/ --json
virta compose examples/packs/retail/compose.json --export html,png --out out/ --json
virta preview out/sample-bar-light.html
```
