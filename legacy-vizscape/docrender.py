"""vizscape · 报告页 HTML 渲染（批次 B · report-basic）

解析与指标规则在 docmd.py；本模块只负责把文档模型渲染成单文件 HTML。
"""
import re
import sys
from pathlib import Path

from docmd import DOC_SUFFIXES, METHOD_LABEL, _esc, _inline, build_doc, read_text

# eyebrow 主题词：页面内切换主题时随 data-theme 显隐（与 vizlib.core.THEME_TOKEN_HTML 一致；
# core 依赖本模块，不能反向 import）
_THEME_TOKEN_HTML = (
    '<span class="eb-th eb-th-l">LIGHT</span><span class="eb-th eb-th-d">DARK</span>'
    '<style>html[data-theme="light"] .eb-th-d{display:none}'
    'html[data-theme="dark"] .eb-th-l{display:none}</style>'
)


def _kpi_html(doc):
    if not doc["metrics"]:
        return '<p class="empty">未识别到可用指标</p>'
    order = {"explicit": 0, "inferred": 1, "table": 2}
    picks = sorted(doc["metrics"], key=lambda m: order[m["method"]])[:8]
    cards = []
    for m in picks:
        inf = m["method"] == "inferred"
        bar = ""
        if m["unit"] == "%" and m["value"] is not None:
            bar = f'<div class="kpi-bar"><i style="width:{min(100, abs(m["value"])):.1f}%"></i></div>'
        tag = '<span class="tag-inf">推断</span>' if inf else ""
        cls = " inferred" if inf else ""
        cards.append(
            f'<article class="kpi{cls}"><div class="kpi-label">{_esc(m["label"])}{tag}</div>'
            f'<div class="kpi-val">{_esc(m["value_text"])}<small>{_esc(m["unit"])}</small></div>'
            f'{bar}<a class="kpi-src" href="#{m["anchor"]}">来源 · {_esc(m["section"])}</a></article>')
    return "".join(cards)


def _toc_html(doc):
    items = [h for h in doc["headings"] if not h["is_title"] and h["level"] <= 3]
    if not items:
        return '<div class="side-block"><p class="side-title">目录</p><p class="muted">未检测到标题</p></div>'
    lis = "".join(f'<li class="lv{h["level"]}"><a href="#{h["id"]}">{_esc(h["text"])}</a></li>' for h in items)
    return (f'<nav class="side-block toc" aria-label="目录"><p class="side-title">目录 <span>CONTENTS</span></p>'
            f'<ol>{lis}</ol></nav>')


def _section_bars_html(doc):
    secs = doc["sections"]
    if len(secs) < 2:
        return ""
    top = max(s["chars"] for s in secs) or 1
    items = "".join(
        f'<div class="sb"><a href="#{s["anchor"]}">{_esc(s["text"])}</a>'
        f'<span>{s["chars"]:,} 字</span>'
        f'<div class="sb-track"><i style="width:{s["chars"] / top * 100:.1f}%"></i></div></div>'
        for s in secs)
    return f'<div class="side-block"><p class="side-title">章节篇幅 <span>SECTIONS</span></p>{items}</div>'


def _list_html(items):
    out, stack = [], []
    for it in items:
        lvl, tag = it["level"], ("ol" if it["ordered"] else "ul")
        if not stack or lvl > stack[-1][0]:
            out.append(f"<{tag}>")
            stack.append((lvl, tag))
        else:
            while len(stack) > 1 and lvl < stack[-1][0]:
                out.append(f"</li></{stack.pop()[1]}>")
            out.append("</li>")
        out.append(f"<li>{_inline(it['text'])}")
    while stack:
        out.append("</li>")
        out.append(f"</{stack.pop()[1]}>")
    return "".join(out)


def _table_html(b):
    def cls(a):
        return f' class="{a}"' if a else ""

    head = "".join(f"<th{cls(a)}>{_inline(c)}</th>" for c, a in zip(b["head"], b["align"]))
    body = "".join(
        "<tr>" + "".join(f"<td{cls(a)}>{_inline(c)}</td>" for c, a in zip(r, b["align"])) + "</tr>"
        for r in b["rows"])
    return (f'<div class="tbl-wrap"><table class="table md"><thead><tr>{head}</tr></thead>'
            f'<tbody>{body}</tbody></table></div>')


