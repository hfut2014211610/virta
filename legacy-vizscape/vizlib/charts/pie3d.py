"""vizlib.charts.pie3d · 3D 分层饼图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。

3D 不扭曲面积判断的方案：每一层是一层饼（该层各分类的占比），同一类别跨层同色。
  - 两层输入（group+label+value）：分层沿 Z 轴排布，每层的扇区 = 该组内占比
  - 一维输入（label+value）：单层厚环，扇区 = 总数中的占比
与透视挤压的"3D 饼"不同，本图所有层半径相同、扇区角度相同，宽度/面积判读不受影响。
"""
import sys
from collections import OrderedDict
from pathlib import Path
from ..core import (
    _fmt_num, esc, is_doc_template, js_json, parse_number, read_raw, TEMPLATES, THEME_TOKEN_HTML,
)
from .treemap import _detect_treemap_columns

PIE3D_SMALL_THRESHOLD = 0.03  # 每层占比 < 3% 的扇区并入「其他」

def _merge_small(items):
    """items: [(label, value)]，按 value 降序返回 (slices, other_n)"""
    total = sum(v for _, v in items)
    ordered = sorted(items, key=lambda kv: -kv[1])
    keep_n = len(ordered)
    shares = [v / total for _, v in ordered]
    # 降序保证：从尾部连续小份额并入「其他」
    while keep_n > 1 and shares[keep_n - 1] < PIE3D_SMALL_THRESHOLD:
        keep_n -= 1
    slices = [{"label": l, "value": v, "share": s} for (l, v), s in zip(ordered[:keep_n], shares[:keep_n])]
    other_n = len(ordered) - keep_n
    if other_n:
        other_v = sum(v for _, v in ordered[keep_n:])
        slices.append({"label": f"其他（{other_n} 项）", "value": other_v, "share": other_v / total if total else 0})
    return slices, other_n

def to_pie3d(raw):
    """{rows} → 3D 分层饼模型：{mode, layers:[{name,value,share,slices:[...]}], grand, ...}"""
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("3D 饼图需要 group+label+value 或 label+value（CSV/Excel）；ECharts JSON 请先展开成表格")
    if not raw:
        raise ValueError("数据为空")
    cols = _detect_treemap_columns(raw)
    value_key = cols["value_key"]
    if value_key is None:
        raise ValueError("3D 饼图需要数值列（label+value 或 group+label+value）")
    label_key = cols["label_key"]
    if label_key is None:
        raise ValueError("3D 饼图需要标签列（label/名称/分类等）")
    group_key = cols["group_key"]

    # 收集各层 → 各扇区（剔除负/0，缺失跳过）
    rows = []
    neg, zero, missing = [], [], 0
    for idx, r in enumerate(raw):
        lab = r.get(label_key)
        lab = str(lab) if lab not in (None, "") else f"行{idx+1}"
        grp = None
        if group_key:
            g = r.get(group_key)
            grp = str(g) if g not in (None, "") else "未分组"
        val, status, _ = parse_number(r.get(value_key))
        if status == "missing":
            missing += 1
            continue
        if val < 0:
            neg.append((lab, val))
        elif val == 0:
            zero.append(lab)
        else:
            rows.append({"label": lab, "group": grp, "value": val})
    warnings = []
    if neg:
        warnings.append(f"{len(neg)} 项为负值（如 {', '.join(esc(l) for l, _ in neg[:3])}），扇区面积无意义，已剔除")
    if zero:
        warnings.append(f"{len(zero)} 项为 0，已剔除（占比不可见）")
    if missing:
        warnings.append(f"{missing} 项数值缺失，已跳过")
    if not rows:
        raise ValueError("3D 饼图没有正值数据；请确认数值列或改用柱状图")
    grand = sum(r["value"] for r in rows)
    if grand <= 0:
        raise ValueError("所有数值之和 ≤ 0，3D 饼图无法表示；请确认数值列")

    # 分组、排序、并小份额
    mode = "grouped" if group_key else "flat"
    layer_items = OrderedDict()
    for r in rows:
        layer_items.setdefault(r["group"] if group_key else None, []).append((r["label"], r["value"]))
    layers = []
    merged_total = 0
    unique = OrderedDict()
    for gname, items in layer_items.items():
        lt = sum(v for _, v in items)
        slices, other_n = _merge_small(items)
        merged_total += other_n
        for s in slices:
            if not s["label"].startswith("其他"):
                unique[s["label"]] = unique.get(s["label"], 0) + s["value"]
        layers.append({"name": gname, "value": lt, "share": lt / grand if grand else 0, "slices": slices})
    # 层按总值降序（最大层在最下面）——视觉稳定且符合阅读顺序
    layers.sort(key=lambda l: -l["value"])
    if merged_total:
        warnings.append(f"共 {merged_total} 个小份额（< 3%），已并入「其他」")
    if len(layers) == 1 and group_key is None:
        mode = "flat"
    # 类别全局排序（按总值降序，颜色一致）
    category_order = sorted(unique, key=lambda c: -unique[c])
    categories = [c for c in category_order]
    # 峰值扇区
    peak = max(((s, l["name"]) for l in layers for s in l["slices"]),
               key=lambda x: x[0]["value"], default=({"label": "—", "value": 0, "share": 0}, None))
    quality = {
        "rows": len(raw), "mode": mode,
        "mapping": {"group": group_key, "label": label_key, "value": value_key}
        if group_key else {"label": label_key, "value": value_key},
        "numeric_columns": [esc(value_key)], "missing": missing, "invalid": 0, "percent": 0,
        "negative": len(neg), "anchors": 0, "unknown_types": 0, "kind_conflicts": 0,
        "type_column": "—", "duplicate_pairs": 0, "warnings": warnings[:6], "confidence": "high",
    }
    if warnings:
        quality["confidence"] = "medium"
    return {
        "mode": mode, "layers": layers, "grand": grand,
        "n_layers": len(layers),
        "categories": categories,               # 跨层颜色槽位
        "n_categories": len(categories),
        "peak": {"label": peak[0]["label"], "value": peak[0]["value"], "share": peak[0]["share"], "layer": peak[1]},
        "mapping": quality["mapping"], "quality": quality,
    }

