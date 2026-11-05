"""vizlib.charts.sankey · 桑基图 管线：数据 → 模型 → 表格/质量报告 → 模板渲染。"""
import sys
from pathlib import Path
from ..core import (
    _first_key, _fmt_num, esc, js_json, norm_key, parse_number, read_raw, TEMPLATES, THEME_TOKEN_HTML, VALUE_ALIAS,
)

SANKEY_SOURCE_ALIAS = tuple(norm_key(x) for x in ("source", "from", "src", "源", "来源", "起点", "上游", "fromnode"))

SANKEY_TARGET_ALIAS = tuple(norm_key(x) for x in ("target", "to", "dst", "目标", "去向", "终点", "下游", "tonode"))

def to_sankey(raw):
    """source/target/value → 桑基图数据。必须是无环有向图；成环边按值最小剔除。"""
    if not raw:
        raise ValueError("数据为空")
    if isinstance(raw, tuple) and raw and raw[0] == "echarts":
        raise ValueError("桑基图需要 source/target/value 行数据，暂不支持 ECharts JSON")
    sample = raw[0]
    s_key = _first_key(sample, SANKEY_SOURCE_ALIAS)
    t_key = _first_key(sample, SANKEY_TARGET_ALIAS)
    v_key = _first_key(sample, VALUE_ALIAS)
    if not v_key or v_key in (s_key, t_key):
        used = {k for k in (s_key, t_key) if k}
        for k in sample.keys():
            if k in used:
                continue
            ok = sum(1 for row in raw[:50] if parse_number(row.get(k))[1] not in ("missing", "invalid"))
            if ok >= max(1, int(0.8 * min(len(raw), 50))):
                v_key = k
                break
    if not (s_key and t_key and v_key):
        raise ValueError("桑基图需要 source+target+value 三组列")
    warnings, bad_val, bad_key, self_loop = [], 0, 0, 0
    edges = {}
    nodes = []
    for row in raw:
        sv, tv = row.get(s_key), row.get(t_key)
        if sv in (None, "") or tv in (None, ""):
            bad_key += 1
            continue
        num, st, _u = parse_number(row.get(v_key))
        if st in ("missing", "invalid") or num <= 0:
            bad_val += 1
            continue
        ss, tt = str(sv).strip(), str(tv).strip()
        if ss == tt:
            self_loop += 1
            continue
        for n_ in (ss, tt):
            if n_ not in nodes:
                nodes.append(n_)
        sig = (ss, tt)
        edges[sig] = edges.get(sig, 0.0) + num
    if not edges:
        raise ValueError("没有可解析的 (source, target, value) 行")
    # —— 环检测：反复剔除拓扑残留子图中的最小边 ——
    removed_cycle = []
    def _has_cycle_remove():
        # Kahn：若无法全部出列则有环；在残留边里找最小值边剔除
        indeg = {}
        for (s_, t_) in edges:
            indeg[t_] = indeg.get(t_, 0) + 1
            indeg.setdefault(s_, indeg.get(s_, 0))
        stack = [n_ for n_, d_ in indeg.items() if d_ == 0]
        seen = 0
        ind2 = dict(indeg)
        while stack:
            n_ = stack.pop()
            seen += 1
            for (s_, t_) in list(edges):
                if s_ == n_:
                    ind2[t_] -= 1
                    if ind2[t_] == 0:
                        stack.append(t_)
        if seen >= len(indeg):
            return False
        # 只在「参与环」的边里剔最弱：边 (s,t) 若 t 能经其他路径回到 s 则成环
        adj = {}
        for (s_, t_) in edges:
            adj.setdefault(s_, []).append(t_)
        def _reaches(start, goal):
            st, seen2 = [start], {start}
            while st:
                n2 = st.pop()
                if n2 == goal:
                    return True
                for nxt in adj.get(n2, ()):
                    if nxt not in seen2:
                        seen2.add(nxt)
                        st.append(nxt)
            return False
        cyclic = [k for k in edges if _reaches(k[1], k[0])]
        if not cyclic:
            return False
        min_sig = min(cyclic, key=lambda k: edges[k])
        removed_cycle.append((min_sig, edges[min_sig]))
        del edges[min_sig]
        return True
    guard = 0
    while _has_cycle_remove() and guard < 1000:
        guard += 1
    dup_cnt = len(raw) - bad_key - bad_val - self_loop - len(edges) - len(removed_cycle)
    if dup_cnt > 0:
        warnings.append(f"{dup_cnt} 条重复 (source,target) 边，已求和合并")
    if self_loop:
        warnings.append(f"{self_loop} 行 source=target 自环，已剔除")
    if bad_key:
        warnings.append(f"{bad_key} 行缺 source 或 target，已跳过")
    if bad_val:
        warnings.append(f"{bad_val} 行数值缺失/非正，已跳过")
    if removed_cycle:
        names = "、".join(f"{esc(s)}→{esc(t)}" for (s, t), _v in removed_cycle[:4])
        warnings.append(f"检测到循环依赖，已剔除 {len(removed_cycle)} 条最弱边（{names}）——桑基图要求有向无环")
    if not edges:
        raise ValueError("剔除环后无剩余边，无法绘制桑基图")
    # 层级（最长路径）
    depth = {}
    remaining = set(edges)
    changed = True
    for n_ in nodes:
        depth[n_] = 0
    for _ in range(len(nodes) + 1):
        changed = False
        for (s_, t_) in list(remaining):
            if depth[t_] < depth[s_] + 1:
                depth[t_] = depth[s_] + 1
                changed = True
        if not changed:
            break
    idx = {n_: i for i, n_ in enumerate(nodes)}
    links = [{"s": idx[s_], "t": idx[t_], "v": round(v_, 4)} for (s_, t_), v_ in edges.items()]
    in_v = {n_: 0.0 for n_ in nodes}
    out_v = {n_: 0.0 for n_ in nodes}
    for (s_, t_), v_ in edges.items():
        out_v[s_] += v_
        in_v[t_] += v_
    through = {n_: max(in_v[n_], out_v[n_]) for n_ in nodes}
    counts = {"nodes": len(nodes), "links": len(links), "layers": (max(depth.values()) + 1) if depth else 1,
              "total": round(sum(v_ for v_ in edges.values()), 2)}
    quality = {"rows": len(raw), "kept": len(links), "warnings": warnings[:6],
               "confidence": "high" if not warnings else "medium",
               "mapping": {"source": s_key, "target": t_key, "value": v_key}}
    return {"nodes": [{"name": n_, "depth": depth[n_], "value": round(through[n_], 4)} for n_ in nodes],
            "links": links, "counts": counts, "quality": quality}

