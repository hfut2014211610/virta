// B3：gantt / fishbone / grid / report / pie3d / line3d / scatter3d。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, scaleLinear, scene } from '@virta/chart-core';
import { formatNumber, type LegendItem } from '@virta/chart-skin';
import { paletteColors, rampDiverging } from '@virta/design-system';
import type { DocModel, FishboneModel, GanttModel, GridModel, Line3dModel, Pie3dModel, ScatterModel, BarlineModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { project3d } from './b1.js';

const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');
const ISO = (ord: number) => new Date(ord * 86400000).toISOString().slice(0, 10);

// —— gantt ——
export const ganttRenderer: FamilyRenderer<GanttModel> = {
  view: 'gantt' as ViewId,
  layout(m: GanttModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const padL = Math.min(160, Math.max(70, ...m.tasks.map((k) => measureText(k.label, 'body', 11) + 16)));
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 26, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 46 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const x0 = 0, x1 = Math.max(1, m.span);
    const x = scaleLinear([x0, x1], [plot.x, plot.x + plot.w]);
    const iso = (d: number) => (m.baseOrd !== null ? ISO(m.baseOrd + d) : `D${Math.round(d)}`);
    const rowH = plot.h / Math.max(1, m.tasks.length);
    const barH = Math.min(18, rowH * 0.55);
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    // 时间刻度（~8 格）
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let d = 0; d <= x1; d += step) {
      nodes.push({ type: 'line', x1: x(d), y1: plot.y, x2: x(d), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: x(d), y: plot.y - 4, text: iso(d).slice(5), font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.faint });
    }
    const todayOrd = m.today;
    m.tasks.forEach((k, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const c = colors[(gi.get(k.group) ?? i) % colors.length];
      const s = k.s, e = k.e ?? k.s;
      nodes.push({ type: 'text', x: plot.x - 8, y: cy, text: k.label, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      const datum = { kind: 'task', index: i, label: k.label, value: e - s, tooltip: { title: `${k.label}（${k.group}）`, rows: [{ swatch: c, name: '区间', value: `${iso(s)} → ${iso(e)}` }, { name: '进度', value: k.progress !== null ? `${Math.round(k.progress * 100)}%` : '—' }] } };
      if (k.milestone) {
        nodes.push({ type: 'path', d: `M${x(s)} ${cy - 7} L${x(s) + 7} ${cy} L${x(s)} ${cy + 7} L${x(s) - 7} ${cy} Z`, fill: t.acc, datum });
      } else {
        nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, x(e) - x(s)), h: barH, r: 4, fill: c, opacity: 0.32, datum });
        if (k.progress) nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, (x(e) - x(s)) * k.progress), h: barH, r: 4, fill: c, datum });
      }
      if (k.status === 'delayed' || k.status === 'late') nodes.push({ type: 'circle', cx: x(e) + 10, cy, r: 3, fill: t.neg });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    // 依赖连线
    m.tasks.forEach((k, i) => {
      const cy2 = plot.y + i * rowH + rowH / 2;
      for (const d of k.deps) {
        const src = m.tasks[d];
        if (!src) continue;
        const cy1 = plot.y + d * rowH + rowH / 2;
        const x1p = x(src.e ?? src.s), x2p = x(k.s);
        nodes.push({ type: 'path', d: `M${x1p} ${cy1} L${x1p + 8} ${cy1} L${x1p + 8} ${cy2} L${x2p} ${cy2}`, fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [3, 2] });
      }
    });
    if (todayOrd !== null) nodes.push({ type: 'line', x1: x(todayOrd), y1: plot.y - 4, x2: x(todayOrd), y2: plot.y + plot.h, stroke: t.warn, strokeWidth: 1.5, dash: [5, 3] });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— fishbone ——
