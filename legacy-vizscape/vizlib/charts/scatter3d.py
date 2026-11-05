"""vizlib.charts.scatter3d · 3D 散点图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from .scatter import to_scatter
from ..core import (
    _first_key, _fmt_num, _numeric_keys, _numeric_stats, esc, js_json, norm_key, parse_number, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML,
)

RAW_Z_ALIAS = ("z", "z值", "竖轴", "深轴", "高度", "深度", "z轴", "利润", "评分", "数量", "金额", "销量", "权重")

Z_ALIAS = tuple(norm_key(x) for x in RAW_Z_ALIAS)

def to_scatter3d(raw):
    """3D 散点：X/Y 同 to_scatter，第三个数值列作 Z（深度）。

    Z 选取优先级：显式 z 别名 > 剩余数值列（排除 x/y/size 后第一个）。
    size 从剩余数值列再取一个（可选）。至少需 3 个数值列（x/y/z）。
    """
    base = to_scatter(raw)
    points = base["points"]
    if not points:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("3D 散点暂不支持 ECharts JSON；请用 CSV/Excel，需 x/y/z 三个数值列")
    sample = raw[0]
    keys = list(sample.keys())
    stats = _numeric_stats(raw, keys)
    numeric_cols = _numeric_keys(stats, keys, set())
    z_key = _first_key(sample, Z_ALIAS)
    x_key, y_key, size_key = base["x_key"], base["y_key"], base["size_key"]
    used = {x_key, y_key}
    remaining = [k for k in numeric_cols if k not in used]
    # 3D 里 Z（第三维）优先于 size（气泡）：
    #   - 显式 z 别名优先
    #   - 否则用剩余数值列；若 size 占用了唯一剩余列，则把该列转作 Z（放弃 size）
    if z_key and z_key not in used:
        pass  # 用显式 z
    elif remaining:
        z_key = remaining[0]
    elif size_key:
        z_key = size_key      # 只有 x/y/size 三列：size 让位给 Z
        size_key = None
    else:
        raise ValueError(
            f"3D 散点需要三个数值列（x/y/z），当前只有 x={x_key}、y={y_key}。"
            "请补充第三列数值（利润/评分/数量等，或列名含 z 别名）。\n"
            "  · 若只需两维关系，请用 --view scatter"
        )
    used.add(z_key)
    # size：若无，从剩余（排除 x/y/z）再取一个
    remaining2 = [k for k in numeric_cols if k not in used]
    if size_key is None and remaining2:
        size_key = remaining2[0]
    elif size_key is not None and size_key in used:
        size_key = None
    # 给每个点补 z（和 size 若之前没有）
    for p, r in zip(points, raw):
        p["z"], _, _ = parse_number(r.get(z_key))
        if size_key:
            p["size"], _, _ = parse_number(r.get(size_key))
    stats2 = base["stats"]
    stats2["z_missing"] = sum(1 for r in raw if parse_number(r.get(z_key))[1] == "missing")
    stats2["z_invalid"] = sum(1 for r in raw if parse_number(r.get(z_key))[1] == "invalid")
    base["z_key"] = z_key
    base["size_key"] = size_key
    # Z 轴相关（y 与 z）
    ys = [p["y"] for p in points]
    zs = [p["z"] for p in points]
    n = len(points)
    my = sum(ys) / n
    mz = sum(zs) / n
    syz = sum((y - my) * (z - mz) for y, z in zip(ys, zs))
    syy = sum((y - my) ** 2 for y in ys)
    szz = sum((z - mz) ** 2 for z in zs)
    base["r_yz"] = syz / (syy * szz) ** 0.5 if syy > 0 and szz > 0 else None
    return base

def build_scatter3d_table(chart):
    """3D 散点表：点 / 分组 / X / Y / Z / size。"""
    pts = chart["points"]
    head = ["点", "分组", chart["x_key"], chart["y_key"], chart["z_key"]]
    if chart["size_key"]:
        head.append(chart["size_key"])
    align = ["", "", "num", "num", "num"] + (["num"] if chart["size_key"] else [])
    parts = ['<table class="table"><thead><tr>' + "".join(f"<th>{esc(c)}</th>" for c in head) + "</tr></thead><tbody>"]
    for i, p in enumerate(pts):
        cells = [str(i + 1), p["group"], _fmt_num(p["x"]), _fmt_num(p["y"]), _fmt_num(p["z"])]
        if chart["size_key"]:
            cells.append("—" if p["size"] is None else _fmt_num(p["size"]))
        tds = "".join(f'<td class="num">{esc(c)}</td>' if a == "num" else f"<td>{esc(c)}</td>" for c, a in zip(cells, align))
        parts.append(f"<tr>{tds}</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_scatter3d_quality(chart):
    st = chart["stats"]
    r_xy = chart["fit"]["r"] if chart.get("fit") else None
    r_yz = chart.get("r_yz")
    f_xy = f"{r_xy:.3f}" if r_xy is not None else "—"
    f_yz = f"{r_yz:.3f}" if r_yz is not None else "—"
    invalid = st["x_invalid"] or st["y_invalid"] or st.get("z_invalid")
    cls = "quality warn" if invalid else "quality ok"
    conf = "高置信识别" if not invalid else "低置信识别"
    chips_data = [
        ("模式", "scatter3d"), ("点数", len(chart["points"])), ("分组", len(chart["groups"])),
        ("X", chart["x_key"]), ("Y", chart["y_key"]), ("Z", chart["z_key"]),
        ("r(x,y)", f_xy), ("r(y,z)", f_yz),
        ("缺失", st["x_missing"] + st["y_missing"] + st.get("z_missing", 0)),
    ]
    if chart["size_key"]:
        chips_data.append(("气泡", chart["size_key"]))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if invalid:
        body = '<ul class="quality-warnings"><li>X/Y/Z 含缺失或非法值，已按 0 计，位置可能有偏，请核对原始数据</li></ul>'
    else:
        body = '<p class="quality-ok">三轴数值解析正常；旋转视角后位置关系可直接判读。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>scatter3d · {esc(chart["x_key"])}×{esc(chart["y_key"])}×{esc(chart["z_key"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_scatter3d(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        chart = to_scatter3d(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    pts = chart["points"]
    def _r(v):
        return f"{v:.3f}" if v is not None else "—"
    r_xy = chart["fit"]["r"] if chart.get("fit") else None
    cards = [
        ("点数", str(len(pts))),
        ("分组", str(len(chart["groups"]))),
        ("X", chart["x_key"]),
        ("Y", chart["y_key"]),
        ("Z", chart["z_key"]),
        ("r(x,y)", _r(r_xy)),
    ]
    if chart["size_key"]:
        cards.append(("气泡", chart["size_key"]))
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__X_KEY__", esc(chart["x_key"]))
    html_text = html_text.replace("__Y_KEY__", esc(chart["y_key"]))
    html_text = html_text.replace("__Z_KEY__", esc(chart["z_key"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__POINTS_N__", str(len(pts)))
    data = {"points": pts, "groups": chart["groups"],
            "x_key": chart["x_key"], "y_key": chart["y_key"], "z_key": chart["z_key"],
            "size_key": chart["size_key"], "fit": chart["fit"], "r_yz": chart.get("r_yz")}
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_scatter3d_table(chart))
    html_text = html_text.replace("__QUALITY_HTML__", build_scatter3d_quality(chart))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(pts), len(chart["groups"])

# ---- 注册与契约 ----
render = render_scatter3d  # 统一注册入口
TEMPLATE_IDS = ("scatter3d-basic",)
SUMMARY_KEYS = ("points", "groups")
def SUMMARY_FMT(n, ns):
    return f"{n} 点 × {ns} 分组 × 3轴"

CONTRACT = {
    "views": ["scatter3d"],
    "templates": list(TEMPLATE_IDS),
    "title": "3D 散点图",
    "summary": "x/y/z 三数值列的伪 3D 投影散点；可选 group 分组、size 气泡",
    "columns": {
        "required": [
            {"name": "x", "aliases": ["x", "x值", "横轴"], "note": "数值列"},
            {"name": "y", "aliases": ["y", "y值", "纵轴"], "note": "数值列"},
            {"name": "z", "aliases": ["z", "z值", "竖轴", "深轴", "高度", "深度", "z轴", "利润", "评分", "数量", "金额", "销量", "权重"], "note": "数值列"},
        ],
        "optional": [
            {"name": "group", "aliases": ["group", "series", "分组", "系列", "渠道", "门店", "城市", "部门"], "note": "分组着色"},
            {"name": "size", "aliases": ["size", "气泡", "气泡大小", "规模", "权重"], "note": "气泡面积"},
        ],
    },
    "inference": ["x/y/z 缺省 = 前三个数值列", "拖拽旋转 + 滚轮缩放（页内交互）"],
    "example_csv": "成本,转化,利润,渠道\n1200,340,560,线上",
    "command": "vizscape render data.csv --view scatter3d --theme light --out out/scatter3d.html",
}
