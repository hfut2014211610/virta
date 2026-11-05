"""vizlib.core · 共享解析与工具层。

所有图族模块复用的：列名别名、数值解析、行读取、质量报告骨架、模板常量替换、日期解析。
ROOT/TEMPLATES 在此唯一定义。
"""

import argparse, csv, json, sys, html, math, os, re, datetime

from collections import OrderedDict

from pathlib import Path

from docmd import DOC_SUFFIXES, profile_doc

from docrender import render_doc


ROOT = Path(__file__).resolve().parent.parent

TEMPLATES = ROOT / "templates"

RAW_LABEL_ALIASES = ("label", "name", "category", "x", "分类", "类别", "标签", "名称", "阶段", "指标")

RAW_VALUE_ALIAS = ("value", "count", "amount", "y", "数值", "数量", "金额", "销量", "营收", "增减")

RAW_SERIES_ALIAS = ("series", "group", "系列", "分组", "渠道", "门店", "城市", "部门")

RAW_TYPE_ALIAS = ("type", "kind", "marker", "阶段类型", "类型", "行类型")

RAW_ACTUAL_ALIAS = ("actual", "value", "实际", "实际值", "本期值", "完成值")

RAW_TARGET_ALIAS = ("target", "goal", "目标", "目标值", "计划值", "plan", "指标目标")

RAW_POOR_ALIAS = ("poor", "low", "bad", "bad_max", "差", "较差线", "较差上限", "差阈值")

RAW_GOOD_ALIAS = ("good", "high", "ok", "good_min", "好", "良好线", "良好下限", "好阈值")

RAW_MAX_ALIAS = ("max", "scale", "upper", "上限", "量程")

RAW_X_ALIAS = ("x", "x值", "横轴", "自变量", "投放入", "成本", "投入")

RAW_Y_ALIAS = ("y", "y值", "纵轴", "因变量", "转化", "收益", "产出")

RAW_SIZE_ALIAS = ("size", "气泡", "气泡大小", "规模", "权重")

ABS_TOKENS = {"absolute", "anchor", "subtotal", "total", "小计", "合计", "总计", "累计"}

DELTA_TOKENS = {"delta", "change", "variance", "增减", "变动", "差额"}

MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "-", "—", "缺失", "空值"}

NUM_RATIO = 0.8

TEMPORAL_RE = re.compile(
    r"^(?:(?:19|20)\d{2}(?:年(?:\d{1,2}月?)?|[-/.]\d{1,2}(?:[-/.]\d{1,2})?)?|\d{1,2}月|[一二三四五六七八九十]+月|\d{1,2}[日号时点]|\d{1,2}:\d{2}(?::\d{2})?|Q[1-4]|第?[一二三四]季度|周[一二三四五六日天]|星期[一二三四五六日天]|(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?|(?:January|February|March|April|May|June|July|August|September|October|November|December))$",
    re.IGNORECASE,
)

def norm_key(k):
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "", str(k or "").strip().lower())

LABEL_ALIASES = tuple(norm_key(x) for x in RAW_LABEL_ALIASES)

VALUE_ALIAS = tuple(norm_key(x) for x in RAW_VALUE_ALIAS)

SERIES_ALIAS = tuple(norm_key(x) for x in RAW_SERIES_ALIAS)

TYPE_ALIAS = tuple(norm_key(x) for x in RAW_TYPE_ALIAS)

ACTUAL_ALIAS = tuple(norm_key(x) for x in RAW_ACTUAL_ALIAS)

TARGET_ALIAS = tuple(norm_key(x) for x in RAW_TARGET_ALIAS)

POOR_ALIAS = tuple(norm_key(x) for x in RAW_POOR_ALIAS)

GOOD_ALIAS = tuple(norm_key(x) for x in RAW_GOOD_ALIAS)

MAX_ALIAS = tuple(norm_key(x) for x in RAW_MAX_ALIAS)

X_ALIAS = tuple(norm_key(x) for x in RAW_X_ALIAS)

Y_ALIAS = tuple(norm_key(x) for x in RAW_Y_ALIAS)

SIZE_ALIAS = tuple(norm_key(x) for x in RAW_SIZE_ALIAS)

def esc(v):
    return html.escape(str(v), quote=True)

def js_json(obj):
    """给 <script> 内嵌 JSON 用：防止 </script> 提前闭合。"""
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")

# eyebrow 主题词：页面内切换主题时随 data-theme 显隐，不依赖模板 JS
THEME_TOKEN_HTML = (
    '<span class="eb-th eb-th-l">LIGHT</span><span class="eb-th eb-th-d">DARK</span>'
    '<style>html[data-theme="light"] .eb-th-d{display:none}'
    'html[data-theme="dark"] .eb-th-l{display:none}</style>'
)

