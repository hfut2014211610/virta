// B1：matrix3d / scatter / pie / bullet / funnel。
import type { ViewId } from '@virta/contracts';
import type { Node, Paint, Scene } from '@virta/chart-core';
import { g, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, formatNumber, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors } from '@virta/design-system';
import type { BarlineModel, BulletModel, FunnelModel, PieModel, ScatterModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

const PLOT = (ctx: LayoutContext, r = 16) => ({
  x: ctx.plot.x + 56, y: ctx.plot.y + 22, w: ctx.plot.w - 56 - r, h: ctx.plot.h - 56,
});
const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');

/** 伪 3D 投影：azimuth/tilt（度）→ 等轴偏移。 */
export function project3d(x: number, y: number, z: number, az: number, ti: number): [number, number] {
  const a = (az * Math.PI) / 180, t = (ti * Math.PI) / 180;
  const x2 = x * Math.cos(a) - z * Math.sin(a);
  const z2 = x * Math.sin(a) + z * Math.cos(a);
  return [x2, y * Math.cos(t) - z2 * Math.sin(t)];
}

// —— matrix3d：labels×series 的 3D 柱状矩阵 ——
export const matrix3dRenderer: FamilyRenderer<BarlineModel> = {
  view: 'matrix3d' as ViewId,
  interactions: ['rotate'],
  layout(m: BarlineModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const az = Number(ctx.state?.azimuth ?? 45), ti = Number(ctx.state?.tilt ?? 30);
    const plot = { x: ctx.plot.x + 70, y: ctx.plot.y + 30, w: ctx.plot.w - 120, h: ctx.plot.h - 90 };
    const nodes: Node[] = [];
    const vmax = Math.max(1, ...m.series.flatMap((s) => s.values));
    const cols = m.labels.length, rows = m.series.length;
    const gw = plot.w / cols, gd = plot.h / rows;
    const maxH = Math.min(90, plot.h * 0.5);
    // 地面网格
    for (let i = 0; i <= cols; i++) {
      const [x1, y1] = project3d(i * gw - plot.w / 2, 0, -plot.h / 2, az, ti);
      const [x2, y2] = project3d(i * gw - plot.w / 2, 0, plot.h / 2, az, ti);
      nodes.push({ type: 'line', x1: ctx.plot.x + ctx.plot.w / 2 + x1, y1: ctx.plot.y + ctx.plot.h * 0.62 + y1, x2: ctx.plot.x + ctx.plot.w / 2 + x2, y2: ctx.plot.y + ctx.plot.h * 0.62 + y2, stroke: t.grid, strokeWidth: 1 });
    }
    for (let j = 0; j <= rows; j++) {
      const [x1, y1] = project3d(-plot.w / 2, 0, j * gd - plot.h / 2, az, ti);
      const [x2, y2] = project3d(plot.w / 2, 0, j * gd - plot.h / 2, az, ti);
      nodes.push({ type: 'line', x1: ctx.plot.x + ctx.plot.w / 2 + x1, y1: ctx.plot.y + ctx.plot.h * 0.62 + y1, x2: ctx.plot.x + ctx.plot.w / 2 + x2, y2: ctx.plot.y + ctx.plot.h * 0.62 + y2, stroke: t.grid, strokeWidth: 1 });
    }
    // 柱（后→前序）
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.62;
    for (let zi = rows - 1; zi >= 0; zi--) for (let xi = 0; xi < cols; xi++) {
      const v = m.series[zi].values[xi];
      const h = (Math.max(0, v) / vmax) * maxH;
      const bx = xi * gw + gw * 0.15 - plot.w / 2, bz = zi * gd + gd * 0.15 - plot.h / 2;
      const bw = gw * 0.7, bd = gd * 0.7;
      const c = colors[zi % colors.length];
      const P = (x: number, y: number, z: number) => project3d(x, y, z, az, ti).map((k, i2) => (i2 ? cy0 : cx0) + k) as [number, number];
      const p = (x: number, y: number, z: number) => { const q = P(x, y, z); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
      // 正面/顶面/侧面
      nodes.push({ type: 'path', d: `M${p(bx, 0, bz)} L${p(bx + bw, 0, bz)} L${p(bx + bw, -h, bz)} L${p(bx, -h, bz)} Z`, fill: c, opacity: 0.92 });
      nodes.push({ type: 'path', d: `M${p(bx + bw, 0, bz)} L${p(bx + bw, 0, bz + bd)} L${p(bx + bw, -h, bz + bd)} L${p(bx + bw, -h, bz)} Z`, fill: 'rgba(0,0,0,.22)' });
      nodes.push({ type: 'path', d: `M${p(bx, -h, bz)} L${p(bx + bw, -h, bz)} L${p(bx + bw, -h, bz + bd)} L${p(bx, -h, bz + bd)} Z`, fill: 'rgba(255,255,255,.25)' });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    (sc as { legend?: LegendItem[] }).legend = m.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— scatter ——
export const scatterRenderer: FamilyRenderer<ScatterModel> = {
  view: 'scatter' as ViewId,
  interactions: ['brush'],
  layout(m: ScatterModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const plot = PLOT(ctx);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y);
    const xMin = Number(ctx.options?.['xMin'] ?? Math.min(0, ...xs)), xMax = Number(ctx.options?.['xMax'] ?? Math.max(1, ...xs));
    const yMin = Number(ctx.options?.['yMin'] ?? Math.min(0, ...ys)), yMax = Number(ctx.options?.['yMax'] ?? Math.max(1, ...ys));
    const x = scaleLinear([xMin, xMax], [plot.x, plot.x + plot.w]);
    const y = scaleLinear([yMin, yMax], [plot.y + plot.h, plot.y]);
    nodes.push(...yAxis(y, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t, fmt(ctx)));
    x.ticks.forEach((v) => {
      nodes.push({ type: 'line', x1: x(v), y1: plot.y, x2: x(v), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: x(v), y: plot.y + plot.h + 6, text: x.fmt(v), font: 'mono', size: 11, anchor: 'middle', baseline: 'top', fill: t.muted });
    });
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    const smax = Math.max(1, ...m.points.map((p) => p.size ?? 0));
    for (const p of m.points) {
      const c = colors[(gi.get(p.group) ?? 0) % colors.length];
      const r = p.size ? 3 + 9 * Math.sqrt(p.size / smax) : 4;
      const datum = { kind: 'point', index: 0, series: p.group, label: p.label, value: p.y, tooltip: { title: p.label, rows: [{ swatch: c, name: 'x', value: fmt(ctx)(p.x) }, { name: 'y', value: fmt(ctx)(p.y) }] } };
      nodes.push({ type: 'circle', cx: x(p.x), cy: y(p.y), r, fill: c, opacity: 0.82, datum });
      hits.push({ shape: { type: 'circle', cx: x(p.x), cy: y(p.y), r: Math.max(r + 3, 9) }, datum });
    }
    if (m.fit) {
      const { m: k, b, x0, x1, r } = m.fit;
      nodes.push({ type: 'line', x1: x(x0), y1: y(k * x0 + b), x2: x(x1), y2: y(k * x1 + b), stroke: t.acc, strokeWidth: 1.5, dash: [6, 4] });
      if (r !== null) nodes.push({ type: 'text', x: plot.x + plot.w - 8, y: plot.y + 4, text: `r=${r.toFixed(2)}`, font: 'mono', size: 11, anchor: 'end', baseline: 'top', fill: t.acc });
    }
    nodes.push(...annotationNodes(ctx.annotations, { plot, xOf: (v) => x(Number(v)), yOf: y, format: fmt(ctx) }, t));
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.length > 1 ? m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length] })) : [];
    return sc;
  },
};

