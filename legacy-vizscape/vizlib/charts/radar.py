"""vizlib.charts.radar · 雷达图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import math, sys
from pathlib import Path
from .barline import to_chart
from ..core import (
    _fmt_num, _new_quality, esc, js_json, parse_number, read_raw, TEMPLATES, THEME_TOKEN_HTML,
)

def to_radar(raw):
    """{labels, series} → 雷达数据：多轴（label=轴）× 多对比项（数值列=系列）。

    各轴量纲可能不同 → 按轴归一化到 0..1（max=1），保留原始值与各轴刻度上限。
    """
    chart = to_chart(raw)
    labels = chart["labels"]
    series = chart["series"]
    # 长表展开：若被识别为单系列、且原始表有 ≥2 个文本列（维度 + 对比项），按
    # (维度, 对比项) 分组聚合，避免把不同对比项的数值错误求和成一个系列。
    if len(series) == 1 and series[0]["name"] == "数值" and isinstance(raw, list) and raw:
        sample = raw[0]
        keys = list(sample.keys())
        text_keys = [k for k in keys if not _is_numeric_col(raw, k)]
        value_keys = [k for k in keys if _is_numeric_col(raw, k)]
        if len(text_keys) >= 2 and len(value_keys) == 1:
            return _radar_from_long(raw, text_keys[0], text_keys[1], value_keys[0])
    nax = len(labels)
    if nax < 3:
        raise ValueError(f"雷达图至少需要 3 个轴（当前 {nax} 个）；请提供 ≥3 行数据，每行是一个维度轴")
    axis_max = [max((s["values"][i] for s in series), default=0) for i in range(nax)]
    neg_axes = [labels[i] for i in range(nax) if any(s["values"][i] < 0 for s in series)]
    warnings = list(chart["quality"].get("warnings", []))
    if neg_axes:
        warnings.append(f"{len(neg_axes)} 个轴含负值（{', '.join(neg_axes[:3])}），归一化时按该轴最小值平移，占比仅在该轴内可比")
    # 每轴：若全非负 → min=0；含负 → 按该轴 min..max 平移到 0..1
    axes = []
    for i, lab in enumerate(labels):
        vals = [s["values"][i] for s in series]
        mn, mx = min(vals), axis_max[i]
        axes.append({"label": lab, "max": mx, "min": mn if mn < 0 else 0})
    def _norm(axis, v):
        lo, hi = axis["min"], axis["max"]
        return 0.0 if hi == lo else max(0.0, min(1.0, (v - lo) / (hi - lo)))
    items = []
    for si, s in enumerate(series):
        pts = [_norm(axes[i], s["values"][i]) for i in range(nax)]
        area = _poly_area(pts)
        avg = sum(pts) / nax
        items.append({"name": s["name"], "values": s["values"], "norm": pts,
                      "area": area, "avg": avg, "min_i": min(range(nax), key=lambda i: pts[i]),
                      "max_i": max(range(nax), key=lambda i: pts[i])})
    ranked = sorted(items, key=lambda x: x["area"], reverse=True)
    chart["quality"]["warnings"] = warnings[:6]
    return {"axes": axes, "items": items, "nax": nax,
            "leader": ranked[0]["name"] if ranked else "—",
            "mapping": chart["quality"].get("mapping"), "series_n": len(series),
            "mode": chart["quality"].get("mode"), "quality": chart["quality"], "kinds": chart.get("kinds")}

def _is_numeric_col(rows, key):
    vals = [r.get(key) for r in rows]
    ok = 0
    for v in vals:
        num, status, _ = parse_number(v)
        if status in ("ok", "percent"):
            ok += 1
    return ok >= 0.8 * max(1, len(vals))

def _radar_from_long(rows, axis_key, item_key, value_key):
    """长表 (维度, 对比项, 数值) → 每个对比项一条系列，按维度对齐。"""
    axes_order = []
    items_order = []
    grouped = {}
    for r in rows:
        axis = str(r.get(axis_key) if r.get(axis_key) not in (None, "") else "?")
        item = str(r.get(item_key) if r.get(item_key) not in (None, "") else "?")
        val, _, _ = parse_number(r.get(value_key))
        if axis not in axes_order:
            axes_order.append(axis)
        if item not in items_order:
            items_order.append(item)
        grouped[(item, axis)] = grouped.get((item, axis), 0) + val
    axes = [{"label": a, "max": 0.0, "min": 0.0} for a in axes_order]
    items = []
    for item in items_order:
        vals = [grouped.get((item, a), 0) for a in axes_order]
        items.append({"name": item, "values": vals})
    nax = len(axes_order)
    for i in range(nax):
        axes[i]["max"] = max((it["values"][i] for it in items), default=0)
        mn = min((it["values"][i] for it in items), default=0)
        axes[i]["min"] = mn if mn < 0 else 0
    warnings = []
    neg_axes = [axes[i]["label"] for i in range(nax) if any(it["values"][i] < 0 for it in items)]
    if neg_axes:
        warnings.append(f"{len(neg_axes)} 个轴含负值（{', '.join(neg_axes[:3])}），归一化时按该轴最小值平移，占比仅在该轴内可比")
    def _norm(axis, v):
        lo, hi = axis["min"], axis["max"]
        return 0.0 if hi == lo else max(0.0, min(1.0, (v - lo) / (hi - lo)))
    for it in items:
        it["norm"] = [_norm(axes[i], it["values"][i]) for i in range(nax)]
        it["area"] = _poly_area(it["norm"])
        it["avg"] = sum(it["norm"]) / nax
        it["min_i"] = min(range(nax), key=lambda i: it["norm"][i])
        it["max_i"] = max(range(nax), key=lambda i: it["norm"][i])
    ranked = sorted(items, key=lambda x: x["area"], reverse=True)
    quality = _new_quality(len(rows), "long")
    quality["mapping"] = {"label": axis_key, "series": item_key, "value": value_key}
    quality["warnings"] = warnings[:6]
    return {"axes": axes, "items": items, "nax": nax,
            "leader": ranked[0]["name"] if ranked else "—",
            "mapping": quality["mapping"], "series_n": len(items),
            "mode": "long", "quality": quality, "kinds": ["delta"] * nax}

def _poly_area(pts):
    """正多边形雷达：极坐标面积 Σ 0.5*r_i*r_j*sin(2π/n)，单位为轴归一化平方。"""
    n = len(pts)
    if n < 3:
        return 0.0
    ang = 2 * math.pi / n
    s = 0.0
    for i in range(n):
        j = (i + 1) % n
        s += 0.5 * pts[i] * pts[j] * math.sin(ang)
    return abs(s)

def build_radar_table(data):
    parts = ['<table class="table"><thead><tr><th>对比项</th>' + "".join(f"<th class=\"num\">{esc(a['label'])}</th>" for a in data["axes"]) + '<th class="num">覆盖面积</th></tr></thead><tbody>']
    for it in data["items"]:
        tds = "".join(f"<td class=\"num\">{_fmt_num(v)}</td>" for v in it["values"])
        parts.append(f'<tr><td>{esc(it["name"])}</td>{tds}<td class="num">{it["area"]:.2f}</td></tr>')
    parts.append("</tbody></table>")
    return "".join(parts)

def build_radar_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["mapping"] or {}
    chips_data = [
        ("模式", "radar"), ("轴数", data["nax"]), ("对比项", data["series_n"]),
        ("分类列", m.get("label", "?")), ("数值列", m.get("value", "—")),
        ("领先", data["leader"]), ("归一化", "按轴 max=1"),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">各轴按最大值归一化；面积与形状可直接对比。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>radar · {data["nax"]} 轴 × {data["series_n"]} 项</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_radar(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_radar(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    items = data["items"]
    leader = data["leader"]
    cards = [
        ("轴数", str(data["nax"])),
        ("对比项", str(data["series_n"])),
        ("领先", leader),
        ("领先覆盖", f"{max((it['area'] for it in items), default=0):.2f}"),
        ("归一化", "按轴 max=1"),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__AXES_N__", str(data["nax"]))
    html_text = html_text.replace("__ITEMS_N__", str(data["series_n"]))
    html_text = html_text.replace("__LEADER__", esc(leader))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json({"axes": data["axes"], "items": data["items"]}))
    html_text = html_text.replace("__TABLE_HTML__", build_radar_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_radar_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, data["nax"], data["series_n"]

# ---- 注册与契约 ----
render = render_radar  # 统一注册入口
TEMPLATE_IDS = ("radar-basic",)
SUMMARY_KEYS = ("axes", "items")
def SUMMARY_FMT(n, ns):
    return f"{n} 轴 × {ns} 对比项"

CONTRACT = {
    "views": ["radar"],
    "templates": list(TEMPLATE_IDS),
    "title": "雷达图",
    "summary": "多维对比：宽表（label+多数值列）或长表（axis/item/value）",
    "columns": {
        "required": [
            {"name": "label/item", "aliases": ["label", "name", "item", "类别", "名称", "对比项"], "note": "宽表取第一列；长表为对比项列"},
            {"name": "value", "aliases": ["value", "数值"], "note": "宽表：其余数值列各为一轴；长表：axis+item+value 三列"},
        ],
        "optional": [{"name": "axis", "aliases": ["axis", "dimension", "维度", "指标"], "note": "长表模式专用"}],
    },
    "inference": ["宽表优先；检测到 axis/item/value 结构自动转长表模式", "轴数 <3 拒绝", "各轴独立归一"],
    "example_csv": "车型,动力,油耗,舒适,操控\nA款,8,6,9,7\nB款,6,8,7,8",
    "command": "vizscape render data.csv --view radar --theme light --out out/radar.html",
}
