// B1：matrix3d / scatter / pie / bullet / funnel。
import type { ViewId } from '@virta/contracts';
import type { Node, Paint, Scene } from '@virta/chart-core';
import { g, niceTicks, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, formatNumber, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors, accentFor, lerpOklch } from '@virta/design-system';
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
  interactions: ['rotate', 'zoom'],
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
    const vmin = Math.min(0, ...m.series.flatMap((s) => s.values.map((v) => Math.min(0, v))));
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
    if (sort === 'value') order.sort((a, b) => m.series.reduce((s2, s) => s2 + s.values[b], 0) - m.series.reduce((s2, s) => s2 + s.values[a], 0));
    else if (sort === 'label') order.sort((a, b) => String(m.labels[a]).localeCompare(String(m.labels[b]), 'zh'));
    // 归一：全局 or 按行（系列）
    const vmaxG = Math.max(1, ...m.series.flatMap((s) => s.values));
    const vmaxRow = m.series.map((s) => Math.max(1, ...s.values));
    const cols = m.labels.length, rows = m.series.length;
    const gw = plot.w / cols, gd = plot.h / rows;
    // 柱高默认取格距 ~1.6 倍（旧版 heightScale≈2.6 世界单位的观感），上限 plot.h 一半
    const maxH = Math.min(Number(opt('height', 0)) || Math.min(gw, gd) * 1.6, plot.h * 0.5);
    const fog = opt('fog', true) !== false;
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.62;
    const P = (x: number, y: number, z: number) => project3d(x, y, z, az, ti).map((k, i2) => (i2 ? cy0 : cx0) + k * zf) as [number, number];
    const p = (x: number, y: number, z: number) => { const q = P(x, y, z); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
    // 地面网格
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
      // 前缘 x 轴标签
      for (let xi = 0; xi < cols; xi++) {
        const [lx, ly] = P(xi * gw + gw / 2 - plot.w / 2, 0, plot.h / 2 + 6);
        nodes.push({ type: 'text', x: lx, y: ly + 8, text: String(m.labels[order[xi]]), font: 'mono', size: 10, anchor: 'middle', baseline: 'top', fill: t.faint });
      }
    }
    // 柱（后→前序）
    const totalCells = cols * rows;
    for (let zi = rows - 1; zi >= 0; zi--) for (let xi = 0; xi < cols; xi++) {
      const li = order[xi];
      const v = m.series[zi].values[li];
      const vmax = norm === 'per_column' ? vmaxRow[zi] : vmaxG;
      const h = (Math.max(0, v) / vmax) * maxH;
      // 正方形柱底（边长取格宽/格深较小者）：避免少列大格时长成扁片
      const bw = Math.min(gw, gd) * 0.66, bd = bw;
      const bx = xi * gw + (gw - bw) / 2 - plot.w / 2, bz = zi * gd + (gd - bd) / 2 - plot.h / 2;
      const c = colors[zi % colors.length];
      // 景深雾化：远处（zi 小）柱体向底色淡化
      const base = fog && rows > 1 ? lerpOklch(t.paper, c, 0.72 + 0.28 * (zi / (rows - 1))) : c;
      const op = shading ? 0.55 + 0.4 * (Math.max(0, v) / vmax) : 0.92;
      const datum = { kind: 'bar', index: li, series: m.series[zi].name, label: String(m.labels[li]), value: v, tooltip: { title: `${m.series[zi].name} · ${m.labels[li]}`, rows: [{ swatch: c, name: '值', value: fmt(ctx)(v) }] } };
      // 接触软阴影：柱底椭圆（旧版 bar-matrix 的柔和接触阴影）
      {
        const [s1x, s1y] = P(bx + bw / 2, 0, bz + bd / 2);
        const rx = bw * 0.5, ry = Math.max(1.5, bd * 0.22);
        nodes.push({ type: 'path', d: `M${(s1x - rx).toFixed(1)} ${s1y.toFixed(1)} a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0 a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0 Z`, fill: t.ink, opacity: 0.08 });
      }
      // 正面/侧面/顶面：明暗面都取柱色的色阶（侧面压暗、顶面提亮），而非灰片
      const side = lerpOklch(t.ink, base, 0.52), top = lerpOklch('#ffffff', base, 0.72);
      nodes.push({ type: 'path', d: `M${p(bx, 0, bz)} L${p(bx + bw, 0, bz)} L${p(bx + bw, -h, bz)} L${p(bx, -h, bz)} Z`, fill: base, opacity: op, datum });
      nodes.push({ type: 'path', d: `M${p(bx + bw, 0, bz)} L${p(bx + bw, 0, bz + bd)} L${p(bx + bw, -h, bz + bd)} L${p(bx + bw, -h, bz)} Z`, fill: side, opacity: op, datum });
      nodes.push({ type: 'path', d: `M${p(bx, -h, bz)} L${p(bx + bw, -h, bz)} L${p(bx + bw, -h, bz + bd)} L${p(bx, -h, bz + bd)} Z`, fill: top, opacity: Math.min(1, op + 0.05), datum });
      if (topLabels && totalCells <= 60) {
        const [tx, ty] = P(bx + bw / 2, -h, bz + bd / 2);
        nodes.push({ type: 'text', x: tx, y: ty - 4, text: fmt(ctx)(v), font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.muted });
      }
      const [hx, hy] = P(bx + bw / 2, -h / 2, bz + bd / 2);
      hits.push({ shape: { type: 'rect', x: hx - bw / 2, y: hy - Math.max(12, h / 2), w: bw, h: Math.max(24, h) }, datum });
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
    const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y);
    const xMin = Number(ctx.options?.['xMin'] ?? Math.min(0, ...xs)), xMax = Number(ctx.options?.['xMax'] ?? Math.max(1, ...xs));
    const yMin = Number(ctx.options?.['yMin'] ?? Math.min(0, ...ys)), yMax = Number(ctx.options?.['yMax'] ?? Math.max(1, ...ys));
    const logX = ctx.options?.['logX'] === true && xMin > 0;
    const logY = ctx.options?.['logY'] === true && yMin > 0;
    const lx = (v: number) => Math.log10(Math.max(1e-12, v));
    const x = scaleLinear([logX ? lx(xMin) : xMin, logX ? lx(xMax) : xMax], [plot.x, plot.x + plot.w]);
    const y = scaleLinear([logY ? lx(yMin) : yMin, logY ? lx(yMax) : yMax], [plot.y + plot.h, plot.y]);
    const X = (v: number) => x(logX ? lx(v) : v), Y = (v: number) => y(logY ? lx(v) : v);
    if (logY) {
      niceTicks(yMin, yMax, 6).ticks.forEach((v) => {
        nodes.push({ type: 'line', x1: plot.x, y1: Y(v), x2: plot.x + plot.w, y2: Y(v), stroke: t.grid, strokeWidth: 1 });
        nodes.push({ type: 'text', x: plot.x - 8, y: Y(v), text: fmt(ctx)(v), font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      });
    } else nodes.push(...yAxis(y, { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, t, fmt(ctx)));
    (logX ? niceTicks(xMin, xMax, 6).ticks : x.ticks).forEach((v) => {
      nodes.push({ type: 'line', x1: X(v), y1: plot.y, x2: X(v), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: X(v), y: plot.y + plot.h + 6, text: fmt(ctx)(v), font: 'mono', size: 11, anchor: 'middle', baseline: 'top', fill: t.muted });
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
        nodes.push({ type: 'text', x: X(p.x) + r + 4, y: Y(p.y) - r - 2, text: p.label, font: 'mono', size: 10, baseline: 'bottom', fill: t.muted });
      }
    });
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
  view: 'pie' as ViewId,
  layout(m: PieModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
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
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    let a = -Math.PI / 2;
    slices.forEach((s, i) => {
      const a1 = a + s.share * Math.PI * 2 * (slices.length === 1 ? 0.9999 : 1);
      const c = colors[i % colors.length];
      const datum = { kind: 'slice', index: i, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value), share: `${(s.share * 100).toFixed(1)}%` }] } };
      nodes.push({ type: 'path', d: arcPath(cx, cy, r0, r1, a, a1), fill: c, datum });
      const am = (a + a1) / 2;
      if (labelMode === 'inside' && s.share > 0.05) {
        const lr2 = (r0 + r1) / 2;
        nodes.push({ type: 'text', x: cx + lr2 * Math.cos(am), y: cy + lr2 * Math.sin(am), text: `${s.label} ${(s.share * 100).toFixed(0)}%`, font: 'mono', size: 10.5, anchor: 'middle', baseline: 'middle', fill: t.paper });
      } else if (labelMode !== 'none' && s.share > 0.03) {
        const lr = r1 + 16;
        const lx = cx + lr * Math.cos(am), ly = cy + lr * Math.sin(am);
        nodes.push({ type: 'line', x1: cx + (r1 + 2) * Math.cos(am), y1: cy + (r1 + 2) * Math.sin(am), x2: lx, y2: ly, stroke: t.faint, strokeWidth: 1 });
        nodes.push({ type: 'text', x: lx + (lx > cx ? 4 : -4), y: ly, text: `${s.label} ${(s.share * 100).toFixed(0)}%`, font: 'body', size: 11, anchor: lx > cx ? 'start' : 'end', baseline: 'middle', fill: t.muted });
      }
      hits.push({ shape: { type: 'circle', cx: cx + (r0 + r1) / 2 * Math.cos(am), cy: cy + (r0 + r1) / 2 * Math.sin(am), r: (r1 - r0) / 2 + 10 }, datum });
      a = a1;
    });
    if (donut && centerLabel) nodes.push({ type: 'text', x: cx, y: cy, text: fmt(ctx)(slices.reduce((s2, x) => s2 + x.value, 0)), font: 'display', size: 26, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.ink });
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
      const datum = { kind: 'stage', index: i, label: s.label, value: s.value, tooltip: { title: s.label, rows: [{ swatch: c, name: '数值', value: fmt(ctx)(s.value) }, { name: '转化', value: s.step !== null && s.step !== undefined ? `${(s.step * 100).toFixed(1)}%` : '—' }] } };
      // —— 圆角横条（质感三态）——
      if (finish === 'outline') {
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: paper, stroke: c, strokeWidth: 2, datum });
      } else if (finish === 'flat') {
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: c, datum });
      } else {
        defs.gradients.push({ id: `fn${i}`, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: lerpOklch(c, '#ffffff', 0.14) }, { offset: 1, color: lerpOklch(c, '#000000', 0.16) }] });
        nodes.push({ type: 'rect', x: bx, y: by, w: bw, h: bh, r: Math.min(10, bh / 2), fill: { ref: `fn${i}` } as never, datum });
      }
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
