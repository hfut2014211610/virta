// compose 单文件 HTML：多面板网格 + 联动筛选条 + 内联首屏 SVG + payload + 运行期。
import { buildCss } from '@virta/design-system';
import type { Theme } from '@virta/contracts';
import type { ComposePayload } from './runtime-compose.js';

export interface ComposeHtmlOpts {
  payload: ComposePayload;
  /** 每面板首屏 SVG（与 panels 同序） */
  svgs: string[];
  runtimeJs: string;
  theme: Theme;
}

export function composeHtml(o: ComposeHtmlOpts): string {
  const { payload, svgs, runtimeJs, theme } = o;
  const css = buildCss({ fonts: true });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const grid = payload.layout === 'grid';
  const panels = payload.panels.map((p, i) => {
    const title = p.spec.text?.title ?? p.id;
    const ins = p.insights.slice(0, 2).map((x) => `<span class="pins">${esc(x.text)}</span>`).join('');
    const style = grid ? `grid-column:span ${Math.min(12, Math.max(1, p.w ?? 6))}` : '';
    return `<section class="panel" style="${style}">
      ${p.question ? `<div class="pq">${esc(p.question)}</div>` : ''}
      <h3>${esc(title)}</h3>
      ${ins ? `<div class="pins-row">${ins}</div>` : ''}
      <div class="pbox" id="pbox-${i}">${svgs[i]}</div>
    </section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(payload.title ?? 'Virta 组合页')} · Virta</title>
<style>${css}
#virta-app{max-width:${grid ? 1440 : 960}px;margin:0 auto;padding:24px}
.toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between}
.toolbar button{border:1px solid var(--line);background:var(--paper);border-radius:8px;padding:5px 11px;font:12px var(--body);color:var(--muted);cursor:pointer}
.eyebrow{font:11px var(--mono);color:var(--acc);letter-spacing:.12em;text-transform:uppercase}
#flinks{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.fchip{border:1px solid var(--acc);background:none;border-radius:99px;padding:3px 12px;font:11.5px var(--body);color:var(--acc);cursor:pointer}
.pgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-top:14px}
.panel{border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:var(--paper);min-width:0}
.panel h3{font:600 15px var(--body);color:var(--ink);margin:0 0 4px}
.pq{font:12px var(--mono);color:var(--acc);margin-bottom:2px}
.pins-row{display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 6px}
.pins{font:11.5px var(--body);color:var(--muted)}
.pins::before{content:'◆ ';color:var(--acc)}
.pbox{position:relative}
.pbox svg{display:block;cursor:pointer}
.perr{font:12px var(--mono);color:var(--faint);padding:40px 0;text-align:center}
.story .panel{margin-bottom:16px}
@media(max-width:900px){.panel{grid-column:span 12 !important}}
@media print{.toolbar,#flinks{display:none}}
</style></head>
<body data-theme="${theme}">
<div id="virta-app" class="${grid ? 'grid-page' : 'story'}">
  <div class="toolbar">
    <span class="eyebrow">VIRTA · COMPOSE · ${theme.toUpperCase()}</span>
    <span class="toolbar"><button id="btn-theme" title="切换主题">☀/☾</button></span>
  </div>
  <h1 style="font:600 34px/1.2 var(--display);color:var(--ink);margin:10px 0 4px">${esc(payload.title ?? '')}</h1>
  ${payload.links.length ? `<div id="flinks" title="点击图元筛选"></div>` : '<div id="flinks"></div>'}
  <div class="${grid ? 'pgrid' : 'story'}">
${panels}
  </div>
</div>
<script>window.__VIRTA__=${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>
<script>${runtimeJs}</script>
</body></html>`;
}
