"""vizscape · 文本 / Markdown 解析与关键指标抽取（批次 B）

输入: .md / .txt。识别规则见 docs/TEXT_REPORT.md。
"""
import html
import re
from pathlib import Path

DOC_SUFFIXES = (".md", ".txt")

NUM = r"[+-]?[¥$€￥]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?[¥$€￥]?\d+(?:\.\d+)?"
UNIT = r"个百分点|百分点|亿元|万元|万单|万人|个月|小时|分钟|天|%|‰|ms|秒|GB|MB|TB|KB|pt|倍|亿|万|元|单|人|次|个|家|台|x"
PAT_A = re.compile(
    r"(?P<label>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 /·()（）\-_]{0,23}?)\s*[：:]\s*"
    r"(?P<value>" + NUM + r")\s*(?P<unit>" + UNIT + r")?(?![A-Za-z0-9])(?![-/.]\d)"
)
PAT_B = re.compile(
    r"(?P<label>[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z/· ]{1,11}?)\s*(?:为|达到|达|约|共|是|仅|至)?\s*"
    r"(?P<value>" + NUM + r")\s*(?P<unit>" + UNIT + r")(?![A-Za-z])"
)
CELL_RE = re.compile(r"^\s*(?P<value>" + NUM + r")\s*(?P<unit>" + UNIT + r")?\s*$")
CLAUSE_RE = re.compile(r"[，；;。！？!?、]+|(?<!\d),+|,+(?!\d)")
FENCE_RE = re.compile(r"^\s*(```+|~~~+)\s*([\w+#.\-]*)\s*$")
HEAD_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$")
HR_RE = re.compile(r"^\s{0,3}([-*_])(?:\s*\1){2,}\s*$")
QUOTE_RE = re.compile(r"^\s{0,3}>\s?(.*)$")
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$")
IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
LINK_RE = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
CODE_SPLIT_RE = re.compile(r"(`[^`]+`)")
BOLD_RE = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")
ITAL_RE = re.compile(r"(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])")
DEL_RE = re.compile(r"~~(.+?)~~")
SAFE_URL_RE = re.compile(r"^(?:https?://|mailto:|#|\.{0,2}/|[^:/?#]*$)", re.I)
HTML_TAG_RE = re.compile(r"<[A-Za-z/!][^>]*>")
STOP_LABELS = {"注意", "说明", "备注", "结论", "提示", "示例", "版本", "时间", "日期", "来源", "更新", "附注", "注", "例如", "截至"}
METHOD_LABEL = {"explicit": "显式标签", "inferred": "推断", "table": "表格"}


def _esc(s):
    return html.escape(str(s), quote=True)


def _is_cjk(ch):
    return "\u4e00" <= ch <= "\u9fff" or "\u3000" <= ch <= "\u303f" or "\uff00" <= ch <= "\uffef"


def _join(lines):
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if not out:
            out = ln
        else:
            out += ("" if _is_cjk(out[-1]) or _is_cjk(ln[0]) else " ") + ln
    return out