def build_pie3d_table(data):
    parts = ['<table class="table"><thead><tr>']
    if data["mode"] == "grouped":
        parts.append("<th>层</th>")
    parts.append("<th>扇区</th><th class=\"num\">数值</th><th class=\"num\">层内占比</th></tr></thead><tbody>")
    for li, layer in enumerate(data["layers"]):
        first = True
        for s in layer["slices"]:
            cell = (esc(layer['name']) if layer['name'] else "全部") if first else ""
            parts.append(
                f"<tr><td>{cell}</td>"
                f"<td>{esc(s['label'])}</td>"
                f"<td class=\"num\">{_fmt_num(s['value'])}</td>"
                f"<td class=\"num\">{s['share']*100:.1f}%</td></tr>")
            first = False
        if layer["name"]:
            parts.append(
                f"<tr class=\"subtotal\"><td></td><td><b>{esc(layer['name'])} 小计</b></td>"
                f"<td class=\"num\"><b>{_fmt_num(layer['value'])}</b></td>"
                f"<td class=\"num\"><b>{layer['share']*100:.1f}%</b></td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_pie3d_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["mapping"]
    chips_data = [
        ("模式", "pie3d"), ("层数", data["n_layers"]), ("类别", data["n_categories"]),
        ("总值", _fmt_num(data["grand"])),
    ]
    if data["mode"] == "grouped":
        chips_data.append(("层映射", " → ".join(f"{k}={v}" for k, v in m.items())))
    else:
        chips_data.append(("映射", " → ".join(f"{k}={v}" for k, v in m.items())))
    chips_data.append(("并小份额", f"占比<{int(PIE3D_SMALL_THRESHOLD*100)}% 并入其他"))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">各层按同色分类对齐、角度一致，占比可直接比较。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>pie3d · {esc(m.get("label", "?"))}{(" × " + esc(m["group"])) if m.get("group") else ""}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_pie3d(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    if not (tdir / "manifest.json").exists():
        sys.exit(f"✗ 模板不存在：{template}（vizscape list 查看）")
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_pie3d(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    peak = data["peak"]
    cards = [
        ("层数", str(data["n_layers"])),
        ("类别", str(data["n_categories"])),
        ("总值", _fmt_num(data["grand"])),
        ("峰值", f"{peak['share']*100:.1f}%"),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__LAYERS_N__", str(data["n_layers"]))
    html_text = html_text.replace("__CATS_N__", str(data["n_categories"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    data_out = {"mode": data["mode"], "layers": data["layers"], "grand": data["grand"],
                "categories": data["categories"], "peak": peak,
                "x_title": "层 · " + str((data["mapping"] or {}).get("group") or "全部")}
    html_text = html_text.replace("__DATA_JSON__", js_json(data_out))
    html_text = html_text.replace("__TABLE_HTML__", build_pie3d_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_pie3d_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, data["n_layers"], data["n_categories"]

# ---- 注册与契约 ----
render = render_pie3d  # 统一注册入口
TEMPLATE_IDS = ("pie3d-basic",)
SUMMARY_KEYS = ("rings", "categories")
def SUMMARY_FMT(n, ns):
    return f"{n} 层 × {ns} 类别"

CONTRACT = {
    "views": ["pie3d"],
    "templates": list(TEMPLATE_IDS),
    "title": "3D 分层饼图",
    "summary": "每一层是一层饼（该行各分类占比），同类别跨层同色；真三维投影，占比不扭曲",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "分类", "类别", "标签"], "note": "占比扇区"},
            {"name": "value", "aliases": ["value", "count", "amount", "数值", "数量", "金额"], "note": "每层求和后取占比"},
        ],
        "optional": [
            {"name": "group", "aliases": ["group", "大区", "区域", "季度", "分组", "group_field"], "note": "分层列（缺省=单层）"},
        ],
    },
    "inference": ["group+label+value → 多层；label+value → 单层厚环；基数最少的文本列当分层", "每层占比 <3% 的扇区并入「其他」", "负值/0 值剔除并警告；层按总值降序（最大层在最下）"],
    "example_csv": "季度,品类,营收\nQ1,手机,320\nQ1,笔记本,210\nQ2,手机,350",
    "command": "vizscape render data.csv --view pie3d --theme light --out out/pie3d.html",
}
