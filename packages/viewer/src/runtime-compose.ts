// compose 运行期：多面板联动仪表盘（§5.7 组合页）。
// links: [{column}] —— 任一面板点击类目 → 同列筛选写入共享 state.filter → 其余面板重新 adapt。
import { hitTest, toSVG, modelHash, type Scene } from '@virta/chart-core';
import { applySkin } from '@virta/chart-skin';
import { THEME_IDS } from '../../design-system/src/tokens.js';
import { resolveTheme } from '../../design-system/src/skins.js';
import { renderFlowDoc } from './flow-doc.js';
import { renderFlowTable } from './flow-table.js';
import type { DocModel, GridModel } from '@virta/data-engine';
import type { Theme, ViewSpec, Table } from '@virta/contracts';
import { html, raw } from './safe-html.js';

export interface ComposePanel {
  id: string;
  view: string;
  spec: ViewSpec;
  table: Table;
  /** 文档面板原文（report）；非空时不参与联动筛选（§4.4） */
  doc?: string;
  /** 流式面板标记（ADR-0009：DOM 渲染 + 自然高度 + grid 布局独占整行） */
  flow?: boolean;
  question?: string;
  insights: { kind: string; text: string; importance: number }[];
  w?: number; h?: number;
  /** ADR-0012 C4：运行期写回的面板 model 内容指纹（parity 对拍用，不进回执） */
  modelHash?: string;
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
  /** A7 统一入口：{table?,doc?} → model（与 CLI adaptInput 同语义） */
  adapt: (input: { table?: Table; doc?: string }, spec?: ViewSpec) => unknown;
  renderer: { layout: (model: never, ctx: never) => Scene };
  /** 契约 flow 标记：grid/report 面板走 DOM 渲染 */
  flow?: boolean;
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

  const hasFilter = () => Object.values(filter).some((vs) => vs.length);
  const clearFilter = () => { for (const k of Object.keys(filter)) filter[k] = []; renderChips(); payload.panels.forEach((_, j) => renderPanel(j)); };

  function renderPanel(i: number) {
    const p = payload.panels[i];
    const box = $(`#pbox-${i}`);
    const view = views[p.view];
    if (!box || !view) return;
    const tokens = resolveTheme(theme);
    const width = Math.max(280, box.clientWidth || 560);
    const isDoc = p.doc !== undefined;
    const isFlow = view.flow === true || isDoc;
    const ft = isDoc ? p.table : filtered(p.table);
    let model: unknown;
    try { model = view.adapt({ table: ft, doc: p.doc }, p.spec); p.modelHash = modelHash(model); }
    catch (e) {
      // §4.4：adapt 抛错显示真实错误文案（不是误报「筛选后无数据」）
      box.innerHTML = html`<div class="perr">${(e as Error).message}</div>`;
      return;
    }
    // §4.4：仅「筛选后为空」显示无数据，并给清除筛选
    if (!isDoc && hasFilter() && ft.rows.length === 0) {
      box.innerHTML = html`<div class="perr">筛选后无数据 <button type="button" class="pclr">清除筛选</button></div>`;
      box.querySelector('.pclr')?.addEventListener('click', clearFilter);
      return;
    }
    // 文档/流式面板 → DOM 渲染（不参与联动标记；自然高度）
    if (isFlow) {
      box.classList.add('pbox-flow');
      if (isDoc) box.classList.add('pdoc');
      if (isDoc) renderFlowDoc(box, model as DocModel);
      else renderFlowTable(box, model as GridModel, p.spec);
      (box as HTMLElement & { __scene?: Scene }).__scene = undefined;
      return;
    }
    const height = Math.max(220, Math.round(width * 0.56));
    const sc = view.renderer.layout(model as never, {
      width, height, plot: { x: 0, y: 0, w: width, h: height },
      theme, palette, tokens,
      variant: p.spec.variant, mode: p.spec.mode,
      options: p.spec.options ?? {}, state: { ...p.spec.state, filter },
      format: p.spec.format, annotations: p.spec.annotations, text: p.spec.text,
    } as never);
    applySkin(sc, tokens.skin);
    box.innerHTML = raw(toSVG(sc)).html;
    (box as HTMLElement & { __scene?: Scene }).__scene = sc;
    const svg = box.firstElementChild as SVGElement | null;
    svg?.setAttribute('width', '100%'); if (svg) svg.style.height = 'auto';
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
    el.replaceChildren();
    const active = Object.entries(filter).filter(([, vs]) => vs.length);
    for (const [c, vs] of active) for (const v of vs) {
      const chip = document.createElement('button');
      chip.className = 'fchip';
      chip.textContent = `${c} = ${v} ✕`;
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
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = `VIRTA · COMPOSE · ${theme.toUpperCase()}`;
    payload.panels.forEach((_, i) => renderPanel(i));
  });
  payload.panels.forEach((_, i) => renderPanel(i));
  new ResizeObserver(() => payload.panels.forEach((_, i) => renderPanel(i))).observe(root);
}