def _body_html(doc):
    parts = []
    for b in doc["blocks"]:
        t = b["type"]
        if t == "heading":
            if b["is_title"]:
                continue
            lvl = min(max(b["level"], 2), 4)
            parts.append(f'<h{lvl} id="{b["id"]}">{_inline(b["text"])}</h{lvl}>')
        elif t == "p":
            parts.append(f"<p>{_inline(b['text'])}</p>")
        elif t == "list":
            parts.append(_list_html(b["items"]))
        elif t == "table":
            parts.append(_table_html(b))
        elif t == "code":
            parts.append(f'<pre class="code"><div class="code-lang">{_esc(b["lang"] or "text")}</div>'
                         f'<code>{_esc(b["text"])}</code></pre>')
        elif t == "quote":
            parts.append("<blockquote>" + "".join(f"<p>{_inline(p)}</p>" for p in b["paras"]) + "</blockquote>")
        elif t == "hr":
            parts.append("<hr>")
    return "\n".join(parts) if parts else '<p class="muted">（空文档）</p>'


def _metrics_table_html(doc):
    if not doc["metrics"]:
        return '<p class="empty">未识别到指标。可在正文使用「名称：数值单位」（如「营收：12.5 亿元」）或 Markdown 表格。</p>'
    rows = []
    for m in doc["metrics"][:200]:
        rows.append(
            f'<tr><td>{_esc(m["label"])}</td>'
            f'<td class="num">{_esc(m["value_text"])}{_esc(m["unit"])}</td>'
            f'<td><a href="#{m["anchor"]}">{_esc(m["section"])}</a></td>'
            f'<td>{METHOD_LABEL[m["method"]]}</td>'
            f'<td class="src">{_esc(m["source"])}</td></tr>')
    return ('<div class="tbl-wrap"><table class="table"><thead><tr><th>指标</th><th class="num">数值</th>'
            '<th>来源章节</th><th>识别方式</th><th>来源句</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table></div>")


def _quality_html(doc):
    q, st = doc["quality"], doc["stats"]
    conf_label = {"high": "高置信识别", "medium": "中置信识别", "low": "低置信识别"}[q["confidence"]]
    cls = "quality warn" if q["warnings"] else "quality ok"
    chips = "".join(f'<span class="qs"><b>{_esc(k)}</b> {_esc(v)}</span>' for k, v in q["chips"])
    if q["warnings"]:
        body = '<ul class="quality-warnings">' + "".join(f"<li>{_esc(w)}</li>" for w in q["warnings"]) + "</ul>"
    else:
        body = '<p class="quality-ok">结构与指标识别无风险项。</p>'
    return (f'<section class="{cls}" aria-label="文档识别报告">'
            f'<div class="quality-head"><div><p class="eyebrow">document quality</p><h2>文档识别报告</h2></div>'
            f'<div class="quality-score"><b>指标识别 · {conf_label}</b>'
            f'{st["sections"]} 个章节 · {len(doc["metrics"])} 个指标</div></div>'
            f'<div class="quality-grid">{chips}</div>{body}</section>')


def render_doc(tdir, input_path, out_path, theme, title):
    p = Path(input_path)
    if p.suffix.lower() not in DOC_SUFFIXES:
        sys.exit(f"✗ 报告模板只支持 .md / .txt 输入（当前：{p.suffix or '无扩展名'}）")
    if not p.exists():
        sys.exit(f"✗ 输入文件不存在：{p}")
    doc = build_doc(read_text(p), p.stem)
    st = doc["stats"]
    values = {
        "__THEME__": _esc(theme),
        "__THEME_UPPER__": _THEME_TOKEN_HTML,
        "__TITLE__": _esc(title or doc["title"]),
        "__SOURCE__": _esc(p.name),
        "__SECTIONS_N__": str(st["sections"]),
        "__METRICS_N__": str(len(doc["metrics"])),
        "__TABLES_N__": str(st["tables"]),
        "__CHARS_N__": f"{st['chars']:,}",
        "__KPI_HTML__": _kpi_html(doc),
        "__QUALITY_HTML__": _quality_html(doc),
        "__TOC_HTML__": _toc_html(doc),
        "__SECTION_BARS_HTML__": _section_bars_html(doc),
        "__BODY_HTML__": _body_html(doc),
        "__METRICS_TABLE_HTML__": _metrics_table_html(doc),
    }
    tpl = (Path(tdir) / "template.html").read_text(encoding="utf-8")
    out_html = re.sub(r"__[A-Z_]+__", lambda m: values.get(m.group(0), m.group(0)), tpl)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(out_html, encoding="utf-8")
    return out, st["sections"], len(doc["metrics"])
