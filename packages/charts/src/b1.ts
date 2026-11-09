// B1：matrix3d / scatter / pie / bullet / funnel。
import type { ViewId } from '@virta/contracts';
import type { LabelCandidate, Node, Paint, Scene } from '@virta/chart-core';
import { g, measureText, niceTicks, paddedDomain, placeLabels, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, formatNumber, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors, accentFor, lerpOklch } from '@virta/design-system';
import type { BarlineModel, BulletModel, FunnelModel, PieModel, ScatterModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { emptyDefs, styleFill } from './finish.js';

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
  interactions: ['rotate', 'zoom'],
  resolve: (model, req) => {
    const opts = { ...(req.options ?? {}) };
    if (opts['topLabels'] && model.labels.length * model.series.length > 60) opts['topLabels'] = false;
    return { variant: req.variant ?? 'matrix', options: opts };
  },
  layout(m: BarlineModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const sort = String(opt('sort', 'none'));
    const norm = String(opt('norm', 'global'));
    const showAxes = opt('axes3d', true) !== false;
    const topLabels = opt('topLabels', false) === true;
    const shading = opt('shading', true) !== false;
    const az = Number(ctx.state?.azimuth ?? 45);
    const ti = Number(ctx.state?.tilt ?? { high: 48, mid: 30, low: 14 }[String(opt('tilt', 'mid'))] ?? 30);
    const zf = Number(ctx.state?.zoom ?? 1);
    // 负值守卫（旧版 bar-matrix 规则）：地板在 z=0，负值柱无地下空间，直接空态
    const vmin = Math.min(0, ...m.series.flatMap((s) => s.values.map((v) => Math.min(0, v ?? 0))));
    if (vmin < 0) {
      const sc = scene(ctx.width, ctx.height, [g([
        { type: 'text', x: ctx.plot.x + ctx.plot.w / 2, y: ctx.plot.y + ctx.plot.h / 2 - 10, text: '3D 透视矩阵不支持负值', font: 'body', size: 15, anchor: 'middle', baseline: 'middle', fill: t.muted },
        { type: 'text', x: ctx.plot.x + ctx.plot.w / 2, y: ctx.plot.y + ctx.plot.h / 2 + 14, text: '推荐替代：分组 / 堆叠 / 瀑布图', font: 'mono', size: 10, anchor: 'middle', baseline: 'middle', fill: t.faint },
      ])]);
      sc.hits = [];
      return sc;
    }
    const plot = { x: ctx.plot.x + 70, y: ctx.plot.y + 30, w: ctx.plot.w - 120, h: ctx.plot.h - 90 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    // 排序：按列合计 / 按标签
    const order = m.labels.map((_, i) => i);
    if (sort === 'value') order.sort((a, b) => m.series.reduce((s2, s) => s2 + (s.values[b] ?? 0), 0) - m.series.reduce((s2, s) => s2 + (s.values[a] ?? 0), 0));
    else if (sort === 'label') order.sort((a, b) => String(m.labels[a]).localeCompare(String(m.labels[b]), 'zh'));
    // 归一：全局 or 按行（系列）
    const vmaxG = Math.max(1, ...m.series.flatMap((s) => s.values.map((v) => v ?? 0)));
    const vmaxRow = m.series.map((s) => Math.max(1, ...s.values.map((v) => v ?? 0)));
    const cols = m.labels.length, rows = m.series.length;
    const gw = plot.w / cols, gd = plot.h / rows;
    // 柱高默认取格距 ~1.6 倍（旧版 heightScale≈2.6 世界单位的观感），上限 plot.h 一半
    const maxH = Math.min(Number(opt('height', 0)) || Math.min(gw, gd) * 1.6, plot.h * 0.5);
    const fog = opt('fog', true) !== false;
    const isCurve = (ctx.variant ?? 'matrix') === 'curve';
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.62;
    const P = (x: number, y: number, z: number) => project3d(x, y, z, az, ti).map((k, i2) => (i2 ? cy0 : cx0) + k * zf) as [number, number];
    const p = (x: number, y: number, z: number) => { const q = P(x, y, z); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
    // 地面网格 + 前缘 x 标签 + 后墙值轴 + 右缘系列名
    if (showAxes) {
      for (let i = 0; i <= cols; i++) {
        const [x1, y1] = P(i * gw - plot.w / 2, 0, -plot.h / 2);
        const [x2, y2] = P(i * gw - plot.w / 2, 0, plot.h / 2);
        nodes.push({ type: 'line', x1, y1, x2, y2, stroke: t.grid, strokeWidth: 1 });
      }
      for (let j = 0; j <= rows; j++) {
        const [x1, y1] = P(-plot.w / 2, 0, j * gd - plot.h / 2);
        const [x2, y2] = P(plot.w / 2, 0, j * gd - plot.h / 2);
        nodes.push({ type: 'line', x1, y1, x2, y2, stroke: t.grid, strokeWidth: 1 });
      }
      for (let xi = 0; xi < cols; xi++) {
        const [lx, ly] = P(xi * gw + gw / 2 - plot.w / 2, 0, plot.h / 2 + 6);
        nodes.push({ type: 'text', x: lx, y: ly + 8, text: String(m.labels[order[xi]]), font: 'mono', size: 10, anchor: 'middle', baseline: 'top', fill: t.faint });
      }
      // 后墙（z=+h/2 远缘）值轴：竖线 + niceTicks 刻度值 + 横贯参考线
      const [ax, ay] = P(-plot.w / 2, 0, plot.h / 2);
      const [ax2, ay2] = P(-plot.w / 2, -maxH * 1.08, plot.h / 2);
      nodes.push({ type: 'line', x1: ax, y1: ay, x2: ax2, y2: ay2, stroke: t.faint, strokeWidth: 1.4 });
      for (const tv of niceTicks(0, vmaxG, 4).ticks) {
        const th = (tv / vmaxG) * maxH;
        const [x1, y1] = P(-plot.w / 2, -th, plot.h / 2);
        const [x2, y2] = P(plot.w / 2, -th, plot.h / 2);
        nodes.push({ type: 'line', x1, y1, x2, y2, stroke: t.faint, strokeWidth: 1, dash: [4, 5], opacity: 0.6 });
        nodes.push({ type: 'text', x: x1 - 8, y: y1, text: fmt(ctx)(tv), font: 'mono', size: 10, anchor: 'end', baseline: 'middle', fill: t.muted });
      }
      // 右缘 z 轴系列名
      for (let zi = 0; zi < rows; zi++) {
        const [lx, ly] = P(plot.w / 2 + 8, 0, zi * gd + gd / 2 - plot.h / 2);
        nodes.push({ type: 'text', x: lx, y: ly, text: String(m.series[zi].name), font: 'mono', size: 10, anchor: 'start', baseline: 'middle', fill: t.muted });
      }
    }
    // 深度 ∝ x·sinA + z·cosA（大者远）：近侧面取较小一侧，任意方位角下柱体都是正立方体
    const sinA = Math.sin((az * Math.PI) / 180), cosA = Math.cos((az * Math.PI) / 180);
    // 柱（深度排序远→近，旋转后遮挡仍正确；曲线变体也保留柱体）
    const totalCells = cols * rows;
    const cells: { zi: number; xi: number }[] = [];
    for (let zi = 0; zi < rows; zi++) for (let xi = 0; xi < cols; xi++) cells.push({ zi, xi });
    cells.sort((a, b) => (b.xi * gw * sinA + b.zi * gd * cosA) - (a.xi * gw * sinA + a.zi * gd * cosA));
    for (const { zi, xi } of cells) {
      const li = order[xi];
      const v = m.series[zi].values[li];
      const vmax = norm === 'per_column' ? vmaxRow[zi] : vmaxG;
      const h = (Math.max(0, v ?? 0) / vmax) * maxH;
      // 正方形柱底（边长取格宽/格深较小者）：避免少列大格时长成扁片
      const bw = Math.min(gw, gd) * 0.66, bd = bw;
      const bx = xi * gw + (gw - bw) / 2 - plot.w / 2, bz = zi * gd + (gd - bd) / 2 - plot.h / 2;
      const c = colors[zi % colors.length];
      // 景深雾化：远处（zi 小）柱体向底色淡化
      const base = fog && rows > 1 ? lerpOklch(t.paper, c, 0.85 + 0.15 * (zi / (rows - 1))) : c;
      const op = shading ? 0.62 + 0.38 * (Math.max(0, v ?? 0) / vmax) : 1;
      const datum = { kind: 'bar', index: li, series: m.series[zi].name, label: String(m.labels[li]), value: v ?? undefined, tooltip: { title: `${m.series[zi].name} · ${m.labels[li]}`, rows: [{ swatch: c, name: '值', value: fmt(ctx)(v ?? 0) }] } };
      // 接触软阴影：柱底椭圆（旧版 bar-matrix 的柔和接触阴影）
      {
        const [s1x, s1y] = P(bx + bw / 2, 0, bz + bd / 2);
        const rx = bw * 0.5, ry = Math.max(1.5, bd * 0.22);
        nodes.push({ type: 'path', d: `M${(s1x - rx).toFixed(1)} ${s1y.toFixed(1)} a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0 a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0 Z`, fill: t.ink, opacity: 0.08 });
      }
      // 近侧两面 + 顶面：明暗面都取柱色的色阶（侧面压暗、顶面提亮），而非灰片
      const side = lerpOklch(t.ink, base, 0.42), top = lerpOklch('#ffffff', base, 0.80);
      const xF = sinA > 0 ? bx : bx + bw;   // 近侧 x 面
      const zF = cosA > 0 ? bz : bz + bd;   // 近侧 z 面
      nodes.push({ type: 'path', d: `M${p(bx, 0, zF)} L${p(bx + bw, 0, zF)} L${p(bx + bw, -h, zF)} L${p(bx, -h, zF)} Z`, fill: base, opacity: op, datum });
      nodes.push({ type: 'path', d: `M${p(xF, 0, bz)} L${p(xF, 0, bz + bd)} L${p(xF, -h, bz + bd)} L${p(xF, -h, bz)} Z`, fill: side, opacity: op, datum });
      nodes.push({ type: 'path', d: `M${p(bx, -h, bz)} L${p(bx + bw, -h, bz)} L${p(bx + bw, -h, bz + bd)} L${p(bx, -h, bz + bd)} Z`, fill: top, opacity: Math.min(1, op + 0.05), datum });
      if (topLabels && totalCells <= 60) {
        const [tx, ty] = P(bx + bw / 2, -h, bz + bd / 2);
        nodes.push({ type: 'text', x: tx, y: ty - 4, text: fmt(ctx)(v ?? 0), font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.muted });
      }
      const [hx, hy] = P(bx + bw / 2, -h / 2, bz + bd / 2);
      hits.push({ shape: { type: 'rect', x: hx - bw / 2, y: hy - Math.max(12, h / 2), w: bw, h: Math.max(24, h) }, datum });
    }
    // 曲线变体：每个系列一条跨分类的三维曲线（双因素）
    if (isCurve) for (let zi = 0; zi < rows; zi++) {
      const c = colors[zi % colors.length];
      const base = fog && rows > 1 ? lerpOklch(t.paper, c, 0.85 + 0.15 * (zi / (rows - 1))) : c;
      const vmax = norm === 'per_column' ? vmaxRow[zi] : vmaxG;
      const pts: [number, number][] = [];
      for (let xi = 0; xi < cols; xi++) {
        const li = order[xi];
        const v = m.series[zi].values[li];
        const h = (Math.max(0, v ?? 0) / vmax) * maxH;
        pts.push(P(xi * gw + gw / 2 - plot.w / 2, -h, zi * gd + gd / 2 - plot.h / 2));
      }
      nodes.push({ type: 'path', d: pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' '), fill: 'none', stroke: base, strokeWidth: 2.2 });
      pts.forEach((q, xi) => {
        const li = order[xi];
        const v = m.series[zi].values[li];
        const datum = { kind: 'point', index: li, series: m.series[zi].name, label: String(m.labels[li]), value: v ?? undefined, tooltip: { title: `${m.series[zi].name} · ${m.labels[li]}`, rows: [{ swatch: c, name: '值', value: fmt(ctx)(v ?? 0) }] } };
        nodes.push({ type: 'circle', cx: q[0], cy: q[1], r: 3.4, fill: base, stroke: t.paper, strokeWidth: 1.2, datum });
        hits.push({ shape: { type: 'rect', x: q[0] - 8, y: q[1] - 8, w: 16, h: 16 }, datum });
      });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
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
    const scatCands: LabelCandidate[] = [];
    const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y);
    // D6/H10：clamp 零界——全正数据不下零（原实现对 min(0,·) 再减 6% pad 导致负刻度）
    let [xMin, xMax] = paddedDomain(xs.length ? Math.min(...xs) : 0, xs.length ? Math.max(...xs) : 1, { pad: 0.06, zero: 'clamp' });
    let [yMin, yMax] = paddedDomain(ys.length ? Math.min(...ys) : 0, ys.length ? Math.max(...ys) : 1, { pad: 0.06, zero: 'clamp' });
    if (ctx.options?.['xMin'] !== undefined) xMin = Number(ctx.options['xMin']);
    if (ctx.options?.['xMax'] !== undefined) xMax = Number(ctx.options['xMax']);
    if (ctx.options?.['yMin'] !== undefined) yMin = Number(ctx.options['yMin']);
    if (ctx.options?.['yMax'] !== undefined) yMax = Number(ctx.options['yMax']);
    const logX = ctx.options?.['logX'] === true && xMin > 0;
    const logY = ctx.options?.['logY'] === true && yMin > 0;
    const lx = (v: number) => Math.log10(Math.max(1e-12, v));
    const x = scaleLinear([logX ? lx(xMin) : xMin, logX ? lx(xMax) : xMax], [plot.x, plot.x + plot.w]);
    const y = scaleLinear([logY ? lx(yMin) : yMin, logY ? lx(yMax) : yMax], [plot.y + plot.h, plot.y]);
    const X = (v: number) => x(logX ? lx(v) : v), Y = (v: number) => y(logY ? lx(v) : v);
    if (logY) {
      niceTicks(yMin, yMax, 6).ticks.forEach((v) => {
        nodes.push({ type: 'line', x1: plot.x, y1: Y(v), x2: plot.x + plot.w, y2: Y(v), stroke: t.grid, strokeWidth: 1 });
        nodes.push({ type: 'text', x: plot.x - 8, y: Y(v), text: fmt(ctx)(v ?? 0), font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      });
    } else nodes.push(...yAxis(y, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t, fmt(ctx)));
    (logX ? niceTicks(xMin, xMax, 6).ticks : x.ticks).forEach((v) => {
      nodes.push({ type: 'line', x1: X(v), y1: plot.y, x2: X(v), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: X(v), y: plot.y + plot.h + 6, text: fmt(ctx)(v ?? 0), font: 'mono', size: 11, anchor: 'middle', baseline: 'top', fill: t.muted });
    });
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    const smax = Math.max(1, ...m.points.map((p) => p.size ?? 0));
    const dotScale = Number(ctx.options?.['dotSize'] ?? 1);
    const metricBubble = String(ctx.options?.['bubble'] ?? 'metric') === 'metric';
    const marker = String(ctx.options?.['marker'] ?? 'circle');
    const labelMode = String(ctx.options?.['labelMode'] ?? 'none');
    // 均值/离群判定
    const mx = m.points.reduce((s2, p) => s2 + p.x, 0) / Math.max(1, m.points.length);
    const my = m.points.reduce((s2, p) => s2 + p.y, 0) / Math.max(1, m.points.length);
    const sd = Math.sqrt(m.points.reduce((s2, p) => s2 + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / Math.max(1, m.points.length)) || 1;
    const dot = (px: number, py: number, r: number, c: string, gi2: number, datum: { kind: string; index: number; series: string; label: string; value: number; tooltip: unknown }) => {
      const kind = marker === 'mixed' ? ['circle', 'square', 'diamond', 'triangle'][gi2 % 4] : marker;
      const base = { fill: c, opacity: 0.82, datum: datum as never } as const;
      if (kind === 'square') nodes.push({ type: 'rect', x: px - r, y: py - r, w: r * 2, h: r * 2, ...base });
      else if (kind === 'diamond') nodes.push({ type: 'path', d: `M${px} ${py - r * 1.2} L${px + r * 1.2} ${py} L${px} ${py + r * 1.2} L${px - r * 1.2} ${py} Z`, ...base });
      else if (kind === 'triangle') nodes.push({ type: 'path', d: `M${px} ${py - r * 1.15} L${px + r * 1.1} ${py + r * 0.8} L${px - r * 1.1} ${py + r * 0.8} Z`, ...base });
      else nodes.push({ type: 'circle', cx: px, cy: py, r, ...base });
    };
    m.points.forEach((p, pi) => {
      const c = colors[(gi.get(p.group) ?? 0) % colors.length];
      const r = (metricBubble && p.size ? 3 + 9 * Math.sqrt(p.size / smax) : 4) * dotScale;
      const datum = { kind: 'point', index: pi, series: p.group, label: p.label, value: p.y, tooltip: { title: p.label, rows: [{ swatch: c, name: 'x', value: fmt(ctx)(p.x) }, { name: 'y', value: fmt(ctx)(p.y) }] } };
      dot(X(p.x), Y(p.y), r, c, gi.get(p.group) ?? 0, datum);
      hits.push({ shape: { type: 'circle', cx: X(p.x), cy: Y(p.y), r: Math.max(r + 3, 9) }, datum });
      const dist = Math.hypot(p.x - mx, p.y - my) / sd;
      if (labelMode === 'all' || (labelMode === 'outlier' && dist > 1.8)) {
        scatCands.push({ x: X(p.x), y: Y(p.y), text: p.label, width: measureText(p.label, 'mono', 10), height: 12, priority: dist, leader: true, datum });
      }
    });
    for (const pl of placeLabels(scatCands, [plot.x, plot.y, plot.x + plot.w, plot.y + plot.h]).placed) {
      if (pl.leader) nodes.push({ type: 'line', x1: pl.leader[0], y1: pl.leader[1], x2: pl.leader[2], y2: pl.leader[3], stroke: t.faint, strokeWidth: 0.8, opacity: 0.5 });
      nodes.push({ type: 'text', x: pl.x, y: pl.y + pl.h / 2, text: pl.text, font: 'mono', size: 10, baseline: 'middle', fill: t.muted });
    }
    if (ctx.options?.['meanLines'] === true) {
      const acc2 = accentFor(ctx.palette, ctx.theme);
      nodes.push({ type: 'line', x1: X(mx), y1: plot.y, x2: X(mx), y2: plot.y + plot.h, stroke: acc2, strokeWidth: 1, dash: [3, 4], opacity: 0.7 });
      nodes.push({ type: 'line', x1: plot.x, y1: Y(my), x2: plot.x + plot.w, y2: Y(my), stroke: acc2, strokeWidth: 1, dash: [3, 4], opacity: 0.7 });
      nodes.push({ type: 'text', x: X(mx) + 4, y: plot.y + 4, text: `x̄ ${fmt(ctx)(mx)}`, font: 'mono', size: 10, baseline: 'top', fill: acc2 });
      nodes.push({ type: 'text', x: plot.x + plot.w - 4, y: Y(my) - 4, text: `ȳ ${fmt(ctx)(my)}`, font: 'mono', size: 10, anchor: 'end', baseline: 'bottom', fill: acc2 });
    }
    // 95% 置信椭圆：全体或按分组（协方差特征分解）
    if (ctx.options?.['ellipse'] === true && m.points.length >= 5) {
      const groupsToUse = m.groups.length > 1 ? m.groups : [m.groups[0] ?? ''];
      groupsToUse.forEach((gn, gi2) => {
        const pts = m.points.filter((p) => p.group === gn || m.groups.length <= 1);
        if (pts.length < 5) return;
        const ex2 = pts.reduce((s2, p) => s2 + p.x, 0) / pts.length, ey2 = pts.reduce((s2, p) => s2 + p.y, 0) / pts.length;
        let sxx = 0, syy = 0, sxy = 0;
        for (const p of pts) { sxx += (p.x - ex2) ** 2; syy += (p.y - ey2) ** 2; sxy += (p.x - ex2) * (p.y - ey2); }
        sxx /= pts.length; syy /= pts.length; sxy /= pts.length;
        const tr = sxx + syy, det = sxx * syy - sxy * sxy;
        const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
        const l1 = tr / 2 + disc, l2 = Math.max(1e-12, tr / 2 - disc);
        const ang2 = Math.abs(sxy) < 1e-12 ? 0 : Math.atan2(l1 - sxx, sxy);
        const rx = Math.sqrt(l1 * 5.991), ry = Math.sqrt(l2 * 5.991);
        const c2 = colors[gi2 % colors.length];
        const ep: string[] = [];
        for (let i2 = 0; i2 <= 40; i2++) {
          const a2 = (i2 / 40) * Math.PI * 2;
          const exv = ex2 + rx * Math.cos(a2) * Math.cos(ang2) - ry * Math.sin(a2) * Math.sin(ang2);
          const eyv = ey2 + rx * Math.cos(a2) * Math.sin(ang2) + ry * Math.sin(a2) * Math.cos(ang2);
          ep.push(`${i2 ? 'L' : 'M'}${X(exv).toFixed(1)} ${Y(eyv).toFixed(1)}`);
        }
        nodes.push({ type: 'path', d: ep.join(' ') + ' Z', fill: 'none', stroke: c2, strokeWidth: 1.4, dash: [5, 4], opacity: 0.75 });
      });
    }
    if (m.fit && ctx.options?.['trendline'] !== false) {
      const { m: k, b, x0, x1, r } = m.fit;
      nodes.push({ type: 'line', x1: X(x0), y1: Y(k * x0 + b), x2: X(x1), y2: Y(k * x1 + b), stroke: accentFor(ctx.palette, ctx.theme), strokeWidth: 1.5, dash: [6, 4] });
      if (r !== null) nodes.push({ type: 'text', x: plot.x + plot.w - 8, y: plot.y + 4, text: `r=${r.toFixed(2)}`, font: 'mono', size: 11, anchor: 'end', baseline: 'top', fill: accentFor(ctx.palette, ctx.theme) });
    }
    nodes.push(...annotationNodes(ctx.annotations, { plot, xOf: (v) => X(Number(v)), yOf: Y, format: fmt(ctx) }, t));
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
  // 共性样式：defs 承载纹理/渐变填充（texture/colorMode 选项）
  view: 'pie' as ViewId,
  interactions: ['select'],
  layout(m: PieModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const defs = emptyDefs();
    const donut = (ctx.variant ?? 'pie') === 'donut';
    const ringRatio = Math.min(0.85, Math.max(0.2, Number(ctx.options?.['ringRatio'] ?? 0.6)));
    const labelMode = String(ctx.options?.['labelMode'] ?? 'leader');
    const collapseOther = ctx.options?.['collapseOther'] !== false;
    const centerLabel = ctx.options?.['centerLabel'] !== false;
    // 其他合并：尾部小扇区并入「其他」
    let slices = m.slices;
    if (collapseOther && slices.length > 8) {
      const head = slices.slice(0, 7), tail = slices.slice(7);
      const tv = tail.reduce((s2, x) => s2 + x.value, 0);
      if (tv > 0) slices = [...head, { label: '其他', value: tv, share: tv / m.slices.reduce((s2, x) => s2 + x.value, 0) }];
    }
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const r1 = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 30, r0 = donut ? r1 * ringRatio : 0;
    const ex = Number(ctx.state?.explode ?? -1);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const cands: LabelCandidate[] = [];
    const leaders = new Map<string, [number, number]>();
    let a = -Math.PI / 2;
    slices.forEach((s, i) => {
      const a1 = a + s.share * Math.PI * 2 * (slices.length === 1 ? 0.9999 : 1);
      const c = colors[i % colors.length];
      const datum = { kind: 'slice', index: i, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value), share: `${(s.share * 100).toFixed(1)}%` }] } };
      const am = (a + a1) / 2;
      // 选择放大：命中扇形沿角平分线外移
      const off = i === ex ? 15 : 0;
      const ox = off * Math.cos(am), oy = off * Math.sin(am);
      nodes.push({ type: 'path', d: arcPath(cx + ox, cy + oy, r0, r1, a, a1), fill: styleFill(defs, ctx, c, i), datum });
      if (labelMode === 'inside' && s.share > 0.05) {
        const lr2 = (r0 + r1) / 2;
        nodes.push({ type: 'text', x: cx + ox + lr2 * Math.cos(am), y: cy + oy + lr2 * Math.sin(am), text: `${s.label} ${(s.share * 100).toFixed(0)}%`, font: 'mono', size: 10.5, anchor: 'middle', baseline: 'middle', fill: t.paper });
      } else if (labelMode !== 'none' && s.share > 0.03) {
        const lr = r1 + 16;
        const lx = cx + ox + lr * Math.cos(am), ly = cy + oy + lr * Math.sin(am);
        const txt = `${s.label} ${(s.share * 100).toFixed(0)}%`;
        // D4/H8：外侧标签交 placeLabels 避让；引导线改从扇形边画到落点
        cands.push({ x: lx + (lx > cx ? 4 : -4), y: ly, text: txt, width: measureText(txt, 'body', 11),
          height: 13, priority: s.share, leader: true, datum });
        leaders.set(txt, [cx + ox + (r1 + 2) * Math.cos(am), cy + oy + (r1 + 2) * Math.sin(am)]);
      }
      hits.push({ shape: { type: 'circle', cx: cx + ox + (r0 + r1) / 2 * Math.cos(am), cy: cy + oy + (r0 + r1) / 2 * Math.sin(am), r: (r1 - r0) / 2 + 10 }, datum });
      a = a1;
    });
    if (donut && centerLabel) nodes.push({ type: 'text', x: cx, y: cy, text: fmt(ctx)(slices.reduce((s2, x) => s2 + x.value, 0)), font: 'display', size: 26, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.ink });
    for (const pl of placeLabels(cands, [ctx.plot.x, ctx.plot.y, ctx.plot.x + ctx.plot.w, ctx.plot.y + ctx.plot.h]).placed) {
      const src = leaders.get(pl.text);
      if (src) nodes.push({ type: 'line', x1: src[0], y1: src[1], x2: pl.x + pl.w / 2, y2: pl.y + pl.h / 2, stroke: t.faint, strokeWidth: 1 });
      nodes.push({ type: 'text', x: pl.x + pl.w / 2, y: pl.y + pl.h / 2, text: pl.text, font: 'body', size: 11, anchor: 'middle', baseline: 'middle', fill: t.muted });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
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
    const gapLabels = ctx.options?.['gapLabels'] !== false;
    const sort = String(ctx.options?.['sort'] ?? 'original');
    let items = ctx.options?.['onlyBehind'] === true ? m.items.filter((it) => it.actual < it.target) : [...m.items];
    if (sort === 'ratio') items.sort((a, b) => a.actual / Math.max(1e-9, a.target) - b.actual / Math.max(1e-9, b.target));
    else if (sort === 'gap') items.sort((a, b) => (a.actual - a.target) - (b.actual - b.target));
    const plot = { x: ctx.plot.x + 110, y: ctx.plot.y + 16, w: ctx.plot.w - (gapLabels ? 172 : 130), h: ctx.plot.h - 40 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const x = scaleLinear([0, Math.max(1, m.scale)], [plot.x, plot.x + plot.w]);
    const n = items.length;
    const rowH = plot.h / Math.max(1, n);
    const barH = Math.min(20, rowH * 0.4);
    items.forEach((it, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const poor = it.poor ?? m.scale * 0.5, good = it.good ?? m.scale * 0.85;
      // 区间带（语义色带保留含义；中段随配色主色）
      const acc = accentFor(ctx.palette, ctx.theme);
      nodes.push({ type: 'rect', x: plot.x, y: cy - barH * 0.9, w: x(poor) - plot.x, h: barH * 1.8, fill: t.neg, opacity: 0.14 });
      nodes.push({ type: 'rect', x: x(poor), y: cy - barH * 0.9, w: x(good) - x(poor), h: barH * 1.8, fill: acc, opacity: 0.12 });
      nodes.push({ type: 'rect', x: x(good), y: cy - barH * 0.9, w: x(m.scale) - x(good), h: barH * 1.8, fill: t.pos, opacity: 0.14 });
      // 实际条 + 目标刻线（实际条随配色主色，与 legacy 一致）
      const c = acc;
      const datum = { kind: 'bullet', index: i, label: it.label, value: it.actual, tooltip: { title: it.label, rows: [{ swatch: c, name: '实际', value: fmt(ctx)(it.actual) }, { name: '目标', value: fmt(ctx)(it.target) }] } };
      nodes.push({ type: 'rect', x: plot.x, y: cy - barH / 2, w: Math.max(0, x(it.actual) - plot.x), h: barH, r: 3, fill: c, datum });
      nodes.push({ type: 'line', x1: x(it.target), y1: cy - barH * 0.85, x2: x(it.target), y2: cy + barH * 0.85, stroke: t.ink, strokeWidth: 2 });
      if (gapLabels && it.target > 0) {
        const gap = it.actual - it.target;
        nodes.push({ type: 'text', x: plot.x + plot.w + 8, y: cy, text: `${gap >= 0 ? '+' : ''}${fmt(ctx)(gap)}`, font: 'mono', size: 10, baseline: 'middle', fill: gap >= 0 ? t.pos : t.neg });
      }
      nodes.push({ type: 'text', x: plot.x - 10, y: cy, text: it.label, font: 'body', size: 11.5, anchor: 'end', baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    if (ctx.options?.['scale'] !== false) {
      x.ticks.forEach((v) => {
        nodes.push({ type: 'line', x1: x(v), y1: plot.y + plot.h, x2: x(v), y2: plot.y + plot.h + 4, stroke: t.faint, strokeWidth: 1 });
        nodes.push({ type: 'text', x: x(v), y: plot.y + plot.h + 6, text: x.fmt(v), font: 'mono', size: 9.5, anchor: 'middle', baseline: 'top', fill: t.faint });
      });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— funnel：圆角横条 + 左标签栏 / 右转化徽章栏（legacy 三栏阅读动线）——
export const funnelRenderer: FamilyRenderer<FunnelModel> = {
  view: 'funnel' as ViewId,
  interactions: ['select'],
  resolve(m, req) {
    const v = String(req.variant ?? 'single');
    return { variant: v === 'multi' && m.series_n < 2 ? 'single' : v, options: req.options ?? {} };
  },
  layout(m: FunnelModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const acc = accentFor(ctx.palette, ctx.theme);
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const align = String(opt('align', ctx.variant === 'left' ? 'left' : 'center'));
    const colorMode = String(opt('colorMode', 'ramp'));
    const finish = String(opt('finish', 'gradient'));
    const showRates = opt('showRates', true) !== false;
    const highlightDrop = opt('highlightDrop', true) !== false;
    const paper = t.paper;
    const labelW = Math.min(150, ctx.plot.w * 0.24);
    const badgeW = showRates ? Math.min(128, ctx.plot.w * 0.22) : 10;
    const plot = { x: ctx.plot.x + labelW + 14, y: ctx.plot.y + 14, w: ctx.plot.w - labelW - badgeW - 28, h: ctx.plot.h - 28 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const n = m.stages.length;
    const bandH = plot.h / Math.max(1, n);
    const gap = Math.min(18, bandH * 0.26), bh = Math.max(8, bandH - gap);
    const maxV = Math.max(1e-9, m.top);
    const pcx = plot.x + plot.w / 2;
    const defs: Scene['defs'] = { gradients: [], radials: [], patterns: [], clips: [] };
    const dark = ctx.theme === 'dark';
    const stageColor = (i: number) => colorMode === 'cat'
      ? colors[i % colors.length]
      : lerpOklch(acc, dark ? '#ede9dc' : '#ffffff', 0.45 * (n > 1 ? i / (n - 1) : 0));
    // 最大流失级
    let worst = -1, worstRate = Infinity;
    m.stages.forEach((s, i) => { if (i > 0 && s.step !== null && s.step !== undefined && s.step < worstRate) { worstRate = s.step; worst = i; } });
    // 多系列：各系列一列并排迷你漏斗，各自按自身首级归一
    if (String(ctx.variant ?? 'single') === 'multi' && m.seriesStages?.length) {
      const sn = m.seriesStages.length, colW = plot.w / sn;
      m.seriesStages.forEach((ser, si) => {
        const cc = colors[si % colors.length];
        const top0 = Math.max(1e-9, ser.stages[0]?.value ?? 1);
        const cxx = plot.x + colW * si + colW / 2;
        nodes.push({ type: 'text', x: cxx, y: plot.y - 2, text: ser.name, font: 'body', size: 11, weight: 600, anchor: 'middle', baseline: 'bottom', fill: cc });
        ser.stages.forEach((s, i) => {
          const bw = Math.max(8, (s.value / top0) * (colW - 18));
          const by = plot.y + i * bandH + gap / 2;
          const dim = ctx.state?.focus != null && ctx.state.focus !== ser.name;
          const datum = { kind: 'stage', index: i, series: ser.name, label: s.label, value: s.value, tooltip: { title: `${ser.name} · ${s.label}`, rows: [{ swatch: cc, name: '数值', value: fmt(ctx)(s.value) }, { name: '转化', value: s.step !== null ? `${(s.step * 100).toFixed(1)}%` : '—' }] } };
          nodes.push({ type: 'rect', x: cxx - bw / 2, y: by, w: bw, h: bh, r: Math.min(8, bh / 2), fill: cc, opacity: (dim ? 0.15 : 0.92) * (1 - i * 0.08), datum });
          hits.push({ shape: { type: 'rect', x: cxx - bw / 2, y: by, w: bw, h: bh }, datum });
        });
      });
      m.stages.forEach((s, i) => nodes.push({ type: 'text', x: plot.x - 10, y: plot.y + i * bandH + bandH / 2, text: s.label, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted }));
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
      sc.hits = hits;
      (sc as { legend?: LegendItem[] }).legend = m.seriesStages.map((ser, si) => ({ name: ser.name, color: colors[si % colors.length] }));
      return sc;
    }
    if (align === 'center') {
      nodes.push({ type: 'line', x1: pcx, y1: plot.y - 2, x2: pcx, y2: plot.y + plot.h + 2, stroke: t.faint, strokeWidth: 1, dash: [2, 6], opacity: 0.4 });
    }
    m.stages.forEach((s, i) => {
      const bw = Math.max(14, (s.value / maxV) * plot.w);
      const bx = align === 'center' ? pcx - bw / 2 : plot.x;
      const by = plot.y + i * bandH + gap / 2;
      const cy = by + bh / 2;
      const c = stageColor(i);
      const isWorst = highlightDrop && i === worst;
      const isDim = ctx.state?.focus != null && ctx.state.focus !== s.label;
      const datum = { kind: 'stage', index: i, series: s.label, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value) }, { name: '转化', value: s.step !== null && s.step !== undefined ? `${(s.step * 100).toFixed(1)}%` : '—' }] } };
      // —— 圆角横条（质感三态）——
      if (finish === 'outline') {
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: paper, stroke: c, strokeWidth: 2, datum });
      } else if (finish === 'flat') {
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: c, datum });
      } else {
        defs.gradients.push({ id: `fn${i}`, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: lerpOklch(c, '#ffffff', 0.14) }, { offset: 1, color: lerpOklch(c, '#000000', 0.16) }] });
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: { ref: `fn${i}` } as never, datum });
      }
      // 点击调光：未聚焦阶段罩半透明纸色（对全部质感形态统一生效）
      if (isDim) nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: paper, opacity: 0.78 });
      if (isWorst) nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: 'none', stroke: t.neg, strokeWidth: 2 });
      // —— 左栏：阶段 + 数值 ——
      const labelTxt = s.label.length > 10 ? `${s.label.slice(0, 9)}…` : s.label;
      nodes.push({ type: 'text', x: ctx.plot.x + labelW, y: cy - 8, text: labelTxt, font: 'mono', size: 12, weight: 600, anchor: 'end', baseline: 'middle', fill: t.ink });
      nodes.push({ type: 'text', x: ctx.plot.x + labelW, y: cy + 9, text: fmt(ctx)(s.value), font: 'mono', size: 10.5, anchor: 'end', baseline: 'middle', fill: t.faint });
      // —— 右栏：转化率徽章 + 流失 ——
      const next = m.stages[i + 1];
      if (showRates && next) {
        const rate = `${((next.value / Math.max(1e-9, s.value)) * 100).toFixed(1)}%`;
        const badge = `↓ ${rate}`;
        const bwTxt = badge.length * 7 + 14;
        nodes.push({ type: 'rect', x: plot.x + plot.w + 12, y: cy - 18, w: bwTxt, h: 17, r: 8.5, fill: paper, stroke: isWorst ? t.neg : t.line2, strokeWidth: 1 });
        nodes.push({ type: 'text', x: plot.x + plot.w + 12 + bwTxt / 2, y: cy - 9.5, text: badge, font: 'mono', size: 10, anchor: 'middle', baseline: 'middle', fill: isWorst ? t.neg : t.ink });
        nodes.push({ type: 'text', x: plot.x + plot.w + 14, y: cy + 11, text: `−${fmt(ctx)(Math.abs(next.value - s.value))}`, font: 'mono', size: 10, baseline: 'middle', fill: t.neg });
      } else if (!showRates && s.cum) {
        nodes.push({ type: 'text', x: plot.x + plot.w + 12, y: cy, text: `${(s.cum * 100).toFixed(0)}% 累计`, font: 'mono', size: 10, baseline: 'middle', fill: t.faint });
      }
      hits.push({ shape: { type: 'rect', x: bx - 2, y: by, w: bw + 4, h: bh }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};
