"""vizlib.cli · 命令路由：list / render / inspect / schema / preview / build-manifest。"""
import argparse, json, os, sys
from pathlib import Path
from docmd import DOC_SUFFIXES, profile_doc
from .core import (
    NUM_RATIO, ROOT, TEMPLATES, TEMPORAL_RE, _numeric_stats, is_doc_template, read_raw,
)
from .charts.barline import render as render_fallback, to_chart
from .charts.scatter import to_scatter
from .charts import REGISTRY

VIEW_TO_TEMPLATE = {"bar": "bar-basic", "line": "line-basic", "matrix3d": "bar-matrix", "bullet": "bullet", "report": "report-basic", "scatter": "scatter-basic", "pie": "pie-basic", "pie3d": "pie3d-basic", "funnel": "funnel-basic", "radar": "radar-basic", "treemap": "treemap-basic", "gantt": "gantt-basic", "scatter3d": "scatter3d-basic", "line3d": "line3d-basic", "fish": "fishbone-basic", "heat": "heatmap-basic", "sankey": "sankey-basic", "box": "boxplot-basic", "sunburst": "sunburst-basic", "grid": "grid-basic", "pivot": "grid-basic"}

TEMPLATE_TO_VIEW = {t: v for v, t in VIEW_TO_TEMPLATE.items()}

def is_temporal(labels):
    labels = [str(x).strip() for x in labels]
    return len(labels) >= 3 and sum(bool(TEMPORAL_RE.match(x)) for x in labels) >= 0.8 * len(labels)

def recommend(chart):
    nl, ns = len(chart["labels"]), len(chart["series"])
    if is_temporal(chart["labels"]):
        return "line", f"auto: 时间序列 {nl} 点 × {ns} 系列 → line（趋势）"
    if ns >= 2 and nl >= 4:
        return "bar", f"auto: {nl}分类 × {ns}系列 → bar（分组）"
    return "bar", f"auto: {nl}点 × {ns}系列 → bar"

def scatter_hint(path):
    """inspect 时提示该数据能否走散点图（≥2 数值列即可，但 auto 仍优先 bar/line）。"""
    try:
        c = to_scatter(read_raw(path))
    except ValueError as e:
        return None
    return f"X={c['x_key']} Y={c['y_key']}，{len(c['points'])} 点，{len(c['groups'])} 分组"

MANIFEST_REQUIRED_KEYS = ("name", "title", "input_types")

