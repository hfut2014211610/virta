// ADR-0009 flow-table：GridModel → 语义化 <table>（搜索/筛选/排序/粘性表头/行数徽章/link/tone）。
// 与 gridRenderer 共用 pivotView（同一 model 语义）；行数 >500 分批渲染，打印一次性展开。
import { GRID_AGGS, pivotView, type PivotView } from '@virta/charts';
import { formatNumber } from '@virta/chart-skin';
import type { GridModel } from '@virta/data-engine';
import type { ViewSpec } from '@virta/contracts';
import { html, raw } from './safe-html.js';
const safeUrl = (u: string) => /^(https?:|mailto:)/i.test(u);
const TONE_MAP: Record<string, string> = { danger: 'danger', warn: 'warn', ok: 'ok', info: 'info', muted: 'muted', 高: 'danger', 严重: 'danger', 中: 'warn', 低: 'ok', 提示: 'info' };
const BATCH = 500;

interface Cell { text: string; num?: boolean; link?: string }
interface FRow { cells: Cell[]; tone?: string; head?: boolean; depth?: number }

export function renderFlowTable(box: HTMLElement, m: GridModel, spec: ViewSpec): void {
  const opts = spec.options ?? {};
  const variant = String(spec.variant ?? m.mode) === 'pivot' && m.mode === 'pivot' ? 'pivot' : 'detail';
  const showTotals = opts['showTotals'] !== false;
  const fmt = (v: number) => formatNumber(v, spec.format, 'number');
  const linkCol = String(spec.mapping?.['link'] ?? '');
  const linkTextCol = String(opts['linkText'] ?? spec.mapping?.['label'] ?? '');
  const toneCol = String(spec.mapping?.['tone'] ?? '');

  // —— 行视图（明细按列 / 透视交叉表）——
  let head: Cell[][] = [], rows: FRow[] = [];
  if (variant === 'pivot') {
    const pv = pivotView(m, String(opts['agg'] ?? 'sum'), showTotals) as PivotView | null;
    if (pv) {
      const M = m.measures.length, showSub = M > 1;
      const h1: Cell[] = [{ text: `${pv.rowDims.join(' / ')} × ${pv.colDim}` }];
      pv.colVals.forEach((cv) => h1.push({ text: cv, num: true }));
      if (showTotals) h1.push({ text: '合计', num: true });
      head = [h1];
      if (showSub) {
        const h2: Cell[] = [{ text: '' }];
        for (let i = 0; i < pv.colVals.length + (showTotals ? 1 : 0); i++) m.measures.forEach((me) => h2.push({ text: me, num: true }));
        head.push(h2);
      } else {
        // 单度量时表头单元格即列值（与上面对齐：每列值占 1 列）
      }
      rows = pv.body.map((r) => ({
        head: r.head, depth: r.depth,
        cells: [{ text: r.label }, ...r.vals.map((v) => ({ text: v === null ? '—' : fmt(v), num: true }))],
      }));
      if (showTotals && pv.grand.length) rows.push({ head: true, cells: [{ text: '合计' }, ...pv.grand.map((v) => ({ text: v === null ? '—' : fmt(v), num: true }))] });
    } else rows = [];
    if (!rows.length) {
      head = [m.columns.map((c) => ({ text: c.key, num: c.numeric }))];
      rows = detailRows();
    }
  } else {
    head = [m.columns.map((c) => ({ text: c.key, num: c.numeric }))];
    rows = detailRows();
  }

  function detailRows(): FRow[] {
    return m.rows.map((r) => {
      const tone = toneCol ? TONE_MAP[String(r[toneCol] ?? '')] : undefined;
      const cells = m.columns.map((c) => {
        const raw = r[c.key];
        const text = raw === null || raw === undefined ? '—' : c.numeric ? fmt(Number(raw)) : String(raw);
        const link = linkCol && typeof r[linkCol] === 'string' && safeUrl(String(r[linkCol]))
          ? (c.key === (linkTextCol || m.columns.find((x) => !x.numeric && x.key !== linkCol)?.key) ? String(r[linkCol]) : undefined)
          : undefined;
        return { text, num: c.numeric, link };
      });
      return { cells, tone };
    });
  }

  // —— 状态：搜索串 + 列筛选 + 排序 ——
  const st = { query: String(spec.state?.query ?? ''), filter: { ...(spec.state?.filter ?? {}) }, sort: (spec.state?.sort as 'none' | 'asc' | 'desc' | undefined) ?? 'none', sortCol: -1 };
  const filterCols = m.columns.filter((c) => !c.numeric && c.distinct > 1 && c.distinct <= 30);

  const match = (r: FRow) => {
    if (st.query) {
      const q = st.query.toLowerCase();
      if (!r.cells.some((c) => c.text.toLowerCase().includes(q))) return false;
    }
    for (const [col, keep] of Object.entries(st.filter)) {
      if (!keep?.length) continue;
      const ci = m.columns.findIndex((c) => c.key === col);
      const v = ci >= 0 ? String((rowsSource(r) as Record<string, unknown>)[m.columns[ci]!.key] ?? '—') : r.cells[m.columns.findIndex((c) => c.key === col)]?.text;
      if (v !== undefined && !keep.includes(v)) return false;
    }
    return true;
  };
  const detailRaw = new WeakMap<FRow, Record<string, unknown>>();
  if (variant !== 'pivot') m.rows.forEach((r, i) => detailRaw.set(rows[i]!, r as Record<string, unknown>));
  const rowsSource = (r: FRow) => detailRaw.get(r) ?? {};

  const viewRows = () => {
    const vs = rows.filter(match);
    if (st.sort !== 'none' && st.sortCol >= 0) {
      const ci = st.sortCol;
      vs.sort((a, b) => {
        const av = a.cells[ci]?.text ?? '', bv = b.cells[ci]?.text ?? '';
        const an = Number(av.replace(/,/g, '')), bn = Number(bv.replace(/,/g, ''));
        const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : av.localeCompare(bv, 'zh');
        return st.sort === 'asc' ? cmp : -cmp;
      });
    }
    return vs;
  };

  // —— DOM ——
  box.innerHTML = html`<div class="flow-table">
    <div class="ft-bar">
      <input class="ft-q" type="search" placeholder="搜索全部列…" value="${st.query}" aria-label="搜索表格">
      ${filterCols.map((c) => raw(html`<select class="ft-f" data-col="${c.key}" aria-label="筛选 ${c.key}">
        <option value="">${c.key}：全部</option>
        ${[...new Set(m.rows.map((r) => String(r[c.key] ?? '—')))].map((v) => raw(html`<option${(st.filter[c.key] ?? []).includes(v) ? ' selected' : ''} value="${v}">${v}</option>`))}
      </select>`))}
      <span class="ft-badge" role="status"></span>
    </div>
    <div class="ft-wrap"><table><thead></thead><tbody></tbody></table></div>
  </div>`;
  const thead = box.querySelector('thead')!, tbody = box.querySelector('tbody')!, badge = box.querySelector('.ft-badge')!;
  thead.innerHTML = html`${head.map((hr, hi) => raw(html`<tr>${hr.map((c, ci) => raw(html`<th class="${c.num ? 'num' : ''}" data-ci="${hi === head.length - 1 ? ci : -1}"${ci === st.sortCol && hi === head.length - 1 ? raw(html` data-sort="${st.sort}"`) : ''}>${c.text}<i class="ft-si"></i></th>`))}</tr>`))}`;

  let filtered = viewRows(), rendered = 0, batching = false;
  const rowHtml = (r: FRow) => html`<tr${r.tone ? ` class="ft-tone-${r.tone}"` : ''}${r.head ? ' class="ft-head"' : ''}>
    ${r.cells.map((c, ci) => raw(html`<td class="${c.num ? 'num' : ''}"${r.depth && ci === 0 ? ` style="padding-left:${8 + r.depth * 14}px"` : ''}>${c.link ? raw(html`<a href="${c.link}" target="_blank" rel="noopener noreferrer">${c.text}</a>`) : c.text}</td>`))}
  </tr>`;
  const renderBatch = (all = false) => {
    const upto = all ? filtered.length : Math.min(filtered.length, rendered + BATCH);
    tbody.insertAdjacentHTML('beforeend', html`${raw(filtered.slice(rendered, upto).map(rowHtml).join(''))}`);
    rendered = upto;
    badge.textContent = `显示 ${filtered.length} / ${rows.length} 行`;
    if (rendered < filtered.length && !batching) {
      batching = true;
      (window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 16)))(() => { batching = false; renderBatch(); });
    }
  };
  const refresh = () => { tbody.replaceChildren(); rendered = 0; filtered = viewRows(); renderBatch(); };
  refresh();

  box.querySelector('.ft-q')!.addEventListener('input', (e) => { st.query = (e.target as HTMLInputElement).value; spec.state = { ...spec.state, query: st.query }; refresh(); });
  box.querySelectorAll<HTMLSelectElement>('.ft-f').forEach((sel) => sel.addEventListener('change', () => {
    const col = sel.dataset['col']!;
    st.filter[col] = sel.value ? [sel.value] : [];
    spec.state = { ...spec.state, filter: st.filter };
    refresh();
  }));
  thead.addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest('th');
    if (!th || th.dataset['ci'] === '-1' || th.dataset['ci'] === undefined) return;
    const ci = Number(th.dataset['ci']);
    st.sort = st.sortCol === ci ? (st.sort === 'asc' ? 'desc' : st.sort === 'desc' ? 'none' : 'asc') : 'asc';
    st.sortCol = st.sort === 'none' ? -1 : ci;
    spec.state = { ...spec.state, sort: st.sort };
    thead.querySelectorAll('th').forEach((x) => x.removeAttribute('data-sort'));
    if (st.sortCol >= 0) th.setAttribute('data-sort', st.sort);
    refresh();
  });
  // 打印一次性展开全部筛选后行
  window.addEventListener('beforeprint', () => { if (rendered < filtered.length) renderBatch(true); });
  void GRID_AGGS;
}
