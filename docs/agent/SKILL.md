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
  "size": {"width": 1200, "height": 675} }
```

`--set` 语法：`key=value`，点号分层（`options.finish=glass`、`state.sort=desc`），值能 JSON.parse 就按 JSON。
合并优先级：`--set` > 专用参数（`--theme` 等）> `--spec` > 默认值。

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
