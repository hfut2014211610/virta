"""vizlib.charts.line3d · 3D 折线图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。

视图编码：X（地面轴）=分类/时间，Y（地面深度轴）=系列位置，Z（垂直轴）=数值高度。
数据模型复用 barline.to_chart（柱/线通用 label+series 表格），因此支持
ECharts JSON / 宽表 / 长表 / 单系列四种输入形态。
"""
import sys
from pathlib import Path
from .barline import build_table, to_chart
from ..core import (
    _fmt_num, esc, is_doc_template, js_json, read_raw, SHARED_CSS, TEMPLATES, TEMPORAL_RE, THEME_TOKEN_HTML,
)

def _is_temporal(labels):
    labels = [str(x).strip() for x in labels]
    return len(labels) >= 3 and sum(bool(TEMPORAL_RE.match(x)) for x in labels) >= 0.8 * len(labels)

def to_line3d(raw):
    """{labels, series, quality, kinds} → 3D 折线模型：统一 Z 轴刻度 + 系列深度槽位。"""
    chart = to_chart(raw)
    labels, series = chart["labels"], chart["series"]
    if not labels or not series:
        raise ValueError("数据为空或没有有效系列")
    x_key = (chart["quality"].get("mapping") or {}).get("label", "分类")
    value_key = str((chart["quality"].get("mapping") or {}).get("value", "数值") or "数值")
    if value_key.startswith("(") or any(t in value_key for t in ("宽表", "series[]", ", ", "，")):
        value_key = "数值"   # 宽表/ECharts 通用描述不便直接当轴名
    y_name = value_key
    all_vals = [v for s in series for v in s["values"]]
    ymin, ymax = min(all_vals), max(all_vals)
    return {
        "labels": labels,
        "series": series,
        "quality": chart["quality"],
        "kinds": chart.get("kinds", ["delta"] * len(labels)),
        "x_key": str(x_key),
        "z_key": str(y_name),          # 纵向 Z（高度）
        "y_key": "系列",               # 深度 Y（地面另一轴）
        "value_range": [ymin, ymax],
        "temporal": _is_temporal(labels),
        "n_labels": len(labels),
        "n_series": len(series),
    }

def build_line3d_table(chart):
    return build_table(chart)

def build_line3d_quality(chart):
    q = chart["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q.get("mapping") or {}
    ymin, ymax = chart["value_range"]
    chips_data = [
        ("模式", "line3d"),
        ("分类", chart["n_labels"]),
        ("系列", chart["n_series"]),
        ("分类列", m.get("label", "?")),
        ("数值", m.get("value", "—")),
        ("序列类型", "时间" if chart["temporal"] else "类别"),
        ("Y范围", f"{_fmt_num(ymin)} ~ {_fmt_num(ymax)}"),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">序列无缺失/非法风险；各系列共用同一 Z 刻度，可直接比较前后系列的高度。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>line3d · {chart["n_labels"]} 分类 × {chart["n_series"]} 系列</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_line3d(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    if not (tdir / "manifest.json").exists():
        sys.exit(f"✗ 模板不存在：{template}（vizscape list 查看）")
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        chart = to_line3d(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    labels, series = chart["labels"], chart["series"]
    flat = [(lab, s["name"], s["values"][i]) for i, lab in enumerate(labels) for s in series]
    peak = max(flat, key=lambda x: x[2], default=("—", "—", 0))
    cards = [
        ("分类", str(chart["n_labels"])),
        ("系列", str(chart["n_series"])),
        ("峰值", _fmt_num(peak[2])),
        ("峰值点", esc(f"{peak[0]}·{peak[1]}")),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__LABELS_N__", str(chart["n_labels"]))
    html_text = html_text.replace("__SERIES_N__", str(chart["n_series"]))
    html_text = html_text.replace("__X_KEY__", esc(chart["x_key"]))
    html_text = html_text.replace("__Z_KEY__", esc(chart["z_key"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    data = {"labels": labels, "series": series,
            "x_key": chart["x_key"], "z_key": chart["z_key"], "y_key": chart["y_key"],
            "value_range": chart["value_range"], "temporal": chart["temporal"]}
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_line3d_table(chart))
    html_text = html_text.replace("__QUALITY_HTML__", build_line3d_quality(chart))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, chart["n_labels"], chart["n_series"]

# ---- 注册与契约 ----
render = render_line3d  # 统一注册入口
TEMPLATE_IDS = ("line3d-basic",)
SUMMARY_KEYS = ("labels", "series")
def SUMMARY_FMT(n, ns):
    return f"{n} 分类 × {ns} 系列 × 3轴"

CONTRACT = {
    "views": ["line3d"],
    "templates": list(TEMPLATE_IDS),
    "title": "3D 折线图",
    "summary": "多系列沿深度轴排列的真三维折线；X=分类/时间，Y=系列深度，Z=数值高度",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "x", "分类", "类别", "标签", "名称", "阶段", "指标"], "note": "分类/时间轴（≥2 项）；缺省取第一列，月份等时间格式自动标记为时间轴"},
            {"name": "value", "aliases": ["value", "count", "amount", "y", "数值", "数量", "金额", "销量", "营收", "增减"], "note": "宽表=多个数值列各一条系列；长表=系列列+数值列"},
        ],
        "optional": [
            {"name": "series", "aliases": ["series", "group", "系列", "分组", "渠道", "门店", "城市", "部门"], "note": "深度轴（每条系列一根带状折线）"},
        ],
    },
    "inference": ["缺省：宽表每个数值列=一个系列；长表按系列列分组；xAxis/series 的 ECharts JSON 也支持", "所有系列共用同一 Z 刻度；拖拽旋转 + 滚轮缩放（页内交互）"],
    "example_csv": "label,消费,出行,政务\n1月,420,300,180\n2月,460,330,200",
    "command": "vizscape render data.csv --view line3d --theme light --out out/line3d.html",
}
