# Virta · legacy-vizscape 架构

## 分层

```
vizscape.py            瘦壳入口：sys.path 引导 → vizlib.cli:main（对外命令不变）
vizlib/
  core.py              共享解析与工具层
                       · 列名别名（LABEL/VALUE/SERIES/… 中英文）· norm_key
                       · read_raw（csv/json/xlsx）· parse_number（千分位/货币/括号负数/百分号）
                       · 质量报告骨架（_new_quality/_finish_quality，≥80% 数值列判定）
                       · esc/js_json · parse_gantt_date（甘特/热力日历共用）
  charts/
    __init__.py        REGISTRY：模板名 → 图族模块（自动汇总）
    <family>.py        每图族一个文件：to_*（建模）→ build_*_table/quality → render_*（模板替换）
  cli.py               命令路由：list / render / inspect / schema / preview / build-manifest
docmd.py / docrender.py  文档报告（report-basic）独立管线，不经 charts
templates/<tpl>/       manifest.json + template.html（图表模板用 Canvas；grid-basic 为纯 DOM 表格；均离线单文件）
```

路由规则：`render` 命令按模板名查 `charts.REGISTRY`；未命中走 `barline.render`（label+series 通用模型，兼文档模板兜底）。`vizscape.py` 单文件时代（~3000 行）已废弃，新增图族**不得**再写回单文件。

## 图族模块契约（每个 charts/<family>.py 必须导出）

| 名字 | 类型 | 用途 |
|---|---|---|
| `render` | fn(template, input, out, theme, title) | 统一渲染入口（模块内可叫 `render_xxx`，末尾别名 `render = render_xxx`） |
| `TEMPLATE_IDS` | tuple[str] | 本模块服务的模板目录名（REGISTRY 键） |
| `SUMMARY_KEYS` | tuple[str, str] | `render --json` 输出的两个计数字段名 |
| `SUMMARY_FMT` | fn(n, ns) → str | CLI 成功摘要（如 `f"{n} 格 × {ns} 列"`） |
| `CONTRACT` | dict | Agent 输入契约（见下） |

## Agent 输入契约：`vizscape schema`

```powershell
vizscape schema              # 全部图族一览（view / 模板 / 必需列）
vizscape schema --json       # 全部契约 JSON 数组
vizscape schema heat         # 按 view 取单个契约（JSON）
vizscape schema sankey-basic # 按模板名取，等价
```

`CONTRACT` 字段约定：`views` / `templates` / `title` / `summary` / `columns.required[]`（name + aliases + note）/ `columns.optional[]` / `inference[]`（自动判定与清洗规则）/ `example_csv` / `command`。Agent 流程：`schema <view>` 拿契约 → 按契约造数 → `render --json` 拿结果回执。

## 新增一个图族的步骤

1. `vizlib/charts/<family>.py`：实现 `to_*` / `build_*_table` / `build_*_quality` / `render_*`，末尾补注册块（`render` 别名 + `TEMPLATE_IDS` + `SUMMARY_KEYS/FMT` + `CONTRACT`）
2. `vizlib/charts/__init__.py`：import 并加入注册循环的模块列表
3. `vizlib/cli.py`：`--view` choices 与 `VIEW_TO_TEMPLATE` 加映射
4. `templates/<tpl>/`：manifest.json + template.html
5. 验证：`build-manifest --check` → 渲染双主题 → Playwright 截图 → `vizscape schema <view>` 自检
6. 同步：gallery 分区 + 命令速查 + docs/<FAMILY>_CHART.md