def parse_number(v):
    """返回 (number, status, unit)
    status: ok | percent | missing | invalid
    数值渲染保持原始刻度：10% -> 10（仅标记 percent，不静默缩成 0.1）。
    """
    if v is None:
        return 0.0, "missing", None
    s = str(v).strip()
    if s.lower().replace(" ", "") in MISSING_TOKENS:
        return 0.0, "missing", None
    # 括号负数：(1,234) => -1234
    paren_neg = re.fullmatch(r"\(\s*([+-]?[\d,，]+(?:\.\d+)?)\s*\)", s)
    if paren_neg:
        s = "-" + paren_neg.group(1)
    s = s.replace("，", ",").replace("￥", "").replace("¥", "").replace("$", "").replace("€", "").replace("£", "")
    s = re.sub(r"\s+", "", s)
    percent = s.endswith("%")
    if percent:
        s = s[:-1]
    s = s.replace(",", "")
    try:
        num = float(s)
    except ValueError:
        return 0.0, "invalid", "percent" if percent else None
    return num, ("percent" if percent else "ok"), ("%" if percent else None)

def _first_key(sample, aliases):
    norm_to_orig = {norm_key(k): k for k in sample}
    for alias in aliases:
        if alias in norm_to_orig:
            return norm_to_orig[alias]
    return None

def _numeric_stats(raw, keys):
    stats = {k: {"total": 0, "missing": 0, "invalid": 0, "percent": 0, "ok": 0, "negative": 0, "examples_invalid": []} for k in keys}
    for row in raw:
        for k in keys:
            v, status, _ = parse_number(row.get(k))
            st = stats[k]
            st["total"] += 1
            if status == "missing":
                st["missing"] += 1
            elif status == "invalid":
                st["invalid"] += 1
                if len(st["examples_invalid"]) < 3:
                    st["examples_invalid"].append(str(row.get(k))[:32])
            elif status == "percent":
                st["percent"] += 1
                st["ok"] += 1
                if v < 0:
                    st["negative"] += 1
            else:
                st["ok"] += 1
                if v < 0:
                    st["negative"] += 1
    for st in stats.values():
        denom = max(1, st["total"] - st["missing"])
        st["ratio"] = st["ok"] / denom
    return stats

def _row_label(row, label_key):
    value = row.get(label_key) if row else None
    return str(value) if value not in (None, "") else "?"

def _kind_map(raw, label_key, type_key):
    if not type_key:
        return {}, 0, 0
    kind_map = OrderedDict()
    unknown_types = 0
    conflicts = 0
    for row in raw:
        lab = _row_label(row, label_key)
        raw_type = str(row.get(type_key, "")).strip().lower()
        if not raw_type:
            kind = "delta"
        elif raw_type in ABS_TOKENS:
            kind = "absolute"
        elif raw_type in DELTA_TOKENS:
            kind = "delta"
        else:
            unknown_types += 1
            kind = "delta"
        if lab in kind_map and kind_map[lab] != kind:
            conflicts += 1
        else:
            kind_map[lab] = kind
    return kind_map, unknown_types, conflicts

def _numeric_keys(stats, keys, exclude):
    return [k for k in keys if k not in exclude and stats[k]["ratio"] >= NUM_RATIO]

def _add_group(grouped, quality, series_name, label, value):
    cur = grouped.setdefault(series_name, {})
    if label in cur:
        quality["duplicate_pairs"] += 1
    cur[label] = cur.get(label, 0) + value

def _new_quality(rows, mode):
    return {
        "rows": rows, "mode": mode,
        "mapping": {"label": "?", "series": "—", "value": "—"},
        "numeric_columns": [], "missing": 0, "invalid": 0, "percent": 0, "negative": 0,
        "anchors": 0, "unknown_types": 0, "kind_conflicts": 0, "type_column": "—",
        "duplicate_pairs": 0, "warnings": [], "confidence": "high",
    }

