// line 图族 layout：smooth/straight/step × none/area/stack × window × marker × endLabels。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, scaleLinear, scalePoint, scene } from '@virta/chart-core';
import { annotationNodes, axisTitle, formatNumber, xAxisTicks, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors } from '@virta/design-system';
import type { BarlineModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

function windowSlice(m: BarlineModel, w: string | undefined): BarlineModel {
  const n = m.labels.length;
  const [i0, i1] = w === 'first6' ? [0, Math.min(6, n)] : w === 'last6' ? [Math.max(0, n - 6), n] : w === 'last12' ? [Math.max(0, n - 12), n] : [0, n];
  if (i0 === 0 && i1 === n) return m;
  const idx = Array.from({ length: i1 - i0 }, (_, k) => i0 + k);
  return { ...m, labels: idx.map((i) => m.labels[i]), series: m.series.map((s) => ({ ...s, values: idx.map((i) => s.values[i]) })) };
}

function linePath(xs: number[], ys: number[], style: string): string {
  if (!xs.length) return '';
  if (style === 'step') {
    let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 1; i < xs.length; i++) d += ` L${xs[i].toFixed(2)} ${ys[i - 1].toFixed(2)} L${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`;
    return d;
  }
  if (style === 'smooth' && xs.length > 2) {
    // Catmull-Rom → 三次贝塞尔
    let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 0; i < xs.length - 1; i++) {
      const p0 = i > 0 ? [xs[i - 1], ys[i - 1]] : [xs[i], ys[i]];
      const p1 = [xs[i], ys[i]], p2 = [xs[i + 1], ys[i + 1]];
      const p3 = i + 2 < xs.length ? [xs[i + 2], ys[i + 2]] : p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
  }
  return xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
}