def _split_row(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _align_of(cell):
    c = cell.strip()
    if c.startswith(":") and c.endswith(":"):
        return "ctr"
    return "num" if c.endswith(":") else ""


def _slug(text, used):
    base = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", text.strip().lower()).strip("-") or "sec"
    slug, k = base, 2
    while slug in used:
        slug = f"{base}-{k}"
        k += 1
    used.add(slug)
    return slug


def _plain(s):
    s = IMG_RE.sub("", s)
    s = LINK_RE.sub(lambda m: m.group(1), s)
    s = s.replace("`", "")
    s = re.sub(r"\*\*|__|~~", "", s)
    return s.replace("*", "").strip()


def _chars(s):
    return len(re.sub(r"\s+", "", s))


def _safe_url(url):
    return bool(SAFE_URL_RE.match(html.unescape(url)))


def _to_float(v):
    try:
        return float(re.sub(r"[¥$€￥,]", "", v))
    except ValueError:
        return None


def _looks_like_markdown(lines):
    for i, ln in enumerate(lines):
        if HEAD_RE.match(ln) or FENCE_RE.match(ln) or QUOTE_RE.match(ln) or HR_RE.match(ln) or LIST_RE.match(ln):
            return True
        if "|" in ln and i + 1 < len(lines) and "|" in lines[i + 1] and TABLE_SEP_RE.match(lines[i + 1]):
            return True
    return False


def parse_markdown(text):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    # 有 Markdown 结构标记 → 按 Markdown 软换行合并段落；纯文本 → 每行一条独立陈述
    # （避免标题行/相邻陈述被拼进同一从句，污染指标标签或造出跨行假指标）
    is_md = _looks_like_markdown(lines)
    blocks, para = [], []
    n, i = len(lines), 0

    def flush():
        if para:
            blocks.append({"type": "p", "text": _join(para)})
            para.clear()

    while i < n:
        line = lines[i]
        if not line.strip():
            flush()
            i += 1
            continue
        fm = FENCE_RE.match(line)
        if fm:
            flush()
            marker, body = fm.group(1), []
            i += 1
            while i < n and not lines[i].strip().startswith(marker):
                body.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "lang": fm.group(2), "text": "\n".join(body)})
            continue
        hm = HEAD_RE.match(line)
        if hm:
            flush()
            blocks.append({"type": "heading", "level": len(hm.group(1)), "text": hm.group(2).strip()})
            i += 1
            continue
        if HR_RE.match(line):
            flush()
            blocks.append({"type": "hr"})
            i += 1
            continue
        if QUOTE_RE.match(line):
            flush()
            paras, cur = [], []
            while i < n and QUOTE_RE.match(lines[i]):
                inner = QUOTE_RE.match(lines[i]).group(1)
                if inner.strip():
                    cur.append(inner)
                elif cur:
                    paras.append(_join(cur))
                    cur = []
                i += 1
            if cur:
                paras.append(_join(cur))
            blocks.append({"type": "quote", "paras": paras})
            continue
        if "|" in line and i + 1 < n and "|" in lines[i + 1] and TABLE_SEP_RE.match(lines[i + 1]):
            flush()
            head = _split_row(line)
            w = len(head)
            align = ([_align_of(c) for c in _split_row(lines[i + 1])] + [""] * w)[:w]
            rows, i = [], i + 2
            while i < n and lines[i].strip() and "|" in lines[i]:
                rows.append((_split_row(lines[i]) + [""] * w)[:w])
                i += 1
            blocks.append({"type": "table", "head": head, "align": align, "rows": rows})
            continue
        if LIST_RE.match(line):
            flush()
            items = []
            while i < n:
                ln = lines[i]
                if not ln.strip():
                    j = i + 1
                    while j < n and not lines[j].strip():
                        j += 1
                    if j < n and LIST_RE.match(lines[j]):
                        i = j
                        continue
                    break
                m = LIST_RE.match(ln)
                if m:
                    items.append({"level": len(m.group(1).replace("\t", "    ")) // 2,
                                  "ordered": m.group(2)[0].isdigit(), "text": m.group(3).strip()})
                elif items and ln[:1] in (" ", "\t"):
                    items[-1]["text"] += " " + ln.strip()
                else:
                    break
                i += 1
            blocks.append({"type": "list", "items": items})
            continue
        if is_md:
            para.append(line)
        else:
            blocks.append({"type": "p", "text": _join([line])})
        i += 1
    flush()
    return blocks


def _inline_plain(s):
    s = _esc(s)
    s = IMG_RE.sub(lambda m: f'<span class="img-ph">🖼 {m.group(1) or "图片"} · 离线未加载</span>', s)
    s = LINK_RE.sub(lambda m: (f'<a href="{m.group(2)}" target="_blank" rel="noopener noreferrer">{m.group(1)}</a>'
                               if _safe_url(m.group(2)) else m.group(1)), s)
    s = BOLD_RE.sub(lambda m: "<strong>" + (m.group(1) or m.group(2)) + "</strong>", s)
    s = DEL_RE.sub(r"<del>\1</del>", s)
    return ITAL_RE.sub(r"<em>\1</em>", s)


def _inline(s):
    out = []
    for part in CODE_SPLIT_RE.split(s):
        if len(part) > 2 and part.startswith("`") and part.endswith("`"):
            out.append("<code>" + _esc(part[1:-1]) + "</code>")
        else:
            out.append(_inline_plain(part))
    return "".join(out)


def _block_text(b):
    t = b["type"]
    if t == "p":
        return _plain(b["text"])
    if t == "list":
        return " ".join(_plain(it["text"]) for it in b["items"])
    if t == "table":
        return " ".join(_plain(c) for c in b["head"] + [c for r in b["rows"] for c in r])
    if t == "quote":
        return " ".join(_plain(p) for p in b["paras"])
    if t == "code":
        return b["text"]
    return ""


def extract_metrics(blocks):
    metrics, seen = [], set()
    sec = {"text": "（开头）", "anchor": "top"}

    def add(label, value, unit, method, source):
        label = re.sub(r"\s+", " ", label).strip()
        if len(label) < 2 or label in STOP_LABELS or label[-1].isdigit():
            return
        if not unit and re.fullmatch(r"[+-]?(?:19|20)\d{2}", value.replace(",", "")):
            return
        key = (label, value, unit, sec["anchor"])
        if key in seen:
            return
        seen.add(key)
        metrics.append({"label": label, "value_text": value, "unit": unit, "value": _to_float(value),
                        "method": method, "section": sec["text"], "anchor": sec["anchor"],
                        "source": source[:160]})

    def scan(text):
        for clause in [c.strip() for c in CLAUSE_RE.split(text) if c and c.strip()]:
            rest = clause
            for m in PAT_A.finditer(clause):
                add(m.group("label"), m.group("value"), m.group("unit") or "", "explicit", clause)
                rest = rest[:m.start()] + " " * (m.end() - m.start()) + rest[m.end():]
            for m in PAT_B.finditer(rest):
                add(m.group("label"), m.group("value"), m.group("unit"), "inferred", clause)

    for b in blocks:
        t = b["type"]
        if t == "heading":
            sec = {"text": b["text"], "anchor": b["id"]}
        elif t == "p":
            scan(_plain(b["text"]))
        elif t == "list":
            for it in b["items"]:
                scan(_plain(it["text"]))
        elif t == "quote":
            for p in b["paras"]:
                scan(_plain(p))
        elif t == "table":
            for row in b["rows"]:
                rowlabel = _plain(row[0]) if row else ""
                for j, cell in enumerate(row[1:], start=1):
                    m = CELL_RE.match(_plain(cell))
                    if not m:
                        continue
                    col = _plain(b["head"][j]) if j < len(b["head"]) else ""
                    add(" · ".join(x for x in (rowlabel, col) if x), m.group("value"), m.group("unit") or "",
                        "table", " | ".join(x for x in (rowlabel, col, _plain(cell)) if x))
    return metrics


