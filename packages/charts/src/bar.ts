// bar 图族 layout：grouped/stacked/pct/pareto/waterfall × 表面/形状/伪3D。
import type { ViewId } from '@virta/contracts';
import type { Node, Paint, Scene } from '@virta/chart-core';
import { g, scaleBand, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, axisTitle, formatNumber, xAxisBand, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors, accentFor, rampSequential } from '@virta/design-system';
import type { BarlineModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

/** 单元格统一成 [start, delta]（grouped/pareto 恒为 [0,v]）。 */
type Cell = [number, number];

function applySort(m: BarlineModel, s: 'none' | 'asc' | 'desc'): BarlineModel {
  if (s === 'none') return m;
  const tot = m.labels.map((_, i) => m.series.reduce((a, sr) => a + (sr.values[i] ?? 0), 0));
  const order = m.labels.map((_, i) => i).sort((a, b) => (s === 'desc' ? tot[b] - tot[a] : tot[a] - tot[b]));
  return {
    ...m,
    labels: order.map((i) => m.labels[i]),
    kinds: order.map((i) => m.kinds[i]),
    series: m.series.map((sr) => ({ ...sr, values: order.map((i) => (sr.values[i] ?? 0)) })),
  };
}

/** 柱形 path（非 round/rect/pill 的 7 种轮廓）。 */
function shapePath(x: number, y: number, w: number, h: number, shape: string): string | null {
  const r = Math.min(4, w / 2, h / 2);
  const x2 = x + w;
  switch (shape) {
    case 'dome': return `M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w / 2} ${y - Math.min(10, h * 0.15)} Q${x2 - r} ${y} ${x2} ${y + r} L${x2} ${y + h} Z`;
    case 'taper': return `M${x + w * 0.12} ${y + h} L${x} ${y} L${x2} ${y} L${x2 - w * 0.12} ${y + h} Z`;
    case 'skew': return `M${x + w * 0.18} ${y + h} L${x} ${y} L${x2 - w * 0.18} ${y} L${x2} ${y + h} Z`;
    case 'crystal': return `M${x} ${y + h} L${x} ${y + 6} L${x + w / 2} ${y - 4} L${x2} ${y + 6} L${x2} ${y + h} Z`;
    case 'barrel': return `M${x + w * 0.06} ${y} Q${x - w * 0.02} ${y + h / 2} ${x + w * 0.06} ${y + h} L${x2 - w * 0.06} ${y + h} Q${x2 + w * 0.02} ${y + h / 2} ${x2 - w * 0.06} ${y} Z`;
    case 'notch': return `M${x} ${y} L${x2} ${y} L${x2} ${y + h - 6} L${x + w / 2 + 4} ${y + h - 6} L${x + w / 2} ${y + h} L${x + w / 2 - 4} ${y + h - 6} L${x} ${y + h - 6} Z`;
    default: return null;
  }
}

/** variant/options 生效值：pct/pareto 负值回退 grouped；waterfall 无行类型回退；
 *  伪3D 受形状/变体约束；配色×表面×着色互斥（瀑布锁语义色、按数值覆盖配色、渐变需纯色底）。 */
function resolveBar(model: BarlineModel, variant: string | undefined, options?: Record<string, string | number | boolean>): { variant: string; options: Record<string, string | number | boolean> } {
  const neg = model.series.some((s) => s.values.some((v) => (v ?? 0) < 0));
  let v = variant ?? 'grouped';
  if ((v === 'pct' || v === 'pareto') && neg) v = 'grouped';
  if (v === 'waterfall' && !model.kinds?.length) v = 'grouped';
  const opts = { ...(options ?? {}) };
  // 旧 spec 兼容：finish=gradient → colorMode=gradient + flat；colorBy=value → colorMode=value
  if (opts['finish'] === 'gradient') {
    if (opts['colorMode'] === undefined) opts['colorMode'] = 'gradient';
    opts['finish'] = 'flat';
  }
  if (opts['colorBy'] === 'value' && opts['colorMode'] === undefined) opts['colorMode'] = 'value';
  opts['colorBy'] = 'series';
  const shape = String(opts['shape'] ?? 'round');
  const cm = String(opts['colorMode'] ?? 'multi');
  const fin = String(opts['finish'] ?? 'flat');
  if (opts['depth3d']) opts['depth3d'] = ['round', 'rect'].includes(shape) && ['grouped', 'stacked', 'pct'].includes(v);
  if (v === 'waterfall') {
    opts['colorMode'] = 'multi';
  } else {
    if (cm === 'value' && fin === 'hatch') opts['finish'] = 'flat';
    if (fin !== 'flat' && cm === 'gradient') opts['colorMode'] = 'multi';
  }
  return { variant: v, options: opts };
}

export const barRenderer: FamilyRenderer<BarlineModel> = {
  view: 'bar' as ViewId,
  interactions: ['brush'],
  resolve: (model, req) => resolveBar(model, req.variant, req.options),
  layout(model: BarlineModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const colors = paletteColors(ctx.palette, ctx.theme);
    const hiddenS = new Set(ctx.state?.hiddenSeries ?? []);
    const m0 = applySort(model, ctx.state?.sort ?? 'none');
    const eff = resolveBar(m0, ctx.variant, ctx.options);
    const effVariant = eff.variant;

    const padL = 56, padR = effVariant === 'pareto' ? 52 : 16, padT = 22, padB = 34;
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + padT, w: ctx.plot.w - padL - padR, h: ctx.plot.h - padT - padB };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const visSeries = m0.series.filter((s) => !hiddenS.has(s.name));
    const labels = m0.labels;
    const fmt = (v: number) => formatNumber(v, ctx.format, 'number');
    const legend: LegendItem[] = m0.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length], hidden: hiddenS.has(s.name) }));

    // —— cells[label][series] = [start, delta] ——
    const stacked = effVariant === 'stacked' || effVariant === 'pct';
    const pctMode = effVariant === 'pct';
    const cells: Cell[][] = labels.map((_, li) => {
      if (effVariant === 'waterfall') {
        // 由调用方先累计（见下），此处占位
        return [[0, visSeries[0]?.values[li] ?? 0]];
      }
      if (stacked) {
        const tot = visSeries.reduce((a, s) => a + Math.abs(s.values[li] ?? 0), 0);
        let pos = 0, negA = 0;
        return visSeries.map((s) => {
          const v = pctMode && tot ? ((s.values[li] ?? 0) / tot) * 100 : (s.values[li] ?? 0);
          const start = v >= 0 ? pos : negA;
          if (v >= 0) pos += v; else negA += v;
          return [start, v] as Cell;
        });
      }
      return visSeries.map((s) => [0, s.values[li]] as Cell);
    });
    // 瀑布：absolute 重置水位，delta 自上一水位起画
    let connectors: { x: number; y: number }[] = [];
    if (effVariant === 'waterfall') {
      let run = 0;
      const kinds = m0.kinds ?? labels.map(() => 'delta');
      labels.forEach((_, li) => {
        const v = visSeries[0]?.values[li] ?? 0;
        if (kinds[li] === 'absolute') { cells[li] = [[0, v]]; run = v; }
        else { cells[li] = [[run, v]]; run += v; }
      });
      connectors = labels.map((_, li) => ({ x: li, y: (cells[li][0][0]) + cells[li][0][1] }));
    }

    // —— 值域 ——
    let vMin = 0, vMax = 0;
    cells.forEach((row) => row.forEach(([st, dv]) => {
      if (stacked || effVariant === 'waterfall') { vMin = Math.min(vMin, st, st + dv); vMax = Math.max(vMax, st, st + dv); }
      else { vMin = Math.min(vMin, dv); vMax = Math.max(vMax, dv); }
    }));
    if (pctMode) { vMin = Math.min(0, vMin); vMax = 100; }
    if (vMax === vMin) vMax = vMin + 1;
    // facet sharedScale：分面共享值域覆盖
    if (ctx.options?.['yMax'] !== undefined) vMax = Number(ctx.options['yMax']);
    if (ctx.options?.['yMin'] !== undefined) vMin = Number(ctx.options['yMin']);
    const y = scaleLinear([vMin, vMax], [plot.y + plot.h, plot.y]);
    const band = scaleBand(labels, [plot.x, plot.x + plot.w]);

    nodes.push(...yAxis(y, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t, (v) => pctMode ? `${Math.round(v)}%` : fmt(v)));
    nodes.push(...xAxisBand(band, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t));
    nodes.push(...axisTitle(ctx.text?.unit, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t));

    // —— 配色 colorMode × 表面 finish → defs + paint ——
    const finish = String(eff.options['finish'] ?? 'flat');
    const colorMode = String(eff.options['colorMode'] ?? 'multi');
    const mono = accentFor(ctx.palette, ctx.theme);
    const defs: Scene['defs'] = { gradients: [], radials: [], patterns: [], clips: [] };
    const paint = (si: number): { fill?: Paint; stroke?: string; opacity?: number } => {
      const base = colorMode === 'mono' ? mono : colors[m0.series.indexOf(visSeries[si]) % colors.length];
      if (colorMode === 'gradient') {
        defs.gradients.push({ id: `g${si}`, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: base }, { offset: 1, color: base, opacity: 0.78 }] });
        return { fill: { ref: `g${si}` } };
      }
      switch (finish) {
        case 'outline': case 'neon': return { fill: 'none', stroke: base };
        case 'glass': return { fill: base, opacity: 0.5 };
        case 'papercut': return { fill: base, opacity: 0.82 };
        case 'carve': return { fill: base, opacity: 0.9 };
        case 'hatch': case 'ribbed': case 'dotted': {
          defs.patterns.push({
            id: `pat${si}`, width: 6, height: 6,
            nodes: finish === 'dotted'
              ? [{ type: 'circle', cx: 3, cy: 3, r: 1, fill: base }]
              : finish === 'ribbed'
                ? [{ type: 'line', x1: 3, y1: 0, x2: 3, y2: 6, stroke: base, strokeWidth: 1.2 }]
                : [{ type: 'line', x1: 0, y1: 6, x2: 6, y2: 0, stroke: base, strokeWidth: 1.2 }],
          });
          return { fill: { ref: `pat${si}` }, stroke: base };
        }
        case 'metal': {
          defs.gradients.push({ id: `m${si}`, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: '#ffffff' }, { offset: 0.45, color: base }, { offset: 1, color: base }] });
          return { fill: { ref: `m${si}` } };
        }
        default: return { fill: base };
      }
    };

    const shape = String(eff.options['shape'] ?? 'round');
    // 色阶：colorMode=value 按数值给每根柱上色（|值| 越大越饱和），瀑布图保持涨跌语义色
    const ramp = colorMode === 'value' ? rampSequential(ctx.palette, ctx.theme) : null;
    const vabs = Math.max(1e-9, ...visSeries.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))));
    const rampC = (dv: number) => ramp![Math.min(ramp!.length - 1, Math.floor((Math.abs(dv) / vabs) * ramp!.length))];
    const depth3d = eff.options['depth3d'] === true;
    const valueLabels = Boolean(ctx.options?.['valueLabels']);
    const perGroup = stacked || effVariant === 'waterfall' ? 1 : visSeries.length;
    const bw = band.bandwidth / Math.max(1, perGroup);
    const z = y(0);

    visSeries.forEach((s, si) => {
      const p = paint(si);
      const swatch = colors[m0.series.indexOf(s) % colors.length];
      labels.forEach((lab, li) => {
        const [st, dv] = cells[li][si] ?? [0, 0];
        let x0: number, y0: number, h: number, w: number;
        if (stacked || effVariant === 'waterfall') {
          x0 = band(lab) + band.bandwidth * 0.08;
          w = band.bandwidth * 0.84;
          y0 = Math.min(y(st), y(st + dv));
          h = Math.abs(y(st) - y(st + dv));
        } else {
          x0 = band(lab) + si * bw + bw * 0.08;
          w = bw * 0.84;
          y0 = Math.min(y(Math.max(0, dv)), z);
          h = Math.abs(y(dv) - z);
        }
        const barC = ramp ? rampC(dv) : swatch;
        const color = effVariant === 'waterfall'
          ? (m0.kinds?.[li] === 'absolute' ? accentFor(ctx.palette, ctx.theme) : dv < 0 ? t.neg : t.pos)
          : barC;
        const fill = effVariant === 'waterfall' ? color : ramp ? barC : p.fill;
        const strokeC = ramp ? barC : p.stroke;
        const datum = { kind: 'bar', index: li, series: s.name, label: lab, value: dv, tooltip: { title: lab, rows: [{ swatch: color, name: s.name, value: fmt(dv) }] } };
        const d = shapePath(x0, y0, w, h, shape);
        const r = shape === 'pill' ? w / 2 : shape === 'round' ? Math.min(4, w / 2) : 0;
        const node: Node = d
          ? { type: 'path', d, fill: fill as never, stroke: strokeC, strokeWidth: p.stroke ? 1.6 : undefined, opacity: p.opacity, datum }
          : { type: 'rect', x: x0, y: y0, w, h, r, fill: fill as never, stroke: strokeC, strokeWidth: p.stroke ? 1.6 : undefined, opacity: p.opacity, datum };
        nodes.push(node);
        if (depth3d) {
          const dx = Math.min(7, w * 0.3), dy = -dx * 0.62;
          nodes.push({ type: 'path', d: `M${x0} ${y0} L${x0 + dx} ${y0 + dy} L${x0 + w + dx} ${y0 + dy} L${x0 + w} ${y0} Z`, fill: 'rgba(255,255,255,.28)' });
          nodes.push({ type: 'path', d: `M${x0 + w} ${y0} L${x0 + w + dx} ${y0 + dy} L${x0 + w + dx} ${y0 + h + dy} L${x0 + w} ${y0 + h} Z`, fill: 'rgba(0,0,0,.18)' });
        }
        hits.push({ shape: { type: 'rect', x: x0, y: y0, w, h: Math.max(h, 4) }, datum });
        if (valueLabels && w >= 18) {
          nodes.push({ type: 'text', x: x0 + w / 2, y: y0 - 4, text: fmt(dv), font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.muted });
        }
      });
    });

    // 瀑布连接线
    if (effVariant === 'waterfall') {
      for (let li = 0; li < labels.length - 1; li++) {
        const yv = y(connectors[li].y);
        const x1 = band(labels[li]) + band.bandwidth * 0.92;
        const x2 = band(labels[li + 1]) + band.bandwidth * 0.08;
        nodes.push({ type: 'line', x1, y1: yv, x2, y2: yv, stroke: t.faint, strokeWidth: 1, dash: [3, 3] });
      }
    }

    // pareto 累计线
    if (effVariant === 'pareto') {
      const tot = labels.map((_, i) => visSeries.reduce((a, s) => a + (s.values[i] ?? 0), 0));
      const grand = tot.reduce((a, b) => a + b, 0) || 1;
      const pctY = scaleLinear([0, 100], [plot.y + plot.h, plot.y]);
      let acc = 0;
      const pts = labels.map((_, i) => { acc += tot[i]; return { x: band(labels[i]) + band.bandwidth / 2, y: pctY((acc / grand) * 100) }; });
      nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), fill: 'none', stroke: accentFor(ctx.palette, ctx.theme), strokeWidth: 1.8 });
      nodes.push({ type: 'line', x1: plot.x, y1: pctY(80), x2: plot.x + plot.w, y2: pctY(80), stroke: t.warn, strokeWidth: 1, dash: [4, 4] });
      nodes.push({ type: 'text', x: plot.x + plot.w + 6, y: pctY(80), text: '80%', font: 'mono', size: 10, baseline: 'middle', fill: t.warn });
    }

    nodes.push(...annotationNodes(ctx.annotations, {
      plot, xBand: (l) => { const i = labels.indexOf(l); return i < 0 ? undefined : band(l) + band.bandwidth / 2; },
      yOf: y, format: fmt,
    }, t));

    const sc = scene(ctx.width, ctx.height, [g(nodes)], undefined);
    sc.defs = defs;
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = legend;
    return sc;
  },
};