// —— pie/donut ——
function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}
export const pieRenderer: FamilyRenderer<PieModel> = {
  view: 'pie' as ViewId,
  layout(m: PieModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const donut = (ctx.variant ?? 'pie') === 'donut';
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const r1 = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 30, r0 = donut ? r1 * 0.55 : 0;
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    let a = -Math.PI / 2;
    m.slices.forEach((s, i) => {
      const a1 = a + s.share * Math.PI * 2 * (m.slices.length === 1 ? 0.9999 : 1);
      const c = colors[i % colors.length];
      const datum = { kind: 'slice', index: i, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value), share: `${(s.share * 100).toFixed(1)}%` }] } };
      nodes.push({ type: 'path', d: arcPath(cx, cy, r0, r1, a, a1), fill: c, datum });
      // 标签（外侧引线）
      const am = (a + a1) / 2, lr = r1 + 16;
      if (s.share > 0.03) {
        const lx = cx + lr * Math.cos(am), ly = cy + lr * Math.sin(am);
        nodes.push({ type: 'line', x1: cx + (r1 + 2) * Math.cos(am), y1: cy + (r1 + 2) * Math.sin(am), x2: lx, y2: ly, stroke: t.faint, strokeWidth: 1 });
        nodes.push({ type: 'text', x: lx + (lx > cx ? 4 : -4), y: ly, text: `${s.label} ${(s.share * 100).toFixed(0)}%`, font: 'body', size: 11, anchor: lx > cx ? 'start' : 'end', baseline: 'middle', fill: t.muted });
      }
      hits.push({ shape: { type: 'circle', cx: cx + (r0 + r1) / 2 * Math.cos((a + a1) / 2), cy: cy + (r0 + r1) / 2 * Math.sin((a + a1) / 2), r: (r1 - r0) / 2 + 10 }, datum });
      a = a1;
    });
    if (donut) nodes.push({ type: 'text', x: cx, y: cy, text: fmt(ctx)(m.slices.reduce((s2, x) => s2 + x.value, 0)), font: 'display', size: 26, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.ink });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = [];
    return sc;
  },
};