def build_sankey_table(data):
    parts = ['<table class="table"><thead><tr><th>源</th><th>目标</th><th class="num">流量</th><th class="num">占比</th></tr></thead><tbody>']
    total = sum(l["v"] for l in data["links"]) or 1
    nodes = data["nodes"]
    for l in sorted(data["links"], key=lambda x: -x["v"]):
        parts.append(f"<tr><td>{esc(nodes[l['s']]['name'])}</td><td>{esc(nodes[l['t']]['name'])}</td>"
                     f"<td class=\"num\">{_fmt_num(l['v'])}</td><td class=\"num\">{l['v']/total:.1%}</td></tr>")
    parts.append("</tbody></table>")
    return "".join(parts)

def build_sankey_quality(data):
    q = data["quality"]
    cls = "quality warn" if q.get("warnings") else "quality ok"
    conf = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}.get(q.get("confidence", "high"), "中置信识别")
    m = q["mapping"]
    c = data["counts"]
    chips_data = [("节点", c["nodes"]), ("流带", c["links"]), ("层级", c["layers"]), ("总流量", _fmt_num(c["total"])),
                  ("源列", m["source"]), ("目标列", m["target"]), ("数值列", m["value"])]
    chips = "".join(f'<span class="qs"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in chips_data)
    if q.get("warnings"):
        body = "<ul class=\"quality-warnings\">" + "".join(f"<li>{w}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">有向无环；流带与节点可直接引用。</p>'
    return f'<section class="{cls}" aria-label="数据识别报告"><div class="quality-head"><div><p class="eyebrow">data quality</p><h2>数据识别报告</h2></div><div class="quality-score"><b>{esc(conf)}</b>sankey · {esc(m["source"])} → {esc(m["target"])}</div></div><div class="quality-grid">{chips}</div>{body}</section>'

def render_sankey(template, input_path, out_path, theme, title):
    tdir = TEMPLATES / template
    p = Path(input_path)
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    raw = read_raw(p)
    try:
        data = to_sankey(raw)
    except ValueError as e:
        sys.exit(f"✗ {e}")
    html_text = (tdir / "template.html").read_text(encoding="utf-8")
    c = data["counts"]
    effect = title or p.stem
    cards = [("节点", str(c["nodes"])), ("流带", str(c["links"])), ("层级", str(c["layers"])), ("总流量", _fmt_num(c["total"]))]
    summary = "".join(f'<span class="sum-card"><b>{esc(v)}</b>{esc(k)}</span>' for k, v in cards)
    html_text = html_text.replace("__THEME__", esc(theme))
    html_text = html_text.replace("__THEME_UPPER__", THEME_TOKEN_HTML)
    html_text = html_text.replace("__TITLE__", esc(effect))
    html_text = html_text.replace("__SOURCE__", esc(p.name))
    html_text = html_text.replace("__ARIA_DESC__", f"{c['nodes']} 节点 {c['links']} 条流带，{c['layers']} 层")
    html_text = html_text.replace("__SUMMARY_CARDS__", summary)
    html_text = html_text.replace("__DATA_JSON__", js_json(data))
    html_text = html_text.replace("__TABLE_HTML__", build_sankey_table(data))
    html_text = html_text.replace("__QUALITY_HTML__", build_sankey_quality(data))
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_text, encoding="utf-8")
    return out, c["links"], c["nodes"]

# ---- 注册与契约 ----
render = render_sankey  # 统一注册入口
TEMPLATE_IDS = ("sankey-basic",)
SUMMARY_KEYS = ("links", "nodes")
def SUMMARY_FMT(n, ns):
    return f"{n} 流带 × {ns} 节点"

CONTRACT = {
    "views": ["sankey"],
    "templates": list(TEMPLATE_IDS),
    "title": "桑基图（流量路径）",
    "summary": "source+target+value 边表；强制 DAG，自环剔除、成环去最弱边并警告",
    "columns": {
        "required": [
            {"name": "source", "aliases": ["source", "from", "src", "源", "来源", "起点", "上游"], "note": ""},
            {"name": "target", "aliases": ["target", "to", "dst", "目标", "去向", "终点", "下游"], "note": ""},
            {"name": "value", "aliases": ["全量数值别名"], "note": "流量"},
        ],
        "optional": [],
    },
    "inference": ["重复边求和", "自环剔除", "成环去最弱边并警告", "最长路径分层 + barycenter 排序"],
    "example_csv": "source,target,value\n访问,注册,3200\n注册,付费,860",
    "command": "vizscape render flow.csv --view sankey --theme light --out out/sankey.html",
}
