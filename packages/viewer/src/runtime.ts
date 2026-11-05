// viewer 运行期：单文件 HTML 内嵌本模块（esbuild 打成 <view>.js）。
// 负责：adapt+layout+SVG 渲染、图例开关、tooltip、编辑抽屉、hash 同步、导出。
import { hitTest, toSVG, type Scene } from '@virta/chart-core';
import { getContract, THEMES, paletteColors, PALETTE_IDS } from './deps.js';
import type { ViewSpec, Table } from '@virta/contracts';

export interface Payload {
  spec: ViewSpec;
  table: Table;
  /** 文档视图原文（report 等）；非空时浏览器端走 buildDoc */
  doc?: string;
  insights: { kind: string; text: string; importance: number }[];
  reason: string;
  counts: Record<string, number>;
  quality: { confidence: string; issues: { level: string; message: string }[]; mapping: Record<string, string | string[]> };
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function getState(spec: ViewSpec): { sort: 'none' | 'asc' | 'desc'; hiddenSeries: string[] } {
  return { sort: spec.state?.sort ?? 'none', hiddenSeries: spec.state?.hiddenSeries ?? [] };
}

/** 注入式运行期依赖：per-view bundle 只打包本视图的 adapter+renderer。 */
export interface RuntimeDeps {
  /** Table → 图族 model（等价 adapter.adapt(...).model） */
  adapt?: (table: Table) => unknown;
  /** 文档原文 → DocModel（report 等文档视图） */
  buildDoc?: (text: string, name: string) => unknown;
  /** 图族 renderer */
  renderer: { layout: (model: never, ctx: never) => Scene } | undefined;
}

export function boot(payload: Payload, deps: RuntimeDeps): void {
  const root = $('#virta-app');
  if (!root) return;
  let spec = structuredClone(payload.spec);
  const contract = getContract(spec.view as never);
  const renderer = deps.renderer;
  const view = spec.view;

  // hash 恢复
  try {
    const h = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
    if (h) {
      const restored = JSON.parse(decodeURIComponent(escape(atob(h[1].replace(/-/g, '+').replace(/_/g, '/'))))) as ViewSpec;
      spec = { ...spec, ...restored, version: 1 };
    }
  } catch { /* 忽略坏 hash */ }

  const syncHash = () => {
    const json = JSON.stringify(spec);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_');
    history.replaceState(null, '', `#s=${b64}`);
  };

  function layoutScene() {
    const theme = spec.theme ?? 'light';
    const tokens = THEMES[theme];
    document.body.dataset['theme'] = theme;
    const box = $('#chart-box');
    const width = Math.max(360, box.clientWidth || 960);
    const height = Math.min(640, Math.max(360, Math.round(window.innerHeight * 0.58)));
    const model = payload.doc !== undefined
      ? deps.buildDoc!(payload.doc, payload.spec.text?.title ?? 'doc')
      : deps.adapt!(payload.table);
    const sc = renderer!.layout(model as never, {
      width, height,
      plot: { x: 0, y: 0, w: width, h: height },
      theme, palette: spec.palette ?? 'signal', tokens,
      variant: spec.variant, mode: spec.mode,
      options: spec.options ?? {}, state: spec.state,
      format: spec.format, annotations: spec.annotations, text: spec.text,
    } as never);
    return sc;
  }

  function render() {
    const sc = layoutScene();
    const box = $('#chart-box');
    box.innerHTML = toSVG(sc);
    (box.firstElementChild as SVGElement | null)?.setAttribute('width', '100%');
    (box.firstElementChild as SVGElement | null)?.setAttribute('height', 'auto');
    (box as HTMLElement & { __scene?: unknown }).__scene = sc;
    renderLegend((sc as { legend?: { name: string; color: string; hidden?: boolean }[] }).legend);
    buildTable();
    syncHash();
  }

  // —— 图例 ——
  function renderLegend(legend?: { name: string; color: string; hidden?: boolean }[]) {
    const el = $('#legend');
    el.innerHTML = '';
    for (const it of legend ?? []) {
      const chip = document.createElement('button');
      chip.className = 'lg-chip' + (it.hidden ? ' off' : '');
      chip.innerHTML = `<i style="background:${it.color}"></i>${it.name}`;
      chip.onclick = () => {
        const st = getState(spec);
        st.hiddenSeries = it.hidden ? st.hiddenSeries.filter((n) => n !== it.name) : [...st.hiddenSeries, it.name];
        spec = { ...spec, state: { ...spec.state, ...st } };
        render();
      };
      el.appendChild(chip);
    }
  }

  // —— tooltip ——
  const tip = $('#tooltip');
  $('#chart-box').addEventListener('mousemove', (e) => {
    const box = $('#chart-box');
    const sc = (box as HTMLElement & { __scene?: ReturnType<typeof layoutScene> }).__scene;
    if (!sc) return;
    const rect = box.getBoundingClientRect();
    const dpr = (sc.width || rect.width) / rect.width;
    const x = (e.clientX - rect.left) * dpr, y = (e.clientY - rect.top) * dpr;
    const d = hitTest(sc, x, y);
    if (d?.tooltip) {
      const t = d.tooltip;
      tip.innerHTML = `<b>${t.title ?? ''}</b>` + (t.rows ?? []).map((r) => `<div><i style="background:${r.swatch}"></i>${r.name} <b>${r.value}</b></div>`).join('');
      tip.style.display = 'block';
      tip.style.left = `${e.clientX - rect.left + 14}px`;
      tip.style.top = `${e.clientY - rect.top + 10}px`;
      $('#detail').textContent = `${t.title ?? ''} ${(t.rows ?? []).map((r) => `${r.name}=${r.value}`).join(' ')}`;
    } else {
      tip.style.display = 'none';
      $('#detail').textContent = '—';
    }
  });
  $('#chart-box').addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  // —— 主题/编辑/抽屉 ——
  $('#btn-theme').onclick = () => { spec = { ...spec, theme: spec.theme === 'dark' ? 'light' : 'dark' }; render(); };
  $('#btn-edit').onclick = () => { $('#drawer').classList.toggle('open'); $('#app-grid').classList.toggle('editing'); };
  $('#btn-full').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); };

  // 抽屉由 contract.options 自动生成
  const dg = $('#drawer-groups');
  dg.innerHTML = '';
  const groups = new Map<string, import('@virta/contracts').OptionSpec[]>();
  for (const opt of contract?.options ?? []) {
    const list = groups.get(opt.group) ?? [];
    list.push(opt);
    groups.set(opt.group, list);
  }
  for (const [grp, opts] of groups) {
    const det = document.createElement('details');
    det.open = true;
    det.innerHTML = `<summary>${{ view: '视图', style: '外观', display: '展示', data: '数据', interaction: '交互' }[grp] ?? grp}</summary>`;
    for (const opt of opts) {
      const row = document.createElement('div');
      row.className = 'opt';
      const cur = spec.options?.[opt.key] ?? opt.default;
      let input = '';
      if (opt.type === 'boolean') input = `<input type="checkbox" data-k="${opt.key}" ${cur ? 'checked' : ''}>`;
      else if (opt.type === 'enum') input = `<select data-k="${opt.key}">${(opt.values ?? []).map((v) => `<option value="${v.value}" ${String(cur) === String(v.value) ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`;
      else if (opt.type === 'number') input = `<input type="number" data-k="${opt.key}" value="${cur}" ${opt.min !== undefined ? `min="${opt.min}"` : ''} ${opt.max !== undefined ? `max="${opt.max}"` : ''}>`;
      else input = `<input type="text" data-k="${opt.key}" value="${cur ?? ''}">`;
      row.innerHTML = `<label>${opt.label}</label>${input}<small>${opt.description ?? ''}</small>`;
      det.appendChild(row);
    }
    dg.appendChild(det);
  }
  // 变体
  if ((contract?.variants?.length ?? 0) > 0) {
    const det = document.createElement('details');
    det.open = true;
    det.innerHTML = '<summary>变体</summary>';
    const row = document.createElement('div');
    row.className = 'opt';
    row.innerHTML = `<label>变体</label><select id="variant-sel">${(contract!.variants).map((v) => `<option value="${v.id}" ${spec.variant === v.id ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`;
    det.appendChild(row);
    dg.prepend(det);
  }
  dg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.id === 'variant-sel') { spec = { ...spec, variant: t.value }; render(); return; }
    const k = (t as HTMLElement).dataset['k'];
    if (!k) return;
    const v = t instanceof HTMLInputElement && t.type === 'checkbox' ? t.checked : t instanceof HTMLInputElement && t.type === 'number' ? Number(t.value) : t.value;
    spec = { ...spec, options: { ...spec.options, [k]: v } };
    render();
  });
  $('#btn-copyspec').onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    ($('#btn-copyspec') as HTMLButtonElement).textContent = '已复制';
    setTimeout(() => { ($('#btn-copyspec') as HTMLButtonElement).textContent = '复制 spec'; }, 1200);
  };
  $('#btn-reset').onclick = () => { spec = structuredClone(payload.spec); render(); };
  // 色板
  const pal = $('#palette-sel') as HTMLSelectElement;
  pal.innerHTML = PALETTE_IDS.map((p) => `<option value="${p}" ${spec.palette === p ? 'selected' : ''}>${p}</option>`).join('');
  pal.onchange = () => { spec = { ...spec, palette: pal.value as never }; render(); };

  // —— 导出 ——
  const dl = (name: string, url: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  $('#exp-menu').querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      const kind = (b as HTMLElement).dataset['exp'];
      if (kind === 'svg') {
        const sc = ( $('#chart-box') as HTMLElement & { __scene?: ReturnType<typeof layoutScene> }).__scene!;
        dl(`${view}.svg`, URL.createObjectURL(new Blob([toSVG(sc)], { type: 'image/svg+xml' })));
      } else if (kind === 'png') {
        const sc = ( $('#chart-box') as HTMLElement & { __scene?: ReturnType<typeof layoutScene> }).__scene!;
        const svg = toSVG(sc);
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const c = document.createElement('canvas');
        c.width = sc.width * 2; c.height = sc.height * 2;
        const g2 = c.getContext('2d')!;
        g2.fillStyle = getComputedStyle(document.body).backgroundColor;
        g2.fillRect(0, 0, c.width, c.height);
        g2.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((bl) => bl && dl(`${view}.png`, URL.createObjectURL(bl)), 'image/png');
      } else if (kind === 'csv') {
        const t = payload.table;
        const cell = (r: unknown) => { const sv = String(r ?? ''); return /[",\n]/.test(sv) ? `"${sv.replace(/"/g, '""')}"` : sv; };
        const lines = [t.columns.join(',')].concat(
          t.rows.map((r) => t.columns.map((col) => cell((r as Record<string, unknown>)[col])).join(',')),
        );
        dl('data.csv', URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })));
      } else if (kind === 'spec') {
        dl('spec.json', URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' })));
      }
    };
  });

  // —— 数据表折叠 ——
  function buildTable() {
    const el = $('#datatable');
    const t = payload.table;
    el.innerHTML = '<table><thead><tr>' + t.columns.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
      t.rows.slice(0, 200).map((r) => '<tr>' + t.columns.map((col) => `<td>${String((r as Record<string, unknown>)[col] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody></table>' +
      (t.rows.length > 200 ? `<small>仅显示前 200 / ${t.rows.length} 行</small>` : '');
  }
  // —— 键盘 ——
  let focusIdx = -1;
  document.addEventListener('keydown', (e) => {
    const sc = ( $('#chart-box') as HTMLElement & { __scene?: ReturnType<typeof layoutScene> }).__scene;
    if (!sc?.hits?.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      focusIdx = Math.max(0, Math.min(sc.hits.length - 1, focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      const d = sc.hits[focusIdx].datum;
      $('#detail').textContent = `${d?.label ?? ''} ${d?.series ?? ''} = ${d?.value ?? ''}`;
      tip.style.display = 'none';
      e.preventDefault();
    } else if (e.key === 'Escape') { tip.style.display = 'none'; focusIdx = -1; }
  });
  // —— 响应式 ——
  new ResizeObserver(() => render()).observe($('#chart-box'));

  render();
}