def _stats(text, blocks, headings, sections):
    def count(kind):
        return sum(1 for b in blocks if b["type"] == kind)

    return {
        "headings": sum(1 for h in headings if not h["is_title"]),
        "sections": len(sections),
        "paragraphs": count("p"), "lists": count("list"), "tables": count("table"),
        "quotes": count("quote"), "code": count("code"),
        "images": len(IMG_RE.findall(text)), "links": len(LINK_RE.findall(text)),
        "chars": sum(_chars(_block_text(b)) for b in blocks),
    }


def _doc_quality(text, blocks, headings, metrics):
    n_head = sum(1 for h in headings if not h["is_title"])
    kinds = {b["type"] for b in blocks}
    mode = "markdown" if kinds & {"heading", "table", "list", "code", "quote"} else "text"
    inferred = sum(1 for m in metrics if m["method"] == "inferred")
    images = len(IMG_RE.findall(text))
    unsafe = sum(1 for m in LINK_RE.finditer(text) if not _safe_url(m.group(2)))
    warnings = []
    if not blocks:
        warnings.append("文档为空，未生成正文")
    if blocks and not headings:
        warnings.append("未检测到 # 标题，目录为空，内容按段落顺序呈现")
    if not metrics:
        warnings.append("未识别到可用指标（需要「名称：数值单位」、「名称 数值单位」或表格）")
    if inferred:
        warnings.append(f"{inferred} 个指标为推断识别（无冒号），请对照来源句复核")
    if images:
        warnings.append(f"{images} 个图片引用未加载（离线产物），已显示为占位")
    if unsafe:
        warnings.append(f"{unsafe} 个链接协议不安全（如 javascript:），已去除链接")
    if HTML_TAG_RE.search(text):
        warnings.append("原文含 HTML 标签，已按纯文本转义，不会生效")
    if not blocks or not metrics:
        confidence = "low"
    elif not n_head or inferred:
        confidence = "medium"
    else:
        confidence = "high"
    chips = [
        ("模式", mode), ("标题", n_head),
        ("段落", sum(1 for b in blocks if b["type"] == "p")),
        ("表格", sum(1 for b in blocks if b["type"] == "table")),
        ("列表", sum(1 for b in blocks if b["type"] == "list")),
        ("代码块", sum(1 for b in blocks if b["type"] == "code")),
        ("图片", f"{images} 未加载"), ("指标", len(metrics)), ("推断", inferred),
    ]
    return {"mode": mode, "confidence": confidence, "warnings": warnings[:6], "chips": chips}


def build_doc(text, name):
    blocks = parse_markdown(text)
    used, headings, title = set(), [], None
    for b in blocks:
        if b["type"] != "heading":
            continue
        b["id"] = _slug(b["text"], used)
        b["is_title"] = b["level"] == 1 and title is None
        if b["is_title"]:
            title = b["text"]
        headings.append(b)
    body_levels = [h["level"] for h in headings if not h["is_title"]]
    sec_level = min(body_levels) if body_levels else None
    sections, cur = [], None
    for b in blocks:
        if b["type"] == "heading":
            if not b["is_title"] and b["level"] == sec_level:
                cur = {"text": b["text"], "anchor": b["id"], "chars": 0}
                sections.append(cur)
            continue
        if cur is not None:
            cur["chars"] += _chars(_block_text(b))
    metrics = extract_metrics(blocks)
    return {"title": title or name, "source": name, "blocks": blocks, "headings": headings,
            "sections": sections, "metrics": metrics,
            "stats": _stats(text, blocks, headings, sections),
            "quality": _doc_quality(text, blocks, headings, metrics)}


def read_text(path):
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(enc).replace("\r\n", "\n")
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def profile_doc(path):
    p = Path(path)
    doc = build_doc(read_text(p), p.stem)
    st, q = doc["stats"], doc["quality"]
    return {"input": p.name, "mode": q["mode"], "sections": st["sections"], "headings": st["headings"],
            "tables": st["tables"], "metrics": len(doc["metrics"]),
            "inferred": sum(1 for m in doc["metrics"] if m["method"] == "inferred"),
            "confidence": q["confidence"], "recommend": "report",
            "reason": "auto: 文本/Markdown → report（报告页）"}
