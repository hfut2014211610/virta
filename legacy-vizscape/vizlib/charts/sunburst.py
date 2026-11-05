"""vizlib.charts.sunburst · 旭日图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, esc, js_json, parse_number, read_raw, TEMPLATES, THEME_TOKEN_HTML, VALUE_ALIAS,
)

def to_sunburst(raw):
    """多级类目列（按列顺序）+ value → 旭日图嵌套树。非数值列即层级，最多 4 层。"""
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("旭日图需要多级类目列 + value 行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    v_key = _first_key(sample, VALUE_ALIAS)
    if not v_key:
        for k in sample.keys():
            ok = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] not in ("missing", "invalid"))
            if ok >= max(1, int(0.8 * min(len(raw), 50))):
                v_key = k
                break
    if not v_key:
        raise ValueError("旭日图需要一列数值作为扇区大小")
    lvl_keys = []
    for k in sample.keys():
        if k == v_key:
            continue
        bad = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] in ("missing", "invalid"))
        if bad >= max(1, int(0.2 * min(len(raw), 50))):
            lvl_keys.append(k)
    lvl_keys = lvl_keys[:4]
    if not lvl_keys:
        raise ValueError("旭日图需要至少一列类目（层级）列")
    warnings, bad = [], 0
    root = {"name": "全部", "children": {}, "value": 0.0}
    total = 0.0
    for row in raw:
        num, st, _u = parse_number(row.get(v_key))
        if st in ("missing", "invalid") or num <= 0:
            bad += 1
            continue
        path = []
        skip = False
        for k in lvl_keys:
            v = row.get(k)
            if v in (None, ""):
                if not path:
                    skip = True
                    break
                path.append("未填")
            else:
                path.append(str(v).strip())
        if skip:
            bad += 1
            continue
        node = root
        for name in path:
            node = node["children"].setdefault(name, {"name": name, "children": {}, "value": 0.0})
        node["value"] += num
        total += num
    if not root["children"]:
        raise ValueError("没有可解析的层级行")
    if bad:
        warnings.append(f"{bad} 行数值缺失/非正或首层为空，已跳过")
    # 自底向上聚合 + 转 list
    def _agg(node):
        kids = list(node["children"].values())
        self_v = node["value"]
        if not kids:
            return {"name": node["name"], "value": round(self_v, 4), "children": []}
        children = [_agg(k) for k in kids]
        children.sort(key=lambda c: -c["value"])
        return {"name": node["name"], "value": round(self_v + sum(c["value"] for c in children), 4), "children": children}
    tree = _agg(root)
    max_depth = 0
    leaf_cnt = 0
    def _walk(n, d):
        nonlocal max_depth, leaf_cnt
        max_depth = max(max_depth, d)
        if not n["children"]:
            leaf_cnt += 1
        for c in n["children"]:
            _walk(c, d + 1)
    _walk(tree, 0)
    if len(lvl_keys) >= 4:
        warnings.append("层级列超过 4 层，已截断到前 4 层")
    tiny = 0
    def _tiny(n, dv):
        nonlocal tiny
        for c in n["children"]:
            if c["value"] < dv * 0.005:
                tiny += 1
            _tiny(c, dv)
    _tiny(tree, tree["value"])
    if tiny:
        warnings.append(f"{tiny} 个扇区占比 < 0.5%，视觉不可读，建议合并为「其他」")
    counts = {"levels": len(lvl_keys), "leaves": leaf_cnt, "depth": max_depth, "total": round(total, 4)}
    quality = {"rows": len(raw), "kept": leaf_cnt, "warnings": warnings[:6],
               "confidence": "high" if not warnings else "medium",
               "mapping": {"levels": " / ".join(lvl_keys), "value": v_key}}
    return {"tree": tree, "level_names": lvl_keys, "counts": counts, "quality": quality}

def build_sunburst_table(data):
    parts = ['<table class="table"><thead><tr>' +
             "".join(f"<th>{esc(k)}</th>" for k in data["level_names"]) +
             '<th class="num">值</th><th class="num">占比</th></tr></thead><tbody>']
    total = data["tree"]["value"] or 1

    def _walk(n, path):
        for c in n["children"]:
            p2 = path + [c["name"]]
            cells = "".join(f"<td>{esc(x)}</td>" for x in p2) + "<td></td>" * (len(data["level_names"]) - len(p2))
            parts.append(f"<tr>{cells}<td class=\"num\">{_fmt_num(c['value'])}</td><td class=\"num\">{c['value']/total:.1%}</td></tr>")
            _walk(c, p2)
    _walk(data["tree"], [])
    parts.append("</tbody></table>")
    return "".join(parts)

def build_sunburst_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q["mapping"]
    c = data["counts"]
    chips_data = [("层级", f"{c['levels']} 层"), ("叶子", c["leaves"]), ("总量", _fmt_num(c["total"])),
                  ("层级列", m["levels"]), ("数值列", m["value"])]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">层级树完整；扇区与占比可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>sunburst · {esc(m["levels"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_sunburst(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_sunburst(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    effect = title or p.stem
    cards = [("层级", f"{c['levels']} 层"), ("叶子", str(c["leaves"])), ("总量", _fmt_num(c["total"])), ("最深", f"{c['depth']} 层")]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(effect))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__ARIA_DESC__", f"{c['levels']} 层 {c['leaves']} 个叶子，总量 {_fmt_num(c['total'])}")
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_sunburst_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_sunburst_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, c["leaves"], c["levels"]

# ---- 注册与契约 ----
render = render_sunburst  # 统一注册入口
TEMPLATE_IDS = ("sunburst-basic",)
SUMMARY_KEYS = ("leaves", "levels")
def SUMMARY_FMT(n, ns):
    return f"{n} 叶子 × {ns} 层"

CONTRACT = {
    "views": ["sunburst"],
    "templates": list(TEMPLATE_IDS),
    "title": "旭日图（层级占比）",
    "summary": "非数值列按列顺序作层级路径（≤4 层），最后一个数值列为 value；父级 = 子树和",
    "columns": {
        "required": [
            {"name": "level1..N", "aliases": ["任意非数值列"], "note": "按列顺序成层级，≤4 层"},
            {"name": "value", "aliases": ["最后一个数值列"], "note": "叶子聚合"},
        ],
        "optional": [],
    },
    "inference": ["空层级单元格压缩路径", "同名兄弟合并", "负值剔除并警告", "占比<0.5% 扇区计入识别报告"],
    "example_csv": "部门,类目,事项,金额\n研发,人力,薪酬,5200",
    "command": "vizscape render spend.csv --view sunburst --theme light --out out/sunburst.html",
}
