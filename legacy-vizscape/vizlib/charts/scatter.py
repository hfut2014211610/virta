"""vizlib.charts.scatter · 散点图/气泡图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from collections import OrderedDict
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, _numeric_keys, _numeric_stats, _row_label, esc, js_json, norm_key, NUM_RATIO, parse_number, read_raw, SERIES_ALIAS, SIZE_ALIAS, TEMPLATES, THEME_TOKEN_HTML, X_ALIAS, Y_ALIAS,
)

SC_LABEL_ALIAS = tuple(norm_key(x) for x in ("label", "category", "分类", "类别", "标签"))

SCATTER_X = ("投放入", "成本", "投入", "x", "横轴", "自变量")

SCATTER_Y = ("转化", "收益", "产出", "y", "纵轴", "因变量")

def _corr(xs, ys):
    n = len(xs)
    if n < 2:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / (sxx * syy) ** 0.5

def to_scatter(raw):
    """统一成 {points:[{label,x,y,size}], xAxis/yAxis 名称, fit, quality}"""
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        e = raw[1]
        pts, invalid = [], 0
        x_labels = e.get("xAxis", {}).get("data", []) if isinstance(e.get("xAxis"), dict) else []
        for i, s in enumerate(e.get("series", [])):
            gname = str(s.get("name", f"系列{i+1}"))
            for j, p in enumerate(s.get("data", [])):
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    x, sx, _ = parse_number(p[0])
                    y, sy, _ = parse_number(p[1])
                    if sx == "invalid":
                        invalid += 1
                    if sy == "invalid":
                        invalid += 1
                    sz = None
                    if len(p) >= 3:
                        sz, _, _ = parse_number(p[2])
                    lab = str(x_labels[j]) if j < len(x_labels) else f"{gname}·{j+1}"
                    pts.append({"label": lab, "group": gname, "x": x, "y": y, "size": sz})
        if not pts:
            raise ValueError("ECharts 散点需 series[].data 为 [x, y] 或 [x, y, size] 数组")
        stats2 = {"x_missing": 0, "y_missing": 0, "x_invalid": invalid, "y_invalid": 0}
        points = pts
        label_key, x_key, y_key, size_key, group_key = "(序号)", "(x)", "(y)", None, "(series)"
        groups = sorted({p["group"] for p in pts})
        numeric_cols = [x_key, y_key] + (["size"] if any(p["size"] is not None for p in pts) else [])
    else:
        sample = raw[0]
        keys = list(sample.keys())
        x_key = _first_key(sample, X_ALIAS)
        y_key = _first_key(sample, Y_ALIAS)
        size_key = _first_key(sample, SIZE_ALIAS)
        stats = _numeric_stats(raw, keys)
        numeric_cols = _numeric_keys(stats, keys, set())
        # 文本列 = 非数值列；散点 label/group 只从文本列里挑
        text_cols = [k for k in keys if stats[k]["ratio"] < NUM_RATIO]
        # 分组列：命中系列别名的文本列（渠道/城市/部门…）
        group_key = next((k for k in text_cols if k not in (x_key, y_key, size_key)
                          and norm_key(k) in SERIES_ALIAS), None)
        # label 列：显式 label/category 别名优先；否则文本列里第一个「不作分组」的列
        # （避免「渠道」既当分组又当点名）；全都是分组候选时才用第一个文本列
        label_key = next((k for k in text_cols if norm_key(k) in SC_LABEL_ALIAS
                          and k != group_key), None)
        if label_key is None:
            label_key = next((k for k in text_cols if k != group_key), None) or (
                next((k for k in text_cols if norm_key(k) in SC_LABEL_ALIAS), None)
                or group_key or keys[0])
        if label_key == group_key:
            group_key = None  # 唯一文本列无法既点名又分组，退为单组（label 作点名）
        excluded = {label_key} | ({group_key} if group_key else set()) | ({size_key} if size_key else set())
        # 候选数值列：排除 label/group/size 之外的数值列
        xy_candidates = [k for k in numeric_cols if k not in excluded]
        if not x_key and not y_key:
            # 无 x/y 别名：前两数值列 = x/y
            if len(xy_candidates) < 2:
                raise ValueError(
                    f"找不到两个数值列：散点需要 x / y 两列数值（当前数值列：{', '.join(xy_candidates) or '无'}）。\n"
                    f"  · 请确保列名含 x/y 别名（x, y, 成本, 转化, 投入, 收益, 自变量, 因变量…）\n"
                    f"  · 或显式指定：--template scatter-basic（并确认表有 ≥2 个数值列）\n"
                    f"  · 单数值列对比请用 --view bar"
                )
            x_key, y_key = xy_candidates[0], xy_candidates[1]
        elif x_key is None:
            x_key = next((k for k in xy_candidates if k != y_key), None)
        elif y_key is None:
            y_key = next((k for k in xy_candidates if k != x_key), None)
        if x_key is None or y_key is None or x_key == y_key:
            raise ValueError(f"散点需要两个不同的数值列（当前数值列：{', '.join(xy_candidates) or '无'}）")

        stats2 = {"x_missing": 0, "y_missing": 0, "x_invalid": 0, "y_invalid": 0}
        points = []
        groups_set = OrderedDict()
        for r in raw:
            lab = _row_label(r, label_key)
            g = _row_label(r, group_key) if group_key else "全部"
            groups_set[g] = None
            x, xs, _ = parse_number(r.get(x_key))
            y, ys, _ = parse_number(r.get(y_key))
            sz = None
            if size_key:
                sz, _, _ = parse_number(r.get(size_key))
            if xs == "missing":
                stats2["x_missing"] += 1
            elif xs == "invalid":
                stats2["x_invalid"] += 1
            if ys == "missing":
                stats2["y_missing"] += 1
            elif ys == "invalid":
                stats2["y_invalid"] += 1
            points.append({"label": lab, "group": g, "x": x, "y": y, "size": sz})
        groups = list(groups_set)

    # 线性拟合 + Pearson
    xs_all = [p["x"] for p in points]
    ys_all = [p["y"] for p in points]
    n = len(points)
    mx = sum(xs_all) / n
    my = sum(ys_all) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs_all, ys_all))
    sxx = sum((x - mx) ** 2 for x in xs_all)
    syy = sum((y - my) ** 2 for y in ys_all)
    r = sxy / (sxx * syy) ** 0.5 if sxx > 0 and syy > 0 else None
    fit = None
    if sxx > 0:
        slope = sxy / sxx
        fit = {"m": slope, "b": my - slope * mx, "x0": min(xs_all), "x1": max(xs_all), "r": r}
    return {
        "points": points, "groups": groups, "fit": fit,
        "label_key": label_key, "x_key": x_key, "y_key": y_key,
        "size_key": size_key, "group_key": group_key, "stats": stats2,
        "mode": "echarts" if isinstance(raw, tuple) else "table",
    }

def build_scatter_table(chart):
    pts = chart["points"]
    head = ["点", "分组", chart["x_key"], chart["y_key"]]
    if chart["size_key"]:
        head.append(chart["size_key"])
    align = ["", "", "num", "num"] + (["num"] if chart["size_key"] else [])
    rows = []
    for i, p in enumerate(pts):
        cells = [str(i + 1), p["group"], _fmt_num(p["x"]), _fmt_num(p["y"])]
        if chart["size_key"]:
            cells.append("—" if p["size"] is None else _fmt_num(p["size"]))
        rows.append((cells, align))
    parts = ['<table class="table"><thead><tr>' + "".join(f"<th>{esc(c)}</th>" for c in head) + "</tr></thead><tbody>"]
    for cells, _ in rows:
        tds = "".join(f'<td class="num">{esc(c)}</td>' if a == "num" else f"<td>{esc(c)}</td>" for c, a in zip(cells, align))
        parts.append(f"<tr>{tds}</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_scatter_quality(chart):
    st = chart["stats"]
    fit = chart["fit"]
    r = fit["r"] if fit else None
    r_text = f"{r:.3f}" if r is not None else "—"
    cls = "quality warn" if st["x_invalid"] or st["y_invalid"] else "quality ok"
    conf = "高置信识别" if not (st["x_invalid"] or st["y_invalid"]) else "低置信识别"
    chips_data = [
        ("模式", "scatter"), ("点数", len(chart["points"])), ("分组", len(chart["groups"])),
        ("X 轴", chart["x_key"]), ("Y 轴", chart["y_key"]),
        ("相关系数 r", r_text), ("缺失按0计", st["x_missing"] + st["y_missing"]),
        ("非法按0计", st["x_invalid"] + st["y_invalid"]),
    ]
    if chart["size_key"]:
        chips_data.insert(2, ("气泡列", chart["size_key"]))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if st["x_invalid"] or st["y_invalid"]:
        body = "<ul class=\"quality-warnings\"><li>含无法解析的数值，已按 0 计并参与计算，请核对原始数据</li></ul>"
    else:
        body = '<p class="quality-ok">未发现缺失/非法风险；相关系数可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>scatter · {esc(chart["x_key"])} × {esc(chart["y_key"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_scatter(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        chart = to_scatter(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    pts = chart["points"]
    xs = [q["x"] for q in pts]
    ys = [q["y"] for q in pts]
    fit = chart["fit"]
    r = fit["r"] if fit else None
    r_text = f"{r:.3f}" if r is not None else "—"
    r_desc = ("强正相关" if r and r >= 0.7 else "中度正相关" if r and r >= 0.4 else
              "强负相关" if r and r <= -0.7 else "中度负相关" if r and r <= -0.4 else
              "弱相关" if r is not None else "—")
    stats_cards = [
        ("点数", str(len(pts))),
        ("分组", str(len(chart["groups"]))),
        ("相关 r", r_text),
        ("相关", r_desc),
        ("X 轴", chart["x_key"]),
        ("Y 轴", chart["y_key"]),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in stats_cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__X_KEY__", esc(chart["x_key"]))
    html_text = html_text.replace("__Y_KEY__", esc(chart["y_key"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__POINTS_N__", str(len(pts)))
    html_text = html_text.replace("__CORR_R__", r_text)
    html_text = html_text.replace("__CORR_DESC__", r_desc)
    html_text = html_text.replace("__DATA_JSON__", js_json({"points": pts, "groups": chart["groups"], "fit": fit}))
    html_text = html_text.replace("__TABLE_HTML__", build_scatter_table(chart))
    html_text = html_text.replace("__QUALITY_HTML__", build_scatter_quality(chart))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(pts), len(chart["groups"])

# ---- 注册与契约 ----
render = render_scatter  # 统一注册入口
TEMPLATE_IDS = ("scatter-basic",)
SUMMARY_KEYS = ("points", "groups")
def SUMMARY_FMT(n, ns):
    return f"{n} 点 × {ns} 分组"

CONTRACT = {
    "views": ["scatter"],
    "templates": list(TEMPLATE_IDS),
    "title": "散点图 / 相关性气泡图",
    "summary": "x+y 两列数值看相关性；可选 size 列变气泡图，group 列上色分组",
    "columns": {
        "required": [
            {"name": "x", "aliases": ["x", "x值", "横轴", "自变量", "投入", "成本"], "note": "数值列；缺省取第一个数值列"},
            {"name": "y", "aliases": ["y", "y值", "纵轴", "因变量", "转化", "收益", "产出"], "note": "数值列；缺省取第二个数值列"},
        ],
        "optional": [
            {"name": "size", "aliases": ["size", "气泡", "规模", "权重"], "note": "气泡面积"},
            {"name": "group", "aliases": ["group", "series", "分组", "系列"], "note": "分组着色"},
            {"name": "label", "aliases": ["label", "category", "分类", "类别", "标签"], "note": "悬浮点名"},
        ],
    },
    "inference": ["x/y 缺省 = 前两个数值列", "相关系数 r 自动计算入识别报告"],
    "example_csv": "投入,转化,规模,渠道\n1200,340,20,线上\n800,210,12,线下",
    "command": "vizscape render data.csv --view scatter --theme light --out out/scatter.html",
}
