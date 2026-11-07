// 单文件 HTML 组装：设计 token CSS + 内联字体 + 首屏静态 SVG + payload JSON + 运行期 bundle。
// 壳层布局对齐 legacy vizscape 演示页：header（eyebrow+标题+主题 seg）→ 标签化工具栏（trow）→ 卡片。
import { createHash } from 'node:crypto';
import { buildCss } from '@virta/design-system';
import { THEME_IDS, type Theme } from '@virta/contracts';
import { ZH } from './i18n/zh-CN.js';
import type { Payload } from './runtime.js';

/** ADR-0013 CSP 纵深防御：内联脚本按 sha256 白名单，inline 事件处理器无 'unsafe-inline' 直接拦截。 */
const sha256B64 = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64');
export function cspMeta(...scripts: string[]): string {
  const hashes = scripts.map((s) => `'sha256-${sha256B64(s)}'`).join(' ');
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hashes}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'">`;
}

export interface SingleFileOpts {
  payload: Payload;
  /** 首屏 SVG（服务端/CLI 已渲染） */
  svg: string;
  /** 运行期 JS bundle（viewer/dist/<view>.js 或 esbuild 产物） */
  runtimeJs: string;
  theme: Theme;
}

export function singleFileHtml(o: SingleFileOpts): string {
  const { payload, svg, runtimeJs, theme } = o;
  const t = payload.spec.text ?? {};
  const css = buildCss({ fonts: true });
  const confBadge = ZH.confidence[payload.quality.confidence] ?? `● ${payload.quality.confidence}`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const viewName = payload.viewTitle ?? payload.spec.view;
  const h1 = t.title && viewName && t.title !== viewName ? `${esc(t.title)} <em>· ${esc(viewName)}</em>` : esc(t.title ?? viewName);
  const payloadScript = `window.__VIRTA__=${JSON.stringify(payload).replace(/</g, '\\u003c')};`;
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}" data-palette="${payload.spec.palette ?? 'signal'}"><head><meta charset="utf-8">
${cspMeta(payloadScript, runtimeJs)}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title ?? 'Virta')} · Virta</title>
<style>${css}
body{padding:18px 28px}
#virta-app{max-width:1180px;margin:0 auto}
#chart-box{position:relative;min-height:360px}
#chart-box svg{display:block}
.lg-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:none;border-radius:99px;padding:3px 10px;margin:0 6px 6px 0;font:11px var(--body);color:var(--muted);cursor:pointer}
.lg-chip i{width:9px;height:9px;border-radius:2px}
.lg-chip.off{opacity:.4;text-decoration:line-through}
#toolbar{margin:8px 0 0;box-shadow:var(--shadow)}
#toolbar .seg,#opt-row .seg{box-shadow:none}
#toolbar .subseg,#opt-row .subseg{display:inline-flex;flex-wrap:nowrap;gap:10px;align-items:center}
#opt-row{display:none;margin:10px 0 0;box-shadow:var(--shadow)}
#opt-row.open{display:flex}
#opt-row .glab{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--faint);text-transform:uppercase;border-left:1px dashed var(--line2);padding-left:10px;margin-left:2px}
#opt-row .glab:first-child{border-left:0;padding-left:0;margin-left:0}
.opt-num{width:64px;appearance:none;border:1px solid var(--line2);background:var(--paper);color:var(--ink);border-radius:99px;padding:7px 12px;font:12px var(--mono)}
.opt-text{width:120px;appearance:none;border:1px solid var(--line2);background:var(--paper);color:var(--ink);border-radius:99px;padding:7px 12px;font:12px var(--body)}
.opt-sel{appearance:none;border:1px solid var(--line2);background:var(--paper);color:var(--muted);border-radius:99px;padding:6px 10px;font:11px var(--body);cursor:pointer}
.opt-sel:hover{color:var(--acc);border-color:var(--acc)}
#opt-row .opt-sub{display:inline-flex;flex-wrap:nowrap;gap:6px;align-items:center}
#opt-row .opt-sub>label{font:11px var(--body);color:var(--muted);white-space:nowrap}
.insights{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0 0}
.insights span{font:12.5px var(--body);color:var(--muted)}
.insights span::before{content:'◆ ';color:var(--acc)}
.foot{display:flex;justify-content:space-between;font:11px var(--mono);color:var(--faint);margin-top:12px}
#detail{font:12px var(--mono);color:var(--faint);min-height:18px}
details.fold{margin-top:14px}
details.fold summary{cursor:pointer;font:12.5px var(--body);color:var(--muted)}
#datatable table{border-collapse:collapse;width:100%;font:12px var(--mono)}
#datatable th,#datatable td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:left;color:var(--muted)}
#datatable th.num,#datatable td.num{text-align:right}
.render-err{display:grid;place-items:center;min-height:320px;text-align:center;color:var(--warn);font:14px var(--body)}
.render-err small{color:var(--faint);font:11px var(--mono)}
/* ADR-0009 流式视图 DOM（flow-doc / flow-table） */
#chart-box .flow-doc{max-width:760px;margin:0 auto;padding:8px 4px;font:14px/1.75 var(--body)}
.flow-doc h2,.flow-doc h3,.flow-doc h4{font-family:var(--display);margin:1.1em 0 .4em;color:var(--ink)}
.flow-doc p{margin:.3em 0;color:var(--muted)}
.flow-doc a{color:var(--acc)}
.fd-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:10px 0}
.fd-metric{background:var(--grid);border-radius:10px;padding:10px 12px}
.fd-mlabel{font:11px var(--mono);color:var(--muted)}
.fd-mval{font:600 20px var(--display);color:var(--ink)}
.fd-mval small{font:11px var(--body);color:var(--faint);margin-left:4px}
.fd-toc{display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.fd-toc a{font:12.5px var(--body);color:var(--acc);text-decoration:none}
.fd-toc a:hover{text-decoration:underline}
.flow-doc table{border-collapse:collapse;width:100%;font:12px var(--mono);margin:8px 0}
.flow-doc th,.flow-doc td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:left;color:var(--muted)}
.flow-doc th{color:var(--ink);font-weight:600;background:var(--grid)}
.flow-doc td.num{text-align:right}
.flow-doc ul,.flow-doc ol{color:var(--muted);margin:.3em 0;padding-left:1.6em}
.flow-doc blockquote{border-left:3px solid var(--acc);margin:.4em 0;padding:2px 12px;color:var(--faint)}
.flow-doc pre{background:var(--grid);border-radius:8px;padding:10px 12px;font:11.5px var(--mono);overflow:auto;color:var(--muted)}
.flow-doc hr{border:none;border-top:1px solid var(--line);margin:12px 0}
.fd-img{border:1px dashed var(--line2);border-radius:8px;padding:8px 12px;margin:6px 0;font:11px var(--mono);color:var(--faint)}
.img-ph{font:11px var(--mono);color:var(--faint)}
#chart-box .flow-table{font:12px var(--mono)}
.ft-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.ft-q{flex:0 1 220px;padding:5px 9px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font:12px var(--body)}
.ft-f{padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--muted);font:11px var(--body);max-width:150px}
.ft-badge{margin-left:auto;font:11px var(--mono);color:var(--faint)}
.ft-wrap{max-height:70vh;overflow:auto;border:1px solid var(--line);border-radius:8px}
.flow-table table{border-collapse:collapse;width:100%}
.flow-table th{position:sticky;top:0;background:var(--paper);color:var(--ink);font-weight:600;text-align:left;padding:7px 10px;border-bottom:1.5px solid var(--ink);white-space:nowrap;cursor:pointer;user-select:none;z-index:1}
.flow-table th.num{text-align:right}
.flow-table th[data-sort="asc"] .ft-si::after{content:" ↑"}
.flow-table th[data-sort="desc"] .ft-si::after{content:" ↓"}
.flow-table td{border-bottom:1px solid var(--line);padding:5px 10px;color:var(--muted)}
.flow-table td.num{text-align:right}
.flow-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--grid) 45%,transparent)}
.flow-table tr.ft-head td{font-weight:600;color:var(--ink);background:color-mix(in srgb,var(--acc) 10%,transparent)}
.flow-table tr.ft-tone-danger td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.flow-table tr.ft-tone-warn td:first-child{box-shadow:inset 3px 0 0 #d99a06}
.flow-table tr.ft-tone-ok td:first-child{box-shadow:inset 3px 0 0 #16a34a}
.flow-table tr.ft-tone-info td:first-child{box-shadow:inset 3px 0 0 var(--acc)}
.flow-table a{color:var(--acc)}
@media(max-width:720px){body{padding:14px}}
@media print{header .seg,#toolbar,#opt-row,#detail,details.fold,.ft-bar{display:none!important}#chart-box svg{width:100%}
.ft-wrap{max-height:none;overflow:visible;border:none}
.flow-table thead{display:table-header-group}.flow-table tbody tr{break-inside:avoid}
.flow-doc h2,.flow-doc h3,.flow-doc h4{break-after:avoid}
.flow-doc tr,.flow-doc blockquote,.flow-doc pre{break-inside:avoid}}
@media(prefers-reduced-motion:no-preference){.lg-chip{transition:opacity .15s}}
</style></head>
<body data-theme="${theme}">
<div id="virta-app">
  <header>
    <div>
      <div class="eyebrow">${ZH.eyebrow} · ${esc(payload.spec.view)} · ${theme.toUpperCase()}</div>
      <h1>${h1}</h1>
      ${t.subtitle ? `<p class="subtitle">${esc(t.subtitle)}</p>` : ''}
    </div>
    <div class="seg" id="theme-seg">${THEME_IDS.map((t) => `<button type="button" data-t="${t}"${t === theme ? ' class="on"' : ''}>${ZH.themeNames[t]}</button>`).join('')}</div>
  </header>
  ${payload.insights.length ? `<div class="insights">${payload.insights.slice(0, 3).map((i) => `<span>${esc(i.text)}</span>`).join('')}</div>` : ''}
  <div class="trow" id="toolbar">
    <span id="quick-segs" style="display:contents"></span>
    <span class="spacer"></span>
    <span class="subseg"><span class="label">${ZH.export}</span><div class="seg" id="exp-menu"><button type="button" data-exp="svg">SVG</button><button type="button" data-exp="png">PNG</button><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="spec">spec</button></div><button class="toggle" id="btn-full" type="button">${ZH.fullscreen}</button></span>
  </div>
  <div class="trow open" id="opt-row"></div>
  <div class="card" style="margin-top:10px">
    <div id="legend"></div>
    <div id="chart-box">${svg}<div id="tooltip" aria-live="polite"></div></div>
    <div id="detail">—</div>
  </div>
  <div class="foot"><span>${esc([t.source, t.unit].filter(Boolean).join(' · '))}</span><span>${confBadge}</span></div>
  <details class="fold"><summary>${ZH.dataTable}</summary><div id="datatable"></div></details>
  <details class="fold"><summary>${ZH.qualityReport}</summary><div style="font:12px var(--mono);color:var(--muted)">
    <p>${ZH.mapping}：${esc(JSON.stringify(payload.quality.mapping))}</p>
    ${payload.quality.issues.map((i) => `<p style="color:var(--${i.level === 'error' ? 'neg' : i.level === 'warn' ? 'warn' : 'faint'})">· ${esc(i.message)}</p>`).join('') || `<p>${ZH.noIssues}</p>`}
  </div></details>
</div>
<script>${payloadScript}</script>
<script>${runtimeJs}</script>
</body></html>`;
}
