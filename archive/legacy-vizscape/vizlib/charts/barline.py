"""vizlib.charts.barline · 柱状/折线/3D 矩阵（label+series 通用表格模型） 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from collections import OrderedDict
from pathlib import Path
from ..core import (
    _add_group, _finish_quality, _first_key, _kind_map, _new_quality, _numeric_keys, _numeric_stats, esc, is_doc_template, js_json, LABEL_ALIASES, NUM_RATIO, parse_number, read_raw, SERIES_ALIAS, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML, TYPE_ALIAS, VALUE_ALIAS,
)
from docrender import render_doc

def to_chart(raw):
    """统一成 {labels:[...], series:[{name, values:[...]}], quality:{...}}"""
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        e = raw[1]
        labels = [str(x) for x in e.get("xAxis", {}).get("data", [])]
        series, missing, invalid, percent = [], 0, 0, 0
        for i, s in enumerate(e.get("series", [])):
            vals = []
            for v in s.get("data", []):
                num, status, _ = parse_number(v)
                vals.append(num)
                if status == "missing":
                    missing += 1
                elif status == "invalid":
                    invalid += 1
                elif status == "percent":
                    percent += 1
            series.append({"name": str(s.get("name", f"系列{i+1}")), "values": vals})
        quality = _new_quality(len(labels), "echarts")
        quality["mapping"] = {"label": "xAxis.data", "series": "series[].name", "value": "series[].data"}
        quality["type_column"] = "—"
        quality["missing"], quality["invalid"], quality["percent"] = missing, invalid, percent
        if missing or invalid or percent:
            quality["warnings"].append("ECharts JSON 含缺失/非法/百分号数值，已按 0 计或原刻度保留")
            quality["confidence"] = "medium" if invalid == 0 else "low"
        for s in series:
            s["values"] = [int(v) if v == int(v) else v for v in s["values"]]
        return {"labels": labels, "series": series, "quality": quality, "kinds": ["delta"] * len(labels)}
    if not raw:
        raise ValueError("数据为空")

    sample = raw[0]
    keys = list(sample.keys())
    label_key = _first_key(sample, LABEL_ALIASES) or keys[0]
    series_key = _first_key(sample, SERIES_ALIAS)
    type_key = _first_key(sample, TYPE_ALIAS)
    stats = _numeric_stats(raw, keys)
    excluded = {label_key} | ({series_key} if series_key else set()) | ({type_key} if type_key else set())
    numeric_cols = _numeric_keys(stats, keys, excluded)
    value_alias_key = _first_key(sample, VALUE_ALIAS)

    grouped = OrderedDict()
    labels_order = []
    if series_key:
        mode = "long"
        value_key = value_alias_key if value_alias_key and value_alias_key != label_key else (numeric_cols[-1] if numeric_cols else None)
        quality = _new_quality(len(raw), mode)
        quality["mapping"] = {"label": label_key, "series": series_key, "value": value_key or "(末列兜底)"}
        for r in raw:
            lab = str(r.get(label_key) if r.get(label_key) not in (None, "") else "?")
            sname = str(r.get(series_key) if r.get(series_key) not in (None, "") else "系列")
            raw_val = r.get(value_key) if value_key else (list(r.values())[-1] if r else None)
            val, _, _ = parse_number(raw_val)
            if lab not in labels_order:
                labels_order.append(lab)
            _add_group(grouped, quality, sname, lab, val)
    elif len(numeric_cols) >= 2:
        mode = "wide"
        value_key = "(宽表多数值列)"
        quality = _new_quality(len(raw), mode)
        quality["mapping"] = {"label": label_key, "series": "(每个数值列=一个系列)", "value": ", ".join(numeric_cols[:4])}
        for r in raw:
            lab = str(r.get(label_key) if r.get(label_key) not in (None, "") else "?")
            if lab not in labels_order:
                labels_order.append(lab)
            for col in numeric_cols:
                val, _, _ = parse_number(r.get(col))
                _add_group(grouped, quality, col, lab, val)
    else:
        mode = "single"
        value_key = value_alias_key or (numeric_cols[0] if numeric_cols else next((k for k in keys if k != label_key), None))
        if value_key is None:
            raise ValueError("找不到数值列（需 label + value，或 label + series + value，或宽表）")
        grouped["数值"] = {}
        quality = _new_quality(len(raw), mode)
        quality["mapping"] = {"label": label_key, "series": "(单系列)", "value": value_key}
        for r in raw:
            lab = str(r.get(label_key) if r.get(label_key) not in (None, "") else "?")
            if lab not in labels_order:
                labels_order.append(lab)
            val, _, _ = parse_number(r.get(value_key))
            _add_group(grouped, quality, "数值", lab, val)

    kind_map, unknown_types, kind_conflicts = _kind_map(raw, label_key, type_key)
    quality["type_column"] = esc(type_key) if type_key else "—"
    quality["anchors"] = sum(1 for kind in kind_map.values() if kind == "absolute")
    quality["unknown_types"] = unknown_types
    quality["kind_conflicts"] = kind_conflicts
    if unknown_types:
        quality["warnings"].append(f"类型列「{esc(type_key)}」含 {unknown_types} 个未知标记，已按 delta 处理")
    if kind_conflicts:
        quality["warnings"].append(f"同一分类出现多种行类型，已按首次出现的类型绘制")
    kinds = [kind_map.get(lab, "delta") for lab in labels_order]

    chosen = numeric_cols if mode != "single" else [value_key]
    quality = _finish_quality(quality, stats, chosen, excluded)
    if (unknown_types or kind_conflicts) and quality["confidence"] == "high":
        quality["confidence"] = "medium"
    series = [{"name": name, "values": [grouped[name].get(lab, 0) for lab in labels_order]} for name in grouped]
    for s in series:
        s["values"] = [int(v) if v == int(v) else v for v in s["values"]]
    return {"labels": labels_order, "series": series, "quality": quality, "kinds": kinds}

def build_table(chart):
    labels, series = chart["labels"], chart["series"]
    totals = [sum(s["values"][i] for s in series) for i in range(len(labels))]
    abs_totals = [abs(t) for t in totals]
    tmax = max(abs_totals) if abs_totals else 1
    grand = sum(abs_totals)
    head = "".join(f'<th class="num">{esc(s["name"])}</th>' for s in series)
    rows = []
    for i, lab in enumerate(labels):
        cells = "".join(f'<td class="num">{s["values"][i]:,}</td>' for s in series)
        pct = (abs_totals[i] / grand * 100) if grand else 0
        rows.append(
            f'<tr><td>{esc(lab)}</td>{cells}'
            f'<td class="num">{totals[i]:,}</td>'
            f'<td><div class="bar-cell" style="width:{round(abs_totals[i]/tmax*100) if tmax else 0}%"></div></td>'
            f'<td class="num">{pct:.1f}%</td></tr>'
        )
    return (
        '<table class="table"><thead><tr><th>分类</th>' + head +
        '<th class="num">小计</th><th>相对占比</th><th class="num">占绝对量</th></tr></thead><tbody>' +
        "".join(rows) + '</tbody></table>'
    )

def build_quality(chart):
    q = chart.get("quality") or _new_quality(0, "unknown")
    m = q.get("mapping", {})
    conf = q.get("confidence", "high")
    conf_label = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(conf, conf)
    cls = "quality warn" if q.get("warnings") else "quality ok"
    stats = [
        ("模式", q.get("mode", "?")), ("行数", q.get("rows", 0)), ("分类列", m.get("label", "?")),
        ("系列", m.get("series", "—")), ("数值", m.get("value", "—")),
        ("类型列", q.get("type_column", "—")), ("锚点", q.get("anchors", 0)),
        ("缺失按0计", q.get("missing", 0)), ("非法按0计", q.get("invalid", 0)), ("负值", q.get("negative", 0)), ("重复组合", q.get("duplicate_pairs", 0)),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in stats)
    if q.get("warnings"):
        details = "".join(f"<li>{w}</li>" for w in q["warnings"])
        body = f'<ul class="quality-warnings">{details}</ul>'
    else:
        body = '<p class="quality-ok">未发现缺失/非法/重复风险；字段映射可直接信任。</p>'
    return f'''<section class="{cls}" aria-label="数据识别报告">
  <div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf_label)}</b>{len(q.get("numeric_columns", []))} 个数值列 · 阈值 ≥ {int(NUM_RATIO*100)}%</div></div>
  <div class="quality-grid">{chips}</div>
  {body}
</section>'''

def render(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    if not (tdir / "manifest.json").exists():
        sys.exit(f"✗ 模板不存在：{template}（vizscape list 查看）")
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    if is_doc_template(template):
        return render_doc(tdir, input_path, out_path, theme, title)
    raw = read_raw(p)
    chart = to_chart(raw)
    finals = [{"name": s["name"], "values": s["values"]} for s in chart["series"]]
    total = sum(sum(s["values"]) for s in chart["series"])
    peak = max(((lab, s["name"], s["values"][i]) for i, lab in enumerate(chart["labels"]) for s in chart["series"]), key=lambda x: abs(x[2]), default=("—", "—", 0))
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__LABELS__", str(len(chart["labels"])))
    html_text = html_text.replace("__SERIES_N__", str(len(chart["series"])))
    html_text = html_text.replace("__SUM__", f"{total:,}")
    html_text = html_text.replace("__MAX__", esc(f"{peak[0]} · {peak[1]} = {peak[2]:,}"))
    html_text = html_text.replace("__DATA_JSON__", js_json({"labels": chart["labels"], "series": finals, "kinds": chart.get("kinds", ["delta"] * len(chart["labels"]))}))
    html_text = html_text.replace("__TABLE_HTML__", build_table(chart))
    html_text = html_text.replace("__QUALITY_HTML__", build_quality(chart))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(chart["labels"]), len(chart["series"])

# ---- 注册与契约（vizlib.charts.REGISTRY / vizscape schema）----
TEMPLATE_IDS = ("bar-basic", "line-basic", "bar-matrix")
SUMMARY_KEYS = ("labels", "series")
def SUMMARY_FMT(n, ns):
    return f"{n} 分类 × {ns} 系列"

CONTRACT = {
    "views": ["bar", "line", "matrix3d"],
    "templates": list(TEMPLATE_IDS),
    "title": "柱状图 / 折线图 / 3D 矩阵",
    "summary": "通用 label+series 表格模型；单系列、长表、宽表、ECharts 风格 JSON 均可",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "x", "分类", "类别", "标签", "名称", "阶段", "指标"], "note": "缺省取第一列"},
            {"name": "value", "aliases": ["value", "count", "amount", "y", "数值", "数量", "金额", "销量", "营收", "增减"], "note": "宽表时除 label 外每个数值列即一个系列"},
        ],
        "optional": [
            {"name": "series", "aliases": ["series", "group", "系列", "分组", "渠道", "门店", "城市", "部门"], "note": "长表分组列"},
            {"name": "type", "aliases": ["type", "kind", "阶段类型", "类型"], "note": "瀑布/矩阵模式：absolute|delta"},
        ],
    },
    "inference": ["数值列 = 解析率≥80% 的列", "重复 label+series 组合求和并警告", "缺失/NA 按 0 计并警告", "label 命中时间格式 → inspect 推荐 line"],
    "example_csv": "月份,产品A,产品B\n1月,120,80\n2月,150,95",
    "command": "vizscape render data.csv --view bar --theme light --out out/bar.html",
}
