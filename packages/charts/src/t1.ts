// T1 新视图渲染器（M6）：combo / rank / histogram / kpi / compare / cohort。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, scaleBand, scaleLinear, scene } from '@virta/chart-core';
import { axisTitle, formatNumber, xAxisBand, xAxisTicks, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors } from '@virta/design-system';
import type {
  BarlineModel, CohortModel, CompareModel, HistogramModel, KpiModel, RankModel,
} from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

const fm = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');
const fpct = (v: number) => `${(v * 100).toFixed(0)}%`;

// ── combo：左轴柱/线 + 右轴柱/线 ─────────────────────────────────────
export const comboRenderer: FamilyRenderer<BarlineModel> = {
  view: 'combo' as ViewId,
  interactions: ['brush'],
  layout(m: BarlineModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const variant = ctx.variant ?? 'bar+line';
    const y2Sel = String(ctx.options?.['y2Series'] ?? 'auto');
    const y2Idx = y2Sel === 'first' ? 0 : m.series.length - 1; // auto/second → 末列
    const y2IsPct = String(ctx.options?.['y2Format'] ?? 'auto') === 'percent'
      || (String(ctx.options?.['y2Format'] ?? 'auto') === 'auto'
        && m.series[y2Idx].values.every((v) => v >= 0 && v <= 100));
    const plot = { x: ctx.plot.x + 56, y: ctx.plot.y + 20, w: ctx.plot.w - 122, h: ctx.plot.h - 66 };
    const x = scaleBand(m.labels, [plot.x, plot.x + plot.w], 0.2);
    const y1v = m.series.filter((_, i) => i !== y2Idx).flatMap((s) => s.values);
    const y2v = m.series[y2Idx].values;
    const y1 = scaleLinear([Math.min(0, ...y1v), Number(ctx.options?.['yMax'] ?? (Math.max(...y1v, 0) * 1.08 || 1))], [plot.y + plot.h, plot.y]);
    const y2 = scaleLinear([Math.min(0, ...y2v), Number(ctx.options?.['y2Max'] ?? (Math.max(...y2v, 0) * 1.08 || 1))], [plot.y + plot.h, plot.y]);
    const fmtY2 = y2IsPct ? (v: number) => `${fm(ctx)(v)}%` : fm(ctx);
    nodes.push(...yAxis(y1, plot, t, fm(ctx)));
    // 右轴刻度画在 plot 右侧（无网格线）
    y2.ticks.forEach((tv) => {
      nodes.push({ type: 'text', x: plot.x + plot.w + 6, y: y2(tv), text: fmtY2(tv), font: 'mono', size: 10.5, anchor: 'start', baseline: 'middle', fill: t.muted });
      nodes.push({ type: 'line', x1: plot.x + plot.w, y1: y2(tv), x2: plot.x + plot.w + 4, y2: y2(tv), stroke: t.line2 });
    });
    nodes.push(...xAxisBand(x, plot, t));
    nodes.push(...axisTitle(ctx.text?.unit, plot, t));
    const sline = String(ctx.options?.['lineStyle'] ?? 'smooth');
    m.series.forEach((s, si) => {
      const isY2 = si === y2Idx;
      const yv = isY2 ? y2 : y1;
      const bar = variant === 'bar+bar' || (variant === 'bar+line' && !isY2);
      const col = colors[si % colors.length];
      if (bar) {
        const bw = Math.max(2, x.bandwidth * (variant === 'bar+bar' ? 0.42 : 0.6));
        const off = variant === 'bar+bar' ? (isY2 ? bw / 2 + 2 : -bw / 2 - 2) : 0;
        m.labels.forEach((lab, i) => {
          const v = s.values[i] ?? 0;
          const y0 = yv(Math.max(0, v)), y1p = yv(Math.min(0, v));
          const rx = x(lab) + x.bandwidth / 2 + off - bw / 2;
          nodes.push({ type: 'rect', x: rx, y: y0, w: bw, h: Math.max(1, Math.abs(y1p - y0)), r: 2, fill: col, opacity: isY2 ? 0.85 : 1 });
          hits.push({ shape: { type: 'rect', x: rx, y: y0, w: bw, h: Math.max(Math.abs(y1p - y0), 4) },
            datum: { kind: 'bar', index: i, series: s.name, label: lab, value: v, tooltip: { title: lab, rows: [{ swatch: col, name: s.name, value: isY2 ? fmtY2(v) : fm(ctx)(v) }] } } });
        });
      } else {
        const pts = m.labels.map((lab, i) => ({ x: x(lab) + x.bandwidth / 2, y: yv(s.values[i] ?? 0) }));
        nodes.push({
          type: 'path',
          d: sline === 'step'
            ? pts.map((p, i) => `${i === 0 ? 'M' : 'H'}${p.x.toFixed(2)} V${p.y.toFixed(2)}`).join(' ')
            : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '),
          fill: 'none', stroke: col, strokeWidth: 2.5,
        });
        pts.forEach((p, i) => {
          nodes.push({ type: 'circle', cx: p.x, cy: p.y, r: 3.5, fill: t.paper, stroke: col, strokeWidth: 2 });
          hits.push({ shape: { type: 'circle', cx: p.x, cy: p.y, r: 8 },
            datum: { kind: 'point', index: i, series: s.name, label: m.labels[i], value: s.values[i], tooltip: { title: m.labels[i], rows: [{ swatch: col, name: s.name, value: isY2 ? fmtY2(s.values[i]) : fm(ctx)(s.values[i]) }] } } });
        });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// ── rank：横向排行；race 按 state.time 取帧 ─────────────────────────
export const rankRenderer: FamilyRenderer<RankModel> = {
  view: 'rank' as ViewId,
  interactions: ['brush', 'play'],
  layout(m: RankModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const topN = Math.max(3, Number(ctx.options?.['topN'] ?? 10));
    const order = String(ctx.options?.['order'] ?? 'desc');
    const others = ctx.options?.['others'] !== false;
    let items = [...(m.items ?? [])];
    let frameLabel = '';
    if (m.mode === 'race' && m.frames?.length) {
      const st = ctx.state?.time;
      const f = st === undefined || st === null
        ? m.frames[m.frames.length - 1]
        : (m.frames.find((fr) => fr.time === String(st)) ?? m.frames[Math.min(m.frames.length - 1, Number(st) || 0)]);
      items = [...f.items];
      frameLabel = f.time;
    }
    items.sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value));
    const shown = items.slice(0, topN);
    if (others && items.length > topN) shown.push({ label: '其他', value: items.slice(topN).reduce((a, b) => a + b.value, 0) });
    const n = shown.length;
    const plot = { x: ctx.plot.x + 110, y: ctx.plot.y + 24, w: ctx.plot.w - 220, h: ctx.plot.h - 78 };
    const rowH = Math.min(34, (plot.h - 10) / Math.max(1, n));
    const vMax = Math.max(1e-9, Number(ctx.options?.['yMax'] ?? Math.max(...shown.map((s) => s.value), 1) * 1.1));
    shown.forEach((it, i) => {
      const y0 = plot.y + i * rowH;
      const w = Math.max(1, (it.value / vMax) * plot.w);
      const col = colors[i % colors.length];
      nodes.push({ type: 'rect', x: plot.x, y: y0 + rowH * 0.14, w, h: rowH * 0.72, r: 3, fill: col });
      hits.push({ shape: { type: 'rect', x: plot.x, y: y0 + rowH * 0.14, w, h: rowH * 0.72 },
        datum: { kind: 'bar', index: i, label: it.label, value: it.value, tooltip: { title: it.label, rows: [{ swatch: col, name: '排名', value: fm(ctx)(it.value) }] } } });
      nodes.push({ type: 'text', x: plot.x - 8, y: y0 + rowH / 2, text: it.label, font: 'body', size: 12, anchor: 'end', baseline: 'middle', fill: t.ink });
      if (ctx.options?.['valueLabels'] !== false) {
        nodes.push({ type: 'text', x: plot.x + w + 6, y: y0 + rowH / 2, text: fm(ctx)(it.value), font: 'mono', size: 11.5, baseline: 'middle', fill: t.muted });
      }
      nodes.push({ type: 'text', x: plot.x + w - 6, y: y0 + rowH / 2, text: String(i + 1), font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: '#fff' });
    });
    if (frameLabel) nodes.push({ type: 'text', x: ctx.plot.x + ctx.plot.w - 8, y: ctx.plot.y + 18, text: frameLabel, font: 'display', size: 15, weight: 600, anchor: 'end', fill: t.muted });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// ── histogram：分箱柱（count/density/cumulative；多组叠加）───────────
export const histogramRenderer: FamilyRenderer<HistogramModel> = {
  view: 'histogram' as ViewId,
  interactions: ['brush'],
  layout(m: HistogramModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const variant = ctx.variant ?? 'count';
    const density = variant !== 'count';
    const plot = { x: ctx.plot.x + 56, y: ctx.plot.y + 20, w: ctx.plot.w - 112, h: ctx.plot.h - 66 };
    const groups = m.groups.length > 1 ? m.groups : [m.groups[0]];
    const val = (b: HistogramModel['bins'][number], n: number) => (density ? b.count / Math.max(1, n) : b.count);
    const vMax = Number(ctx.options?.['yMax'] ?? (Math.max(...groups.flatMap((gg) => gg.bins.map((b) => val(b, gg.n))), 0) * 1.08 || 1));
    const x = scaleBand(m.bins.map((b) => `${b.x0.toFixed(1)}`), [plot.x, plot.x + plot.w], 0.08);
    const y = scaleLinear([0, vMax], [plot.y + plot.h, plot.y]);
    nodes.push(...yAxis(y, plot, t, density ? fpct : fm(ctx)));
    const stepL = Math.max(1, Math.ceil(m.bins.length / 8));
    nodes.push(...xAxisTicks(
      m.bins.filter((_, i) => i % stepL === 0 || i === m.bins.length - 1)
        .map((b) => ({ pos: x(`${b.x0.toFixed(1)}`) + x.bandwidth / 2, text: b.x0.toFixed(1) })),
      plot, t));
    const ng = groups.length, gw = x.bandwidth / ng;
    groups.forEach((gg, gi) => {
      const col = colors[gi % colors.length];
      gg.bins.forEach((b, bi) => {
        const v = val(b, gg.n);
        const bx = x(`${m.bins[bi].x0.toFixed(1)}`) + gi * gw;
        const by = y(v), bh = Math.max(0.5, y(0) - by);
        nodes.push({ type: 'rect', x: bx + 0.5, y: by, w: Math.max(1, gw - 1), h: bh, fill: col, opacity: ng > 1 ? 0.55 : 0.9, stroke: ng > 1 ? col : undefined, strokeWidth: 0.8 });
        hits.push({ shape: { type: 'rect', x: bx, y: by, w: Math.max(gw, 2), h: bh },
          datum: { kind: 'bar', index: bi, series: ng > 1 ? gg.name : undefined, label: `${b.x0.toFixed(1)}–${b.x1.toFixed(1)}`, value: b.count, tooltip: { title: `${b.x0.toFixed(1)}–${b.x1.toFixed(1)}`, rows: [{ swatch: col, name: ng > 1 ? gg.name : '样本数', value: `${b.count}（${fpct(b.count / Math.max(1, gg.n))}）` }] } } });
      });
      if (variant === 'cumulative') {
        const pts = gg.bins.map((b, bi) => ({
          x: x(`${m.bins[bi].x0.toFixed(1)}`) + gi * gw + gw / 2,
          y: plot.y + plot.h - (b.cum / Math.max(1, gg.n)) * plot.h * 0.98 - 2,
        }));
        nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), fill: 'none', stroke: t.ink, strokeWidth: 1.8, dash: [4, 2] });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    if (groups.length > 1) (sc as { legend?: LegendItem[] }).legend = groups.map((gg, i) => ({ name: gg.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// ── kpi：指标卡（cards / cards+spark）───────────────────────────────
export const kpiRenderer: FamilyRenderer<KpiModel> = {
  view: 'kpi' as ViewId,
  interactions: [],
  layout(m: KpiModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const spark = ctx.variant === 'cards+spark';
    const cols = Math.min(6, Math.max(1, Number(ctx.options?.['columns'] ?? 3)));
    const items = m.items.slice(0, 24);
    const rows = Math.max(1, Math.ceil(items.length / cols));
    const pad = 10, cw = (ctx.plot.w - pad * (cols - 1)) / cols, ch = (ctx.plot.h - pad * (rows - 1)) / rows;
    items.forEach((it, i) => {
      const cx = ctx.plot.x + (i % cols) * (cw + pad), cy = ctx.plot.y + Math.floor(i / cols) * (ch + pad);
      nodes.push({ type: 'rect', x: cx, y: cy, w: cw, h: ch, r: 10, fill: t.panel ?? t.paper, stroke: t.line, strokeWidth: 1 });
      nodes.push({ type: 'rect', x: cx, y: cy + 14, w: 3.5, h: 18, r: 1.75, fill: colors[i % colors.length] });
      nodes.push({ type: 'text', x: cx + 14, y: cy + 18, text: it.label, font: 'body', size: 12.5, baseline: 'middle', fill: t.muted });
      nodes.push({ type: 'text', x: cx + 14, y: cy + 52, text: fm(ctx)(it.value), font: 'mono', size: 26, weight: 650, baseline: 'middle', fill: t.ink });
      let yy = cy + 52;
      const invert = Boolean(it.label) && /率|成本|时长|损耗|不良/.test(it.label) && ctx.options?.['invertBad'] !== 'off';
      if (it.previous !== undefined) {
        const d = it.value - it.previous;
        const dp = it.previous !== 0 ? d / Math.abs(it.previous) : 0;
        const good = invert ? d < 0 : d > 0;
        const col = d === 0 ? t.muted : good ? t.pos : t.neg;
        const arrow = d === 0 ? '▸' : d > 0 ? '▲' : '▼';
        yy += 26;
        nodes.push({ type: 'text', x: cx + 14, y: yy, text: `${arrow} 环比 ${d > 0 ? '+' : ''}${fm(ctx)(d)}（${d > 0 ? '+' : ''}${(dp * 100).toFixed(1)}%）`, font: 'body', size: 12, baseline: 'middle', fill: col });
      }
      if (it.target !== undefined && it.target !== 0 && ctx.options?.['targetBar'] !== false) {
        const pct = it.value / Math.abs(it.target);
        const bw = Math.min(cw - 28, 160);
        yy += 22;
        nodes.push({ type: 'text', x: cx + cw - 14, y: yy + 3, text: `达成 ${(pct * 100).toFixed(0)}%`, font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
        nodes.push({ type: 'rect', x: cx + 14, y: yy, w: bw, h: 5, r: 2.5, fill: t.faint });
        nodes.push({ type: 'rect', x: cx + 14, y: yy, w: Math.min(bw, bw * Math.max(0, Math.min(1.5, pct))), h: 5, r: 2.5, fill: pct >= 1 ? t.pos : colors[i % colors.length] });
      }
      if (spark && items.length > 1) {
        const vals = items.map((a) => a.value);
        const smin = Math.min(...vals), smax = Math.max(...vals), sp = smax - smin || 1;
        const sw = cw - 28, sh = Math.min(28, cy + ch - yy - 18);
        const pts = vals.map((v, vi) => ({ x: cx + 14 + (vi / Math.max(1, vals.length - 1)) * sw, y: cy + ch - 12 - ((v - smin) / sp) * sh }));
        nodes.push({ type: 'path', d: pts.map((p, pi) => `${pi ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), fill: 'none', stroke: colors[i % colors.length], strokeWidth: 1.6 });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    return sc;
  },
};

// ── compare：slope / dumbbell ────────────────────────────────────────
export const compareRenderer: FamilyRenderer<CompareModel> = {
  view: 'compare' as ViewId,
  interactions: ['brush'],
  layout(m: CompareModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const variant = ctx.variant ?? 'slope';
    const items = ctx.options?.['sortByDelta'] ? [...m.items].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : [...m.items];
    const all = items.flatMap((i) => [i.from, i.to]);
    const lo = Number(ctx.options?.['vLo'] ?? Math.min(...all, 0));
    const hi = Number(ctx.options?.['vHi'] ?? Math.max(...all));
    const majorityUp = m.up >= m.down;
    const hl = ctx.options?.['highlightReversed'] !== false;
    const fmt = fm(ctx);
    if (variant === 'slope') {
      const plot = { x: ctx.plot.x + 130, y: ctx.plot.y + 26, w: ctx.plot.w - 260, h: ctx.plot.h - 90 };
      const y = scaleLinear([lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.08], [plot.y + plot.h, plot.y]);
      const xA = plot.x, xB = plot.x + plot.w;
      // 两端标签垂直避让（贪心下移 ≥13px）
      const spread = (ys: number[]) => {
        const ord = ys.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
        const out = [...ys];
        let prev = -Infinity;
        for (const [v, i] of ord) { const nv = Math.max(v, prev + 13); out[i] = nv; prev = nv; }
        return out;
      };
      const ly = spread(items.map((it) => y(it.from))), ry = spread(items.map((it) => y(it.to)));
      items.forEach((it, i) => {
        const rev = hl && (majorityUp ? it.delta < 0 : it.delta > 0);
        const col = rev ? t.neg : colors[0];
        const y1 = y(it.from), y2 = y(it.to);
        nodes.push({ type: 'line', x1: xA, x2: xB, y1, y2, stroke: col, strokeWidth: rev ? 2.6 : 1.6, opacity: rev ? 0.95 : 0.65 });
        hits.push({ shape: { type: 'line', x1: xA, x2: xB, y1, y2 },
          datum: { kind: 'line', index: i, label: it.label, value: it.delta, tooltip: { title: it.label, rows: [{ swatch: col, name: m.from_key, value: fmt(it.from) }, { swatch: col, name: m.to_key, value: fmt(it.to) }, { name: '变化', value: `${it.delta > 0 ? '+' : ''}${fmt(it.delta)}` }] } } });
        nodes.push({ type: 'circle', cx: xA, cy: y1, r: 3, fill: col });
        nodes.push({ type: 'circle', cx: xB, cy: y2, r: 3, fill: col });
        if (Math.abs(ly[i] - y1) > 2) nodes.push({ type: 'line', x1: xA - 4, x2: xA - 2, y1, y2: ly[i], stroke: t.line2, strokeWidth: 0.7 });
        if (Math.abs(ry[i] - y2) > 2) nodes.push({ type: 'line', x1: xB + 2, x2: xB + 4, y1: y2, y2: ry[i], stroke: t.line2, strokeWidth: 0.7 });
        nodes.push({ type: 'text', x: xA - 8, y: ly[i], text: `${it.label} ${fmt(it.from)}`, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: rev ? col : t.muted });
        nodes.push({ type: 'text', x: xB + 8, y: ry[i], text: `${fmt(it.to)} ${it.delta > 0 ? '+' : ''}${(it.dpct * 100).toFixed(0)}%`, font: 'mono', size: 11, weight: rev ? 600 : 400, baseline: 'middle', fill: rev ? col : t.muted });
      });
      nodes.push({ type: 'text', x: xA, y: plot.y - 10, text: m.from_key, font: 'body', size: 12, weight: 600, anchor: 'middle', baseline: 'bottom', fill: t.ink });
      nodes.push({ type: 'text', x: xB, y: plot.y - 10, text: m.to_key, font: 'body', size: 12, weight: 600, anchor: 'middle', baseline: 'bottom', fill: t.ink });
    } else {
      const plot = { x: ctx.plot.x + 96, y: ctx.plot.y + 22, w: ctx.plot.w - 220, h: ctx.plot.h - 66 };
      const x = scaleLinear([lo, hi + (hi - lo) * 0.08], [plot.x, plot.x + plot.w]);
      const yb = scaleBand(items.map((i) => i.label), [plot.y, plot.y + plot.h], 0.35);
      for (const tv of x.ticks) {
        const vx = x(tv);
        nodes.push({ type: 'line', x1: vx, x2: vx, y1: plot.y, y2: plot.y + plot.h, stroke: t.grid, dash: [2, 4] });
        nodes.push({ type: 'text', x: vx, y: plot.y + plot.h + 6, text: fmt(tv), font: 'mono', size: 10, anchor: 'middle', baseline: 'top', fill: t.muted });
      }
      items.forEach((it, i) => {
        const rev = hl && (majorityUp ? it.delta < 0 : it.delta > 0);
        const col = rev ? t.neg : (it.delta >= 0 ? t.pos : t.neg);
        const y0 = yb(it.label) + yb.bandwidth / 2;
        const x1 = x(it.from), x2 = x(it.to);
        nodes.push({ type: 'line', x1, x2, y1: y0, y2: y0, stroke: col, strokeWidth: 3, opacity: 0.7 });
        hits.push({ shape: { type: 'rect', x: Math.min(x1, x2) - 4, y: y0 - yb.bandwidth / 2, w: Math.abs(x2 - x1) + 8, h: yb.bandwidth },
          datum: { kind: 'bar', index: i, label: it.label, value: it.delta, tooltip: { title: it.label, rows: [{ name: m.from_key, value: fmt(it.from) }, { name: m.to_key, value: fmt(it.to) }, { name: '变化', value: `${it.delta > 0 ? '+' : ''}${fmt(it.delta)}` }] } } });
        nodes.push({ type: 'circle', cx: x1, cy: y0, r: 5, fill: t.paper, stroke: col, strokeWidth: 2 });
        nodes.push({ type: 'circle', cx: x2, cy: y0, r: 5, fill: col });
        nodes.push({ type: 'text', x: plot.x - 8, y: y0, text: it.label, font: 'body', size: 11.5, anchor: 'end', baseline: 'middle', fill: rev ? col : t.ink });
        if (ctx.options?.['deltaLabels'] !== false) {
          nodes.push({ type: 'text', x: Math.max(x1, x2) + 10, y: y0, text: `${it.delta > 0 ? '+' : ''}${(it.dpct * 100).toFixed(0)}%`, font: 'mono', size: 10.5, baseline: 'middle', fill: col });
        }
      });
      nodes.push({ type: 'text', x: plot.x + 4, y: plot.y - 8, text: `○ ${m.from_key}　● ${m.to_key}`, font: 'body', size: 10.5, baseline: 'bottom', fill: t.muted });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// ── cohort：三角热力（retention% / absolute）─────────────────────────
export const cohortRenderer: FamilyRenderer<CohortModel> = {
  view: 'cohort' as ViewId,
  interactions: ['brush'],
  layout(m: CohortModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const abs = ctx.variant === 'absolute';
    const maxP = Number(ctx.options?.['maxPeriod'] ?? 0);
    const diag = ctx.options?.['diagonal'] !== false;
    const cellText = String(ctx.options?.['cellText'] ?? 'pct');
    const periods = maxP > 0 ? m.periods.filter((p) => p <= maxP) : m.periods;
    const plot = { x: ctx.plot.x + 96, y: ctx.plot.y + 30, w: ctx.plot.w - 130, h: ctx.plot.h - 76 };
    const cw = Math.min(56, plot.w / periods.length), ch = Math.min(34, plot.h / Math.max(1, m.rows.length));
    const cellOf = (r: CohortModel['rows'][number], p: number) => {
      const v = r.cells[p];
      if (v === null || v === undefined) return null;
      return abs ? v : (r.size ? v / r.size : 0);
    };
    const vmax = abs ? Math.max(...m.rows.flatMap((r) => r.cells.filter((v): v is number => v !== null)), 1) : 1;
    const c0 = colors[0];
    periods.forEach((p) => nodes.push({ type: 'text', x: plot.x + p * cw + cw / 2, y: plot.y - 8, text: `第${p}期`, font: 'body', size: 10.5, anchor: 'middle', baseline: 'bottom', fill: t.muted }));
    m.rows.forEach((r, ri) => {
      const y0 = plot.y + ri * ch;
      nodes.push({ type: 'text', x: plot.x - 8, y: y0 + ch / 2, text: `${r.name}（${r.size}）`, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: t.ink });
      periods.forEach((p) => {
        const v = cellOf(r, p);
        if (v === null || (diag && v === null)) return;
        const alpha = Math.min(1, v / vmax);
        const rx = plot.x + p * cw;
        nodes.push({ type: 'rect', x: rx + 0.5, y: y0 + 0.5, w: cw - 1, h: ch - 1, r: 2, fill: c0, opacity: 0.08 + 0.92 * alpha });
        hits.push({ shape: { type: 'rect', x: rx, y: y0, w: cw, h: ch },
          datum: { kind: 'cell', index: ri * periods.length + p, label: `${r.name} 第${p}期`, value: v, tooltip: { title: `${r.name} · 第${p}期`, rows: [{ name: abs ? '数值' : '留存率', value: abs ? fm(ctx)(v) : fpct(v) }] } } });
        if (cellText !== 'none' && cw > 34 && ch > 16) {
          nodes.push({ type: 'text', x: rx + cw / 2, y: y0 + ch / 2, text: cellText === 'pct' ? (abs ? fm(ctx)(v) : `${(v * 100).toFixed(0)}%`) : String(r.cells[p] ?? ''), font: 'mono', size: Math.min(11, ch * 0.4), anchor: 'middle', baseline: 'middle', fill: alpha > 0.5 ? '#fff' : t.ink });
        }
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};
