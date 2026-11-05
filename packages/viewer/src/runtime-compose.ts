// compose 运行期：多面板联动仪表盘（§5.7 组合页）。
// links: [{column}] —— 任一面板点击类目 → 同列筛选写入共享 state.filter → 其余面板重新 adapt。
import { hitTest, toSVG, type Scene } from '@virta/chart-core';
import { applySkin } from '@virta/chart-skin';
import { THEME_IDS, resolveTheme } from './deps.js';
import type { Theme, ViewSpec, Table } from '@virta/contracts';

export interface ComposePanel {
  id: string;
  view: string;
  spec: ViewSpec;
  table: Table;
  question?: string;
  insights: { kind: string; text: string; importance: number }[];
  w?: number; h?: number;
}
export interface ComposePayload {
  title?: string;
  layout: 'grid' | 'story';
  theme: Theme;
  palette: string;
  links: { column: string }[];
  panels: ComposePanel[];
}
export interface ComposeViewEntry {
  adapt: (table: Table) => unknown;
  renderer: { layout: (model: never, ctx: never) => Scene };
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export function bootCompose(payload: ComposePayload, views: Record<string, ComposeViewEntry>): void {
  const root = $('#virta-app');
  if (!root) return;
  let theme = payload.theme;
  let palette = payload.palette;
  const filter: Record<string, string[]> = {};

  // 各链接列的值域（datum.series/label/value 取其一与列值匹配者做筛选）
  const colVals = new Map<string, Set<string>>();
  const valsOf = (p: ComposePanel, col: string): Set<string> => {
    let s = colVals.get(`${p.id}:${col}`);
    if (!s) { s = new Set(p.table.rows.map((r) => String((r as Record<string, unknown>)[col]))); colVals.set(`${p.id}:${col}`, s); }
    return s;
  };

  const filtered = (t: Table): Table => {
    const active = Object.entries(filter).filter(([c, vs]) => vs.length && t.columns.includes(c));
    if (!active.length) return t;
    return { ...t, rows: t.rows.filter((r) => active.every(([c, vs]) => vs.includes(String((r as Record<string, unknown>)[c])))) };
  };

  function renderPanel(i: number) {
    const p = payload.panels[i];
    const box = $(`#pbox-${i}`);
    const view = views[p.view];
    if (!box || !view) return;
    const tokens = resolveTheme(theme);
    const width = Math.max(280, box.clientWidth || 560);
    const height = Math.max(220, Math.round(width * 0.56));
    const ft = filtered(p.table);
    let model: unknown;
    try { model = view.adapt(ft); }
    catch (e) { box.innerHTML = `<div class="perr">筛选后无数据</div>`; return; }
    const sc = view.renderer.layout(model as never, {
      width, height, plot: { x: 0, y: 0, w: width, h: height },
      theme, palette, tokens,
      variant: p.spec.variant, mode: p.spec.mode,
      options: p.spec.options ?? {}, state: { ...p.spec.state, filter },
      format: p.spec.format, annotations: p.spec.annotations, text: p.spec.text,
    } as never);
    applySkin(sc, tokens.skin);
    box.innerHTML = toSVG(sc);
    (box as HTMLElement & { __scene?: Scene }).__scene = sc;
    const svg = box.firstElementChild as SVGElement | null;
    svg?.setAttribute('width', '100%'); svg?.setAttribute('height', 'auto');
    svg?.addEventListener('click', (e) => {
      const rect = box.getBoundingClientRect();
      const dpr = (sc.width || rect.width) / rect.width;
      const d = hitTest(sc, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
      if (!d) return;
      for (const lk of payload.links) {
        if (!p.table.columns.includes(lk.column)) continue;
        const vals = valsOf(p, lk.column);
        const cand = [d.series, d.label, d.value !== undefined ? String(d.value) : undefined].find((v) => v !== undefined && vals.has(v));
        if (!cand) continue;
        const cur = filter[lk.column] ?? [];
        filter[lk.column] = cur.includes(cand) ? cur.filter((v) => v !== cand) : [cand];
      }
      renderChips();
      payload.panels.forEach((_, j) => { if (j !== i) renderPanel(j); });
    });
  }

  function renderChips() {
    const el = $('#flinks');
    el.innerHTML = '';
    const active = Object.entries(filter).filter(([, vs]) => vs.length);
    for (const [c, vs] of active) for (const v of vs) {
      const chip = document.createElement('button');
      chip.className = 'fchip';
      chip.innerHTML = `${c} = ${v} ✕`;
      chip.onclick = () => { filter[c] = filter[c].filter((x) => x !== v); renderChips(); payload.panels.forEach((_, j) => renderPanel(j)); };
      el.appendChild(chip);
    }
    if (active.length) {
      const clr = document.createElement('button');
      clr.className = 'fchip';
      clr.textContent = '清除全部';
      clr.onclick = () => { for (const k of Object.keys(filter)) filter[k] = []; renderChips(); payload.panels.forEach((_, j) => renderPanel(j)); };
      el.appendChild(clr);
    }
  }

  $('#btn-theme')?.addEventListener('click', () => {
    const i = THEME_IDS.indexOf(theme as never);
    theme = THEME_IDS[(i + 1) % THEME_IDS.length]!;
    document.body.dataset['theme'] = theme;
    payload.panels.forEach((_, i) => renderPanel(i));
  });
  payload.panels.forEach((_, i) => renderPanel(i));
  new ResizeObserver(() => payload.panels.forEach((_, i) => renderPanel(i))).observe(root);
}
