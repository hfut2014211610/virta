// ADR-0009 flow-doc：DocModel → 语义化 DOM（<h*>/<a>/<table>/<pre>）。
// 正文复用 docmd 的 inlineHtml（已转义 + http(s)/mailto 白名单），不重复实现。
import type { DocModel } from '@virta/data-engine';
import { inlineHtml } from '@virta/data-engine';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderFlowDoc(box: HTMLElement, m: DocModel): void {
  const parts: string[] = ['<div class="flow-doc">'];
  if (m.metrics.length) {
    parts.push('<div class="fd-metrics">');
    for (const mt of m.metrics) {
      parts.push(`<div class="fd-metric"><div class="fd-mlabel">${esc(mt.label ?? '指标')}</div><div class="fd-mval">${esc(mt.value_text)}<small>${esc(mt.unit)}</small></div></div>`);
    }
    parts.push('</div>');
  }
  if (m.sections.length > 1) {
    parts.push('<nav class="fd-toc">' + m.sections.map((s) => `<a href="#${esc(s.anchor)}">${esc(s.text)}</a>`).join('') + '</nav>');
  }
  for (const b of m.blocks) {
    const bt = b as { type: string; id?: string; text?: string; level?: number; items?: { ordered: boolean; text: string }[]; head?: string[]; align?: string[]; rows?: string[][]; paras?: string[]; lang?: string };
    switch (bt.type) {
      case 'heading': {
        const lv = Math.min(4, Math.max(2, (bt.level ?? 2) + 1));
        parts.push(`<h${lv}${bt.id ? ` id="${esc(bt.id)}"` : ''}>${inlineHtml(bt.text ?? '')}</h${lv}>`);
        break;
      }
      case 'p': {
        const img = /^!\[([^\]]*)\]\(([^)]*)\)/.exec((bt.text ?? '').trim());
        if (img) parts.push(`<div class="fd-img">🖼 图片未内嵌（离线）：${esc(img[1] || img[2] || '图片')}</div>`);
        else parts.push(`<p>${inlineHtml(bt.text ?? '')}</p>`);
        break;
      }
      case 'list': {
        const ordered = bt.items?.[0]?.ordered;
        const tag = ordered ? 'ol' : 'ul';
        parts.push(`<${tag}>` + (bt.items ?? []).map((it) => `<li>${inlineHtml(it.text)}</li>`).join('') + `</${tag}>`);
        break;
      }
      case 'table': {
        parts.push('<div class="fd-twrap"><table><thead><tr>' + (bt.head ?? []).map((h) => `<th>${inlineHtml(h)}</th>`).join('') + '</tr></thead><tbody>'
          + (bt.rows ?? []).map((r) => '<tr>' + r.map((c, ci) => `<td class="${(bt.align?.[ci] === 'right') ? 'num' : ''}">${inlineHtml(c)}</td>`).join('') + '</tr>').join('')
          + '</tbody></table></div>');
        break;
      }
      case 'quote': parts.push('<blockquote>' + (bt.paras ?? []).map((p) => `<p>${inlineHtml(p)}</p>`).join('') + '</blockquote>'); break;
      case 'code': parts.push(`<pre><code>${esc(bt.text ?? '')}</code></pre>`); break;
      case 'hr': parts.push('<hr>'); break;
      default: if (bt.text) parts.push(`<p>${inlineHtml(bt.text)}</p>`);
    }
  }
  parts.push('</div>');
  box.innerHTML = parts.join('');
}