export const lineRenderer: FamilyRenderer<BarlineModel> = {
  view: 'line' as ViewId,
  interactions: ['brush'],
  layout(model0: BarlineModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const colors = paletteColors(ctx.palette, ctx.theme);
    const hiddenS = new Set(ctx.state?.hiddenSeries ?? []);
    const m = windowSlice(model0, String(ctx.options?.['window'] ?? 'all'));
    const lineStyle = String(ctx.options?.['lineStyle'] ?? 'smooth');
    const fillMode = String(ctx.options?.['fill'] ?? 'none');
    const marker = String(ctx.options?.['marker'] ?? 'circle');
    const lw = Number(ctx.options?.['lineWidth'] ?? 2.4);
    const hatch = Boolean(ctx.options?.['hatch']);
    const endLabels = Boolean(ctx.options?.['endLabels']);
    const labels = m.labels;
    const visSeries = m.series.filter((s) => !hiddenS.has(s.name));
    const fmt = (v: number) => formatNumber(v, ctx.format, 'number');

    const padL = 56, padR = endLabels ? 76 : 18, padT = 22, padB = 34;
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + padT, w: ctx.plot.w - padL - padR, h: ctx.plot.h - padT - padB };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const defs: Scene['defs'] = { gradients: [], radials: [], patterns: [], clips: [] };

    const stacked = fillMode === 'stack';
    // 累计基线（stack 模式下逐层垫高）
    const baseAcc = labels.map(() => 0);
    let vMin = 0, vMax = 0;
    if (stacked) {
      labels.forEach((_, li) => {
        let pos = 0, neg = 0;
        visSeries.forEach((s) => { const v = s.values[li]; if (v >= 0) pos += v; else neg += v; });
        vMax = Math.max(vMax, pos); vMin = Math.min(vMin, neg);
      });
    } else {
      visSeries.forEach((s) => s.values.forEach((v) => { vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }));
    }
    if (vMax === vMin) vMax = vMin + 1;
    if (ctx.options?.['yMax'] !== undefined) vMax = Number(ctx.options['yMax']);
    if (ctx.options?.['yMin'] !== undefined) vMin = Number(ctx.options['yMin']);
    const y = scaleLinear([vMin, vMax], [plot.y + plot.h, plot.y]);
    const xOf = scalePoint(labels, [plot.x + 6, plot.x + plot.w - 6]);

    nodes.push(...yAxis(y, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t, fmt));
    const tickStep = Math.max(1, Math.ceil(labels.length / 12));
    nodes.push(...xAxisTicks(labels.filter((_, i) => i % tickStep === 0).map((lab) => ({ pos: xOf(lab), text: lab })), { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t));
    nodes.push(...axisTitle(ctx.text?.unit, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t));

    if (hatch) {
      defs.patterns.push({ id: 'hatchline', width: 5, height: 5, nodes: [{ type: 'line', x1: 0, y1: 5, x2: 5, y2: 0, stroke: t.muted, strokeWidth: 1 }] });
    }

    visSeries.forEach((s, si) => {
      const color = colors[m.series.indexOf(s) % colors.length];
      const xs = labels.map((l) => xOf(l));
      const ysTop = labels.map((_, li) => {
        const v = s.values[li];
        return stacked ? y(baseAcc[li] + Math.max(0, v)) : y(v);
      });
      const ysBase = labels.map((_, li) => stacked ? y(baseAcc[li]) : y(0));
      if (stacked) labels.forEach((_, li) => { baseAcc[li] += Math.max(0, s.values[li]); });

      // 面积填充
      if (fillMode !== 'none') {
        const gid = `area${si}`;
        defs.gradients.push({ id: gid, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color, opacity: stacked ? 0.75 : 0.32 }, { offset: 1, color, opacity: stacked ? 0.55 : 0.05 }] });
        const top = linePath(xs, ysTop, lineStyle).replace(/^M/, 'M');
        const bottom = xs.map((x2, i) => `L${x2.toFixed(2)} ${ysBase[i].toFixed(2)}`).reverse().join(' ');
        nodes.push({ type: 'path', d: `${top} ${bottom} Z`, fill: { ref: gid } });
      }
      const dash = hatch ? [6, 3] : undefined;
      nodes.push({ type: 'path', d: linePath(xs, ysTop, lineStyle), fill: 'none', stroke: color, strokeWidth: lw, dash });

      // 标记
      labels.forEach((lab, li) => {
        const v = s.values[li];
        const py = ysTop[li];
        const datum = { kind: 'point', index: li, series: s.name, label: lab, value: v, tooltip: { title: lab, rows: [{ swatch: color, name: s.name, value: fmt(v) }] } };
        if (marker !== 'none' && labels.length <= 60) {
          if (marker === 'square') nodes.push({ type: 'rect', x: xs[li] - 3, y: py - 3, w: 6, h: 6, fill: color, datum });
          else if (marker === 'diamond') nodes.push({ type: 'path', d: `M${xs[li]} ${py - 4} L${xs[li] + 4} ${py} L${xs[li]} ${py + 4} L${xs[li] - 4} ${py} Z`, fill: color, datum });
          else nodes.push({ type: 'circle', cx: xs[li], cy: py, r: 2.8, fill: color, stroke: t.paper, strokeWidth: 1, datum });
        }
        hits.push({ shape: { type: 'circle', cx: xs[li], cy: py, r: Math.max(8, lw + 5) }, datum });
      });
      // 端点标签
      if (endLabels && labels.length) {
        const li = labels.length - 1;
        nodes.push({ type: 'text', x: xs[li] + 8, y: ysTop[li], text: fmt(s.values[li]), font: 'mono', size: 10.5, baseline: 'middle', fill: color });
      }
    });

    nodes.push(...annotationNodes(ctx.annotations, {
      plot, xBand: (l) => (labels.includes(l) ? xOf(l) : undefined), xOf: (v) => (labels.includes(String(v)) ? xOf(String(v)) : undefined), yOf: y, format: fmt,
    }, t));

    const sc = scene(ctx.width, ctx.height, [g(nodes)], undefined);
    sc.defs = defs;
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = visSeries.length > 1 || hiddenS.size
      ? m.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length], hidden: hiddenS.has(s.name) })) : [];
    return sc;
  },
};