def _finish_quality(quality, stats, chosen_numeric, excluded):
    warnings = quality["warnings"]
    for k, st in stats.items():
        if k in excluded:
            continue
        quality["missing"] += st["missing"]
        quality["invalid"] += st["invalid"]
        quality["percent"] += st["percent"]
        quality["negative"] += st["negative"]
        if st["invalid"]:
            examples = ", ".join(esc(x) for x in st["examples_invalid"])
            warnings.append(f"数值列「{esc(k)}」含 {st['invalid']} 个无法解析值，已按 0 计：{examples}")
        if st["missing"]:
            warnings.append(f"「{esc(k)}」含 {st['missing']} 个空值，已按 0 计")
        if st["percent"]:
            warnings.append(f"「{esc(k)}」含百分号，数值按原刻度保留（10% = 10）")
        if st["negative"]:
            warnings.append(f"「{esc(k)}」含 {st['negative']} 个负值；Pareto / 100%堆叠 / 3D 矩阵自动停用，分组/堆叠/瀑布保持可用")
    if chosen_numeric:
        quality["numeric_columns"] = [esc(k) for k in chosen_numeric]
    if quality["duplicate_pairs"]:
        warnings.append(f"重复 label/series 组合 {quality['duplicate_pairs']} 次，已求和")
    quality["warnings"] = warnings[:6]
    if quality["invalid"] or quality["percent"] or quality["missing"]:
        quality["confidence"] = "medium" if quality["invalid"] == 0 else "low"
    else:
        quality["confidence"] = "high"
    return quality

def read_raw(path: Path):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            # ECharts 风格直接透传
            if "xAxis" in data and "series" in data:
                return ("echarts", data)
            # 无 xAxis 的散点 JSON：series[].data 为 [x,y] / [x,y,size]，交给 to_scatter
            if "series" in data and not data.get("labels"):
                return ("echarts", data)
            return data.get("data") or data.get("rows") or data.get("result") or []
        if isinstance(data, list):
            return data
        raise ValueError("JSON 需为数组，或含 data/rows 字段的对象")
    if suffix == ".xlsx":
        try:
            import openpyxl  # noqa
        except ImportError:
            sys.exit("✗ 缺少依赖 openpyxl：pip install openpyxl（或改存为 CSV）")
        from openpyxl import load_workbook
        wb = load_workbook(path, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        head = [str(c).strip() for c in rows[0]]
        return [dict(zip(head, r)) for r in rows[1:] if any(v is not None for v in r)]
    sys.exit(f"✗ 不支持的输入：{suffix}（仅 csv/json/xlsx）")

def _fmt_num(v):
    return f"{int(v):,}" if v == int(v) else f"{v:,.1f}"

GANTT_DATE_RE = re.compile(r"^(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2})\s*日?)?$")

GANTT_DATE_COMPACT_RE = re.compile(r"^((?:19|20)\d{2})(\d{2})(\d{2})$")

GANTT_YEAR_RE = re.compile(r"^(?:19|20)\d{2}$")

def parse_gantt_date(v):
    """日期解析 → (ordinal|None, offset|None, status)。

    status: date（真实日期，值为 ordinal）/ offset（相对天数）/ missing / invalid。
    兼容：YYYY-MM-DD、YYYY/M/D、YYYY.MM.DD、YYYY年M月D日、YYYYMMDD、YYYY-MM（月初）、
    ISO 时间（取日期部分）、datetime 单元格、epoch 秒/毫秒、纯数字（相对天数）。
    """
    if v is None:
        return None, None, "missing"
    if hasattr(v, "toordinal"):
        try:
            return v.toordinal(), None, "date"
        except Exception:
            return None, None, "invalid"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        f = float(v)
        try:
            if f >= 1e12:
                return int(datetime.date.fromtimestamp(f / 1000).toordinal()), None, "date"
            if f >= 1e9:
                return int(datetime.date.fromtimestamp(f).toordinal()), None, "date"
        except (OverflowError, OSError, ValueError):
            return None, None, "invalid"
        return None, f, "offset"
    s = str(v).strip()
    if s.lower().replace(" ", "") in MISSING_TOKENS:
        return None, None, "missing"
    if "T" in s:
        s = s.split("T")[0]
    elif " " in s:
        s = s.split(" ")[0]
    m = GANTT_DATE_RE.match(s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        d = int(m.group(3)) if m.group(3) else 1
        try:
            return datetime.date(y, mo, d).toordinal(), None, "date"
        except ValueError:
            return None, None, "invalid"
    m = GANTT_DATE_COMPACT_RE.match(s)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).toordinal(), None, "date"
        except ValueError:
            return None, None, "invalid"
    if GANTT_YEAR_RE.match(s):
        return datetime.date(int(s), 1, 1).toordinal(), None, "date"
    try:
        return None, float(s), "offset"
    except ValueError:
        return None, None, "invalid"

def is_doc_template(template):
    mpath = TEMPLATES / template / "manifest.json"
    if not mpath.exists():
        return False
    m = json.loads(mpath.read_text(encoding="utf-8"))
    return m.get("kind") == "doc"
