"""vizlib.charts.gantt · 甘特图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import datetime, re, sys
from pathlib import Path
from ..core import (
    _first_key, esc, js_json, LABEL_ALIASES, norm_key, parse_gantt_date, parse_number, read_raw, SHARED_CSS, TEMPLATES, THEME_TOKEN_HTML, TYPE_ALIAS,
)

GANTT_TASK_ALIAS = tuple(norm_key(x) for x in ("task", "任务", "事项", "工作", "工作项", "活动", "label", "name", "名称"))

GANTT_START_ALIAS = tuple(norm_key(x) for x in ("start", "begin", "startdate", "开始", "开始日期", "开始时间", "启动"))

GANTT_END_ALIAS = tuple(norm_key(x) for x in ("end", "finish", "enddate", "due", "deadline", "结束", "结束日期", "截止日期", "完成日期"))

GANTT_DUR_ALIAS = tuple(norm_key(x) for x in ("duration", "days", "dur", "工期", "时长", "天数"))

GANTT_GROUP_ALIAS = tuple(norm_key(x) for x in ("phase", "lane", "swimlane", "module", "阶段", "分组", "模块", "泳道", "部门", "group", "项目"))

GANTT_PROGRESS_ALIAS = tuple(norm_key(x) for x in ("progress", "pct", "percent", "进度", "完成度", "完成率"))

GANTT_STATUS_ALIAS = tuple(norm_key(x) for x in ("status", "state", "状态"))

GANTT_OWNER_ALIAS = tuple(norm_key(x) for x in ("owner", "assignee", "负责人", "成员", "责任人"))

GANTT_DEPS_ALIAS = tuple(norm_key(x) for x in ("deps", "depends", "dependson", "predecessor", "predecessors", "依赖", "前置", "前置任务", "前置依赖"))

GANTT_STATUS_MAP = {
    "done": "done", "complete": "done", "completed": "done", "finished": "done", "完成": "done", "已完成": "done", "已结束": "done",
    "active": "active", "doing": "active", "wip": "active", "inprogress": "active", "ongoing": "active", "进行中": "active", "进行": "active", "执行中": "active",
    "delayed": "delayed", "delay": "delayed", "blocked": "delayed", "atrisk": "delayed", "risk": "delayed", "延期": "delayed", "延迟": "delayed", "滞后": "delayed", "风险": "delayed", "阻塞": "delayed",
    "todo": "todo", "planned": "todo", "notstarted": "todo", "backlog": "todo", "未开始": "todo", "待办": "todo", "待定": "todo", "计划": "todo", "排期中": "todo",
}

GANTT_STATUS_CN = {"done": "完成", "active": "进行中", "delayed": "延期", "todo": "未开始"}

GANTT_MILESTONE_TOKENS = {"milestone", "ms", "里程碑", "节点"}

def to_gantt(raw):
    """任务表 → 甘特数据。

    task + start 必需；end 或 duration 二选一，二者都缺 → 里程碑◆。
    可选：group（泳道）/ progress / status / owner / deps / type=milestone。
    全部日期归一为相对天（int）；有真实日期时 base=最早日期 ISO，纯数字则 base=None（D+n 轴）。
    """
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("甘特图需要 task/start/end 形式的行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    task_key = _first_key(sample, GANTT_TASK_ALIAS) or _first_key(sample, LABEL_ALIASES)
    start_key = _first_key(sample, GANTT_START_ALIAS)
    end_key = _first_key(sample, GANTT_END_ALIAS)
    dur_key = _first_key(sample, GANTT_DUR_ALIAS)
    group_key = _first_key(sample, GANTT_GROUP_ALIAS)
    prog_key = _first_key(sample, GANTT_PROGRESS_ALIAS)
    status_key = _first_key(sample, GANTT_STATUS_ALIAS)
    owner_key = _first_key(sample, GANTT_OWNER_ALIAS)
    deps_key = _first_key(sample, GANTT_DEPS_ALIAS)
    type_key = _first_key(sample, TYPE_ALIAS)
    if group_key and group_key == task_key:
        group_key = None
    if not start_key:
        raise ValueError("未找到开始时间列（start / 开始 / 开始日期）；甘特图至少需要 任务 + 开始（+ 结束或工期）")
    items, bad_date = [], 0
    unknown_status, clamped_prog, ms_by_type = 0, 0, 0
    for idx, row in enumerate(raw):
        label = str(row.get(task_key)).strip() if task_key and row.get(task_key) not in (None, "") else f"任务{idx + 1}"
        s_ord, s_off, s_st = parse_gantt_date(row.get(start_key))
        if s_st in ("missing", "invalid"):
            bad_date += 1
            continue
        e_ord, e_off, e_st = (None, None, "missing")
        if end_key:
            e_ord, e_off, e_st = parse_gantt_date(row.get(end_key))
            if e_st == "invalid":
                bad_date += 1
                e_st = "missing"
        dur_v = None
        if dur_key:
            dv, dst, _ = parse_number(row.get(dur_key))
            if dst in ("ok", "percent") and dv >= 0:
                dur_v = dv
        milestone = False
        if type_key and norm_key(row.get(type_key)) in GANTT_MILESTONE_TOKENS:
            milestone = True
            ms_by_type += 1
        prog = None
        if prog_key:
            pv, pst, _ = parse_number(row.get(prog_key))
            if pst in ("ok", "percent"):
                prog = pv / 100 if pv > 1 else pv
                if prog < 0 or prog > 1:
                    prog = min(1.0, max(0.0, prog))
                    clamped_prog += 1
        status = None
        if status_key:
            sraw = norm_key(row.get(status_key))
            if sraw:
                status = GANTT_STATUS_MAP.get(sraw)
                if status is None:
                    unknown_status += 1
        if status == "done" and prog is None:
            prog = 1.0
        items.append({
            "label": label,
            "group": (str(row.get(group_key)).strip() if group_key and row.get(group_key) not in (None, "") else "未分组"),
            "s": s_ord if s_st == "date" else s_off, "s_date": s_st == "date",
            "e": e_ord if e_st == "date" else (e_off if e_st == "offset" else None), "e_date": e_st == "date",
            "dur": dur_v, "milestone": milestone, "progress": prog, "status": status,
            "owner": (str(row.get(owner_key)).strip() if owner_key and row.get(owner_key) not in (None, "") else ""),
            "deps_raw": (str(row.get(deps_key)).strip() if deps_key and row.get(deps_key) not in (None, "") else ""),
        })
    if not items:
        raise ValueError("没有可解析的任务行（开始时间支持 YYYY-MM-DD / YYYY/M/D / YYYY年M月D日 / YYYYMMDD / 相对天数）")
    warnings = []
    has_real = any(x["s_date"] or x["e_date"] for x in items)
    if has_real:
        anchors = [x["s"] for x in items if x["s_date"]] + [x["e"] for x in items if x["e_date"] and x["e"] is not None]
        base0 = min(anchors)
        mixed = 0
        for x in items:
            if not x["s_date"]:
                x["e"] = (base0 + x["e"]) if x["e"] is not None else None
                x["s"] = base0 + x["s"]
                mixed += 1
            elif x["e"] is not None and not x["e_date"]:
                x["e"] = base0 + x["e"]
                mixed += 1
        if mixed:
            warnings.append(f"{mixed} 处使用相对天数，已按「最早日期 + N 天」对齐")
    else:
        base0 = None
    no_end, swapped = 0, 0
    for x in items:
        if x["e"] is None:
            if x["dur"] is not None and not x["milestone"]:
                x["e"] = x["s"] + x["dur"]
            else:
                x["e"] = x["s"]
                x["milestone"] = True
                no_end += 1
        if x["e"] < x["s"]:
            x["s"], x["e"] = x["e"], x["s"]
            swapped += 1
        if x["e"] == x["s"]:
            x["milestone"] = True
    min_s = min(x["s"] for x in items)
    for x in items:
        x["s"] -= min_s
        x["e"] -= min_s
    span = int(max(x["e"] for x in items)) + 1
    base_ord = int(min_s) if has_real else None
    base_iso = datetime.date.fromordinal(base_ord).isoformat() if has_real else None
    today = None
    if has_real:
        t = datetime.date.today().toordinal() - base_ord
        if 0 <= t <= span:
            today = int(t)
    # 依赖解析：按任务名（首个同名）或 1-based 序号
    label_to_idx, dup = {}, 0
    for i, x in enumerate(items):
        if x["label"] in label_to_idx:
            dup += 1
        else:
            label_to_idx[x["label"]] = i
    dep_drop = 0
    for i, x in enumerate(items):
        deps = []
        if x["deps_raw"]:
            for tok in re.split(r"[;,，、|/]+", x["deps_raw"]):
                tok = tok.strip()
                if not tok:
                    continue
                j = label_to_idx.get(tok)
                if j is None and re.fullmatch(r"\d+", tok):
                    k = int(tok) - 1
                    j = k if 0 <= k < len(items) else None
                if j is None or j == i:
                    dep_drop += 1
                else:
                    deps.append(j)
        x["deps"] = deps
    groups = []
    for x in items:
        if x["group"] not in groups:
            groups.append(x["group"])
    if bad_date:
        warnings.append(f"{bad_date} 处日期无法解析，已跳过（支持 YYYY-MM-DD / YYYY/M/D / YYYY年M月D日 / YYYYMMDD / 相对天数）")
    if swapped:
        warnings.append(f"{swapped} 行结束早于开始，已自动对调")
    if no_end:
        warnings.append(f"{no_end} 行只有开始时间（无结束/工期），按里程碑 ◆ 处理")
    if unknown_status:
        warnings.append(f"{unknown_status} 行状态无法识别（支持 完成/进行中/延期/未开始），已按普通任务显示")
    if clamped_prog:
        warnings.append(f"{clamped_prog} 行进度越界，已钳制到 0~100%")
    if dep_drop:
        warnings.append(f"{dep_drop} 个依赖指向不存在的任务或自引用，已忽略")
    if dup:
        warnings.append(f"任务名重复 {dup} 次，依赖连线按首个同名任务处理")
    progs = [x["progress"] for x in items if x["progress"] is not None]
    avg_prog = (sum(progs) / len(progs)) if progs else None
    quality = {
        "rows": len(raw), "kept": len(items), "warnings": warnings[:6],
        "confidence": "high" if not warnings else ("low" if bad_date else "medium"),
        "mapping": {"task": task_key or "?", "start": start_key, "end": end_key or (dur_key + "（工期）" if dur_key else "—（里程碑）"),
                    "group": group_key or "—", "progress": prog_key or "—", "status": status_key or "—", "deps": deps_key or "—"},
    }
    return {
        "tasks": [{"i": i, "label": x["label"], "group": x["group"], "s": x["s"], "e": x["e"],
                   "dur": x["e"] - x["s"], "progress": x["progress"], "status": x["status"],
                   "milestone": x["milestone"], "owner": x["owner"], "deps": x["deps"]} for i, x in enumerate(items)],
        "groups": groups, "base": base_iso, "baseOrd": base_ord, "span": span, "today": today,
        "counts": {"milestones": sum(1 for x in items if x["milestone"]),
                   "delayed": sum(1 for x in items if x["status"] == "delayed"),
                   "avg_progress": avg_prog,
                   "deps": sum(len(x["deps"]) for x in items)},
        "quality": quality,
    }

def _gantt_fmt_day(base_ord, d):
    if base_ord is None:
        return f"D{d:g}"
    return datetime.date.fromordinal(int(base_ord + d)).isoformat()

def build_gantt_table(data):
    base_ord = data["baseOrd"]
    parts = ['<table class="table"><thead><tr><th>任务</th><th>泳道</th><th>开始</th><th>结束</th>'
             '<th class="num">工期</th><th class="num">进度</th><th>状态</th><th class="num">前置</th><th>负责人</th></tr></thead><tbody>']
    for t in data["tasks"]:
        prog = "—" if t["progress"] is None else f"{t['progress']*100:.0f}%"
        status = GANTT_STATUS_CN.get(t["status"], "—")
        end = "◆ 里程碑" if t["milestone"] else _gantt_fmt_day(base_ord, t["e"])
        deps = f'{len(t["deps"])} 项' if t["deps"] else "—"
        parts.append(f'<tr><td>{esc(t["label"])}</td><td>{esc(t["group"])}</td>'
                     f'<td>{_gantt_fmt_day(base_ord, t["s"])}</td><td>{end}</td>'
                     f'<td class="num">{t["dur"]:g} 天</td><td class="num">{prog}</td>'
                     f'<td>{status}</td><td class="num">{deps}</td><td>{esc(t["owner"]) or "—"}</td></tr>')
    parts.append("</tbody></table>")
    return "".join(parts)

def build_gantt_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = data["quality"]["mapping"]
    c = data["counts"]
    chips_data = [
        ("模式", "gantt"), ("任务", len(data["tasks"])), ("泳道", len(data["groups"])),
        ("里程碑", c["milestones"]), ("依赖连线", c["deps"]), ("跨度", f"{data['span']} 天"),
        ("任务列", m["task"]), ("开始列", m["start"]), ("结束/工期", m["end"]),
    ]
    if data["today"] is not None:
        chips_data.append(("今日线", f"第 {data['today']} 天"))
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">日期解析完整；进度、状态与依赖连线可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>gantt · {esc(m["task"])} × {esc(m["start"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_gantt(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_gantt(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    avg = "—" if c["avg_progress"] is None else f"{c['avg_progress']*100:.0f}%"
    span_txt = f"{data['span']} 天" if data["base"] is None else f"{data['base']} 起 {data['span']} 天"
    cards = [
        ("任务", str(len(data["tasks"]))),
        ("泳道", str(len(data["groups"]))),
        ("里程碑", str(c["milestones"])),
        ("跨度", span_txt),
        ("平均进度", avg),
        ("延期", str(c["delayed"])),
    ]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__SHARED_CSS__", SHARED_CSS)
    html_text = html_text.replace("__TITLE__", esc(title or p.stem))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__TASKS_N__", str(len(data["tasks"])))
    html_text = html_text.replace("__MILESTONES_N__", str(c["milestones"]))
    html_text = html_text.replace("__SPAN_DAYS__", str(data["span"]))
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_gantt_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_gantt_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, len(data["tasks"]), len(data["groups"])

# ---- 注册与契约 ----
render = render_gantt  # 统一注册入口
TEMPLATE_IDS = ("gantt-basic",)
SUMMARY_KEYS = ("tasks", "groups")
def SUMMARY_FMT(n, ns):
    return f"{n} 任务 × {ns} 泳道"

CONTRACT = {
    "views": ["gantt"],
    "templates": list(TEMPLATE_IDS),
    "title": "甘特图（时间轴 + 日历双视图）",
    "summary": "task+start 必需；end/duration 二选一，都缺则为里程碑◆",
    "columns": {
        "required": [
            {"name": "task", "aliases": ["task", "任务", "事项", "工作", "工作项", "活动", "label", "name", "名称"], "note": ""},
            {"name": "start", "aliases": ["start", "begin", "startdate", "开始", "开始日期", "开始时间", "启动"], "note": "日期或相对天数（D+n）"},
        ],
        "optional": [
            {"name": "end", "aliases": ["end", "finish", "enddate", "due", "deadline", "结束", "结束日期", "截止日期", "完成日期"], "note": "与 duration 二选一"},
            {"name": "duration", "aliases": ["duration", "days", "dur", "工期", "时长", "天数"], "note": "数值"},
            {"name": "group", "aliases": ["phase", "lane", "swimlane", "module", "泳道", "阶段", "分组", "模块", "部门", "group", "项目"], "note": "泳道分组"},
            {"name": "progress", "aliases": ["progress", "pct", "percent", "进度", "完成度", "完成率"], "note": "0-100"},
            {"name": "status", "aliases": ["status", "state", "状态"], "note": "done/active/delayed/todo"},
            {"name": "owner", "aliases": ["owner", "assignee", "负责人", "成员", "责任人"], "note": ""},
            {"name": "deps", "aliases": ["deps", "depends", "dependson", "predecessor", "predecessors", "依赖", "前置", "前置任务", "前置依赖"], "note": "依赖任务名，肘形连线"},
            {"name": "type", "aliases": ["type", "类型"], "note": "=milestone 强制里程碑"},
        ],
    },
    "inference": ["日期多格式（YYYY-MM-DD/中文/紧凑/epoch）", "纯数字 → 相对天数 D+n 轴", "日历视图按周泳道排布"],
    "example_csv": "任务,开始,结束,进度,状态\n设计,2026-01-05,2026-01-16,100,done",
    "command": "vizscape render plan.csv --view gantt --theme light --out out/gantt.html",
}
