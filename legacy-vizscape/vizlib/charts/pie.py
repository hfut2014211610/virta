"""vizlib.charts.pie · 占比饼图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from .barline import to_chart
from ..core import (
    _fmt_num, esc, js_json, read_raw, TEMPLATES, THEME_TOKEN_HTML,
)

PIE_SMALL_THRESHOLD = 0.03  # 占比 < 3% 的扇区并入「其他」

def to_pie(raw):
    """{labels, series:[{name,values}], quality} → 饼图数据：按占比降序，小份额并入「其他」。

    多系列时用「可见系列小计」作每个分类的值（与 bar 的 Pareto 一致）；单系列直接用该列。
    """
    chart = to_chart(raw)
    labels = chart["labels"]
    series = chart["series"]
    # 每个分类的值 = 各可见系列求和（单系列即该列本身）
    totals = [sum(s["values"][i] for s in series) for i in range(len(labels))]
    warnings = list(chart["quality"].get("warnings", []))
    # 负值 / 零值处理：负值剔除并警告，零值剔除
    keep_idx, neg_idx, zero_idx = [], [], []
    for i, v in enumerate(totals):
        if v < 0:
            neg_idx.append(i)
        elif v == 0:
            zero_idx.append(i)
        else:
            keep_idx.append(i)
    if neg_idx:
        warnings.append(f"{len(neg_idx)} 个分类为负值（{', '.join(esc(labels[i]) for i in neg_idx[:3])}），饼图无法表示，已剔除；请用柱状图看正负对比")
    if zero_idx:
        warnings.append(f"{len(zero_idx)} 个分类为 0，已剔除（占比不可见）")
    if not keep_idx:
        raise ValueError("所有分类数值之和 ≤ 0，饼图无法表示；请确认数值列或改用柱状图")
    kept_labels = [labels[i] for i in keep_idx]
    kept_vals = [totals[i] for i in keep_idx]
    kept_grand = sum(kept_vals)
    # 占比排序（降序），再把尾部连续小份额并入「其他」
    order = sorted(range(len(kept_labels)), key=lambda k: kept_vals[k], reverse=True)
    sorted_labels = [kept_labels[k] for k in order]
    sorted_vals = [kept_vals[k] for k in order]
    shares = [v / kept_grand for v in sorted_vals]
    # 找到第一个不再「小」的位置：其后所有都小（降序保证单调）
    keep_n = len(shares)
    while keep_n > 1 and shares[keep_n - 1] < PIE_SMALL_THRESHOLD:
        keep_n -= 1
    slices = [{"label": l, "value": v, "share": shares[i]} for i, (l, v) in enumerate(zip(sorted_labels, sorted_vals)) if i < keep_n]
    other_n = len(shares) - keep_n
    if other_n:
        other_v = sum(sorted_vals[keep_n:])
        slices.append({"label": f"其他（{other_n} 项）", "value": other_v, "share": other_v / kept_grand})
        warnings.append(f"{other_n} 个分类占比 < {int(PIE_SMALL_THRESHOLD*100)}%，已并入「其他」")
    top = slices[0] if slices else {"label": "—", "value": 0, "share": 0}
    chart["quality"]["warnings"] = warnings[:6]
    return {
        "slices": slices, "grand": kept_grand, "top": top, "mode": chart["quality"].get("mode"),
        "mapping": chart["quality"].get("mapping"), "series_n": len(series),
        "quality": chart["quality"], "kinds": chart.get("kinds"),
    }

def build_pie_table(data):
    rows = []
    for s in data["slices"]:
        rows.append((s["label"], _fmt_num(s["value"]), f"{s['share']*100:.1f}%"))
    parts = ['<table class="table"><thead><tr><th>扇区</th><th class="num">数值</th><th class="num">占比</th></tr></thead><tbody>']
    for lab, v, sh in rows:
        parts.append(f"<tr><td>{esc(lab)}</td><td class=\"num\">{esc(v)}</td><td class=\"num\">{esc(sh)}</td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_pie_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["mapping"] or {}
    chips_data = [
        ("模式", "pie"), ("扇区", len(data["slices"])), ("系列", data["series_n"]),
        ("分类列", m.get("label", "?")), ("数值列", m.get("value", "—")),
        ("总和", _fmt_num(data["grand"])), ("最大", f"{data['top']['label']} {data['top']['share']*100:.1f}%"),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">未发现缺失/非法/负值风险；占比可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>pie · {esc(m.get("label","?"))} × {esc(str(m.get("value","—")))}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_pie(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_pie(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    slices = data["slices"]
    top = data["top"]
    cards = [
        ("扇区", str(len(slices))),
        ("总和", _fmt_num(data["grand"])),
        ("最大占比", f"{top['share']*100:.1f}%"),
        ("领先项", top["label"]),
        ("分类数", str(len(data.get("kinds") or slices))),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__SLICES_N__", str(len(slices)))
    html_text = html_text.replace("__MAX_SHARE__", f"{top['share']*100:.1f}%")
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json({"slices": slices}))
    html_text = html_text.replace("__TABLE_HTML__", build_pie_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_pie_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(slices), data["series_n"]

# ---- 注册与契约 ----
render = render_pie  # 统一注册入口
TEMPLATE_IDS = ("pie-basic",)
SUMMARY_KEYS = ("slices", "series")
def SUMMARY_FMT(n, ns):
    return f"{n} 扇区 × {ns} 系列"

CONTRACT = {
    "views": ["pie"],
    "templates": list(TEMPLATE_IDS),
    "title": "占比饼图 / 环形图",
    "summary": "label+value 看份额构成；页内可切环形",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "分类", "类别", "标签"], "note": "缺省取第一列"},
            {"name": "value", "aliases": ["value", "count", "amount", "数值", "数量", "金额"], "note": "数值列"},
        ],
        "optional": [],
    },
    "inference": ["占比 <3% 的扇区自动并入「其他」", "负值/0 值剔除并警告"],
    "example_csv": "渠道,营收\n线上,520\n线下,340",
    "command": "vizscape render data.csv --view pie --theme light --out out/pie.html",
}
