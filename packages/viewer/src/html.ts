// 单文件 HTML 组装：设计 token CSS + 内联字体 + 首屏静态 SVG + payload JSON + 运行期 bundle。
import { buildCss } from '@virta/design-system';
import type { Payload } from './runtime.js';

export interface SingleFileOpts {
  payload: Payload;
  /** 首屏 SVG（服务端/CLI 已渲染） */
  svg: string;
  /** 运行期 JS bundle（viewer/dist/<view>.js 或 esbuild 产物） */
  runtimeJs: string;
  theme: 'light' | 'dark';
}

export function singleFileHtml(o: SingleFileOpts): string {
  const { payload, svg, runtimeJs, theme } = o;
  const t = payload.spec.text ?? {};
  const css = buildCss({ fonts: true });
  const confBadge = payload.quality.confidence === 'high' ? '● 可信度 高'
    : payload.quality.confidence === 'medium' ? '● 可信度 中' : '● 可信度 低';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title ?? 'Virta')} · Virta</title>
<style>${css}
#chart-box{position:relative;min-height:360px}
#chart-box svg{display:block}
#tooltip{position:absolute;display:none;pointer-events:none;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:12px var(--mono);color:var(--ink);box-shadow:0 4px 18px rgba(0,0,0,.12);z-index:5}
#tooltip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
.lg-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:none;border-radius:99px;padding:3px 10px;margin:0 6px 6px 0;font:11px var(--body);color:var(--muted);cursor:pointer}
.lg-chip i{width:9px;height:9px;border-radius:2px}
.lg-chip.off{opacity:.4;text-decoration:line-through}
#app-grid{display:grid;grid-template-columns:1fr 0;gap:0}
#app-grid.editing{grid-template-columns:1fr 360px}
#drawer{display:none;border-left:1px solid var(--line);padding:16px;overflow:auto;max-height:100vh;background:var(--paper)}
#drawer.open{display:block}
#drawer .opt{margin:10px 0}
#drawer .opt label{display:block;font:11px var(--mono);color:var(--faint);margin-bottom:4px}
#drawer .opt select,#drawer .opt input{width:100%}
#drawer .opt small{display:block;color:var(--faint);font-size:10.5px;margin-top:3px}
#drawer summary{font:12px var(--body);font-weight:600;color:var(--muted);margin:14px 0 4px;cursor:pointer}
.toolbar{display:flex;gap:8px;align-items:center}
.toolbar button,.menu button{border:1px solid var(--line);background:var(--paper);border-radius:8px;padding:5px 11px;font:12px var(--body);color:var(--muted);cursor:pointer}
.eyebrow{font:11px var(--mono);color:var(--acc);letter-spacing:.12em;text-transform:uppercase}
.card{border:1px solid var(--line);border-radius:14px;padding:18px 20px;background:var(--paper)}
.insights{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0}
.insights span{font:12.5px var(--body);color:var(--muted)}
.insights span::before{content:'◆ ';color:var(--acc)}
.foot{display:flex;justify-content:space-between;font:11px var(--mono);color:var(--faint);margin-top:12px}
#detail{font:12px var(--mono);color:var(--faint);min-height:18px}
details.fold{margin-top:14px}
details.fold summary{cursor:pointer;font:12.5px var(--body);color:var(--muted)}
#datatable table{border-collapse:collapse;width:100%;font:12px var(--mono)}
#datatable th,#datatable td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:left;color:var(--muted)}
#exp-menu{display:none}
#exp-menu{display:inline-flex;gap:6px}
@media(max-width:720px){#app-grid.editing{grid-template-columns:1fr}#drawer{border-left:0;border-top:1px solid var(--line)}}
@media print{.toolbar,#drawer,#exp-menu{display:none}#chart-box svg{width:100%}}
@media(prefers-reduced-motion:no-preference){.lg-chip{transition:opacity .15s}}
</style></head>
<body data-theme="${theme}">
<div id="virta-app" style="max-width:1180px;margin:0 auto;padding:24px">
  <div class="toolbar" style="justify-content:space-between">
    <span class="eyebrow">VIRTA · ${esc(payload.spec.view)} · ${theme.toUpperCase()}</span>
    <span class="toolbar">
      <button id="btn-theme" title="切换主题">☀/☾</button>
      <button id="btn-edit" title="编辑">⚙ 编辑</button>
      <span id="exp-menu"><button data-exp="svg">SVG</button><button data-exp="png">PNG</button><button data-exp="csv">CSV</button><button data-exp="spec">spec</button></span>
      <button id="btn-full" title="全屏">⛶</button>
    </span>
  </div>
  <h1 style="font:600 40px/1.15 var(--display);color:var(--ink);margin:10px 0 4px">${esc(t.title ?? '')}</h1>
  ${t.subtitle ? `<p style="font:15px var(--body);color:var(--muted);margin:0 0 6px">${esc(t.subtitle)}</p>` : ''}
  ${payload.insights.length ? `<div class="insights">${payload.insights.slice(0, 3).map((i) => `<span>${esc(i.text)}</span>`).join('')}</div>` : ''}
  <div id="app-grid"><div>
  <div class="card">
    <div id="legend"></div>
    <div id="chart-box">${svg}<div id="tooltip" aria-live="polite"></div></div>
    <div id="detail">—</div>
  </div>
  <div class="foot"><span>${esc([t.source, t.unit].filter(Boolean).join(' · '))}</span><span>${confBadge}</span></div>
  <details class="fold"><summary>数据表</summary><div id="datatable"></div></details>
  <details class="fold"><summary>数据识别报告</summary><div style="font:12px var(--mono);color:var(--muted)">
    <p>映射：${esc(JSON.stringify(payload.quality.mapping))}</p>
    ${payload.quality.issues.map((i) => `<p style="color:var(--${i.level === 'error' ? 'neg' : i.level === 'warn' ? 'warn' : 'faint'})">· ${esc(i.message)}</p>`).join('') || '<p>· 无质量问题</p>'}
  </div></details>
  </div>
  <aside id="drawer"><div id="drawer-groups"></div>
    <div class="opt"><label>配色</label><select id="palette-sel"></select></div>
    <div style="display:flex;gap:8px;margin-top:16px"><button id="btn-copyspec">复制 spec</button><button id="btn-reset">重置</button></div>
  </aside>
  </div>
</div>
<script>window.__VIRTA__=${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>
<script>${runtimeJs}</script>
</body></html>`;
}
