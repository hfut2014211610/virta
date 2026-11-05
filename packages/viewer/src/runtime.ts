// viewer 运行期：单文件 HTML 内嵌本模块（esbuild 打成 <view>.js）。
// 负责：adapt+layout+SVG 渲染、图例开关、tooltip、编辑抽屉、hash 同步、导出。
import { hitTest, toSVG, type Scene } from '@virta/chart-core';
import { applySkin } from '@virta/chart-skin';
import { getContract, resolveTheme, PALETTE_IDS } from './deps.js';
import type { ViewSpec, Table } from '@virta/contracts';
import { facetGroups, facetLayout, FACETABLE } from './facet.js';
import { ZH } from './i18n/zh-CN.js';

export interface Payload {
  spec: ViewSpec;
  table: Table;
  /** 文档视图原文（report 等）；非空时浏览器端走 buildDoc */
  doc?: string;
  /** 图族中文名（contract.title），用于标题后缀 */
  viewTitle?: string;
  insights: { kind: string; text: string; importance: number }[];
  reason: string;
  counts: Record<string, number>;
  quality: { confidence: string; issues: { level: string; message: string }[]; mapping: Record<string, string | string[]> };
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

function getState(spec: ViewSpec): { sort: 'none' | 'asc' | 'desc'; hiddenSeries: string[] } {
  return { sort: spec.state?.sort ?? 'none', hiddenSeries: spec.state?.hiddenSeries ?? [] };
}

/** 注入式运行期依赖：per-view bundle 只打包本视图的 adapter+renderer。 */
export interface RuntimeDeps {
  /** Table → 图族 model（等价 adapter.adapt(...).model）；第二参传 spec 供变体分支 */
  adapt?: (table: Table, spec?: ViewSpec) => unknown;
  /** 文档原文 → DocModel（report 等文档视图） */
  buildDoc?: (text: string, name: string) => unknown;
  /** 图族 renderer（interactions 声明的拖拽/缩放能力在此接线） */
  renderer: { layout: (model: never, ctx: never) => Scene; interactions?: string[] } | undefined;
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
    const tokens = resolveTheme(theme);
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.dataset['palette'] = spec.palette ?? 'signal';
    document.body.dataset['theme'] = theme;
    const box = $('#chart-box');
    const width = Math.max(360, box.clientWidth || 960);
    const height = Math.min(640, Math.max(360, Math.round(window.innerHeight * 0.58)));
    const facetCol = spec.facet?.column;
    const model = payload.doc !== undefined
      ? deps.buildDoc!(payload.doc, payload.spec.text?.title ?? 'doc')
      : deps.adapt!(payload.table, spec);
    const facetSubs = payload.doc === undefined && facetCol && FACETABLE.has(view) && payload.table.columns.includes(facetCol)
      ? facetGroups(payload.table.rows as Record<string, unknown>[], facetCol)
          .map((gr: { name: string; rows: Record<string, unknown>[] }) => ({ name: gr.name, model: deps.adapt!({ ...payload.table, rows: gr.rows } as Table, spec) }))
      : null;
    const sc = facetSubs
      ? facetLayout(view, renderer as never, facetSubs, {
          width, height,
          plot: { x: 0, y: 0, w: width, h: height },
          theme, palette: spec.palette ?? 'signal', tokens,
          variant: spec.variant, mode: spec.mode,
          options: spec.options ?? {}, state: spec.state,
          format: spec.format, annotations: spec.annotations, text: spec.text,
        } as never, spec.facet?.sharedScale ?? false, spec.facet?.columns)
      : renderer!.layout(model as never, {
      width, height,
      plot: { x: 0, y: 0, w: width, h: height },
      theme, palette: spec.palette ?? 'signal', tokens,
      variant: spec.variant, mode: spec.mode,
      options: spec.options ?? {}, state: spec.state,
      format: spec.format, annotations: spec.annotations, text: spec.text,
    } as never);
    applySkin(sc, tokens.skin);
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
    syncChrome();
  }