def scan_manifests():
    """扫描 templates/*/manifest.json，返回 (模板清单, 问题列表)。"""
    entries, problems = [], []
    for d in sorted(TEMPLATES.iterdir()):
        if not d.is_dir():
            continue
        mpath = d / "manifest.json"
        if not mpath.exists():
            problems.append(f"{d.name}: 缺少 manifest.json")
            continue
        try:
            m = json.loads(mpath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            sys.exit(f"✗ {mpath} JSON 解析失败：{e}")
        missing = [k for k in MANIFEST_REQUIRED_KEYS if k not in m]
        if missing:
            problems.append(f"{d.name}: 缺字段 {', '.join(missing)}")
        if m.get("name") and m["name"] != d.name:
            problems.append(f"{d.name}: name 与目录名不一致（{m['name']}）")
        entries.append(m)
    return entries, problems

def recommend_input(path):
    p = Path(path)
    if p.suffix.lower() in DOC_SUFFIXES:
        return "report", "auto: 文本/Markdown → report（报告页）"
    raw = read_raw(p)
    hint = grid_hint(raw)
    if hint:
        return "grid", f"auto: {hint} → grid（多维表）"
    return recommend(to_chart(raw))


def grid_hint(raw):
    """多维数据检测：≥3 个维度列且 ≥1 数值列 → 建议 grid。返回提示串或 None。"""
    if not isinstance(raw, list) or not raw or not isinstance(raw[0], dict):
        return None
    keys = list(raw[0].keys())
    stats = _numeric_stats(raw, keys)
    dims = [k for k in keys if stats[k]["ratio"] < NUM_RATIO]
    measures = [k for k in keys if stats[k]["ratio"] >= NUM_RATIO]
    if len(dims) >= 3 and measures:
        return f"{len(dims)} 维度列 × {len(measures)} 数值列"
    return None


def _schema_target(name):
    """按 view 名或模板名解析到 (charts 模块, 模板名)；找不到返回 (None, None)。"""
    if name in REGISTRY:
        return REGISTRY[name], name
    tpl = VIEW_TO_TEMPLATE.get(name)
    if tpl and tpl in REGISTRY:
        return REGISTRY[tpl], tpl
    return None, None


def _schema_all():
    """全部图族契约（按 VIEW_TO_TEMPLATE 的声明顺序，按模块去重）。"""
    rows, seen = [], set()
    for tpl in VIEW_TO_TEMPLATE.values():
        mod = REGISTRY.get(tpl)
        if mod is not None and id(mod) not in seen:
            seen.add(id(mod))
            rows.append(mod.CONTRACT)
    return rows

def main():
    ap = argparse.ArgumentParser(prog="vizscape", description="vizscape · 把表格画成风景卷轴")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="列出模板")
    r = sub.add_parser("render", help="渲染")
    r.add_argument("input")
    r.add_argument("--view", choices=["bar", "line", "matrix3d", "bullet", "report", "scatter", "pie", "pie3d", "funnel", "radar", "treemap", "gantt", "scatter3d", "line3d", "fish", "heat", "sankey", "box", "sunburst", "grid", "pivot", "auto"], default=None, help="图形类型，默认 auto")
    r.add_argument("--template", default=None, help="直接指定模板目录名，优先于 --view")
    r.add_argument("--out", default=None)
    r.add_argument("--theme", choices=["light", "dark"], default="light")
    r.add_argument("--title", default=None)
    r.add_argument("--json", action="store_true", help="JSON 输出（给 Agent 用）")
    ip = sub.add_parser("inspect", help="识别数据并推荐图形")
    ip.add_argument("input")
    ip.add_argument("--json", action="store_true")
    sub.add_parser("preview", help="打开预览站")
    sc = sub.add_parser("schema", help="输出图表输入契约（列/别名/推断规则/示例，给 Agent 用）")
    sc.add_argument("target", nargs="?", default=None, help="view 或模板名；缺省列出全部")
    sc.add_argument("--json", action="store_true", help="无 target 时输出完整 JSON 数组")
    bm = sub.add_parser("build-manifest", help="汇总模板 manifest 到 preview/manifest.json")
    bm.add_argument("--out", default=str(ROOT / "preview" / "manifest.json"), help="输出路径")
    bm.add_argument("--check", action="store_true", help="只校验不写入，有问题退出码 1")
    bm.add_argument("--json", action="store_true", help="JSON 输出到 stdout（警告走 stderr）")
    args = ap.parse_args()

    if args.cmd == "list":
        for d in sorted(TEMPLATES.iterdir()):
            if (d / "manifest.json").exists():
                m = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
                print(f"- {m['name']:<12} {m['title']}  输入: {', '.join(m['input_types'])}")
    elif args.cmd == "render":
        view, reason = args.view, "explicit"
        tpl = args.template
        if tpl is None:
            if view in (None, "auto"):
                view, reason = recommend_input(args.input)
            tpl = VIEW_TO_TEMPLATE[view]
        out = args.out or (ROOT / "out" / f"{Path(args.input).stem}-{tpl}-{args.theme}.html")
        spec = REGISTRY.get(tpl)
        fn = spec.render if spec is not None else render_fallback
        if tpl == "grid-basic" and view in ("grid", "pivot"):
            result, n, ns = fn(tpl, args.input, str(out), args.theme, args.title,
                               default_mode="pivot" if view == "pivot" else "detail")
        else:
            result, n, ns = fn(tpl, args.input, str(out), args.theme, args.title)
        is_doc = is_doc_template(tpl)
        if args.json:
            if is_doc:
                keys = {"sections": n, "metrics": ns}
            elif spec is not None:
                keys = dict(zip(spec.SUMMARY_KEYS, (n, ns)))
            else:
                keys = {"labels": n, "series": ns}
            payload = {"view": TEMPLATE_TO_VIEW.get(tpl), "template": tpl, "reason": reason,
                       "file": str(result), "theme": args.theme}
            payload.update(keys)
            print(json.dumps(payload, ensure_ascii=False))
        else:
            if is_doc:
                summary = f"{n} 章节 × {ns} 指标"
            elif spec is not None:
                summary = spec.SUMMARY_FMT(n, ns)
            else:
                summary = f"{n} 分类 × {ns} 系列"
            print(f"✓ 生成 {result}（{summary} · 主题 {args.theme}）" + (f" · {reason}" if reason != "explicit" else ""))
    elif args.cmd == "inspect":
        p = Path(args.input)
        if p.suffix.lower() in DOC_SUFFIXES:
            prof = profile_doc(p)
            if args.json:
                print(json.dumps(prof, ensure_ascii=False, indent=2))
            else:
                print(f"PROFILE {prof['input']}: {prof['sections']} sections, {prof['headings']} headings, "
                      f"{prof['tables']} tables, {prof['metrics']} metrics, confidence={prof['confidence']}")
                print(f"RECOMMEND --view {prof['recommend']}  # {prof['reason']}")
        else:
            raw = read_raw(p)
            chart = to_chart(raw)
            nl, ns = len(chart["labels"]), len(chart["series"])
            q = chart["quality"]
            rec, reason = recommend(chart)
            scatter_ok = scatter_hint(p)
            grid_ok = grid_hint(raw)
            if args.json:
                print(json.dumps({"input": p.name, "labels": nl, "series": ns, "mode": q["mode"], "confidence": q["confidence"], "recommend": rec, "reason": reason, "scatter": scatter_ok, "grid": grid_ok}, ensure_ascii=False, indent=2))
            else:
                print(f"PROFILE {p.name}: {nl} labels, {ns} series, mode={q['mode']}, confidence={q['confidence']}")
                print(f"RECOMMEND --view {rec}  # {reason}")
                if scatter_ok:
                    print(f"ALSO --view scatter  # {scatter_ok}")
                if grid_ok:
                    print(f"ALSO --view grid  # {grid_ok}，多维数据可透视")
    elif args.cmd == "schema":
        if args.target:
            mod, tpl = _schema_target(args.target)
            if mod is None:
                sys.exit(f"✗ 未知图族/模板：{args.target}（vizscape schema 查看全部）")
            print(json.dumps(mod.CONTRACT, ensure_ascii=False, indent=2))
        else:
            rows = _schema_all()
            if args.json:
                print(json.dumps({"count": len(rows), "contracts": rows}, ensure_ascii=False, indent=2))
            else:
                for c in rows:
                    reqs = []
                    for col in c["columns"]["required"]:
                        reqs.append(col["name"])
                    print(f"- {c['views'][0]:<9} {c['templates'][0]:<16} {c['title']}  必需: {' / '.join(reqs)}")
                print(f"\n共 {len(rows)} 个图族 · vizscape schema <view> 看完整契约（JSON）")
    elif args.cmd == "preview":
        gallery = ROOT / "preview" / "index.html"
        if not gallery.exists():
            sys.exit(f"✗ 预览站不存在：{gallery}")
        print(f"打开预览站：{gallery}")
        try:
            os.startfile(gallery)
        except AttributeError:
            import webbrowser
            webbrowser.open(gallery.as_uri())
    elif args.cmd == "build-manifest":
        entries, problems = scan_manifests()
        for p in problems:
            print(f"! {p}", file=sys.stderr)
        if args.check:
            if problems:
                sys.exit(f"✗ manifest 校验未通过：{len(problems)} 处问题")
            print(f"✓ {len(entries)} 个模板 manifest 全部有效")
        else:
            payload = {"count": len(entries), "templates": entries}
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if args.json:
                print(json.dumps(payload, ensure_ascii=False))
            else:
                tail = f" · {len(problems)} 处警告" if problems else ""
                print(f"✓ 生成 {out}（{len(entries)} 个模板{tail}）")