export const fishboneRenderer: FamilyRenderer<FishboneModel> = {
  view: 'fishbone' as ViewId,
  layout(m: FishboneModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const plot = { x: ctx.plot.x + 30, y: ctx.plot.y + 30, w: ctx.plot.w - 130, h: ctx.plot.h - 60 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const spineY = ctx.plot.y + ctx.plot.h / 2;
    const headX = plot.x + plot.w + 40;
    // 主骨 + 鱼头
    nodes.push({ type: 'line', x1: plot.x, y1: spineY, x2: headX, y2: spineY, stroke: t.ink, strokeWidth: 2.5 });
    nodes.push({ type: 'path', d: `M${headX} ${spineY - 22} L${headX + 46} ${spineY} L${headX} ${spineY + 22} L${headX + 14} ${spineY} Z`, fill: t.acc });
    const n = m.cats.length;
    const per = Math.ceil(n / 2);
    m.cats.forEach((cat, ci) => {
      const up = ci < per;
      const slot = up ? ci : ci - per;
      const cnt = up ? per : n - per;
      const bx = plot.x + ((slot + 1) / (cnt + 1)) * plot.w;
      const by = spineY + (up ? -1 : 1) * plot.h * 0.34;
      const c = colors[ci % colors.length];
      nodes.push({ type: 'line', x1: bx, y1: spineY, x2: bx + (up ? -40 : -40) + plot.w * 0.08, y2: by, stroke: c, strokeWidth: 1.8 });
      nodes.push({ type: 'text', x: bx + plot.w * 0.08 - 30, y: by + (up ? -6 : 14), text: cat.name, font: 'body', size: 12, weight: 600, baseline: up ? 'bottom' : 'top', fill: c });
      cat.causes.forEach((cause, k) => {
        const k2 = k + 1;
        const lx = bx + ((plot.w * 0.08 - 30) * k2) / (cat.causes.length + 1) * 0.9;
        const ly = by + (up ? 1 : -1) * (14 + k * 14) * (up ? 1 : 1);
        const ty = up ? by + 8 + k * 15 : by - 8 - k * 15;
        nodes.push({ type: 'line', x1: bx + plot.w * 0.08 * (k2 / (cat.causes.length + 1)) - 30, y1: by - (up ? 0 : 0), x2: lx, y2: ty, stroke: t.faint, strokeWidth: 1 });
        nodes.push({ type: 'text', x: lx - 4, y: ty, text: cause.label + (cause.sub ? `/${cause.sub}` : ''), font: 'body', size: 10, anchor: 'end', baseline: 'middle', fill: t.muted, datum: { kind: 'cause', index: k, label: cause.label, tooltip: { title: cause.label, rows: [{ swatch: c, name: cat.name, value: cause.sub || '—' }, { name: '负责人', value: cause.owner || '—' }] } } });
        hits.push({ shape: { type: 'rect', x: lx - measureText(cause.label, 'body', 10) - 8, y: ty - 7, w: measureText(cause.label, 'body', 10) + 8, h: 14 }, datum: { kind: 'cause', index: k, label: cause.label, tooltip: { title: cause.label, rows: [{ swatch: c, name: cat.name, value: cause.sub || '—' }, { name: '负责人', value: cause.owner || '—' }] } } });
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— grid（明细/pivot 表）——
export const gridRenderer: FamilyRenderer<GridModel> = {
  view: 'grid' as ViewId,
  layout(m: GridModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const nodes: Node[] = [];
    const x0 = ctx.plot.x + 8, y0 = ctx.plot.y + 8;
    const colW = m.columns.map((c) => Math.min(220, Math.max(70, measureText(c.key, 'mono', 11) + 30)));
    const totW = colW.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, ctx.plot.w / Math.max(1, totW));
    const rowH = 24 * scale, headH = 30;
    let y = y0;
    // 表头
    nodes.push({ type: 'rect', x: x0, y, w: ctx.plot.w - 16, h: headH, fill: t.acc, opacity: 0.1 });
    let x = x0;
    m.columns.forEach((c, i) => {
      nodes.push({ type: 'text', x: x + 6, y: y + headH / 2, text: c.key, font: 'mono', size: 11, weight: 600, baseline: 'middle', fill: t.ink });
      x += colW[i] * scale;
    });
    y += headH;
    nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + ctx.plot.w - 16, y2: y, stroke: t.ink, strokeWidth: 1.2 });
    const maxRows = Math.min(m.rows.length, Math.floor((ctx.plot.h - headH - 16) / Math.max(14, rowH)));
    m.rows.slice(0, maxRows).forEach((r, ri) => {
      x = x0;
      if (ri % 2) nodes.push({ type: 'rect', x: x0, y, w: ctx.plot.w - 16, h: rowH, fill: t.grid, opacity: 0.35 });
      m.columns.forEach((c, i) => {
        const v = r[c.key];
        const txt = v === null || v === undefined ? '—' : c.numeric ? fmt(ctx)(Number(v)) : String(v);
        nodes.push({ type: 'text', x: c.numeric ? x + colW[i] * scale - 6 : x + 6, y: y + rowH / 2, text: txt, font: 'mono', size: 10.5, anchor: c.numeric ? 'end' : 'start', baseline: 'middle', fill: t.muted });
        x += colW[i] * scale;
      });
      y += rowH;
      nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + ctx.plot.w - 16, y2: y, stroke: t.grid, strokeWidth: 0.5 });
    });
    if (m.rows.length > maxRows) nodes.push({ type: 'text', x: x0, y: y + 14, text: `… 共 ${m.rows.length} 行，显示前 ${maxRows}`, font: 'mono', size: 10, baseline: 'top', fill: t.faint });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    return sc;
  },
};

// —— report（文档报告：DocModel → SVG 排版）——
export const reportRenderer: FamilyRenderer<DocModel> = {
  view: 'report' as ViewId,
  layout(m: DocModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const nodes: Node[] = [];
    const W = Math.min(720, ctx.plot.w - 40);
    let x = ctx.plot.x + (ctx.plot.w - W) / 2, y = ctx.plot.y + 10;
    const wrap = (text: string, size: number, font: 'body' | 'display') => {
      const per = Math.floor(W / (size * 1.0));
      const lines: string[] = [];
      for (let i = 0; i < text.length; i += per) lines.push(text.slice(i, i + per));
      return lines;
    };
    // 指标卡（每行 ≤4，字号按宽度自适应）
    if (m.metrics.length) {
      const perRow = Math.min(4, m.metrics.length);
      const cw = (W - (perRow - 1) * 12) / perRow;
      m.metrics.slice(0, 8).forEach((mt, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const mx = x + col * (cw + 12), my = y + row * 72;
        nodes.push({ type: 'rect', x: mx, y: my, w: cw, h: 62, r: 10, fill: t.grid, opacity: 0.4 });
        const label = mt.label ?? '指标';
        const labelTxt = measureText(label, 'mono', 10.5) > cw - 20 ? label.slice(0, Math.max(2, Math.floor((cw - 20) / 10.5))) : label;
        nodes.push({ type: 'text', x: mx + 10, y: my + 12, text: labelTxt, font: 'mono', size: 10.5, baseline: 'top', fill: t.faint });
        const vtxt = `${mt.value_text}${mt.unit}`;
        const vw = measureText(vtxt, 'display', 19);
        const vs = vw > cw - 20 ? Math.max(11, 19 * (cw - 20) / vw) : 19;
        nodes.push({ type: 'text', x: mx + 10, y: my + 42, text: vtxt, font: 'display', size: vs, weight: 600, baseline: 'middle', fill: t.ink });
      });
      y += Math.ceil(Math.min(8, m.metrics.length) / perRow) * 72 + 10;
    }
    for (const b of m.blocks.slice(0, 400)) {
      if (y > ctx.plot.y + ctx.plot.h - 30) break;
      const bt = b as { type: string; text?: string; level?: number; items?: { text: string }[]; rows?: string[][]; head?: string[]; paras?: string[]; lang?: string };
      if (bt.type === 'heading') {
        const size = bt.level === 1 ? 24 : bt.level === 2 ? 18 : 15;
        y += bt.level === 1 ? 10 : 6;
        for (const ln of wrap(bt.text ?? '', size, 'display')) { nodes.push({ type: 'text', x, y, text: ln, font: 'display', size, weight: 600, baseline: 'top', fill: t.ink }); y += size * 1.3; }
      } else if (bt.type === 'list' && bt.items) {
        for (const it of bt.items) for (const ln of wrap(`· ${it.text}`, 12.5, 'body')) { nodes.push({ type: 'text', x: x + 10, y, text: ln, font: 'body', size: 12.5, baseline: 'top', fill: t.muted }); y += 19; }
      } else if (bt.type === 'table' && bt.rows?.length) {
        const trows = [bt.head ?? [], ...bt.rows];
        const cols = Math.max(...trows.map((r) => r.length));
        const cw = W / cols;
        trows.slice(0, 30).forEach((r, ri) => {
          r.forEach((cell, ci) => {
            if (ri === 0) nodes.push({ type: 'rect', x: x + ci * cw, y, w: cw, h: 22, fill: t.grid, opacity: 0.4 });
            nodes.push({ type: 'text', x: x + ci * cw + 5, y: y + 11, text: cell ?? '', font: 'mono', size: 10.5, baseline: 'middle', fill: ri === 0 ? t.ink : t.muted });
          });
          y += 22;
          nodes.push({ type: 'line', x1: x, y1: y, x2: x + W, y2: y, stroke: t.grid, strokeWidth: 0.5 });
        });
        y += 8;
      } else if (bt.type === 'quote' && bt.paras) {
        for (const para of bt.paras) for (const ln of wrap(para, 12.5, 'body')) { nodes.push({ type: 'text', x: x + 10, y, text: ln, font: 'body', size: 12.5, baseline: 'top', fill: t.faint }); y += 19; }
        nodes.push({ type: 'rect', x: x - 2, y: y - bt.paras.length * 19 - 2, w: 3, h: bt.paras.length * 19, fill: t.acc });
        y += 6;
      } else if (bt.type === 'code' && bt.text) {
        for (const ln of bt.text.split('\n')) { nodes.push({ type: 'text', x: x + 10, y, text: ln, font: 'mono', size: 11, baseline: 'top', fill: t.muted }); y += 17; }
        y += 6;
      } else if (bt.type === 'hr') {
        nodes.push({ type: 'line', x1: x, y1: y + 8, x2: x + W, y2: y + 8, stroke: t.grid, strokeWidth: 1 }); y += 18;
      } else if (bt.text) {
        for (const ln of wrap(bt.text, 13, 'body')) { nodes.push({ type: 'text', x, y, text: ln, font: 'body', size: 13, baseline: 'top', fill: t.muted }); y += 20; }
        y += 4;
      }
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    return sc;
  },
};

// —— pie3d：多层环（沿用 2D 环 + 深度偏移）——
export const pie3dRenderer: FamilyRenderer<Pie3dModel> = {
  view: 'pie3d' as ViewId,
  interactions: ['rotate'],
  layout(m: Pie3dModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const n = Math.max(1, m.n_layers);
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 30;
    const ringW = R / (n + 0.4);
    const dz = 8; // 伪 3D 厚度
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    m.layers.forEach((layer, li) => {
      const r0 = li * ringW, r1 = (li + 1) * ringW - 2;
      let a = -Math.PI / 2;
      layer.slices.forEach((s, i) => {
        const a1 = a + s.share * Math.PI * 2;
        const c = colors[i % colors.length];
        const p = (r: number, aa: number) => `${(cx + r * Math.cos(aa)).toFixed(2)} ${(cy + r * Math.sin(aa)).toFixed(2)}`;
        const lg = a1 - a > Math.PI ? 1 : 0;
        const datum = { kind: 'slice', index: i, label: s.label, value: s.value, tooltip: { title: `${layer.name ?? '层'} · ${s.label}`, rows: [{ swatch: c, name: '值', value: f(s.value), share: `${(s.share * 100).toFixed(1)}%` }] } };
        // 厚度侧壁
        nodes.push({ type: 'path', d: `M${p(r1, a)} v${dz} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} v-${dz} A${r1} ${r1} 0 ${lg} 0 ${p(r1, a)} Z`, fill: c, opacity: 0.7 });
        nodes.push({ type: 'path', d: `M${p(r1, a)} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${lg} 0 ${p(r0, a)} Z`, fill: c, datum });
        a = a1;
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— line3d：等轴折线（z=系列）——
export const line3dRenderer: FamilyRenderer<Line3dModel> = {
  view: 'line3d' as ViewId,
  interactions: ['rotate'],
  layout(m: Line3dModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const az = Number(ctx.state?.azimuth ?? 40), ti = Number(ctx.state?.tilt ?? 28);
    const plot = { x: ctx.plot.x + 40, y: ctx.plot.y + 30, w: ctx.plot.w - 80, h: ctx.plot.h - 80 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const vmax = Math.max(1, ...m.series.flatMap((s) => s.values));
    const gw = plot.w / Math.max(1, m.labels.length - 1), gd = Math.min(90, plot.h * 0.18), gh = plot.h * 0.5;
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.68;
    const P = (x: number, y: number, z: number) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k) as [number, number];
    // 地框
    for (const [a, b, c, d] of [[-plot.w / 2, 0, plot.w / 2, 0], [-plot.w / 2, m.series.length * gd, plot.w / 2, m.series.length * gd]] as const) {
      const [x1, y1] = P(a, 0, 0 + (c === a ? 0 : 0)), [x2, y2] = P(c, 0, 0);
      nodes.push({ type: 'line', x1, y1, x2, y2, stroke: t.grid, strokeWidth: 1 });
    }
    m.series.forEach((s, si) => {
      const z = si * gd;
      const pts = s.values.map((v, i) => P(i * gw - plot.w / 2, -(Math.max(0, v) / vmax) * gh, z));
      nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' '), fill: 'none', stroke: colors[si % colors.length], strokeWidth: 2 });
      const [lx, ly] = P(-plot.w / 2 - 10, 0, z);
      nodes.push({ type: 'text', x: lx - 6, y: ly, text: s.name, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: colors[si % colors.length] });
      pts.forEach(([px, py], i) => hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 8 }, datum: { kind: 'point', index: i, series: s.name, label: m.labels[i], value: s.values[i], tooltip: { title: `${s.name} · ${m.labels[i]}`, rows: [{ swatch: colors[si % colors.length], name: '值', value: fmt(ctx)(s.values[i]) }] } } }));
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— scatter3d：等轴散点 ——
export const scatter3dRenderer: FamilyRenderer<ScatterModel> = {
  view: 'scatter3d' as ViewId,
  interactions: ['rotate'],
  layout(m: ScatterModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const az = Number(ctx.state?.azimuth ?? 40), ti = Number(ctx.state?.tilt ?? 28);
    const plot = { x: ctx.plot.x + 40, y: ctx.plot.y + 30, w: ctx.plot.w - 80, h: ctx.plot.h - 80 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y), zs = m.points.map((p) => p.z ?? 0);
    const nx = scaleLinear([Math.min(...xs), Math.max(...xs)], [-plot.w / 2, plot.w / 2]);
    const ny = scaleLinear([Math.min(...ys), Math.max(...ys)], [0, -plot.h * 0.55]);
    const nz = scaleLinear([Math.min(...zs), Math.max(...zs)], [0, plot.h * 0.35]);
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.68;
    const P = (x: number, y: number, z: number) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k) as [number, number];
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    for (const p of [...m.points].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
      const [px, py] = P(nx(p.x), ny(p.y), nz(p.z ?? 0));
      const c = colors[(gi.get(p.group) ?? 0) % colors.length];
      const datum = { kind: 'point', index: 0, series: p.group, label: p.label, value: p.y, tooltip: { title: p.label, rows: [{ swatch: c, name: 'x', value: fmt(ctx)(p.x) }, { name: 'y', value: fmt(ctx)(p.y) }, { name: 'z', value: fmt(ctx)(p.z ?? 0) }] } };
      nodes.push({ type: 'line', x1: px, y1: py, x2: px, y2: P(nx(p.x), 0, nz(p.z ?? 0))[1], stroke: c, strokeWidth: 0.5, opacity: 0.4 });
      nodes.push({ type: 'circle', cx: px, cy: py, r: 4.5, fill: c, opacity: 0.85, datum });
      hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 9 }, datum });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.length > 1 ? m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length] })) : [];
    return sc;
  },
};
