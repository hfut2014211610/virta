// B2：heatmap / treemap / sunburst / sankey / boxplot / radar。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, formatNumber, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors, rampSequential } from '@virta/design-system';
import type { BoxplotModel, HeatmapModel, RadarModel, SankeyModel, SunburstModel, TreemapModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');

// —— heatmap：matrix 格 + calendar 年视图 ——
export const heatmapRenderer: FamilyRenderer<HeatmapModel> = {
  view: 'heatmap' as ViewId,
  layout(m: HeatmapModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const ramp = rampSequential(ctx.palette, ctx.theme);
    const color = (v: number) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(((v - m.vmin) / Math.max(1e-9, m.vmax - m.vmin)) * (ramp.length - 1))))];
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    if (m.mode === 'matrix' && m.xs && m.ys && m.cells) {
      const padL = Math.max(56, ...m.ys.map((y) => measureText(y, 'mono', 11) + 14));
      const padB = 40;
      const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 12, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 12 - padB };
      const cw = plot.w / m.xs.length, ch = plot.h / m.ys.length;
      m.ys.forEach((y, i) => nodes.push({ type: 'text', x: plot.x - 8, y: plot.y + i * ch + ch / 2, text: y, font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted }));
      const xStep = Math.max(1, Math.ceil(m.xs.length / 20));
      m.xs.forEach((x, i) => { if (i % xStep === 0) nodes.push({ type: 'text', x: plot.x + i * cw + cw / 2, y: plot.y + plot.h + 6, text: x, font: 'mono', size: 10.5, anchor: 'middle', baseline: 'top', fill: t.muted }); });
      for (const c of m.cells) {
        const v = c.v;
        const datum = { kind: 'cell', index: 0, label: `${m.xs[c.x]}/${m.ys[c.y]}`, value: v, tooltip: { title: `${m.xs[c.x]} × ${m.ys[c.y]}`, rows: [{ swatch: color(v), name: '值', value: f(v) }] } };
        nodes.push({ type: 'rect', x: plot.x + c.x * cw + 0.5, y: plot.y + c.y * ch + 0.5, w: cw - 1, h: ch - 1, r: Math.min(3, cw / 4), fill: color(v), datum });
        hits.push({ shape: { type: 'rect', x: plot.x + c.x * cw, y: plot.y + c.y * ch, w: cw, h: ch }, datum });
      }
    } else if (m.years) {
      // calendar：每年一格阵（周×星期）
      const years = Object.keys(m.years);
      const yrMap = m.years;
      const cellW = Math.min(16, (ctx.plot.w - 80) / 54);
      years.forEach((yr, yi) => {
        const ox = ctx.plot.x + 50, oy = ctx.plot.y + 20 + yi * (7 * cellW + 30);
        nodes.push({ type: 'text', x: ctx.plot.x + 6, y: oy + 3.5 * cellW, text: yr, font: 'mono', size: 11, anchor: 'start', baseline: 'middle', fill: t.muted });
        const jan1 = Math.floor(Date.UTC(+yr, 0, 1) / 86400000) + 719163;
        const jan1Dow = new Date((jan1 - 719163) * 86400000).getUTCDay();
        for (const [od, v] of yrMap[yr]) {
          const week = Math.floor((od - jan1 + jan1Dow) / 7);
          const dow = new Date((od - 719163) * 86400000).getUTCDay();
          nodes.push({ type: 'rect', x: ox + week * cellW, y: oy + dow * cellW, w: cellW - 1.5, h: cellW - 1.5, r: 2, fill: v > 0 ? color(v) : t.grid, opacity: v > 0 ? 1 : 0.4 });
        }
      });
    }
    // 色阶
    const lg = { x: ctx.plot.x + ctx.plot.w - 130, y: ctx.plot.y + ctx.plot.h - 6, w: 110 };
    ramp.forEach((c, i) => nodes.push({ type: 'rect', x: lg.x + (i * lg.w) / ramp.length, y: lg.y, w: lg.w / ramp.length + 0.5, h: 8, fill: c }));
    nodes.push({ type: 'text', x: lg.x, y: lg.y + 10, text: f(m.vmin), font: 'mono', size: 9.5, baseline: 'top', fill: t.faint });
    nodes.push({ type: 'text', x: lg.x + lg.w, y: lg.y + 10, text: f(m.vmax), font: 'mono', size: 9.5, anchor: 'end', baseline: 'top', fill: t.faint });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— treemap：squarified ——
