"""vizlib.charts.funnel · 漏斗图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from .barline import to_chart
from ..core import (
    _fmt_num, esc, js_json, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML,
)

FUNNEL_MIN_STEP = 0  # 单级流失绝对值提示阈值（0=不提示）

def to_funnel(raw):
    """{labels, series} → 漏斗数据：按行序（阶段顺序）计算逐级转化率、累计留存率、流失量。

    单系列用该列；多系列用各系列小计。负值/0 值剔除并警告（漏斗要求单调非负）。
    """
    chart = to_chart(raw)
    labels = chart["labels"]
    series = chart["series"]
    totals = [sum(s["values"][i] for s in series) for i in range(len(labels))]
    warnings = list(chart["quality"].get("warnings", []))
    # 剔除负值 / 0 值
    keep, neg, zero = [], [], []
    for i, v in enumerate(totals):
        if v < 0:
            neg.append(i)
        elif v == 0:
            zero.append(i)
        else:
            keep.append(i)
    if neg:
        warnings.append(f"{len(neg)} 个阶段为负值（{', '.join(esc(labels[i]) for i in neg[:3])}），漏斗无法表示，已剔除")
    if zero:
        warnings.append(f"{len(zero)} 个阶段为 0，已剔除（后续转化率不可计算）")
    if not keep:
        raise ValueError("没有有效的正值阶段，漏斗无法绘制；请确认数值列")
    if len(keep) < 2:
        warnings.append("仅 1 个有效阶段，漏斗至少需 2 级才能看转化")
    kept_labels = [labels[i] for i in keep]
    kept_vals = [totals[i] for i in keep]
    top = kept_vals[0]
    # 是否单调不增（漏斗语义）；有回升则警告
    rises = [(i, kept_vals[i] - kept_vals[i - 1]) for i in range(1, len(kept_vals)) if kept_vals[i] > kept_vals[i - 1]]
    if rises:
        warnings.append(f"{len(rises)} 处后一阶段大于前一阶段（如 {esc(kept_labels[rises[0][0]])}），漏斗通常应单调递减，请确认阶段顺序")
    stages, prev = [], None
    for i, (lab, v) in enumerate(zip(kept_labels, kept_vals)):
        step_rate = (v / prev) if prev else None
        stages.append({
            "label": lab, "value": v,
            "step": step_rate,          # 逐级转化率（相对上一级）
            "cum": v / top,              # 累计留存率（相对首级）
            "drop": (prev - v) if prev is not None else 0,
            "drop_rate": ((prev - v) / prev) if prev else 0,
            "index": i,
        })
        prev = v
    worst = max((s for s in stages if s["step"] is not None), key=lambda s: s["drop_rate"], default=None)
    chart["quality"]["warnings"] = warnings[:6]
    return {
        "stages": stages, "top": top, "bottom": kept_vals[-1],
        "overall": (kept_vals[-1] / top) if top else 0,
        "worst": {"label": worst["label"], "drop_rate": worst["drop_rate"], "drop": worst["drop"]} if worst else None,
        "mode": chart["quality"].get("mode"), "mapping": chart["quality"].get("mapping"),
        "series_n": len(series), "quality": chart["quality"], "kinds": chart.get("kinds"),
    }

def build_funnel_table(data):
    parts = ['<table class="table"><thead><tr><th>阶段</th><th class="num">数值</th>'
             '<th class="num">逐级转化</th><th class="num">累计留存</th><th class="num">流失</th></tr></thead><tbody>']
    for s in data["stages"]:
        step = "—" if s["step"] is None else f"{s['step']*100:.1f}%"
        drop = "—" if s["index"] == 0 else f"-{_fmt_num(s['drop'])}"
        parts.append(f'<tr><td>{esc(s["label"])}</td><td class="num">{_fmt_num(s["value"])}</td>'
                     f'<td class="num">{step}</td><td class="num">{s["cum"]*100:.1f}%</td>'
                     f'<td class="num">{drop}</td></tr>')
    parts.append("</tbody></table>")
    return "".join(parts)

def build_funnel_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["mapping"] or {}
    chips_data = [
        ("模式", "funnel"), ("阶段", len(data["stages"])), ("系列", data["series_n"]),
        ("分类列", m.get("label", "?")), ("数值列", m.get("value", "—")),
        ("首级", _fmt_num(data["top"])), ("末级", _fmt_num(data["bottom"])),
        ("整体转化", f"{data['overall']*100:.1f}%"),
    ]
    if data["worst"]:
        chips_data.append(("最大流失", f"{data['worst']['label']} -{data['worst']['drop_rate']*100:.0f}%"))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">阶段顺序单调递减；转化率可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>funnel · {esc(m.get("label","?"))} × {esc(str(m.get("value","—")))}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_funnel(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_funnel(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    stages = data["stages"]
    worst = data["worst"]
    cards = [
        ("阶段", str(len(stages))),
        ("首级", _fmt_num(data["top"])),
        ("末级", _fmt_num(data["bottom"])),
        ("整体转化", f"{data['overall']*100:.1f}%"),
        ("最大流失", (f"{worst['label']} -{worst['drop_rate']*100:.0f}%") if worst else "—"),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__STAGES_N__", str(len(stages)))
    html_text = html_text.replace("__OVERALL__", f"{data['overall']*100:.1f}%")
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json({"stages": stages}))
    html_text = html_text.replace("__TABLE_HTML__", build_funnel_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_funnel_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(stages), data["series_n"]

# ---- 注册与契约 ----
render = render_funnel  # 统一注册入口
TEMPLATE_IDS = ("funnel-basic",)
SUMMARY_KEYS = ("stages", "series")
def SUMMARY_FMT(n, ns):
    return f"{n} 阶段 × {ns} 系列"

CONTRACT = {
    "views": ["funnel"],
    "templates": list(TEMPLATE_IDS),
    "title": "漏斗图",
    "summary": "label+value 按行序作阶段，看逐级转化与最大流失点",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "x", "分类", "类别", "标签", "名称", "阶段", "指标"], "note": "行顺序 = 阶段顺序"},
            {"name": "value", "aliases": ["value", "count", "amount", "y", "数值", "数量", "金额", "销量", "营收", "增减"], "note": "数值列"},
        ],
        "optional": [{"name": "series", "aliases": ["series", "group", "系列", "分组", "渠道", "门店", "城市", "部门"], "note": "多漏斗对比"}],
    },
    "inference": ["转化率/流失率自动计算", "最大流失级红色标注", "阶段数 <2 拒绝"],
    "example_csv": "阶段,人数\n访问,10000\n注册,3200\n付费,860",
    "command": "vizscape render data.csv --view funnel --theme light --out out/funnel.html",
}
