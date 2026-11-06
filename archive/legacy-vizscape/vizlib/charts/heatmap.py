"""vizlib.charts.heatmap · 热力图（矩阵/日历年双模式） 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import datetime, re, sys
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, esc, js_json, norm_key, parse_gantt_date, parse_number, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML, VALUE_ALIAS,
)

HEAT_X_ALIAS = tuple(norm_key(x) for x in ("x", "col", "column", "列", "横轴", "weekday", "星期", "时段", "类目x"))

HEAT_Y_ALIAS = tuple(norm_key(x) for x in ("y", "row", "行", "纵轴", "hour", "小时", "类目y"))

HEAT_DATE_ALIAS = tuple(norm_key(x) for x in ("date", "day", "日期", "时间", "time", "dt", "dayord"))

def to_heatmap(raw):
    """x/y/value 或 date/value → 热力图数据。

    有 date+value 列 → 日历模式（GitHub 风格年图）；否则 x+y+value → 矩阵模式。
    矩阵：x/y 全数字按数值升序，否则按首见；重复 (x,y) 求和合并。
    日历：按年分组，多年数据全部输出（模板端切换）。
    """
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("热力图需要 x/y/value 或 date/value 形式的行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    date_key = _first_key(sample, HEAT_DATE_ALIAS)
    x_key = _first_key(sample, HEAT_X_ALIAS)
    y_key = _first_key(sample, HEAT_Y_ALIAS)
    val_key = _first_key(sample, VALUE_ALIAS)
    if not val_key or val_key in (date_key, x_key, y_key):
        # 回退：剩余列里第一列 80% 可解析为数值的列
        used = {k for k in (date_key, x_key, y_key) if k}
        for k in sample.keys():
            if k in used:
                continue
            ok = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] not in ("missing", "invalid"))
            if ok >= max(1, int(0.8 * min(len(raw), 50))):
                val_key = k
                break
    if date_key and val_key and date_key != val_key:
        mode = "calendar"
    else:
        # x/y 回退：取前两列「非数值、未被占用」的列
        def _is_text_col(k):
            bad = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] in ("missing", "invalid"))
            return bad >= max(1, int(0.2 * min(len(raw), 50)))
        used = {k for k in (val_key, date_key) if k}
        if not x_key:
            x_key = next((k for k in sample.keys() if k not in used and _is_text_col(k)), None)
        if x_key:
            used.add(x_key)
        if not y_key:
            y_key = next((k for k in sample.keys() if k not in used and _is_text_col(k)), None)
        if x_key and y_key and val_key and val_key not in (x_key, y_key):
            mode = "matrix"
        else:
            raise ValueError("热力图需要 x+y+value（矩阵）或 date+value（日历）三组列")
    warnings, bad_val, bad_key = [], 0, 0
    if mode == "matrix":
        xs, ys, cells = [], [], {}
        dup = 0
        for row in raw:
            xv = row.get(x_key)
            yv = row.get(y_key)
            if xv in (None, "") or yv in (None, ""):
                bad_key += 1
                continue
            num, st, _u = parse_number(row.get(val_key))
            if st in ("missing", "invalid"):
                bad_val += 1
                continue
            xs_, ys_ = str(xv).strip(), str(yv).strip()
            if xs_ not in xs:
                xs.append(xs_)
            if ys_ not in ys:
                ys.append(ys_)
            sig = (xs_, ys_)
            if sig in cells:
                dup += 1
            cells[sig] = cells.get(sig, 0.0) + num
        if not cells:
            raise ValueError("没有可解析的 (x, y, value) 行")
        def _axis_sort(vals):
            if all(re.fullmatch(r"[+-]?\d+(\.\d+)?", v) for v in vals):
                return sorted(vals, key=float)
            return vals
        xs, ys = _axis_sort(xs), _axis_sort(ys)
        xi = {v: i for i, v in enumerate(xs)}
        yi = {v: i for i, v in enumerate(ys)}
        data_cells = [{"x": xi[a], "y": yi[b], "v": round(v, 4)} for (a, b), v in cells.items()]
        vals = [c["v"] for c in data_cells]
        if dup:
            warnings.append(f"{dup} 个重复 (x,y) 格子，已求和合并")
        if bad_key:
            warnings.append(f"{bad_key} 行缺 x 或 y，已跳过")
        if bad_val:
            warnings.append(f"{bad_val} 行数值无法解析，已跳过")
        cover = len(data_cells) / (len(xs) * len(ys))
        if cover < 0.5:
            warnings.append(f"网格稀疏：覆盖率仅 {cover:.0%}，空白格子过多")
        counts = {"xs": len(xs), "ys": len(ys), "cells": len(data_cells),
                  "vmin": min(vals), "vmax": max(vals), "cover": cover}
        quality = {"rows": len(raw), "kept": len(data_cells), "warnings": warnings[:6],
                   "confidence": "high" if not warnings else "medium",
                   "mapping": {"x": x_key, "y": y_key, "value": val_key}}
        return {"mode": "matrix", "xs": xs, "ys": ys, "cells": data_cells,
                "vmin": min(vals), "vmax": max(vals), "counts": counts, "quality": quality}
    # —— 日历模式 ——
    days = {}
    for row in raw:
        od, off, dst = parse_gantt_date(row.get(date_key))
        if dst != "date" or od is None:
            bad_key += 1
            continue
        num, st, _u = parse_number(row.get(val_key))
        if st in ("missing", "invalid"):
            bad_val += 1
            continue
        days[od] = days.get(od, 0.0) + num
    if not days:
        raise ValueError("date 列无法解析为日期（支持 YYYY-MM-DD / YYYYMMDD / Y/M/D 等）")
    years = {}
    for od, v in days.items():
        y = datetime.date.fromordinal(od).year
        years.setdefault(y, []).append([od, round(v, 4)])
    vals = [v for v in days.values()]
    peak_od = max(days, key=lambda k: days[k])
    if bad_key:
        warnings.append(f"{bad_key} 行日期无法解析，已跳过")
    if bad_val:
        warnings.append(f"{bad_val} 行数值无法解析，已跳过")
    counts = {"days": len(days), "years": len(years), "vmin": min(vals), "vmax": max(vals),
              "total": round(sum(vals), 2), "avg": round(sum(vals) / len(days), 2),
              "peak": datetime.date.fromordinal(peak_od).isoformat(), "peakv": round(days[peak_od], 2)}
    quality = {"rows": len(raw), "kept": len(days), "warnings": warnings[:6],
               "confidence": "high" if not warnings else "medium",
               "mapping": {"date": date_key, "value": val_key}}
    return {"mode": "calendar",
            "years": {str(y): sorted(ds) for y, ds in sorted(years.items())},
            "vmin": min(vals), "vmax": max(vals), "counts": counts, "quality": quality}

def build_heatmap_table(data):
    if data["mode"] == "matrix":
        xs, ys = data["xs"], data["ys"]
        grid = {}
        for c in data["cells"]:
            grid[(c["x"], c["y"])] = c["v"]
        parts = ['<table class="table"><thead><tr><th>' + esc(data["quality"]["mapping"]["y"]) + " \\ " + esc(data["quality"]["mapping"]["x"]) + "</th>"]
        parts += [f"<th class=\"num\">{esc(x)}</th>" for x in xs]
        parts.append("</tr></thead><tbody>")
        for j, yv in enumerate(ys):
            parts.append(f"<tr><td>{esc(yv)}</td>")
            for i in range(len(xs)):
                v = grid.get((i, j))
                parts.append(f"<td class=\"num\">{_fmt_num(v) if v is not None else '—'}</td>")
            parts.append("</tr>")
        parts.append("</tbody></table>")
        return "".join(parts)
    parts = ['<table class="table"><thead><tr><th>月份</th><th class="num">天数</th><th class="num">总量</th><th class="num">日均</th><th class="num">峰值日</th><th class="num">峰值</th></tr></thead><tbody>']
    for y, ds in data["years"].items():
        months = {}
        for od, v in ds:
            d = datetime.date.fromordinal(od)
            mk = f"{d.year}-{d.month:02d}"
            slot = months.setdefault(mk, {"n": 0, "sum": 0.0, "pd": None, "pv": None})
            slot["n"] += 1
            slot["sum"] += v
            if slot["pv"] is None or v > slot["pv"]:
                slot["pv"] = v
                slot["pd"] = d.isoformat()
        for mk in sorted(months):
            s = months[mk]
            parts.append(f"<tr><td>{mk}</td><td class=\"num\">{s['n']}</td><td class=\"num\">{_fmt_num(round(s['sum'], 2))}</td>"
                         f"<td class=\"num\">{_fmt_num(round(s['sum'] / s['n'], 2))}</td>"
                         f"<td class=\"num\">{s['pd']}</td><td class=\"num\">{_fmt_num(s['pv'])}</td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_heatmap_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q["mapping"]
    c = data["counts"]
    if data["mode"] == "matrix":
        chips_data = [("模式", "matrix"), ("网格", f"{c['xs']}×{c['ys']}"), ("有值格", c["cells"]),
                      ("覆盖率", f"{c['cover']:.0%}"), ("值域", f"{_fmt_num(c['vmin'])} ~ {_fmt_num(c['vmax'])}"),
                      ("x 列", m["x"]), ("y 列", m["y"]), ("数值列", m["value"])]
        sig = f"{esc(m['x'])} × {esc(m['y'])}"
    else:
        chips_data = [("模式", "calendar"), ("天数", c["days"]), ("年份", c["years"]),
                      ("总量", _fmt_num(c["total"])), ("日均", _fmt_num(c["avg"])),
                      ("峰值", f"{c['peak']} · {_fmt_num(c['peakv'])}"),
                      ("日期列", m["date"]), ("数值列", m["value"])]
        sig = f"{esc(m['date'])} → {esc(m['value'])}"
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">网格完整；数值与类目可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>heatmap · {sig}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_heatmap(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_heatmap(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    effect = title or p.stem
    if data["mode"] == "matrix":
        cards = [("网格", f"{c['xs']}×{c['ys']}"), ("有值格", str(c["cells"])),
                 ("覆盖率", f"{c['cover']:.0%}"), ("峰值", _fmt_num(c["vmax"])), ("谷值", _fmt_num(c["vmin"]))]
        aria = f"{c['xs']} 列 × {c['ys']} 行"
    else:
        cards = [("天数", str(c["days"])), ("总量", _fmt_num(c["total"])), ("日均", _fmt_num(c["avg"])),
                 ("峰值", f"{c['peak']}"), ("年份", str(c["years"]))]
        aria = f"{c['days']} 天，{c['years']} 个年份"
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(effect))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__ARIA_DESC__", aria)
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_heatmap_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_heatmap_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, c.get("cells", c.get("days")), c.get("xs", c.get("years"))

# ---- 注册与契约 ----
render = render_heatmap  # 统一注册入口
TEMPLATE_IDS = ("heatmap-basic",)
SUMMARY_KEYS = ("cells", "cols")
def SUMMARY_FMT(n, ns):
    return f"{n} 格 × {ns} 列"

CONTRACT = {
    "views": ["heat"],
    "templates": list(TEMPLATE_IDS),
    "title": "热力图（矩阵 / 日历年双模式）",
    "summary": "有 date 列 → 日历年视图；否则 x+y+value → 矩阵",
    "columns": {
        "required": [
            {"name": "date（日历模式）", "aliases": ["date", "day", "日期", "时间", "time", "dt", "dayord"], "note": "有它即日历模式"},
            {"name": "x + y（矩阵模式）", "aliases": ["x", "col", "column", "列", "横轴", "weekday", "星期", "时段", "类目x", "y", "row", "行", "纵轴", "hour", "小时", "类目y"], "note": "两个维度列"},
            {"name": "value", "aliases": ["全量数值别名"], "note": "缺省取首个 ≥80% 数值列"},
        ],
        "optional": [],
    },
    "inference": ["x/y 缺省 = 前两个非数值列", "重复 (x,y) 求和", "覆盖率 <50% 警告", "稀疏格空心呈现"],
    "example_csv": "星期,时段,客流\n周一,上午,120\n周一,下午,260",
    "command": "vizscape render data.csv --view heat --theme light --out out/heat.html",
}