function squarify(items: { label: string; value: number; share: number; group?: string }[], x: number, y: number, w: number, h: number, out: { label: string; value: number; group?: string; x: number; y: number; w: number; h: number }[]) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  let row: typeof items = [], cx = x, cy = y, cw = w, ch = h;
  const worst = (r: typeof items) => {
    const s = r.reduce((a, b) => a + b.value, 0) / total;
    const side = Math.min(cw, ch);
    let m = 0;
    for (const it of r) { const f = (it.value / total) * cw * ch / (side || 1) / (s * Math.max(cw, ch) / (side || 1) || 1); m = Math.max(m, Math.max(f, 1 / f)); }
    return m;
  };
  const layRow = (r: typeof items) => {
    const s = r.reduce((a, b) => a + b.value, 0) / total;
    if (cw >= ch) { const rw = s * cw; let ry = cy; for (const it of r) { const rh = (it.value / total) * cw * ch / (rw || 1); out.push({ label: it.label, value: it.value, group: it.group, x: cx, y: ry, w: rw, h: rh }); ry += rh; } cx += rw; cw -= rw; }
    else { const rh = s * ch; let rx = cx; for (const it of r) { const rw = (it.value / total) * cw * ch / (rh || 1); out.push({ label: it.label, value: it.value, group: it.group, x: rx, y: cy, w: rw, h: rh }); rx += rw; } cy += rh; ch -= rh; }
  };
  for (const it of items) {
    if (row.length && worst([...row, it]) > worst(row)) { layRow(row); row = []; }
    row.push(it);
  }
  if (row.length) layRow(row);
}
export const treemapRenderer: FamilyRenderer<TreemapModel> = {
  view: 'treemap' as ViewId,
  interactions: ['drill'],
  layout(m: TreemapModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const plot = { x: ctx.plot.x + 6, y: ctx.plot.y + 6, w: ctx.plot.w - 12, h: ctx.plot.h - 12 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const rects: { label: string; value: number; group?: string; x: number; y: number; w: number; h: number }[] = [];
    if (m.mode === 'grouped' && m.groups) {
      const gmap = new Map<string, number>();
      m.groups.forEach((gp, gi) => gmap.set(gp.name, gi));
      const gRects: typeof rects = [];
      squarify(m.groups.map((gp) => ({ label: gp.name, value: gp.value, share: gp.share })), plot.x, plot.y, plot.w, plot.h, gRects);
      gRects.forEach((gr) => {
        const gi = gmap.get(gr.label)!;
        nodes.push({ type: 'rect', x: gr.x, y: gr.y, w: gr.w, h: gr.h, fill: 'none', stroke: t.ink, strokeWidth: 1.2 });
        nodes.push({ type: 'text', x: gr.x + 4, y: gr.y + 3, text: gr.label, font: 'mono', size: 10.5, baseline: 'top', fill: t.ink });
        squarify(m.groups![gi].children.map((c) => ({ ...c, group: gr.label })), gr.x + 1, gr.y + 16, gr.w - 2, gr.h - 17, rects);
      });
    } else if (m.flat) {
      squarify(m.flat.map((c) => ({ ...c })), plot.x, plot.y, plot.w, plot.h, rects);
    }
    rects.forEach((r, i) => {
      const gi = r.group ? m.groups!.findIndex((gp) => gp.name === r.group) : i;
      const c = colors[(gi < 0 ? i : gi) % colors.length];
      const datum = { kind: 'tile', index: i, label: r.label, value: r.value, tooltip: { title: r.label, rows: [{ swatch: c, name: '值', value: f(r.value) }] } };
      nodes.push({ type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: 2, fill: c, opacity: 0.85, stroke: t.paper, strokeWidth: 1.5, datum });
      if (r.w > 46 && r.h > 16) nodes.push({ type: 'text', x: r.x + 4, y: r.y + r.h / 2, text: `${r.label} ${f(r.value)}`, font: 'body', size: 10.5, baseline: 'middle', fill: '#fff', datum });
      hits.push({ shape: { type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— sunburst：层级环 ——
export const sunburstRenderer: FamilyRenderer<SunburstModel> = {
  view: 'sunburst' as ViewId,
  interactions: ['drill'],
  layout(m: SunburstModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 24;
    const depth = Math.max(1, m.counts.depth);
    const ringW = R / (depth + 0.5);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const arc = (r0: number, r1: number, a0: number, a1: number) => {
      const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      const lg = a1 - a0 > Math.PI ? 1 : 0;
      return `M${p(r1, a0)} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${lg} 0 ${p(r0, a0)} Z`;
    };
    const walk = (n: { name: string; value: number; children: { name: string; value: number; children: never[] }[] }, lv: number, a0: number, a1: number, ci: number) => {
      const c = colors[ci % colors.length];
      if (lv > 0) {
        const datum = { kind: 'sector', index: lv, label: n.name, value: n.value, tooltip: { title: n.name, rows: [{ swatch: c, name: '值', value: f(n.value) }] } };
        nodes.push({ type: 'path', d: arc(lv * ringW, (lv + 1) * ringW - 1.5, a0, a1), fill: c, opacity: 0.55 + 0.4 * (lv / depth), datum });
        const am = (a0 + a1) / 2, rr = (lv + 0.5) * ringW;
        if (a1 - a0 > 0.09) nodes.push({ type: 'text', x: cx + rr * Math.cos(am), y: cy + rr * Math.sin(am), text: n.name, font: 'body', size: 10, anchor: 'middle', baseline: 'middle', rotate: ((am * 180) / Math.PI + (am > Math.PI / 2 || am < -Math.PI / 2 ? 180 : 0)), fill: t.paper });
        hits.push({ shape: { type: 'circle', cx: cx + rr * Math.cos(am), cy: cy + rr * Math.sin(am), r: ringW / 2 }, datum });
      }
      let a = a0;
      n.children?.forEach((k, i) => { const span = (k.value / Math.max(1e-9, n.value)) * (a1 - a0); walk(k as never, lv + 1, a, a + span, lv === 0 ? i : ci); a += span; });
    };
    walk(m.tree as never, 0, -Math.PI / 2, Math.PI * 1.5, 0);
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— sankey：按 depth 分列的流 ——
export const sankeyRenderer: FamilyRenderer<SankeyModel> = {
  view: 'sankey' as ViewId,
  layout(m: SankeyModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const depth = Math.max(1, ...m.nodes.map((n) => n.depth));
    const pad = { l: 92, r: 110, t: 16, b: 16 };
    const plot = { x: ctx.plot.x + pad.l, y: ctx.plot.y + pad.t, w: ctx.plot.w - pad.l - pad.r, h: ctx.plot.h - pad.t - pad.b };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const colX = (d: number) => plot.x + (d / Math.max(1, depth)) * (plot.w - 14);
    // 每列节点纵向堆叠
    const cols = new Map<number, number[]>();
    m.nodes.forEach((n, i) => { const c = cols.get(n.depth) ?? []; c.push(i); cols.set(n.depth, c); });
    const pos: { x: number; y: number; h: number }[] = [];
    cols.forEach((idxs, d) => {
      const tot = idxs.reduce((a, i) => a + m.nodes[i].value, 0) || 1;
      const gap = Math.min(14, plot.h / (idxs.length * 4));
      const avail = plot.h - gap * (idxs.length - 1);
      let y = plot.y;
      idxs.forEach((i) => {
        const h = Math.max(6, (m.nodes[i].value / tot) * avail);
        pos[i] = { x: colX(d), y, h };
        y += h + gap;
      });
    });
    // 出/入端口游标
    const srcY = new Map<number, number>(), dstY = new Map<number, number>();
    for (const l of m.links) {
      const s = pos[l.s], d = pos[l.t];
      const sh = (l.v / Math.max(1e-9, m.nodes[l.s].value)) * s.h;
      const dh = (l.v / Math.max(1e-9, m.nodes[l.t].value)) * d.h;
      const sy = (srcY.get(l.s) ?? s.y), dy = (dstY.get(l.t) ?? d.y);
      srcY.set(l.s, sy + sh); dstY.set(l.t, dy + dh);
      const x1 = s.x + 14, x2 = d.x;
      const mx = (x1 + x2) / 2;
      nodes.push({ type: 'path', d: `M${x1} ${sy} C${mx} ${sy} ${mx} ${dy} ${x2} ${dy} L${x2} ${dy + dh} C${mx} ${dy + dh} ${mx} ${sy + sh} ${x1} ${sy + sh} Z`, fill: colors[l.s % colors.length], opacity: 0.22 });
    }
    m.nodes.forEach((n, i) => {
      const p = pos[i];
      const c = colors[i % colors.length];
      const datum = { kind: 'node', index: i, label: n.name, value: n.value, tooltip: { title: n.name, rows: [{ swatch: c, name: '流量', value: f(n.value) }] } };
      nodes.push({ type: 'rect', x: p.x, y: p.y, w: 14, h: p.h, r: 2, fill: c, datum });
      nodes.push({ type: 'text', x: n.depth === 0 ? p.x - 5 : p.x + 19, y: p.y + p.h / 2, text: n.name, font: 'body', size: 10.5, anchor: n.depth === 0 ? 'end' : 'start', baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: p.x, y: p.y, w: 14, h: p.h }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— boxplot ——
export const boxplotRenderer: FamilyRenderer<BoxplotModel> = {
  view: 'boxplot' as ViewId,
  layout(m: BoxplotModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const padL = Math.max(64, ...m.groups.map((g2) => measureText(g2.name, 'mono', 11) + 16));
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 18, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 36 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const xx = scaleLinear([m.counts.vmin, Math.max(m.counts.vmin + 1, m.counts.vmax)], [plot.x, plot.x + plot.w]);
    const n = m.groups.length;
    const rowH = plot.h / Math.max(1, n);
    const f = fmt(ctx);
    // 横向网格+刻度
    xx.ticks.forEach((v) => {
      nodes.push({ type: 'line', x1: xx(v), y1: plot.y, x2: xx(v), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: xx(v), y: plot.y + plot.h + 5, text: f(v), font: 'mono', size: 10, anchor: 'middle', baseline: 'top', fill: t.faint });
    });
    m.groups.forEach((g2, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const bh = Math.min(22, rowH * 0.5);
      const c = colors[i % colors.length];
      const datum = { kind: 'box', index: i, label: g2.name, value: g2.med, tooltip: { title: g2.name, rows: [{ swatch: c, name: '中位', value: f(g2.med) }, { name: 'Q1–Q3', value: `${f(g2.q1)}–${f(g2.q3)}` }, { name: 'min–max', value: `${f(g2.min)}–${f(g2.max)}` }] } };
      nodes.push({ type: 'line', x1: xx(g2.min), y1: cy, x2: xx(g2.max), y2: cy, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'line', x1: xx(g2.min), y1: cy - bh / 3, x2: xx(g2.min), y2: cy + bh / 3, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'line', x1: xx(g2.max), y1: cy - bh / 3, x2: xx(g2.max), y2: cy + bh / 3, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'rect', x: xx(g2.q1), y: cy - bh / 2, w: Math.max(1, xx(g2.q3) - xx(g2.q1)), h: bh, r: 2, fill: c, opacity: 0.3, stroke: c, strokeWidth: 1.2, datum });
      nodes.push({ type: 'line', x1: xx(g2.med), y1: cy - bh / 2, x2: xx(g2.med), y2: cy + bh / 2, stroke: c, strokeWidth: 2 });
      if (g2.mean) nodes.push({ type: 'circle', cx: xx(g2.mean), cy, r: 2.5, fill: t.ink });
      for (const o of g2.outliers) nodes.push({ type: 'circle', cx: xx(o), cy, r: 2, fill: 'none', stroke: t.neg, strokeWidth: 1 });
      nodes.push({ type: 'text', x: plot.x - 8, y: cy, text: g2.name, font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— radar ——
export const radarRenderer: FamilyRenderer<RadarModel> = {
  view: 'radar' as ViewId,
  layout(m: RadarModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 40;
    const n = m.nax;
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i: number, r: number) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    // 蛛网
    for (const lv of [0.25, 0.5, 0.75, 1]) {
      nodes.push({ type: 'path', d: m.axes.map((_, i) => `${i ? 'L' : 'M'}${pt(i, R * lv).join(' ')}`).join(' ') + ' Z', fill: 'none', stroke: t.grid, strokeWidth: 1 });
    }
    m.axes.forEach((ax, i) => {
      const [x2, y2] = pt(i, R);
      nodes.push({ type: 'line', x1: cx, y1: cy, x2, y2, stroke: t.grid, strokeWidth: 1 });
      const [lx, ly] = pt(i, R + 18);
      nodes.push({ type: 'text', x: lx, y: ly, text: ax.label, font: 'body', size: 11, anchor: 'middle', baseline: 'middle', fill: t.muted });
    });
    m.items.forEach((it, si) => {
      const c = colors[si % colors.length];
      const pts = it.norm.map((v, i) => pt(i, v * R));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ' Z';
      nodes.push({ type: 'path', d, fill: c, opacity: 0.15 });
      nodes.push({ type: 'path', d, fill: 'none', stroke: c, strokeWidth: 2 });
      pts.forEach(([px, py], i) => hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 9 }, datum: { kind: 'vertex', index: i, series: it.name, label: m.axes[i].label, value: it.values[i], tooltip: { title: `${it.name} · ${m.axes[i].label}`, rows: [{ swatch: c, name: '值', value: fmt(ctx)(it.values[i]) }] } } }));
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.items.map((it, i) => ({ name: it.name, color: colors[i % colors.length] }));
    return sc;
  },
};
