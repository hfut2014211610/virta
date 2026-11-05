// docmd.py 移植：文本/Markdown 解析 + 指标抽取 + 质量（report 视图 golden 对拍源）。
const NUM = '[+-]?[¥$€￥]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|[+-]?[¥$€￥]?\\d+(?:\\.\\d+)?';
const UNIT = '个百分点|百分点|亿元|万元|万单|万人|个月|小时|分钟|天|%|‰|ms|秒|GB|MB|TB|KB|pt|倍|亿|万|元|单|人|次|个|家|台|x';
const PAT_A = new RegExp(
  `(?<label>[一-鿿A-Za-z][一-鿿A-Za-z0-9 /·()（）\\-_]{0,23}?)\\s*[：:]\\s*` +
  `(?<value>${NUM})\\s*(?<unit>${UNIT})?(?![A-Za-z0-9])(?![-/.]\\d)`, 'g');
const PAT_B = new RegExp(
  `(?<label>[一-鿿A-Za-z][一-鿿A-Za-z/· ]{1,11}?)\\s*(?:为|达到|达|约|共|是|仅|至)?\\s*` +
  `(?<value>${NUM})\\s*(?<unit>${UNIT})(?![A-Za-z])`, 'g');
const CELL_RE = new RegExp(`^\\s*(?<value>${NUM})\\s*(?<unit>${UNIT})?\\s*$`);
const CLAUSE_RE = /[，；;。！？!?、]+|(?<!\d),+|,+(?!\d)/g;
const FENCE_RE = /^\s*(```+|~~~+)\s*([\w+#.\-]*)\s*$/;
const HEAD_RE = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMG_RE_ONE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const LINK_RE_ONE = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const CODE_SPLIT_RE = /(`[^`]+`)/g;
const BOLD_RE = /\*\*(.+?)\*\*|__(.+?)__/g;
const ITAL_RE = /(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g;
const DEL_RE = /~~(.+?)~~/g;
const SAFE_URL_RE = /^(?:https?:\/\/|mailto:|#|\.{0,2}\/|[^:/?#]*$)/i;
const HTML_TAG_RE = /<[A-Za-z/!][^>]*>/;
const STOP_LABELS = new Set(['注意', '说明', '备注', '结论', '提示', '示例', '版本', '时间', '日期', '来源', '更新', '附注', '注', '例如', '截至']);

const escHtml = (s: unknown) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const unescapeHtml = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));

const isCjk = (ch: string) =>
  (ch >= '一' && ch <= '鿿') || (ch >= '　' && ch <= '〿') || (ch >= '＀' && ch <= '￯');

function joinLines(lines: string[]): string {
  let out = '';
  for (let ln of lines) {
    ln = ln.trim();
    if (!ln) continue;
    if (!out) out = ln;
    else out += (isCjk(out[out.length - 1]) || isCjk(ln[0]) ? '' : ' ') + ln;
  }
  return out;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const alignOf = (cell: string) => {
  const c = cell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'ctr';
  return c.endsWith(':') ? 'num' : '';
};

function slug(text: string, used: Set<string>): string {
  const base = text.trim().toLowerCase().replace(/[^\w一-鿿-]+/g, '-').replace(/^-+|-+$/g, '') || 'sec';
  let s = base, k = 2;
  while (used.has(s)) { s = `${base}-${k}`; k += 1; }
  used.add(s);
  return s;
}

const plain = (s: string) =>
  s.replace(IMG_RE, '')
    .replace(LINK_RE, (_m, g1) => g1)
    .replace(/`/g, '')
    .replace(/\*\*|__|~~/g, '')
    .replace(/\*/g, '').trim();

const chars = (s: string) => s.replace(/\s+/g, '').length;
const safeUrl = (url: string) => SAFE_URL_RE.test(unescapeHtml(url));

function toFloat(v: string): number | null {
  const f = Number(v.replace(/[¥$€￥,]/g, ''));
  return Number.isNaN(f) ? null : f;
}

function looksLikeMarkdown(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (HEAD_RE.test(ln) || FENCE_RE.test(ln) || QUOTE_RE.test(ln) || HR_RE.test(ln) || LIST_RE.test(ln)) return true;
    if (ln.includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && TABLE_SEP_RE.test(lines[i + 1])) return true;
  }
  return false;
}

export type DocBlock = Record<string, unknown> & { type: string };

export function parseMarkdown(text: string): DocBlock[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const isMd = looksLikeMarkdown(lines);
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { blocks.push({ type: 'p', text: joinLines(para) }); para = []; }
  };
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (!line.trim()) { flush(); i += 1; continue; }
    const fm = FENCE_RE.exec(line);
    if (fm) {
      flush();
      const marker = fm[1];
      const body: string[] = [];
      i += 1;
      while (i < n && !lines[i].trim().startsWith(marker)) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: 'code', lang: fm[2], text: body.join('\n') });
      continue;
    }
    const hm = HEAD_RE.exec(line);
    if (hm) {
      flush();
      blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() });
      i += 1;
      continue;
    }
    if (HR_RE.test(line)) { flush(); blocks.push({ type: 'hr' }); i += 1; continue; }
    if (QUOTE_RE.test(line)) {
      flush();
      const paras: string[] = [];
      let cur: string[] = [];
      while (i < n && QUOTE_RE.test(lines[i])) {
        const inner = QUOTE_RE.exec(lines[i])![1];
        if (inner.trim()) cur.push(inner);
        else if (cur.length) { paras.push(joinLines(cur)); cur = []; }
        i += 1;
      }
      if (cur.length) paras.push(joinLines(cur));
      blocks.push({ type: 'quote', paras });
      continue;
    }
    if (line.includes('|') && i + 1 < n && lines[i + 1].includes('|') && TABLE_SEP_RE.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const w = head.length;
      const align = splitRow(lines[i + 1]).map(alignOf).concat(Array(w).fill('')).slice(0, w);
      const rows: string[][] = [];
      i += 2;
      while (i < n && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]).concat(Array(w).fill('')).slice(0, w));
        i += 1;
      }
      blocks.push({ type: 'table', head, align, rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      flush();
      const items: { level: number; ordered: boolean; text: string }[] = [];
      while (i < n) {
        const ln = lines[i];
        if (!ln.trim()) {
          let j = i + 1;
          while (j < n && !lines[j].trim()) j += 1;
          if (j < n && LIST_RE.test(lines[j])) { i = j; continue; }
          break;
        }
        const m = LIST_RE.exec(ln);
        if (m) {
          items.push({
            level: Math.floor(m[1].replace(/\t/g, '    ').length / 2),
            ordered: /\d/.test(m[2][0]), text: m[3].trim(),
          });
        } else if (items.length && (ln[0] === ' ' || ln[0] === '\t')) {
          items[items.length - 1].text += ' ' + ln.trim();
        } else break;
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    if (isMd) para.push(line);
    else blocks.push({ type: 'p', text: joinLines([line]) });
    i += 1;
  }
  flush();
  return blocks;
}

function inlinePlain(s: string): string {
  s = escHtml(s);
  s = s.replace(IMG_RE, (_m, g1) => `<span class="img-ph">🖼 ${g1 || '图片'} · 离线未加载</span>`);
  s = s.replace(LINK_RE, (_m, g1, g2) =>
    safeUrl(g2) ? `<a href="${g2}" target="_blank" rel="noopener noreferrer">${g1}</a>` : g1);
  s = s.replace(BOLD_RE, (_m, g1, g2) => '<strong>' + (g1 || g2) + '</strong>');
  s = s.replace(DEL_RE, '<del>$1</del>');
  return s.replace(ITAL_RE, '<em>$1</em>');
}

export function inlineHtml(s: string): string {
  const out: string[] = [];
  for (const part of s.split(CODE_SPLIT_RE)) {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) out.push('<code>' + escHtml(part.slice(1, -1)) + '</code>');
    else out.push(inlinePlain(part));
  }
  return out.join('');
}

function blockText(b: DocBlock): string {
  const t = b['type'];
  if (t === 'p') return plain(b['text'] as string);
  if (t === 'list') return (b['items'] as { text: string }[]).map((it) => plain(it.text)).join(' ');
  if (t === 'table') {
    const cells = [...(b['head'] as string[]), ...(b['rows'] as string[][]).flat()];
    return cells.map(plain).join(' ');
  }
  if (t === 'quote') return (b['paras'] as string[]).map(plain).join(' ');
  if (t === 'code') return b['text'] as string;
  return '';
}

export interface DocMetric {
  label: string; value_text: string; unit: string; value: number | null;
  method: string; section: string; anchor: string; source: string;
}

export function extractMetrics(blocks: DocBlock[]): DocMetric[] {
  const metrics: DocMetric[] = [];
  const seen = new Set<string>();
  let sec = { text: '（开头）', anchor: 'top' };
  const add = (label: string, value: string, unit: string, method: string, source: string) => {
    label = label.replace(/\s+/g, ' ').trim();
    if (label.length < 2 || STOP_LABELS.has(label) || /\d/.test(label[label.length - 1])) return;
    if (!unit && /^[+-]?(?:19|20)\d{2}$/.test(value.replace(/,/g, ''))) return;
    const key = `${label}\x00${value}\x00${unit}\x00${sec.anchor}`;
    if (seen.has(key)) return;
    seen.add(key);
    metrics.push({
      label, value_text: value, unit, value: toFloat(value),
      method, section: sec.text, anchor: sec.anchor, source: source.slice(0, 160),
    });
  };
  const scan = (text: string) => {
    for (const clause of text.split(CLAUSE_RE).map((c) => c.trim()).filter(Boolean)) {
      let rest = clause;
      for (const m of clause.matchAll(PAT_A)) {
        add(m.groups!.label, m.groups!.value, m.groups!.unit ?? '', 'explicit', clause);
        rest = rest.slice(0, m.index!) + ' '.repeat(m[0].length) + rest.slice(m.index! + m[0].length);
      }
      for (const m of rest.matchAll(PAT_B)) {
        add(m.groups!.label, m.groups!.value, m.groups!.unit ?? '', 'inferred', clause);
      }
    }
  };
  for (const b of blocks) {
    const t = b['type'];
    if (t === 'heading') sec = { text: b['text'] as string, anchor: b['id'] as string };
    else if (t === 'p') scan(plain(b['text'] as string));
    else if (t === 'list') for (const it of b['items'] as { text: string }[]) scan(plain(it.text));
    else if (t === 'quote') for (const p of b['paras'] as string[]) scan(plain(p));
    else if (t === 'table') {
      const head = b['head'] as string[];
      for (const row of b['rows'] as string[][]) {
        const rowlabel = row.length ? plain(row[0]) : '';
        row.slice(1).forEach((cell, jx) => {
          const j = jx + 1;
          const m = CELL_RE.exec(plain(cell));
          if (!m) return;
          const col = j < head.length ? plain(head[j]) : '';
          add([rowlabel, col].filter(Boolean).join(' · '), m.groups!.value, m.groups!.unit ?? '',
            'table', [rowlabel, col, plain(cell)].filter(Boolean).join(' | '));
        });
      }
    }
  }
  return metrics;
}

function docStats(text: string, blocks: DocBlock[], headings: DocBlock[], sections: unknown[]) {
  const count = (kind: string) => blocks.filter((b) => b['type'] === kind).length;
  return {
    headings: headings.filter((h) => !h['is_title']).length,
    sections: sections.length,
    paragraphs: count('p'), lists: count('list'), tables: count('table'),
    quotes: count('quote'), code: count('code'),
    images: (text.match(IMG_RE) ?? []).length, links: (text.match(LINK_RE) ?? []).length,
    chars: blocks.reduce((a, b) => a + chars(blockText(b)), 0),
  };
}

function docQuality(text: string, blocks: DocBlock[], headings: DocBlock[], metrics: DocMetric[]) {
  const nHead = headings.filter((h) => !h['is_title']).length;
  const kinds = new Set(blocks.map((b) => b['type']));
  const mode = ['heading', 'table', 'list', 'code', 'quote'].some((k) => kinds.has(k)) ? 'markdown' : 'text';
  const inferred = metrics.filter((m) => m.method === 'inferred').length;
  const images = (text.match(IMG_RE) ?? []).length;
  let unsafe = 0;
  for (const m of text.matchAll(LINK_RE)) if (!safeUrl(m[2])) unsafe += 1;
  const warnings: string[] = [];
  if (!blocks.length) warnings.push('文档为空，未生成正文');
  if (blocks.length && !headings.length) warnings.push('未检测到 # 标题，目录为空，内容按段落顺序呈现');
  if (!metrics.length) warnings.push('未识别到可用指标（需要「名称：数值单位」、「名称 数值单位」或表格）');
  if (inferred) warnings.push(`${inferred} 个指标为推断识别（无冒号），请对照来源句复核`);
  if (images) warnings.push(`${images} 个图片引用未加载（离线产物），已显示为占位`);
  if (unsafe) warnings.push(`${unsafe} 个链接协议不安全（如 javascript:），已去除链接`);
  if (HTML_TAG_RE.test(text)) warnings.push('原文含 HTML 标签，已按纯文本转义，不会生效');
  const confidence = !blocks.length || !metrics.length ? 'low' : !nHead || inferred ? 'medium' : 'high';
  const chips: [string, unknown][] = [
    ['模式', mode], ['标题', nHead],
    ['段落', blocks.filter((b) => b['type'] === 'p').length],
    ['表格', blocks.filter((b) => b['type'] === 'table').length],
    ['列表', blocks.filter((b) => b['type'] === 'list').length],
    ['代码块', blocks.filter((b) => b['type'] === 'code').length],
    ['图片', `${images} 未加载`], ['指标', metrics.length], ['推断', inferred],
  ];
  return { mode, confidence, warnings: warnings.slice(0, 6), chips };
}

export interface DocModel {
  title: string; source: string; blocks: DocBlock[]; headings: DocBlock[];
  sections: { text: string; anchor: string; chars: number }[];
  metrics: DocMetric[]; stats: ReturnType<typeof docStats>;
  quality: ReturnType<typeof docQuality>;
}

export function buildDoc(text: string, name: string): DocModel {
  const blocks = parseMarkdown(text);
  const used = new Set<string>();
  const headings: DocBlock[] = [];
  let title: string | null = null;
  for (const b of blocks) {
    if (b['type'] !== 'heading') continue;
    b['id'] = slug(b['text'] as string, used);
    b['is_title'] = b['level'] === 1 && title === null;
    if (b['is_title']) title = b['text'] as string;
    headings.push(b);
  }
  const bodyLevels = headings.filter((h) => !h['is_title']).map((h) => h['level'] as number);
  const secLevel = bodyLevels.length ? Math.min(...bodyLevels) : null;
  const sections: DocModel['sections'] = [];
  let cur: DocModel['sections'][0] | null = null;
  for (const b of blocks) {
    if (b['type'] === 'heading') {
      if (!b['is_title'] && b['level'] === secLevel) {
        cur = { text: b['text'] as string, anchor: b['id'] as string, chars: 0 };
        sections.push(cur);
      }
      continue;
    }
    if (cur !== null) cur.chars += chars(blockText(b));
  }
  const metrics = extractMetrics(blocks);
  return {
    title: title ?? name, source: name, blocks, headings, sections, metrics,
    stats: docStats(text, blocks, headings, sections),
    quality: docQuality(text, blocks, headings, metrics),
  };
}

// 保持导出（模板端/校验端会用到）
export { IMG_RE_ONE, LINK_RE_ONE, plain, blockText, inlinePlain };
