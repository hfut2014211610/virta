// ADR-0009 flow-doc：DocModel → 语义化 DOM（<h*>/<a>/<table>/<pre>）。
// 正文复用 docmd 的 inlineHtml（已转义 + http(s)/mailto 白名单），不重复实现。
import type { DocModel } from '@virta/data-engine';
// 深路径导入：只进 report bundle，避免 data-engine index 把 score/insights/read(papaparse) 拉入（B15）
import { inlineHtml } from '../../data-engine/src/families/docmd.js';
import { html, raw } from './safe-html.js';

export function renderFlowDoc(box: HTMLElement, m: DocModel): void {
  const parts: string[] = ['<div class="flow-doc">'];
  if (m.metrics.length) {
    parts.push('<div class="fd-metrics">');
    for (const mt of m.metrics) {
      parts.push(html`<div class="fd-metric"><div class="fd-mlabel">${mt.label ?? '指标'}</div><div class="fd-mval">${mt.value_text}<small>${mt.unit}</small></div></div>`);
    }
    parts.push('</div>');
  }
  if (m.sections.length > 1) {
    parts.push(html`<nav class="fd-toc">${m.sections.map((s) => raw(html`<a href="#${s.anchor}">${s.text}</a>`))}</nav>`);
  }
  for (const b of m.blocks) {
    const bt = b as { type: string; id?: string; text?: string; level?: number; items?: { ordered: boolean; text: string }[]; head?: string[]; align?: string[]; rows?: string[][]; paras?: string[]; lang?: string };
    switch (bt.type) {
      case 'heading': {
        const lv = Math.min(4, Math.max(2, (bt.level ?? 2) + 1));
        parts.push(html`<h${lv}${bt.id ? raw(html` id="${bt.id}"`) : ''}>${raw(inlineHtml(bt.text ?? ''))}</h${lv}>`);
        break;
      }
      case 'p': {
        const img = /^!\[([^\]]*)\]\(([^)]*)\)/.exec((bt.text ?? '').trim());
        if (img) parts.push(html`<div class="fd-img">🖼 图片未内嵌（离线）：${img[1] || img[2] || '图片'}</div>`);
        else parts.push(html`<p>${raw(inlineHtml(bt.text ?? ''))}</p>`);
        break;
      }
      case 'list': {
        const ordered = bt.items?.[0]?.ordered;
        const tag = ordered ? 'ol' : 'ul';
        parts.push(`<${tag}>` + (bt.items ?? []).map((it) => html`<li>${raw(inlineHtml(it.text))}</li>`).join('') + `</${tag}>`);
        break;
      }
      case 'table': {
        parts.push(html`<div class="fd-twrap"><table><thead><tr>${(bt.head ?? []).map((h) => raw(html`<th>${raw(inlineHtml(h))}</th>`))}</tr></thead><tbody>${raw(
          (bt.rows ?? []).map((r) => html`<tr>${r.map((c, ci) => raw(html`<td class="${bt.align?.[ci] === 'right' ? 'num' : ''}">${raw(inlineHtml(c))}</td>`))}</tr>`).join(''),
        )}</tbody></table></div>`);
        break;
      }
      case 'quote': parts.push(html`<blockquote>${(bt.paras ?? []).map((p) => raw(html`<p>${raw(inlineHtml(p))}</p>`))}</blockquote>`); break;
      case 'code': parts.push(html`<pre><code>${bt.text ?? ''}</code></pre>`); break;
      case 'hr': parts.push('<hr>'); break;
      default: if (bt.text) parts.push(html`<p>${raw(inlineHtml(bt.text))}</p>`);
    }
  }
  parts.push('</div>');
  box.innerHTML = html`${raw(parts.join(''))}`;
}
