"""vizlib.charts.boxplot · 箱线图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, esc, js_json, norm_key, parse_number, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML, VALUE_ALIAS,
)

BOX_GROUP_ALIAS = tuple(norm_key(x) for x in ("group", "category", "类别", "组", "分组", "产线", "批次", "班级", "组别"))

BOX_Q1_ALIAS = tuple(norm_key(x) for x in ("q1", "下四分位", "p25"))

BOX_MED_ALIAS = tuple(norm_key(x) for x in ("median", "med", "中位数", "p50"))

BOX_Q3_ALIAS = tuple(norm_key(x) for x in ("q3", "上四分位", "p75"))

BOX_MIN_ALIAS = tuple(norm_key(x) for x in ("min", "最小值", "下限", "low"))

BOX_MAX_ALIAS = tuple(norm_key(x) for x in ("max", "最大值", "上限", "high"))

def _quartile(sorted_vals, p):
    """type-7 线性插值分位数（与 numpy 默认一致）。"""
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    pos = (n - 1) * p
    lo = int(pos)
    frac = pos - lo
    if lo + 1 >= n:
        return sorted_vals[-1]
    return sorted_vals[lo] + frac * (sorted_vals[lo + 1] - sorted_vals[lo])

def to_boxplot(raw):
    """group+value（原始观测，组内聚合五数）或 group+min/q1/median/q3/max（汇总直绘）。"""
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("箱线图需要 group/value 行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    g_key = _first_key(sample, BOX_GROUP_ALIAS) or list(sample.keys())[0]
    q1_key = _first_key(sample, BOX_Q1_ALIAS)
    med_key = _first_key(sample, BOX_MED_ALIAS)
    q3_key = _first_key(sample, BOX_Q3_ALIAS)
    min_key = _first_key(sample, BOX_MIN_ALIAS)
    max_key = _first_key(sample, BOX_MAX_ALIAS)
    v_key = _first_key(sample, VALUE_ALIAS)
    if not v_key or v_key == g_key:
        used = {k for k in (g_key, q1_key, med_key, q3_key, min_key, max_key) if k}
        for k in sample.keys():
            if k in used:
                continue
            ok = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] not in ("missing", "invalid"))
            if ok >= max(1, int(0.8 * min(len(raw), 50))):
                v_key = k
                break
    warnings = []
    groups = []
    if q1_key and med_key and q3_key:
        # —— 汇总模式 ——
        mode = "summary"
        bad = 0
        for row in raw:
            gv = row.get(g_key)
            if gv in (None, ""):
                bad += 1
                continue
            vals = {}
            ok = True
            for name, k in (("q1", q1_key), ("med", med_key), ("q3", q3_key),
                            ("min", min_key), ("max", max_key)):
                if not k:
                    vals[name] = None
                    continue
                num, st, _u = parse_number(row.get(k))
                if st in ("missing", "invalid"):
                    if name in ("q1", "med", "q3"):
                        ok = False
                        break
                    vals[name] = None
                else:
                    vals[name] = num
            if not ok:
                bad += 1
                continue
            if vals["min"] is None:
                vals["min"] = vals["q1"]
            if vals["max"] is None:
                vals["max"] = vals["q3"]
            mean_v = (vals["min"] + vals["q1"] + vals["med"] + vals["q3"] + vals["max"]) / 5
            groups.append({"name": str(gv).strip(), "n": None, "min": vals["min"], "q1": vals["q1"],
                           "med": vals["med"], "q3": vals["q3"], "max": vals["max"],
                           "mean": round(mean_v, 4), "outliers": [], "values": []})
        if not groups:
            raise ValueError("汇总模式需要 min/q1/median/q3/max 可解析数值")
        if bad:
            warnings.append(f"{bad} 行分组或四分位缺失，已跳过")
        if not min_key or not max_key:
            warnings.append("缺少 min/max 列：须线端点以 Q1/Q3 代替")
    else:
        # —— 原始观测模式 ——
        mode = "raw"
        if not v_key:
            raise ValueError("箱线图需要 value 列（或 min/q1/median/q3/max 汇总列）")
        bad, vals_by = 0, {}
        for row in raw:
            gv = row.get(g_key)
            if gv in (None, ""):
                bad += 1
                continue
            num, st, _u = parse_number(row.get(v_key))
            if st in ("missing", "invalid"):
                bad += 1
                continue
            vals_by.setdefault(str(gv).strip(), []).append(num)
        if not vals_by:
            raise ValueError("没有可解析的 (group, value) 行")
        if bad:
            warnings.append(f"{bad} 行分组或数值缺失，已跳过")
        small = []
        for name, vals in vals_by.items():
            vals.sort()
            n = len(vals)
            if n < 5:
                small.append(f"{name}(n={n})")
            q1 = _quartile(vals, 0.25)
            med = _quartile(vals, 0.5)
            q3 = _quartile(vals, 0.75)
            iqr = q3 - q1
            lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            inlier = [v for v in vals if lo_f <= v <= hi_f]
            outliers = [round(v, 4) for v in vals if v < lo_f or v > hi_f]
            groups.append({"name": name, "n": n, "min": inlier[0] if inlier else vals[0],
                           "q1": round(q1, 4), "med": round(med, 4), "q3": round(q3, 4),
                           "max": inlier[-1] if inlier else vals[-1],
                           "mean": round(sum(vals) / n, 4),
                           "outliers": outliers,
                           "values": [round(v, 4) for v in vals] if len(vals) <= 2000 else []})
        if small:
            warnings.append(f"样本量过小（n<5），五数不稳定：{'、'.join(small[:4])}")
    all_v = [g["min"] for g in groups] + [g["max"] for g in groups]
    for g in groups:
        all_v += g["outliers"]
    n_out = sum(len(g["outliers"]) for g in groups)
    counts = {"groups": len(groups), "mode": mode, "outliers": n_out,
              "vmin": min(all_v), "vmax": max(all_v),
              "n_total": sum(g["n"] for g in groups if g["n"]) if mode == "raw" else None}
    quality = {"rows": len(raw), "kept": len(groups), "warnings": warnings[:6],
               "confidence": "high" if not warnings else "medium",
               "mapping": ({"group": g_key, "q1": q1_key, "median": med_key, "q3": q3_key,
                            "min": min_key, "max": max_key} if mode == "summary"
                           else {"group": g_key, "value": v_key})}
    return {"mode": mode, "groups": groups, "counts": counts, "quality": quality}

def build_boxplot_table(data):
    parts = ['<table class="table"><thead><tr><th>分组</th><th class="num">n</th><th class="num">下限</th>'
             '<th class="num">Q1</th><th class="num">中位数</th><th class="num">Q3</th><th class="num">上限</th>'
             '<th class="num">均值</th><th class="num">离群</th></tr></thead><tbody>']
    for g in data["groups"]:
        parts.append(f"<tr><td>{esc(g['name'])}</td><td class=\"num\">{g['n'] if g['n'] is not None else '—'}</td>"
                     f"<td class=\"num\">{_fmt_num(g['min'])}</td><td class=\"num\">{_fmt_num(g['q1'])}</td>"
                     f"<td class=\"num\"><b>{_fmt_num(g['med'])}</b></td><td class=\"num\">{_fmt_num(g['q3'])}</td>"
                     f"<td class=\"num\">{_fmt_num(g['max'])}</td><td class=\"num\">{_fmt_num(g['mean'])}</td>"
                     f"<td class=\"num\">{len(g['outliers'])}</td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_boxplot_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q["mapping"]
    c = data["counts"]
    chips_data = [("模式", "汇总直绘" if c["mode"] == "summary" else "观测聚合"), ("分组", c["groups"]),
                  ("离群点", c["outliers"]), ("值域", f"{_fmt_num(c['vmin'])} ~ {_fmt_num(c['vmax'])}")]
    if c["n_total"]:
        chips_data.insert(2, ("总样本", c["n_total"]))
    chips_data += [("分组列", m["group"]), ("数值列", m.get("value") or "min/q1/med/q3/max")]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">五数概括完整；箱体与须线可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>boxplot · {esc(m["group"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_boxplot(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_boxplot(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    effect = title or p.stem
    cards = [("分组", str(c["groups"])), ("模式", "汇总" if c["mode"] == "summary" else "聚合"),
             ("离群点", str(c["outliers"])), ("值域", f"{_fmt_num(c['vmin'])}~{_fmt_num(c['vmax'])}")]
    if c["n_total"]:
        cards.insert(1, ("总样本", str(c["n_total"])))
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(effect))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__ARIA_DESC__", f"{c['groups']} 个分组，{c['outliers']} 个离群点")
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_boxplot_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_boxplot_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, c["groups"], c["outliers"]

# ---- 注册与契约 ----
render = render_boxplot  # 统一注册入口
TEMPLATE_IDS = ("boxplot-basic",)
SUMMARY_KEYS = ("groups", "outliers")
def SUMMARY_FMT(n, ns):
    return f"{n} 组 × {ns} 离群"

CONTRACT = {
    "views": ["box"],
    "templates": list(TEMPLATE_IDS),
    "title": "箱线图（观测聚合 / 五数汇总）",
    "summary": "group+value 原始观测自动聚五数；或直接给 min/q1/median/q3/max 汇总列",
    "columns": {
        "required": [
            {"name": "group", "aliases": ["group", "category", "类别", "组", "分组", "产线", "批次", "班级", "组别"], "note": "缺省取第一列"},
            {"name": "value（观测模式）", "aliases": ["全量数值别名"], "note": "有 q1+median+q3 列时走汇总模式"},
        ],
        "optional": [
            {"name": "q1 / median / q3", "aliases": ["q1", "下四分位", "p25", "median", "med", "中位数", "p50", "q3", "上四分位", "p75"], "note": "汇总模式必需"},
            {"name": "min / max", "aliases": ["min", "最小值", "下限", "low", "max", "最大值", "上限", "high"], "note": "缺省以 Q1/Q3 代替并警告"},
        ],
    },
    "inference": ["type-7 分位数", "须线 = Q1∓1.5·IQR 界内最值", "界外离群空心圆", "组内 n<5 警告"],
    "example_csv": "产线,偏差\nA线,0.32\nA线,-0.85",
    "command": "vizscape render qc.csv --view box --theme light --out out/box.html",
}
