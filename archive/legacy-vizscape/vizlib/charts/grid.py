# -*- coding: utf-8 -*-
"""vizlib.charts.grid · 动态表/多维透视表 管线：列分类 → 明细/透视双模型 → 表格/质量报告 → 模板渲染。"""
import math, sys
from pathlib import Path
from ..core import (
    _fmt_num, _new_quality, _numeric_stats, esc, js_json, NUM_RATIO, parse_number, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML,
)

MAX_ROWS = 5000  # 超出截断并警告（单文件体积与前端聚合性能）


def to_grid(raw):
    """任意表格 → 动态表模型：列分类（维度/数值）+ 规范化行 + 质量骨架。

    - 非 ECharts 的 list[dict] 输入；数值列输出解析后 float（缺失→None），非数值列原样字符串
    - 初始模式：≥2 维度列且有数值列 → pivot；否则 detail
    """
    if not isinstance(raw, list) or not raw:
        raise ValueError("动态表需要行式表格数据（list[dict]）")
    sample = raw[0]
    if not isinstance(sample, dict):
        raise ValueError("动态表需要行式表格数据（list[dict]）")
    keys = list(sample.keys())
    stats = _numeric_stats(raw, keys)
    numeric = {k: stats[k]["ratio"] >= NUM_RATIO for k in keys}
    dims = [k for k in keys if not numeric[k]]
    measures = [k for k in keys if numeric[k]]
    # 规范化行
    rows, truncated = [], len(raw) > MAX_ROWS
    for r in raw[:MAX_ROWS]:
        row = {}
        for k in keys:
            v = r.get(k)
            if numeric[k]:
                num, status, _ = parse_number(v)
                row[k] = num if status in ("ok", "percent") and math.isfinite(num) else None
            else:
                row[k] = "—" if v in (None, "") else str(v)
        rows.append(row)
    q = _new_quality(len(rows), "grid")
    q["mapping"] = {"label": "—", "series": "—", "value": ", ".join(measures) or "—"}
    q["numeric_columns"] = measures
    miss = sum(stats[k]["missing"] for k in keys)
    inv = sum(stats[k]["invalid"] for k in keys)
    q["missing"], q["invalid"] = miss, inv
    if inv:
        q["warnings"].append(f"数值列含 {inv} 个无法解析值，已置空（显示 —）")
    if miss:
        q["warnings"].append(f"全表含 {miss} 个空值，显示为 —")
    if truncated:
        q["warnings"].append(f"行数超过 {MAX_ROWS}，已截断（原始 {len(raw)} 行）")
    if not measures:
        q["warnings"].append("无数值列：透视模式不可用，仅明细模式")
    if not dims:
        q["warnings"].append("无维度列：透视模式退化为单行合计")
    q["confidence"] = "low" if inv else ("medium" if miss else "high")
    mode = "pivot" if len(dims) >= 2 and measures else "detail"
    return {
        "mode": mode, "columns": [{"key": k, "numeric": numeric[k],
                                   "distinct": len({str(r.get(k)) for r in raw[:MAX_ROWS]})} for k in keys],
        "rows": rows, "dims": dims, "measures": measures,
        "n_rows": len(rows), "n_raw": len(raw), "quality": q,
    }


def build_grid_table(data):
    """静态明细表（前 200 行；交互全量在上方动态表中）。"""
    keys = [c["key"] for c in data["columns"]]
    numcols = {c["key"] for c in data["columns"] if c["numeric"]}
    head = "".join(f'<th class="{"num" if k in numcols else ""}">{esc(k)}</th>' for k in keys)
    body = []
    for r in data["rows"][:200]:
        tds = "".join(
            f'<td class="num">{_fmt_num(r[k]) if r[k] is not None else "—"}</td>' if k in numcols
            else f"<td>{esc(r[k])}</td>" for k in keys)
        body.append(f"<tr>{tds}</tr>")
    more = "" if data["n_rows"] <= 200 else f'<tr><td colspan="{len(keys)}" style="text-align:center;color:var(--faint)">… 共 {data["n_rows"]} 行，仅列前 200 行；完整数据见上方动态表 …</td></tr>'
    return f'''<table class="table"><thead><tr>{head}</tr></thead>
<tbody>{"".join(body)}{more}</tbody></table>'''


def build_grid_quality(data):
    q = data["quality"]
    cls = "quality warn" if q["confidence"] != "high" else "quality"
    chips = "".join(f'<span class="qs">{k} <b>{v}</b></span>' for k, v in [
        ("行数", data["n_rows"]), ("列数", len(data["columns"])),
        ("维度列", len(data["dims"])), ("数值列", len(data["measures"])),
        ("初始模式", "透视" if data["mode"] == "pivot" else "明细"),
    ])
    warns = "".join(f"<li>{w}</li>" for w in q["warnings"])
    body = f'<ul class="quality-warnings">{warns}</ul>' if warns else '<p class="quality-ok">列类型识别完成；维度/数值列可直接用于透视。</p>'
    return f'''<section class="{cls}" aria-label="数据识别报告">
  <div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(q["confidence"])}</b>{len(q["numeric_columns"])} 个数值列 · 阈值 ≥ {int(NUM_RATIO*100)}%</div></div>
  <div class="quality-grid">{chips}</div>
  {body}
</section>'''


def render_grid(template, input_path, out_path, theme, title, default_mode=None):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    data = to_grid(read_raw(p))
    if default_mode in ("pivot", "detail") and data["measures"]:
        data["mode"] = default_mode
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_grid_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_grid_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, data["n_rows"], len(data["columns"])


render = render_grid  # 统一注册入口
TEMPLATE_IDS = ("grid-basic",)
SUMMARY_KEYS = ("rows", "cols")
def SUMMARY_FMT(n, ns):
    return f"{n} 行 × {ns} 列"

CONTRACT = {
    "views": ["grid", "pivot"],
    "templates": list(TEMPLATE_IDS),
    "title": "动态表 / 多维透视表",
    "summary": "任意表格的直接交付：明细模式（排序/筛选/搜索/分页）+ 透视模式（行维度×列维度×值聚合，小计合计）",
    "columns": {
        "required": [
            {"name": "任意列", "aliases": ["无固定要求"], "note": "数值列自动识别（解析率≥80%）；其余为维度列"},
        ],
        "optional": [
            {"name": "维度列", "aliases": ["任意非数值列"], "note": "≥2 个时默认进入透视模式"},
            {"name": "数值列", "aliases": ["value/数值/金额/数量 等全量别名"], "note": "透视的值字段，页内可切换"},
        ],
    },
    "inference": ["数值列 = 解析率≥80%", "初始模式：≥2 维度列且有数值列 → 透视，否则明细", f"行数 >{MAX_ROWS} 截断并警告", "空值显示 — 并计数"],
    "example_csv": "地区,渠道,品类,销售额,销量\\n华东,线上,整机,1200,34\\n华北,线下,配件,860,51",
    "command": "vizscape render data.csv --view grid --theme light --out out/grid.html  # --view pivot 直接进透视",
}
