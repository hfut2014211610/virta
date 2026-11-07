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

interface Cell { text: string; num?: boolean; link?: string; key?: number | string | null }
interface FRow { cells: Cell[]; tone?: string; head?: boolean; depth?: number }

/** C10 排序比较：原始 key 比较（数字按数值，文本按 zh locale）；null/undefined 恒排最后。 */
export function compareKeys(a: number | string | null | undefined, b: number | string | null | undefined): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh');
}

/** beforeprint 监听改 AbortController：每次渲染 abort 上一个，避免重复追加（B17）。 */
const PRINT_AC = new WeakMap<HTMLElement, AbortController>();

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
        cells: [{ text: r.label, key: r.label }, ...r.vals.map((v) => ({ text: v === null ? '—' : fmt(v), num: true, key: v }))],
      }));
      if (showTotals && pv.grand.length) rows.push({ head: true, cells: [{ text: '合计' }, ...pv.grand.map((v) => ({ text: v === null ? '—' : fmt(v), num: true, key: v }))] });
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
        return { text, num: c.numeric, link, key: raw === undefined ? null : raw as number | string | null };
      });
      return { cells, tone };
    });
  }

  // —— 状态：搜索串 + 列筛选 + 排序（sortBy 按列名写入/恢复，C10）——
  const st = { query: String(spec.state?.query ?? ''), filter: { ...(spec.state?.filter ?? {}) }, sort: (spec.state?.sort as 'none' | 'asc' | 'desc' | undefined) ?? 'none', sortCol: -1 };
  const filterCols = m.columns.filter((c) => !c.numeric && c.distinct > 1 && c.distinct <= 30);
  const colKeys = head.length ? head[head.length - 1]!.map((c) => c.text) : [];
  if (spec.state?.sortBy) {
    const ci = colKeys.indexOf(spec.state.sortBy);
    if (ci >= 0) st.sortCol = ci;
  }

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
        const av = a.cells[ci]?.key ?? null, bv = b.cells[ci]?.key ?? null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (st.sort === 'asc' ? 1 : -1) * compareKeys(av, bv);
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
    <div class="ft-wrap"><div class="ft-print-note" hidden></div><table><thead></thead><tbody></tbody></table></div>
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
    spec.state = { ...spec.state, sort: st.sort, sortBy: st.sortCol >= 0 ? colKeys[st.sortCol] : undefined };
    thead.querySelectorAll('th').forEach((x) => x.removeAttribute('data-sort'));
    if (st.sortCol >= 0) th.setAttribute('data-sort', st.sort);
    refresh();
  });
  // C12 打印口径：所见即所打——打印当前筛选结果，表头上方注明筛选条件与行数
  PRINT_AC.get(box)?.abort();
  const ac = new AbortController();
  PRINT_AC.set(box, ac);
  const printNote = box.querySelector('.ft-print-note') as HTMLElement;
  window.addEventListener('beforeprint', () => {
    const conds: string[] = [];
    if (st.query) conds.push(`搜索"${st.query}"`);
    for (const [col, keep] of Object.entries(st.filter)) if (keep?.length) conds.push(`${col}=${keep.join('/')}`);
    if (conds.length || filtered.length !== rows.length) {
      printNote.textContent = `已筛选：${conds.join('，') || '（无）'}（${filtered.length} / ${rows.length} 行）`;
      printNote.hidden = false;
    }
    if (rendered < filtered.length) renderBatch(true);
  }, { signal: ac.signal });
  window.addEventListener('afterprint', () => { printNote.hidden = true; }, { signal: ac.signal });
  void GRID_AGGS;
}
