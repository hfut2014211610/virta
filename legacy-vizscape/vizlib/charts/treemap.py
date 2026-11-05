"""vizlib.charts.treemap · 矩形树状图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from collections import OrderedDict
from pathlib import Path
from .radar import _is_numeric_col
from ..core import (
    _first_key, _fmt_num, _new_quality, esc, js_json, norm_key, parse_number, read_raw, TEMPLATES, THEME_TOKEN_HTML, VALUE_ALIAS,
)

RAW_TREEMAP_GROUP_ALIAS = ("大区", "区域", "地区", "大类", "一级", "父类", "部门", "板块", "分组", "group", "category2", "region", "area")

TREEMAP_GROUP_ALIAS = tuple(norm_key(x) for x in RAW_TREEMAP_GROUP_ALIAS)

def _squarify(values, x, y, w, h):
    """squarify 算法：把 values（降序，已归一为面积和=w*h）切成矩形列表 [{x,y,w,h}]。

    输入值应为正；内部先按比例换算成面积。返回顺序与 values 一致。
    """
    n = len(values)
    if n == 0:
        return []
    total = sum(values)
    if total <= 0 or w <= 0 or h <= 0:
        return [{"x": x, "y": y, "w": 0.0, "h": 0.0} for _ in values]
    areas = [v / total * w * h for v in values]
    rects = []
    i = 0
    while i < n:
        # 沿较短边尝试放一行（多个矩形共用该边）
        if w >= h:
            side = h
        else:
            side = w
        # 贪心：不断加入矩形，只要 worst ratio 变差就停
        j = i
        sum_area = 0.0
        best = None  # (worst_ratio, count)
        while j < n:
            cand_sum = sum_area + areas[j]
            if side <= 0:
                cand_ratio = float("inf")
            else:
                cand_ratio = 0.0
                mx = 0.0
                for k in range(i, j + 1):
                    thick = areas[k] / cand_sum * side if cand_sum > 0 else 0.0
                    other = cand_sum / side if side > 0 else 0.0
                    ratio = max(thick / other if other > 0 else float("inf"),
                                other / thick if thick > 0 else float("inf"))
                    if ratio > cand_ratio:
                        cand_ratio = ratio
                    if areas[k] > mx:
                        mx = areas[k]
                # 保证至少 1 个
                if mx == 0:
                    cand_ratio = float("inf")
            if best is None or cand_ratio <= best[0]:
                best = (cand_ratio, j + 1, cand_sum)
                sum_area = cand_sum
                j += 1
            else:
                break
        _, cnt, lay_sum = best
        # 输出这一行
        if w >= h:
            # 沿右侧竖条：宽度 = lay_sum/h，高 = side
            colw = lay_sum / side if side > 0 else 0.0
            yy = y
            for k in range(i, i + cnt):
                rh = areas[k] / colw if colw > 0 else 0.0
                rects.append({"x": x, "y": yy, "w": colw, "h": rh})
                yy += rh
            x += colw
            w -= colw
        else:
            rowh = lay_sum / side if side > 0 else 0.0
            xx = x
            for k in range(i, i + cnt):
                rw = areas[k] / rowh if rowh > 0 else 0.0
                rects.append({"x": xx, "y": y, "w": rw, "h": rowh})
                xx += rw
            y += rowh
            h -= rowh
        i += cnt
    return rects

def _detect_treemap_columns(raw):
    """按 (组列, 标签列, 数值列) 分类列。

    标签/分组歧义用「基数规则」：文本列里唯一值**少**的当分组、多的当标签
    （分组是父层级、天然基数小，如大区 3 < 城市 7）。别名只作提示，不再阻塞分配。
    一维数据只有 1 个文本列 → 无分组，直接平铺。
    """
    sample = raw[0]
    keys = list(sample.keys())
    text_keys = [k for k in keys if not _is_numeric_col(raw, k)]
    numeric_keys = [k for k in keys if _is_numeric_col(raw, k)]
    value_alias_key = _first_key(sample, VALUE_ALIAS)

    # 数值列：优先 value 别名，否则第一个数值列
    if value_alias_key and _is_numeric_col(raw, value_alias_key):
        value_key = value_alias_key
    elif numeric_keys:
        value_key = numeric_keys[0]
    else:
        value_key = None

    if not text_keys or value_key is None:
        return {"group_key": None, "label_key": text_keys[0] if text_keys else None,
                "value_key": value_key, "numeric_keys": numeric_keys}

    if len(text_keys) == 1:
        # 一维：单个文本列作标签
        return {"group_key": None, "label_key": text_keys[0],
                "value_key": value_key, "numeric_keys": numeric_keys}

    # 两层：按基数规则分配
    group_key_alias = _first_key(sample, TREEMAP_GROUP_ALIAS)
    if group_key_alias and group_key_alias in text_keys:
        # 有分组别名提示
        grp = group_key_alias
        label_key = [k for k in text_keys if k != grp][0]
    else:
        # 基数规则：唯一值少的当分组、多的当标签
        def uniq(k):
            return len({str(r.get(k)) for r in raw})
        sorted_text = sorted(text_keys, key=uniq)
        grp = sorted_text[0]   # 最少唯一值
        label_key = sorted_text[-1]  # 最多唯一值（若>2列则取末位）

    return {"group_key": grp, "label_key": label_key,
            "value_key": value_key, "numeric_keys": numeric_keys}

def to_treemap(raw):
    """{rows} → 树状图数据：面积=数值的矩形平铺。

    自适应：
      - 两层：有 (组列, 标签列, 数值列) → 按组分区，组内 squarify，看层级构成
      - 一维：只有 (标签列, 数值列) → 全部类别一起 squarify，看类别份额
    面积正比数值，按数值降序排。剔除负值/0 值并警告（矩形面积无意义）。
    """
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("树状图暂不支持 ECharts JSON；请用 CSV/Excel 的 label+value 或 group+label+value")
    if not raw:
        raise ValueError("数据为空")
    cols = _detect_treemap_columns(raw)
    value_key = cols["value_key"]
    if value_key is None:
        raise ValueError("树状图需要数值列（label+value 或 group+label+value）")
    label_key = cols["label_key"]
    if label_key is None:
        raise ValueError("树状图需要标签列（label/name/名称/分类等）")
    group_key = cols["group_key"]
    quality = _new_quality(len(raw), "long" if group_key else "single")

    # 收集 (label, group, value)，剔除负值/0
    rows = []
    neg, zero, missing = [], [], 0
    label_count = OrderedDict()
    for idx, r in enumerate(raw):
        lab = r.get(label_key)
        lab = str(lab) if lab not in (None, "") else f"行{idx+1}"
        if lab in label_count:
            label_count[lab] += 1
            lab = f"{lab}#{label_count[lab]}"
        else:
            label_count[lab] = 1
        val, status, _ = parse_number(r.get(value_key))
        grp = None
        if group_key:
            g = r.get(group_key)
            grp = str(g) if g not in (None, "") else "未分组"
        if status == "missing":
            missing += 1
            continue
        if val < 0:
            neg.append((lab, val))
        elif val == 0:
            zero.append(lab)
        else:
            rows.append({"label": lab, "group": grp, "value": val})
    warnings = list(quality.get("warnings", []))
    if neg:
        warnings.append(f"{len(neg)} 项为负值（如 {', '.join(esc(l) for l, _ in neg[:3])}），矩形面积无意义，已剔除")
    if zero:
        warnings.append(f"{len(zero)} 项为 0，已剔除（面积不可见）")
    if missing:
        warnings.append(f"{missing} 项数值缺失，已跳过")
    if not rows:
        raise ValueError("树状图没有正值数据；请确认数值列或改用柱状图")
    total = sum(x["value"] for x in rows)
    if total <= 0:
        raise ValueError("树状图数值之和 ≤ 0，无法表示；请确认数值列")
    # 分组
    result = {"mode": "grouped" if group_key else "flat", "total": total, "warnings": warnings}
    if group_key:
        # 组聚合
        gmap = OrderedDict()
        for x in rows:
            gmap.setdefault(x["group"], []).append(x)
        groups = []
        for gname in sorted(gmap, key=lambda g: -sum(x["value"] for x in gmap[g])):
            children = sorted(gmap[gname], key=lambda c: -c["value"])
            gval = sum(c["value"] for c in children)
            groups.append({"name": gname, "value": gval, "share": gval / total,
                           "children": [{"label": c["label"], "value": c["value"],
                                         "share": c["value"] / total} for c in children]})
        result["groups"] = groups
        result["n_groups"] = len(groups)
        result["n_leaf"] = len(rows)
        _top = max(rows, key=lambda x: x["value"])
        result["top"] = {"label": _top["label"], "value": _top["value"], "share": _top["value"] / total}
        quality["mapping"] = {"group": group_key, "label": label_key, "value": value_key}
        quality["mode"] = "long"
    else:
        flat = sorted(rows, key=lambda x: -x["value"])
        result["flat"] = [{"label": x["label"], "value": x["value"], "share": x["value"] / total} for x in flat]
        result["n_leaf"] = len(flat)
        result["top"] = {"label": flat[0]["label"], "value": flat[0]["value"], "share": flat[0]["value"] / total}
        quality["mapping"] = {"label": label_key, "value": value_key}
        quality["mode"] = "single"
    quality["warnings"] = warnings[:6]
    result["mapping"] = quality["mapping"]
    result["quality"] = quality
    return result

def build_treemap_table(data):
    parts = ['<table class="table"><thead><tr>']
    if data["mode"] == "grouped":
        parts.append("<th>组</th>")
    parts.append("<th>项</th><th class=\"num\">数值</th><th class=\"num\">占比</th></tr></thead><tbody>")
    if data["mode"] == "grouped":
        for g in data["groups"]:
            first = True
            for c in g["children"]:
                parts.append(
                    f"<tr><td>{esc(g['name']) if first else ''}</td>"
                    f"<td>{esc(c['label'])}</td>"
                    f"<td class=\"num\">{_fmt_num(c['value'])}</td>"
                    f"<td class=\"num\">{c['share']*100:.1f}%</td></tr>")
                first = False
            parts.append(
                f"<tr class=\"subtotal\"><td></td><td><b>{esc(g['name'])} 小计</b></td>"
                f"<td class=\"num\"><b>{_fmt_num(g['value'])}</b></td>"
                f"<td class=\"num\"><b>{g['share']*100:.1f}%</b></td></tr>")
    else:
        for x in data["flat"]:
            parts.append(
                f"<tr><td>{esc(x['label'])}</td>"
                f"<td class=\"num\">{_fmt_num(x['value'])}</td>"
                f"<td class=\"num\">{x['share']*100:.1f}%</td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_treemap_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["mapping"]
    chips_data = [
        ("模式", data["mode"]), ("总面积", _fmt_num(data["total"])),
        ("最大项", f"{data['top']['label']} {data['top']['share']*100:.1f}%"),
    ]
    if data["mode"] == "grouped":
        chips_data += [("组数", data["n_groups"]), ("叶项", data["n_leaf"])]
    else:
        chips_data += [("类别", data["n_leaf"])]
    chips_data.append(("映射", " → ".join(f"{k}={v}" for k, v in m.items())))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">未发现缺失/非法/负值风险；面积与占比可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>treemap · {esc(m.get("value", "?"))}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_treemap(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_treemap(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    top = data["top"]
    cards = [
        ("总面积", _fmt_num(data["total"])),
        ("最大项", f"{top['label']} {top['share']*100:.1f}%"),
    ]
    if data["mode"] == "grouped":
        cards += [("组数", str(data["n_groups"])), ("叶项", str(data["n_leaf"]))]
    else:
        cards += [("类别", str(data["n_leaf"]))]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__MODE__", esc(data["mode"]))
    html_text = html_text.replace("__TOTAL__", esc(_fmt_num(data["total"])))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_treemap_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_treemap_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, data["n_leaf"], data.get("n_groups", 1)

# ---- 注册与契约 ----
render = render_treemap  # 统一注册入口
TEMPLATE_IDS = ("treemap-basic",)
SUMMARY_KEYS = ("items", "groups")
def SUMMARY_FMT(n, ns):
    return f"{ns} 组 × {n} 项" if ns > 1 else f"{n} 类别"

CONTRACT = {
    "views": ["treemap"],
    "templates": list(TEMPLATE_IDS),
    "title": "矩形树状图",
    "summary": "面积 ∝ 数值；有 group 列走两层（分区+组内 squarify），无则一维平铺",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "分类", "类别", "标签", "名称"], "note": "叶子名"},
            {"name": "value", "aliases": ["value", "count", "amount", "数值", "数量", "金额"], "note": "数值列"},
        ],
        "optional": [{"name": "group", "aliases": ["group", "大区", "区域", "大类", "一级", "父类", "部门", "板块"], "note": "有即两层模式"}],
    },
    "inference": ["负值/0 值剔除并警告", "同组同名子项合并", "点击下钻 / 面包屑返回（页内交互）"],
    "example_csv": "大区,城市,销售额\n华东,上海,120\n华东,杭州,80",
    "command": "vizscape render data.csv --view treemap --theme light --out out/treemap.html",
}
