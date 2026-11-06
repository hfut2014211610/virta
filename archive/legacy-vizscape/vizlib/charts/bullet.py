"""vizlib.charts.bullet · KPI 子弹图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, _new_quality, _row_label, ACTUAL_ALIAS, esc, GOOD_ALIAS, LABEL_ALIASES, MAX_ALIAS, parse_number, POOR_ALIAS, read_raw, SHARED_CSS, TARGET_ALIAS, TEMPLATES, THEME_TOKEN_HTML,
)

def to_bullet(raw):
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("Bullet 子弹图不支持 ECharts JSON；请使用 label/actual/target 宽表")
    if not raw:
        raise ValueError("数据为空")
    sample = raw[0]
    keys = list(sample.keys())
    label_key = _first_key(sample, LABEL_ALIASES) or keys[0]
    actual_key = _first_key(sample, ACTUAL_ALIAS)
    target_key = _first_key(sample, TARGET_ALIAS)
    poor_key = _first_key(sample, POOR_ALIAS)
    good_key = _first_key(sample, GOOD_ALIAS)
    max_key = _first_key(sample, MAX_ALIAS)
    if not actual_key or not target_key:
        missing = "、".join(n for n, k in (("actual/实际", actual_key), ("target/目标", target_key)) if not k)
        raise ValueError(f"缺少必需列 {missing}；Bullet 需要 label + actual + target（可选 poor/good/max）")

    items, stats = [], {"missing": 0, "invalid": 0, "negative": 0, "poor_gte_good": 0, "duplicate_labels": 0}
    seen_labels = set()
    max_seed = 0.0
    for row in raw:
        lab = _row_label(row, label_key)
        av, a_status, _ = parse_number(row.get(actual_key))
        tv, t_status, _ = parse_number(row.get(target_key))
        pv, p_status, _ = parse_number(row.get(poor_key)) if poor_key else (None, "missing", None)
        gv, g_status, _ = parse_number(row.get(good_key)) if good_key else (None, "missing", None)
        mv, m_status, _ = parse_number(row.get(max_key)) if max_key else (None, "missing", None)
        pv = pv if p_status != "missing" else None
        gv = gv if g_status != "missing" else None
        mv = mv if m_status != "missing" else None
        for key, status in ((actual_key, a_status), (target_key, t_status), (poor_key, p_status), (good_key, g_status), (max_key, m_status)):
            if key is None:
                continue
            if status == "missing":
                stats["missing"] += 1
            elif status == "invalid":
                stats["invalid"] += 1
        for value in (av if a_status != "missing" else None, tv if t_status != "missing" else None):
            if value is not None and value < 0:
                stats["negative"] += 1
        if lab in seen_labels:
            stats["duplicate_labels"] += 1
        seen_labels.add(lab)
        candidates = [v for key, v, st in ((actual_key, av, a_status), (target_key, tv, t_status), (poor_key, pv, p_status), (good_key, gv, g_status), (max_key, mv, m_status)) if key and st != "missing"]
        max_seed = max(max_seed, *(abs(v) for v in candidates))
        items.append({"label": lab, "actual": av, "target": tv,
                      "poor": pv if pv is not None else None, "good": gv if gv is not None else None,
                      "max": mv if mv is not None else None})
    if stats["negative"]:
        raise ValueError("Bullet 指标不能为负数；负值请使用分组/堆叠/瀑布图")
    scale = max(max_seed, 1.0) * 1.08
    for item in items:
        if item["poor"] is None:
            item["poor"] = scale * 0.55
        if item["good"] is None:
            item["good"] = scale * 0.8
        if item["poor"] >= item["good"]:
            stats["poor_gte_good"] += 1
            item["poor"], item["good"] = scale * 0.55, scale * 0.8
        item["max"] = scale
        denom = item["target"]
        item["ratio"] = (item["actual"] / denom) if denom else None
        item["gap"] = item["actual"] - denom
        item["status"] = "hit" if denom and item["actual"] >= denom else ("watch" if denom and item["actual"] >= denom * 0.8 else "miss")
    rows = len(items)
    hits = sum(1 for x in items if x["status"] == "hit")
    avg_ratio = sum(x["ratio"] for x in items if x["ratio"] is not None) / max(1, sum(1 for x in items if x["ratio"] is not None))
    under_08 = sum(1 for x in items if x["ratio"] is not None and x["ratio"] < 0.8)
    quality = _new_quality(rows, "bullet")
    quality["mapping"] = {"label": label_key, "series": "(actual/target)", "value": f"{actual_key} / {target_key}"}
    quality["type_column"] = "—"
    quality["missing"] = stats["missing"]
    quality["invalid"] = stats["invalid"]
    quality["negative"] = stats["negative"]
    quality["duplicate_labels"] = stats["duplicate_labels"]
    quality["numeric_columns"] = [k for k in [actual_key, target_key, poor_key, good_key, max_key] if k]
    if stats["missing"] or stats["poor_gte_good"] or stats["duplicate_labels"]:
        if stats["missing"]:
            quality["warnings"].append(f"指标含 {stats['missing']} 个空值/缺失，已按 0 计")
        if stats["poor_gte_good"]:
            quality["warnings"].append(f"{stats['poor_gte_good']} 行 poor ≥ good，已回退为 55%/80% 默认刻度")
        if stats["duplicate_labels"]:
            quality["warnings"].append(f"重复指标名 {stats['duplicate_labels']} 次；Bullet 不求和，请确认是否需要去重")
        quality["confidence"] = "medium" if stats["invalid"] == 0 else "low"
    if stats["invalid"]:
        quality["warnings"].append(f"含 {stats['invalid']} 个无法解析数值，已按 0 计")
        quality["confidence"] = "low"
    quality["warnings"] = quality["warnings"][:6]
    return {"items": items, "scale": scale, "hits": hits, "rows": rows, "avg_ratio": avg_ratio,
            "under_08": under_08, "mapping": quality["mapping"], "quality": quality}

def build_bullet_quality(chart):
    q = chart["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = chart["mapping"]
    stats = [
        ("模式", "bullet"), ("行数", chart["rows"]), ("分类列", m["label"]),
        ("实际 / 目标", m["value"]), ("量程", _fmt_num(chart["scale"])),
        ("缺失按0计", q.get("missing", 0)), ("非法按0计", q.get("invalid", 0)), ("重复指标", q.get("duplicate_labels", 0)),
    ]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in stats)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">未发现缺失/非法/阈值冲突；字段映射可直接信任。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>Bullet · label/actual/target</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def _bullet_status_label(item):
    return {"hit": "达标", "watch": "接近", "miss": "偏离"}.get(item["status"], "偏离")

def build_bullet_rows(chart):
    rows = []
    scale = chart["scale"]
    for idx, item in enumerate(chart["items"]):
        actual_pct = max(0.0, min(100.0, (item["actual"] / scale) * 100))
        target_pct = max(0.0, min(100.0, (item["target"] / scale) * 100))
        poor_pct = max(0.0, min(100.0, (item["poor"] / scale) * 100))
        good_pct = max(poor_pct, min(100.0, (item["good"] / scale) * 100))
        ratio = f"{item['ratio'] * 100:.0f}%" if item["ratio"] is not None else "—"
        gap = item["gap"]
        gap_text = f"+{_fmt_num(gap)}" if gap >= 0 else f"-{_fmt_num(abs(gap))}"
        rows.append(
            f'<article class="bullet-row {item["status"]}" data-ratio="{item["ratio"] if item["ratio"] is not None else 0:.6f}" data-gap="{gap:.6f}" style="--i:{idx}">'
            f'<div class="row-head"><div><h3>{esc(item["label"])}</h3><p>实际 <b>{_fmt_num(item["actual"])}</b> · 目标 <b>{_fmt_num(item["target"])}</b> · 差距 <b>{gap_text}</b></p></div><div class="row-badges"><span class="status {item["status"]}">{_bullet_status_label(item)}</span><span class="ratio">{ratio}</span></div></div>'
            f'<div class="track" style="--actual:{actual_pct:.2f}%;--target:{target_pct:.2f}%;--poor:{poor_pct:.2f}%;--good:{good_pct:.2f}%"><div class="band poor"></div><div class="band ok"></div><div class="band good"></div><div class="actual"></div><div class="target-line"></div></div>'
            f'</article>'
        )
    return "\n".join(rows)

def render_bullet(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        chart = to_bullet(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    rows = build_bullet_rows(chart)
    avg = f"{chart['avg_ratio'] * 100:.0f}%" if chart["avg_ratio"] else "—"
    cards = [
        ("指标数", chart["rows"]),
        ("达标", f"{chart['hits']} / {chart['rows']}"),
        ("平均达成", avg),
        ("低于 80%", chart["under_08"]),
        ("量程", _fmt_num(chart["scale"])),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__ROWS_HTML__", rows)
    html_text = html_text.replace("__QUALITY_HTML__", build_bullet_quality(chart))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, chart["rows"], 2

# ---- 注册与契约 ----
render = render_bullet  # 统一注册入口
TEMPLATE_IDS = ("bullet",)
SUMMARY_KEYS = ("labels", "series")
def SUMMARY_FMT(n, ns):
    return f"{n} 分类 × {ns} 系列"

CONTRACT = {
    "views": ["bullet"],
    "templates": list(TEMPLATE_IDS),
    "title": "KPI 子弹图",
    "summary": "actual vs target 的达成度条，带较差/良好阈值带与量程",
    "columns": {
        "required": [
            {"name": "label", "aliases": ["label", "name", "category", "x", "分类", "类别", "标签", "名称", "阶段", "指标"], "note": "缺省取第一列"},
            {"name": "actual", "aliases": ["actual", "value", "实际", "实际值", "本期值", "完成值"], "note": "数值列"},
            {"name": "target", "aliases": ["target", "goal", "目标", "目标值", "计划值", "plan"], "note": "数值列，与 actual 成对"},
        ],
        "optional": [
            {"name": "poor / good", "aliases": ["poor", "low", "bad", "差", "较差线", "较差上限", "good", "high", "ok", "好", "良好线", "良好下限"], "note": "阈值带；缺省按量程 55%/80%"},
            {"name": "max", "aliases": ["max", "scale", "upper", "上限", "量程"], "note": "参与量程估计；全图统一量程"},
        ],
    },
    "inference": ["达成度 = actual/target 自动判定状态色", "poor/good 缺省按量程 55%/80%"],
    "example_csv": "指标,实际,目标\n营收,820,1000\n毛利,46,50",
    "command": "vizscape render data.csv --view bullet --theme light --out out/bullet.html",
}
