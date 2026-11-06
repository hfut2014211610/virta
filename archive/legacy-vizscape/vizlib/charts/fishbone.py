"""vizlib.charts.fishbone · 鱼骨图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from .gantt import GANTT_OWNER_ALIAS
from ..core import (
    _first_key, esc, js_json, norm_key, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML,
)

FISH_CAT_ALIAS = tuple(norm_key(x) for x in ("category", "cat", "dimension", "类别", "类目", "维度", "大骨", "分类", "分组", "group", "方面"))

FISH_CAUSE_ALIAS = tuple(norm_key(x) for x in ("cause", "reason", "原因", "小骨", "因子", "因素", "问题点", "根因", "label", "name", "事项", "原因描述"))

FISH_SUB_ALIAS = tuple(norm_key(x) for x in ("sub", "subcause", "子原因", "子因", "孙骨", "二级原因", "细分"))

def to_fishbone(raw):
    """原因表 → 鱼骨数据。

    category + cause 必需；可选 sub（孙骨）/ owner。鱼头（问题）用标题。
    类别与原因按首见顺序；重复 (类, 因, 子) 合并计数；缺原因行跳过。
    """
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("鱼骨图需要 category/cause 形式的行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    cat_key = _first_key(sample, FISH_CAT_ALIAS)
    cause_key = _first_key(sample, FISH_CAUSE_ALIAS)
    sub_key = _first_key(sample, FISH_SUB_ALIAS)
    owner_key = _first_key(sample, GANTT_OWNER_ALIAS)
    if cat_key and cause_key and cat_key == cause_key:
        cause_key = None
    if not cause_key:
        raise ValueError("未找到原因列（cause / 原因 / 小骨 / 因素）；鱼骨图至少需要 类别 + 原因")
    cats, order = {}, []
    skip_cause, dup, owner_n = 0, 0, 0
    for row in raw:
        cause = str(row.get(cause_key)).strip() if row.get(cause_key) not in (None, "") else ""
        if not cause:
            skip_cause += 1
            continue
        cat = str(row.get(cat_key)).strip() if cat_key and row.get(cat_key) not in (None, "") else "未分类"
        sub = str(row.get(sub_key)).strip() if sub_key and row.get(sub_key) not in (None, "") else ""
        owner = str(row.get(owner_key)).strip() if owner_key and row.get(owner_key) not in (None, "") else ""
        if cat not in cats:
            cats[cat] = {"name": cat, "causes": [], "_seen": set()}
            order.append(cat)
        c = cats[cat]
        sig = (cause, sub)
        if sig in c["_seen"]:
            dup += 1
            continue
        c["_seen"].add(sig)
        if owner:
            owner_n += 1
        c["causes"].append({"label": cause, "sub": sub, "owner": owner})
    if not order:
        raise ValueError("没有可解析的原因行（至少需要 类别 + 原因两列）")
    warnings = []
    if skip_cause:
        warnings.append(f"{skip_cause} 行原因为空，已跳过")
    if dup:
        warnings.append(f"{dup} 条重复（类别+原因+子原因），已合并")
    ks = [len(cats[c]["causes"]) for c in order]
    max_i = ks.index(max(ks))
    if len(order) > 1 and max(ks) >= 3 * min(ks):
        warnings.append(f"类目不均衡：「{esc(order[max_i])}」{max(ks)} 条 vs 最少 {min(ks)} 条，版面会偏向一侧")
    depth = 3 if any(c2["sub"] for c in order for c2 in cats[c]["causes"]) else 2
    quality = {
        "rows": len(raw), "kept": sum(ks), "warnings": warnings[:6],
        "confidence": "high" if not warnings else "medium",
        "mapping": {"category": cat_key or "—（未分类）", "cause": cause_key,
                    "sub": sub_key or "—", "owner": owner_key or "—"},
    }
    return {
        "cats": [{"name": cats[c]["name"], "causes": cats[c]["causes"]} for c in order],
        "counts": {"cats": len(order), "causes": sum(ks), "subs": sum(1 for c in order for x in cats[c]["causes"] if x["sub"]),
                   "owners": owner_n, "maxK": max(ks), "maxCat": order[max_i], "depth": depth},
        "quality": quality,
    }

def build_fishbone_table(data):
    parts = ['<table class="table"><thead><tr><th>类别</th><th>原因</th><th>子原因</th><th>负责人</th></tr></thead><tbody>']
    for c in data["cats"]:
        for x in c["causes"]:
            parts.append(f'<tr><td>{esc(c["name"])}</td><td>{esc(x["label"])}</td>'
                         f'<td>{esc(x["sub"]) or "—"}</td><td>{esc(x["owner"]) or "—"}</td></tr>')
    parts.append("</tbody></table>")
    return "".join(parts)

def build_fishbone_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q["mapping"]
    c = data["counts"]
    chips_data = [
        ("模式", "fishbone"), ("类别", c["cats"]), ("原因", c["causes"]),
        ("子原因", c["subs"]), ("层级", f'{c["depth"]} 层'), ("最深类目", f'{c["maxCat"]} ×{c["maxK"]}'),
        ("类别列", m["category"]), ("原因列", m["cause"]),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">类别与原因解析完整；层级、归属可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>fishbone · {esc(m["category"])} × {esc(m["cause"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_fishbone(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_fishbone(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    effect = title or p.stem
    cards = [
        ("类别", str(c["cats"])),
        ("原因", str(c["causes"])),
        ("子原因", str(c["subs"])),
        ("最深类目", f"{c['maxCat']} ×{c['maxK']}"),
        ("层级", f"{c['depth']} 层"),
        ("负责人", str(c["owners"]) if c["owners"] else "—"),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    data["effect"] = effect
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(effect))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__CATS_N__", str(c["cats"]))
    html_text = html_text.replace("__CAUSES_N__", str(c["causes"]))
    html_text = html_text.replace("__SUBS_N__", str(c["subs"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_fishbone_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_fishbone_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, c["cats"], c["causes"]

# ---- 注册与契约 ----
render = render_fishbone  # 统一注册入口
TEMPLATE_IDS = ("fishbone-basic",)
SUMMARY_KEYS = ("cats", "causes")
def SUMMARY_FMT(n, ns):
    return f"{n} 类 × {ns} 原因"

CONTRACT = {
    "views": ["fish"],
    "templates": list(TEMPLATE_IDS),
    "title": "鱼骨图（因果分析）",
    "summary": "category+cause 必需；鱼头取 --title 或文件名",
    "columns": {
        "required": [
            {"name": "category", "aliases": ["category", "cat", "dimension", "类别", "类目", "维度", "大骨", "分类", "分组", "group", "方面"], "note": "大骨"},
            {"name": "cause", "aliases": ["cause", "reason", "原因", "小骨", "因子", "因素", "问题点", "根因", "label", "name", "事项", "原因描述"], "note": "小骨"},
        ],
        "optional": [
            {"name": "sub", "aliases": ["sub", "subcause", "子原因", "子因", "孙骨", "二级原因", "细分"], "note": "45° 孙骨"},
            {"name": "owner", "aliases": ["owner", "assignee", "负责人", "成员", "责任人"], "note": "悬浮显示"},
        ],
    },
    "inference": ["去重 + 空 cause 跳过", "类间失衡警告", "图例点击显隐并重排"],
    "example_csv": "类别,原因,子原因\n人员,技能不足,培训缺失\n设备,老化,",
    "command": "vizscape render causes.csv --view fish --theme light --out out/fish.html",
}
