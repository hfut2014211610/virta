// line 图族 layout：smooth/straight/step × none/area/stack × window × marker × endLabels。
import type { ViewId } from '@virta/contracts';
import type { LabelCandidate, Node, Scene } from '@virta/chart-core';
import { g, linePath as segPath, measureText, paddedDomain, placeLabels, scaleLinear, scalePoint, scene } from '@virta/chart-core';
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

// ADR-0011/A9：折线路径统一走 chart-core linePath（step-middle + null 缺口分段 + connectGaps 虚线桥接）
const paths = (xs: number[], pts: ({ x: number; y: number } | null)[], style: 'smooth' | 'straight' | 'step', connectGaps: boolean) =>
  segPath(pts, style, { connectGaps });

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
    const endCands: LabelCandidate[] = [];

    const stacked = fillMode === 'stack';
    const connectGaps = ctx.options?.['connectGaps'] === true;
    // 累计基线（stack 模式下逐层垫高）；未观测(null)跳过，不参与值域/堆叠（ADR-0011）
    const baseAcc = labels.map(() => 0);
    let vMin = 0, vMax = 0;
    if (stacked) {
      labels.forEach((_, li) => {
        let pos = 0, neg = 0;
        visSeries.forEach((s) => { const v = s.values[li]; if (v === null) return; if (v >= 0) pos += v; else neg += v; });
        vMax = Math.max(vMax, pos); vMin = Math.min(vMin, neg);
      });
    } else {
      vMin = Infinity; vMax = -Infinity;
      visSeries.forEach((s) => s.values.forEach((v) => { if (v === null) return; vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }));
      if (!Number.isFinite(vMin)) { vMin = 0; vMax = 0; }
    }
    if (vMax === vMin) vMax = vMin + 1;
    if (ctx.options?.['yMax'] !== undefined) vMax = Number(ctx.options['yMax']);
    if (ctx.options?.['yMin'] !== undefined) vMin = Number(ctx.options['yMin']);
    // D6/H10：堆叠以零为基准（include），其余 clamp——全正数据不下零、留 5% 边距
    const [dMin, dMax] = paddedDomain(vMin, vMax, { zero: stacked ? 'include' : 'clamp' });
    const y = scaleLinear([dMin, dMax], [plot.y + plot.h, plot.y]);
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
      const pts = labels.map((_, li) => {
        const v = s.values[li];
        return v === null ? null : { x: xs[li], y: stacked ? y(baseAcc[li] + Math.max(0, v)) : y(v) };
      });
      const ysBase = labels.map((_, li) => stacked ? y(baseAcc[li]) : y(0));
      if (stacked) labels.forEach((_, li) => { const v = s.values[li]; if (v !== null) baseAcc[li] += Math.max(0, v); });
      const segs = paths(xs, pts, lineStyle as 'smooth' | 'straight' | 'step', connectGaps);

      // 面积填充（按缺口分段闭合；gap 桥接段不填充）
      if (fillMode !== 'none' && pts.some(Boolean)) {
        const gid = `area${si}`;
        defs.gradients.push({ id: gid, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color, opacity: stacked ? 0.75 : 0.32 }, { offset: 1, color, opacity: stacked ? 0.55 : 0.05 }] });
        // 逐段：实段顶线 + 原路折返到基线
        for (const seg of segs) {
          if (seg.gap) continue;
          const nums = seg.d.match(/-?\d+\.?\d*/g)!.map(Number);
          const segXs = nums.filter((_, i) => i % 2 === 0);
          const firstX = segXs[0]!, lastX = segXs[segXs.length - 1]!;
          // D5：ysBase 已是像素值，不得再过一次 y()（原代码双重换算导致底边错误）
          const b0 = stacked ? ysBase[labels.findIndex((_, li) => Math.abs(xs[li] - firstX) < 0.01)]! : y(0);
          const b1 = stacked ? ysBase[labels.findIndex((_, li) => Math.abs(xs[li] - lastX) < 0.01)]! : y(0);
          nodes.push({ type: 'path', d: `${seg.d} L${lastX.toFixed(2)} ${b1.toFixed(2)} L${firstX.toFixed(2)} ${b0.toFixed(2)} Z`, fill: { ref: gid } });
        }
      }
      const dash = hatch ? [6, 3] : undefined;
      for (const seg of segs) {
        nodes.push({ type: 'path', d: seg.d, fill: 'none', stroke: color, strokeWidth: seg.gap ? Math.max(1, lw * 0.6) : lw, dash: seg.gap ? [5, 4] : dash });
      }

      // 标记（null=未观测：不画点，tooltip 显示「未观测」）
      labels.forEach((lab, li) => {
        const v = s.values[li];
        const py = pts[li]?.y ?? y(0);
        const datum = { kind: 'point', index: li, series: s.name, label: lab, value: v ?? undefined, tooltip: { title: lab, rows: [{ swatch: color, name: s.name, value: v === null ? '未观测' : fmt(v) }] } };
        if (v === null) { hits.push({ shape: { type: 'circle', cx: xs[li], cy: py, r: Math.max(8, lw + 5) }, datum }); return; }
        if (marker !== 'none' && labels.length <= 60) {
          if (marker === 'square') nodes.push({ type: 'rect', x: xs[li] - 3, y: py - 3, w: 6, h: 6, fill: color, datum });
          else if (marker === 'diamond') nodes.push({ type: 'path', d: `M${xs[li]} ${py - 4} L${xs[li] + 4} ${py} L${xs[li]} ${py + 4} L${xs[li] - 4} ${py} Z`, fill: color, datum });
          else nodes.push({ type: 'circle', cx: xs[li], cy: py, r: 2.8, fill: color, stroke: t.paper, strokeWidth: 1, datum });
        }
        hits.push({ shape: { type: 'circle', cx: xs[li], cy: py, r: Math.max(8, lw + 5) }, datum });
      });
      // 端点标签：最后一个有观测的点（D4/H8 走 placeLabels 避让）
      if (endLabels) {
        const li = labels.reduce((a, _, i) => (s.values[i] !== null ? i : a), -1);
        if (li >= 0) {
          const txt = fmt(s.values[li]!);
          endCands.push({ x: xs[li] + 8, y: pts[li]!.y, text: txt, width: measureText(txt, 'mono', 10.5), height: 12, priority: si, leader: true,
            datum: { kind: 'point', index: li, series: s.name, label: labels[li], value: s.values[li] ?? undefined,
              tooltip: { title: labels[li]!, rows: [{ swatch: color, name: s.name, value: txt }] } } });
        }
      }
    });
    // D4/H8：端点标签落位（近右边界向上/下移，放不下隐藏）
    for (const pl of placeLabels(endCands, [plot.x, plot.y, plot.x + plot.w, plot.y + plot.h]).placed) {
      if (pl.leader) nodes.push({ type: 'line', x1: pl.leader[0], y1: pl.leader[1], x2: pl.leader[2], y2: pl.leader[3], stroke: t.faint, strokeWidth: 0.8, opacity: 0.5 });
      nodes.push({ type: 'text', x: pl.x, y: pl.y + pl.h / 2, text: pl.text, font: 'mono', size: 10.5, baseline: 'middle', fill: colors[(pl.datum?.index ?? 0) % colors.length] });
    }

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
