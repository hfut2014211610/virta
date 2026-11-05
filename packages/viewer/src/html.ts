// 单文件 HTML 组装：设计 token CSS + 内联字体 + 首屏静态 SVG + payload JSON + 运行期 bundle。
// 壳层布局对齐 legacy vizscape 演示页：header（eyebrow+标题+主题 seg）→ 标签化工具栏（trow）→ 卡片。
import { buildCss } from '@virta/design-system';
import { THEME_IDS, type Theme } from '@virta/contracts';
import { ZH } from './i18n/zh-CN.js';
import type { Payload } from './runtime.js';

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
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}" data-palette="${payload.spec.palette ?? 'signal'}"><head><meta charset="utf-8">
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
@media(max-width:720px){body{padding:14px}}
@media print{header .seg,#toolbar,#opt-row{display:none}#chart-box svg{width:100%}}
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
    <span class="subseg"><span class="label">${ZH.export}</span><div class="seg" id="exp-menu"><button type="button" data-exp="svg">SVG</button><button type="button" data-exp="png">PNG</button><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="spec">spec</button></div><button class="toggle" id="btn-opts" type="button">${ZH.settings}</button><button class="toggle" id="btn-full" type="button">${ZH.fullscreen}</button></span>
  </div>
  <div class="trow" id="opt-row"></div>
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
<script>window.__VIRTA__=${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>
<script>${runtimeJs}</script>
</body></html>`;
}