  /** 工具栏/抽屉控件状态与 spec 对齐（seg 高亮、select 值）。 */
  function syncChrome() {
    const theme = spec.theme ?? 'light';
    $$('#theme-seg button').forEach((b) => b.classList.toggle('on', b.dataset['t'] === theme));
    $$('#variant-seg button').forEach((b) => b.classList.toggle('on', b.dataset['v'] === (spec.variant ?? contract?.variants?.[0]?.id)));
    $$('#palette-seg button').forEach((b) => b.classList.toggle('on', b.dataset['v'] === (spec.palette ?? 'signal')));
    // 折叠选项行控件回读
    for (const opt of contract?.options ?? []) {
      const cur = spec.options?.[opt.key] ?? opt.default;
      if (opt.type === 'boolean') {
        const b = $(`#opt-row [data-b="${opt.key}"]`);
        if (b) b.classList.toggle('on', cur === true);
      } else if (opt.type === 'enum') {
        $$(`#opt-row [data-e="${opt.key}"] button`).forEach((b) => b.classList.toggle('on', b.dataset['v'] === String(cur)));
      } else {
        const inp = $(`#opt-row [data-k="${opt.key}"]`) as HTMLInputElement | null;
        if (inp && document.activeElement !== inp) inp.value = String(cur ?? '');
      }
    }
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

  // —— 3D 拖拽旋转/滚轮缩放标记（tooltip 拖拽期间让位）——
  let drag3d = false;

  // —— tooltip ——
  const tip = $('#tooltip');
  $('#chart-box').addEventListener('mousemove', (e) => {
    if (drag3d) { tip.style.display = 'none'; return; }
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

  // —— 3D 交互：拖拽旋转（rotate）/ 滚轮缩放（zoom）/ 自动旋转（options.autoRotate）——
  {
    const inter = renderer?.interactions ?? [];
    if (inter.includes('rotate') || inter.includes('zoom')) {
      const box = $('#chart-box');
      box.style.cursor = 'grab';
      box.style.touchAction = 'none';
      let drag: { x: number; y: number; az: number; ti: number } | null = null;
      let raf = 0;
      const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
      box.addEventListener('pointerdown', (e) => {
        if (!inter.includes('rotate')) return;
        drag = { x: e.clientX, y: e.clientY, az: Number(spec.state?.azimuth ?? NaN), ti: Number(spec.state?.tilt ?? NaN) };
        drag3d = true;
        box.style.cursor = 'grabbing';
        try { box.setPointerCapture(e.pointerId); } catch { /* noop */ }
      });
      box.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const az = (Number.isFinite(drag.az) ? drag.az : 40) + (e.clientX - drag.x) * 0.45;
        const ti = Math.max(6, Math.min(82, (Number.isFinite(drag.ti) ? drag.ti : 28) - (e.clientY - drag.y) * 0.3));
        spec = { ...spec, state: { ...spec.state, azimuth: az, tilt: ti } };
        queue();
      });
      const up = () => { drag = null; drag3d = false; box.style.cursor = 'grab'; };
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
      if (inter.includes('zoom')) {
        box.addEventListener('wheel', (e) => {
          e.preventDefault();
          const z0 = Number(spec.state?.zoom ?? 1);
          const z = Math.max(0.5, Math.min(2.4, z0 * (e.deltaY < 0 ? 1.12 : 0.89)));
          spec = { ...spec, state: { ...spec.state, zoom: z } };
          queue();
        }, { passive: false });
      }
      if (spec.options?.['autoRotate']) {
        setInterval(() => {
          if (drag || document.hidden) return;
          const az = (Number(spec.state?.azimuth ?? 45) + 0.7) % 360;
          spec = { ...spec, state: { ...spec.state, azimuth: az } };
          queue();
        }, 80);
      }
    }
  }

  // —— 主题/选项行/全屏 ——
  $$('#theme-seg button').forEach((b) => {
    b.onclick = () => { spec = { ...spec, theme: b.dataset['t'] as ViewSpec['theme'] }; render(); };
  });
  $('#btn-opts').onclick = () => {
    const open = $('#opt-row').classList.toggle('open');
    $('#btn-opts').classList.toggle('on', open);
  };
  $('#btn-full').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); };

  // —— 快捷工具栏：变体/配色 seg（注入 #quick-segs，legacy 演示页同款标签组）——
  const mkSeg = (label: string, id: string, items: { v: string; label: string }[], onPick: (v: string) => void) => {
    const qs = $('#quick-segs');
    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = label;
    const seg = document.createElement('div');
    seg.className = 'seg wrap';
    seg.id = id;
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset['v'] = it.v;
      b.textContent = it.label;
      b.onclick = () => { onPick(it.v); render(); };
      seg.appendChild(b);
    }
    const grp = document.createElement('span');
    grp.className = 'subseg';
    grp.appendChild(lab);
    grp.appendChild(seg);
    qs.appendChild(grp);
  };
  if ((contract?.variants?.length ?? 0) > 1) {
    mkSeg(ZH.variant, 'variant-seg', contract!.variants.map((v) => ({ v: v.id, label: v.label })),
      (v) => { spec = { ...spec, variant: v }; });
  }
  mkSeg(ZH.palette, 'palette-seg', PALETTE_IDS.map((p) => ({ v: p, label: ZH.paletteNames[p] ?? p })),
    (p) => { spec = { ...spec, palette: p as never }; });

  // —— 折叠选项行：contract.options 全量映射为 seg/toggle/小输入（旧版工具栏形态）——
  const optRow = $('#opt-row');
  const setOpt = (k: string, v: string | number | boolean) => { spec = { ...spec, options: { ...spec.options, [k]: v } }; render(); };
  {
    const groups = new Map<string, import('@virta/contracts').OptionSpec[]>();
    for (const opt of contract?.options ?? []) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    }
    for (const [grp, opts] of groups) {
      const glab = document.createElement('span');
      glab.className = 'glab';
      glab.textContent = ZH.drawerGroups[grp] ?? grp;
      optRow.appendChild(glab);
      for (const opt of opts) {
        const cur = spec.options?.[opt.key] ?? opt.default;
        if (opt.type === 'boolean') {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'toggle';
          b.dataset['b'] = opt.key;
          b.textContent = opt.label;
          b.title = opt.description ?? '';
          b.onclick = () => setOpt(opt.key, !(spec.options?.[opt.key] ?? opt.default));
          optRow.appendChild(b);
        } else if (opt.type === 'enum' && (opt.values?.length ?? 0) > 0) {
          const sub = document.createElement('span');
          sub.className = 'opt-sub';
          const lab = document.createElement('label');
          lab.textContent = opt.label;
          const seg = document.createElement('div');
          seg.className = 'seg wrap';
          seg.dataset['e'] = opt.key;
          for (const v of opt.values!) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset['v'] = v.value;
            b.textContent = v.label;
            b.onclick = () => setOpt(opt.key, v.value);
            seg.appendChild(b);
          }
          sub.appendChild(lab);
          sub.appendChild(seg);
          optRow.appendChild(sub);
        } else {
          const sub = document.createElement('span');
          sub.className = 'opt-sub';
          const lab = document.createElement('label');
          lab.textContent = opt.label;
          const inp = document.createElement('input');
          inp.dataset['k'] = opt.key;
          inp.value = String(cur ?? '');
          if (opt.type === 'number') {
            inp.type = 'number';
            inp.className = 'opt-num';
            if (opt.min !== undefined) inp.min = String(opt.min);
            if (opt.max !== undefined) inp.max = String(opt.max);
            inp.onchange = () => setOpt(opt.key, Number(inp.value));
          } else {
            inp.type = 'text';
            inp.className = 'opt-text';
            inp.onchange = () => setOpt(opt.key, inp.value);
          }
          inp.title = opt.description ?? '';
          sub.appendChild(lab);
          sub.appendChild(inp);
          optRow.appendChild(sub);
        }
      }
    }
    const tail = document.createElement('span');
    tail.className = 'subseg';
    tail.style.marginLeft = 'auto';
    const cp = document.createElement('button');
    cp.type = 'button'; cp.className = 'toggle'; cp.id = 'btn-copyspec'; cp.textContent = ZH.copySpec;
    cp.onclick = async () => {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
      cp.textContent = ZH.copied;
      setTimeout(() => { cp.textContent = ZH.copySpec; }, 1200);
    };
    const rs = document.createElement('button');
    rs.type = 'button'; rs.className = 'toggle'; rs.id = 'btn-reset'; rs.textContent = ZH.reset;
    rs.onclick = () => { spec = structuredClone(payload.spec); render(); };
    tail.appendChild(cp);
    tail.appendChild(rs);
    optRow.appendChild(tail);
    // 无 options 时隐藏「选项」按钮
    if (!(contract?.options?.length)) ($('#btn-opts') as HTMLElement).style.display = 'none';
  }

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