// —— bullet：水平条形 + 目标刻度 + 差/好区间 ——
export const bulletRenderer: FamilyRenderer<BulletModel> = {
  view: 'bullet' as ViewId,
  layout(m: BulletModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const plot = { x: ctx.plot.x + 110, y: ctx.plot.y + 16, w: ctx.plot.w - 130, h: ctx.plot.h - 40 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const x = scaleLinear([0, Math.max(1, m.scale)], [plot.x, plot.x + plot.w]);
    const n = m.items.length;
    const rowH = plot.h / Math.max(1, n);
    const barH = Math.min(20, rowH * 0.4);
    m.items.forEach((it, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const poor = it.poor ?? m.scale * 0.5, good = it.good ?? m.scale * 0.85;
      // 区间带
      nodes.push({ type: 'rect', x: plot.x, y: cy - barH * 0.9, w: x(poor) - plot.x, h: barH * 1.8, fill: t.neg, opacity: 0.14 });
      nodes.push({ type: 'rect', x: x(poor), y: cy - barH * 0.9, w: x(good) - x(poor), h: barH * 1.8, fill: t.acc, opacity: 0.1 });
      nodes.push({ type: 'rect', x: x(good), y: cy - barH * 0.9, w: x(m.scale) - x(good), h: barH * 1.8, fill: t.pos, opacity: 0.14 });
      // 实际条 + 目标刻线
      const ratio = it.target ? it.actual / it.target : 1;
      const c = ratio >= 1 ? t.pos : ratio >= 0.8 ? t.warn : t.neg;
      const datum = { kind: 'bullet', index: i, label: it.label, value: it.actual, tooltip: { title: it.label, rows: [{ swatch: c, name: '实际', value: fmt(ctx)(it.actual) }, { name: '目标', value: fmt(ctx)(it.target) }] } };
      nodes.push({ type: 'rect', x: plot.x, y: cy - barH / 2, w: Math.max(0, x(it.actual) - plot.x), h: barH, r: 3, fill: c, datum });
      nodes.push({ type: 'line', x1: x(it.target), y1: cy - barH * 0.85, x2: x(it.target), y2: cy + barH * 0.85, stroke: t.ink, strokeWidth: 2 });
      nodes.push({ type: 'text', x: plot.x - 10, y: cy, text: it.label, font: 'body', size: 11.5, anchor: 'end', baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— funnel ——
export const funnelRenderer: FamilyRenderer<FunnelModel> = {
  view: 'funnel' as ViewId,
  layout(m: FunnelModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const center = ctx.variant !== 'left';
    const plot = { x: ctx.plot.x + 30, y: ctx.plot.y + 16, w: ctx.plot.w - 160, h: ctx.plot.h - 30 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const n = m.stages.length;
    const h = plot.h / Math.max(1, n);
    m.stages.forEach((s, i) => {
      const w0 = (s.value / Math.max(1e-9, m.top)) * plot.w;
      const w1 = ((m.stages[i + 1]?.value ?? s.value) / Math.max(1e-9, m.top)) * plot.w;
      const y0 = plot.y + i * h;
      const x = (w: number) => center ? plot.x + (plot.w - w) / 2 : plot.x;
      const c = colors[i % colors.length];
      const datum = { kind: 'stage', index: i, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value) }, { name: '转化', value: s.step !== null && s.step !== undefined ? `${(s.step * 100).toFixed(1)}%` : '—' }] } };
      nodes.push({ type: 'path', d: `M${x(w0)} ${y0} L${x(w0) + w0} ${y0} L${x(w1) + w1} ${y0 + h - 3} L${x(w1)} ${y0 + h - 3} Z`, fill: c, datum });
      nodes.push({ type: 'text', x: x(Math.max(w0, w1)) + Math.max(w0, w1) + 14, y: y0 + h / 2, text: `${s.label} ${fmt(ctx)(s.value)}${i > 0 && s.step !== null && s.step !== undefined ? ` · ${(s.step! * 100).toFixed(0)}%` : ''}`, font: 'mono', size: 11, baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: x(Math.max(w0, w1)), y: y0, w: Math.max(w0, w1), h: h - 3 }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};
