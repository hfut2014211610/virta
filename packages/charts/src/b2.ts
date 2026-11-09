// B2：heatmap / treemap / sunburst / sankey / boxplot / radar。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, placeLabels, scaleLinear, scene } from '@virta/chart-core';
import { annotationNodes, formatNumber, yAxis, type LegendItem } from '@virta/chart-skin';
import { paletteColors, rampDiverging, rampSequential } from '@virta/design-system';
import type { BoxplotModel, HeatmapModel, RadarModel, SankeyModel, SunburstModel, TreemapModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { emptyDefs, styleFill } from './finish.js';

const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');

// —— heatmap：matrix 格 + calendar 年视图 ——
export const heatmapRenderer: FamilyRenderer<HeatmapModel> = {
  interactions: ['select'],
  view: 'heatmap' as ViewId,
  layout(m: HeatmapModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const diverging = String(ctx.options?.['scale'] ?? 'sequential') === 'diverging';
    const ramp = diverging ? rampDiverging(ctx.palette, ctx.theme) : rampSequential(ctx.palette, ctx.theme);
    // 发散色带以 0 为中点，顺序色带以值域线性归一
    const mid = Math.max(Math.abs(m.vmin), Math.abs(m.vmax));
    const color = (v: number) => {
      const u = diverging ? (v / Math.max(1e-9, mid) + 1) / 2 : (v - m.vmin) / Math.max(1e-9, m.vmax - m.vmin);
      return ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(u * (ramp.length - 1))))];
    };
    const valueLabels = ctx.options?.['valueLabels'] === true;
    const weekStart = String(ctx.options?.['weekStart'] ?? 'monday') === 'monday' ? 1 : 0;
    const gap = String(ctx.options?.['density'] ?? 'comfort') === 'compact' ? 0.4 : 3;
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
      // 列名恰为 0–23 整数小时（产线×小时类）→ 夜班（22–06）底纹带
      const hs = m.xs.map((x) => Number(x));
      const hourly = m.xs.length >= 20 && hs.every((h) => Number.isInteger(h) && h >= 0 && h <= 23);
      if (hourly) {
        for (const i of [0, 1, 2, 3, 4, 5, 22, 23]) {
          const c = hs.indexOf(i);
          if (c >= 0) nodes.push({ type: 'rect', x: plot.x + c * cw, y: plot.y, w: cw, h: plot.h, fill: t.muted, opacity: 0.08 });
        }
        const c22 = hs.indexOf(22), c6 = hs.indexOf(6);
        if (c22 >= 0) nodes.push({ type: 'text', x: plot.x + c22 * cw, y: plot.y - 2, text: '夜班', font: 'mono', size: 8.5, baseline: 'bottom', fill: t.faint });
        if (c6 >= 0) nodes.push({ type: 'text', x: plot.x + c6 * cw, y: plot.y - 2, text: '夜班', font: 'mono', size: 8.5, baseline: 'bottom', anchor: 'end', fill: t.faint });
      }
      for (const c of m.cells) {
        const v = c.v;
        const datum = { kind: 'cell', index: 0, series: `${m.xs[c.x]}×${m.ys[c.y]}`, label: `${m.xs[c.x]}/${m.ys[c.y]}`, value: v, tooltip: { title: `${m.xs[c.x]} × ${m.ys[c.y]}`, rows: [{ swatch: color(v), name: '值', value: f(v) }] } };
        const hDim = ctx.state?.focus != null && ctx.state.focus !== datum.series;
        nodes.push({ type: 'rect', x: plot.x + c.x * cw + gap / 2, y: plot.y + c.y * ch + gap / 2, w: cw - gap, h: ch - gap, r: Math.min(3, cw / 4), fill: color(v), opacity: hDim ? 0.18 : 1, datum });
        const u = diverging ? (v / Math.max(1e-9, mid) + 1) / 2 : (v - m.vmin) / Math.max(1e-9, m.vmax - m.vmin);
        if (valueLabels && cw > 24 && ch > 13) nodes.push({ type: 'text', x: plot.x + c.x * cw + cw / 2, y: plot.y + c.y * ch + ch / 2, text: f(v), font: 'mono', size: 9.5, anchor: 'middle', baseline: 'middle', fill: u > 0.55 ? t.paper : t.ink });
        hits.push({ shape: { type: 'rect', x: plot.x + c.x * cw, y: plot.y + c.y * ch, w: cw, h: ch }, datum });
      }
    } else if (m.years) {
      // calendar：每年一格阵（周×星期）；整体在绘图区内垂直居中，避免下 2/3 留白
      const years = Object.keys(m.years);
      const yrMap = m.years;
      const cellW = Math.min(16, (ctx.plot.w - 80) / 54);
      const totalH = years.length * (7 * cellW + 30) - 30;
      const oy0 = ctx.plot.y + Math.max(16, (ctx.plot.h - totalH - 30) / 2);
      years.forEach((yr, yi) => {
        const ox = ctx.plot.x + 50, oy = oy0 + yi * (7 * cellW + 30);
        nodes.push({ type: 'text', x: ctx.plot.x + 6, y: oy + 3.5 * cellW, text: yr, font: 'mono', size: 11, anchor: 'start', baseline: 'middle', fill: t.muted });
        const jan1 = Math.floor(Date.UTC(+yr, 0, 1) / 86400000) + 719163;
        const jan1Dow = (new Date((jan1 - 719163) * 86400000).getUTCDay() - weekStart + 7) % 7;
        for (const [od, v] of yrMap[yr]) {
          const week = Math.floor((od - jan1 + jan1Dow) / 7);
          const dow = (new Date((od - 719163) * 86400000).getUTCDay() - weekStart + 7) % 7;
          nodes.push({ type: 'rect', x: ox + week * cellW, y: oy + dow * cellW, w: cellW - (gap ? 1.5 : 1), h: cellW - (gap ? 1.5 : 1), r: 2, fill: v > 0 ? color(v) : t.grid, opacity: v > 0 ? 1 : 0.4 });
        }
      });
    }
    // 色阶（整体收进绘图区内，文字不再溢出底边）
    const lg = { x: ctx.plot.x + ctx.plot.w - 130, y: ctx.plot.y + ctx.plot.h - 24, w: 110 };
    ramp.forEach((c, i) => nodes.push({ type: 'rect', x: lg.x + (i * lg.w) / ramp.length, y: lg.y, w: lg.w / ramp.length + 0.5, h: 8, fill: c }));
    nodes.push({ type: 'text', x: lg.x, y: lg.y + 11, text: f(m.vmin), font: 'mono', size: 9.5, baseline: 'top', fill: t.faint });
    if (diverging) nodes.push({ type: 'text', x: lg.x + lg.w / 2, y: lg.y + 11, text: `0${ctx.text?.unit ? ' ' + ctx.text.unit : ''}`, font: 'mono', size: 9.5, anchor: 'middle', baseline: 'top', fill: t.muted });
    nodes.push({ type: 'text', x: lg.x + lg.w, y: lg.y + 11, text: f(m.vmax), font: 'mono', size: 9.5, anchor: 'end', baseline: 'top', fill: t.faint });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— treemap：squarified（H11 标准算法）——
// 目标面积 = value/total × 原始矩形面积（不随剩余矩形缩小）；
// worst 用行面积与剩余矩形短边算最差长宽比，放不下就换行并扣掉该行面积。
function squarify(items: { label: string; value: number; share?: number; group?: string }[], x: number, y: number, w: number, h: number, out: { label: string; value: number; group?: string; x: number; y: number; w: number; h: number }[]) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const totalArea = w * h;
  const area = (v: number) => (v / total) * totalArea;
  let cx = x, cy = y, cw = w, ch = h;
  let row: typeof items = [];
  const rowArea = (r: typeof items) => r.reduce((a, b) => a + area(b.value), 0);
  const worst = (r: typeof items) => {
    const s = Math.min(cw, ch) || 1;
    const sum = rowArea(r) || 1;
    let m = 0;
    for (const it of r) {
      const a = area(it.value);
      m = Math.max(m, Math.max((s * s * a) / (sum * sum), (sum * sum) / (s * s * a)));
    }
    return m;
  };
  const layRow = (r: typeof items) => {
    const sum = rowArea(r);
    if (cw >= ch) {
      const rw = Math.min(cw, sum / (ch || 1));
      let ry = cy;
      for (const it of r) { const rh = area(it.value) / (rw || 1); out.push({ label: it.label, value: it.value, group: it.group, x: cx, y: ry, w: rw, h: rh }); ry += rh; }
      cx += rw; cw -= rw;
    } else {
      const rh = Math.min(ch, sum / (cw || 1));
      let rx = cx;
      for (const it of r) { const rw = area(it.value) / (rh || 1); out.push({ label: it.label, value: it.value, group: it.group, x: rx, y: cy, w: rw, h: rh }); rx += rw; }
      cy += rh; ch -= rh;
    }
  };
  for (const it of items) {
    if (row.length && worst([...row, it]) > worst(row)) { layRow(row); row = []; }
    row.push(it);
  }
  if (row.length) layRow(row);
}
export const treemapRenderer: FamilyRenderer<TreemapModel> = {
  view: 'treemap' as ViewId,
  interactions: ['drill', 'select'],
  resolve(m, req) {
    const v = String(req.variant ?? 'grouped');
    return { variant: v === 'grouped' && !(m.groups?.length) ? 'flat' : v, options: req.options ?? {} };
  },
  layout(m: TreemapModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const plot = { x: ctx.plot.x + 6, y: ctx.plot.y + 6, w: ctx.plot.w - 12, h: ctx.plot.h - 12 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const showLabels = ctx.options?.['showLabels'] !== false;
    const showValues = ctx.options?.['showValues'] !== false;
    const groupBg = ctx.options?.['groupBg'] !== false;
    const rects: { label: string; value: number; group?: string; x: number; y: number; w: number; h: number }[] = [];
    const defs = emptyDefs();
    const wantGroup = String(ctx.variant ?? 'grouped') === 'grouped';
    if (wantGroup && m.mode === 'grouped' && m.groups) {
      const gmap = new Map<string, number>();
      m.groups.forEach((gp, gi) => gmap.set(gp.name, gi));
      const gRects: typeof rects = [];
      squarify(m.groups.map((gp) => ({ label: gp.name, value: gp.value, share: gp.share })), plot.x, plot.y, plot.w, plot.h, gRects);
      gRects.forEach((gr) => {
        const gi = gmap.get(gr.label)!;
        if (groupBg) nodes.push({ type: 'rect', x: gr.x, y: gr.y, w: gr.w, h: gr.h, fill: colors[gi % colors.length], opacity: 0.12, stroke: colors[gi % colors.length], strokeWidth: 1.2 });
        else nodes.push({ type: 'rect', x: gr.x, y: gr.y, w: gr.w, h: gr.h, fill: 'none', stroke: t.ink, strokeWidth: 1.2 });
        nodes.push({ type: 'text', x: gr.x + 4, y: gr.y + 3, text: gr.label, font: 'mono', size: 10.5, baseline: 'top', fill: t.ink });
        squarify(m.groups![gi].children.map((c) => ({ ...c, group: gr.label })), gr.x + 1, gr.y + 16, gr.w - 2, gr.h - 17, rects);
      });
    } else {
      // flat 变体或数据无分组 → 平铺（grouped 数据退化为全部子叶）
      const flat = m.flat ?? (m.groups ?? []).flatMap((gp) => gp.children);
      squarify(flat.map((c) => ({ ...c })), plot.x, plot.y, plot.w, plot.h, rects);
    }
    rects.forEach((r, i) => {
      const gi = r.group ? m.groups!.findIndex((gp) => gp.name === r.group) : i;
      const c = colors[(gi < 0 ? i : gi) % colors.length];
      const dim = ctx.state?.focus != null && ctx.state.focus !== r.label;
      const datum = { kind: 'tile', index: i, series: r.label, label: r.label, value: r.value, tooltip: { title: r.label, rows: [{ swatch: c, name: '值', value: f(r.value) }] } };
      nodes.push({ type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: 2, fill: styleFill(defs, ctx, c, i), opacity: dim ? 0.25 : 0.85, stroke: t.paper, strokeWidth: 1.5, datum });
      if (showLabels && r.w > 46 && r.h > 16) nodes.push({ type: 'text', x: r.x + 4, y: r.y + r.h / 2, text: showValues ? `${r.label} ${f(r.value)}` : r.label, font: 'body', size: 10.5, baseline: 'middle', fill: '#fff', datum });
      hits.push({ shape: { type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};

// —— sunburst：层级环 ——
export const sunburstRenderer: FamilyRenderer<SunburstModel> = {
  view: 'sunburst' as ViewId,
  interactions: ['drill', 'select'],
  layout(m: SunburstModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const defs = emptyDefs();
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 24;
    const depth = Math.max(1, m.counts.depth);
    const ringW = R / (depth + 0.5);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const arcLabels = ctx.options?.['arcLabels'] !== false;
    const equalAngle = ctx.options?.['equalAngle'] === true;
    const arc = (r0: number, r1: number, a0: number, a1: number) => {
      const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      const lg = a1 - a0 > Math.PI ? 1 : 0;
      return `M${p(r1, a0)} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${lg} 0 ${p(r0, a0)} Z`;
    };
    const walk = (n: { name: string; value: number; children: { name: string; value: number; children: never[] }[] }, lv: number, a0: number, a1: number, ci: number) => {
      const c = colors[ci % colors.length];
      if (lv > 0) {
        const datum = { kind: 'sector', index: lv, series: n.name, label: n.name, value: n.value, tooltip: { title: n.name, rows: [{ swatch: c, name: '值', value: f(n.value) }] } };
        nodes.push({ type: 'path', d: arc(lv * ringW, (lv + 1) * ringW - 1.5, a0, a1), fill: styleFill(defs, ctx, c, lv), opacity: 0.55 + 0.4 * (lv / depth), datum });
        const am = (a0 + a1) / 2, rr = (lv + 0.5) * ringW;
        if (arcLabels && a1 - a0 > 0.09) nodes.push({ type: 'text', x: cx + rr * Math.cos(am), y: cy + rr * Math.sin(am), text: n.name, font: 'body', size: 10, anchor: 'middle', baseline: 'middle', rotate: ((am * 180) / Math.PI + (am > Math.PI / 2 || am < -Math.PI / 2 ? 180 : 0)), fill: t.paper });
        hits.push({ shape: { type: 'circle', cx: cx + rr * Math.cos(am), cy: cy + rr * Math.sin(am), r: ringW / 2 }, datum });
      }
      let a = a0;
      n.children?.forEach((k, i) => { const span = equalAngle ? (a1 - a0) / Math.max(1, n.children.length) : (k.value / Math.max(1e-9, n.value)) * (a1 - a0); walk(k as never, lv + 1, a, a + span, lv === 0 ? i : ci); a += span; });
    };
    // 点击放大：focus 命中的节点下钻为根（整扇区铺满）；再点同节点返回顶层
    let root = m.tree;
    const foc = ctx.state?.focus;
    if (foc !== undefined && foc !== null) {
      const find = (n: { name: string; children?: never[] }): typeof n | null =>
        n.name === foc ? n : ((n.children ?? []).map((c) => find(c as never)).find(Boolean) as typeof n | undefined ?? null);
      root = (find(m.tree as never) ?? m.tree) as never;
    }
    walk(root as never, 0, -Math.PI / 2, Math.PI * 1.5, 0);
    nodes.push({ type: 'text', x: cx, y: cy, text: root.name, font: 'body', size: 13, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.ink });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};

// —— sankey：按 depth 分列的流 ——
export const sankeyRenderer: FamilyRenderer<SankeyModel> = {
  view: 'sankey' as ViewId,
  interactions: ['select'],
  layout(m: SankeyModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const depth = Math.max(1, ...m.nodes.map((n) => n.depth));
    const pad = { l: 92, r: 110, t: 16, b: 16 };
    const plot = { x: ctx.plot.x + pad.l, y: ctx.plot.y + pad.t, w: ctx.plot.w - pad.l - pad.r, h: ctx.plot.h - pad.t - pad.b };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const labelMode = String(ctx.options?.['labelMode'] ?? 'both');
    const flowGradient = ctx.options?.['flowGradient'] !== false;
    const defs: Scene['defs'] = { gradients: [], radials: [], patterns: [], clips: [] };
    const colX = (d: number) => plot.x + (d / Math.max(1, depth)) * (plot.w - 14);
    const focus = ctx.state?.focus;
    // 每列节点纵向堆叠
    const cols = new Map<number, number[]>();
    m.nodes.forEach((n, i) => { const c = cols.get(n.depth) ?? []; c.push(i); cols.set(n.depth, c); });
    const pos: { x: number; y: number; h: number }[] = [];
    cols.forEach((idxs, d) => {
      const tot = idxs.reduce((a, i) => a + m.nodes[i].value, 0) || 1;
      const gap = Math.min(14, plot.h / (idxs.length * 4)) * (String(ctx.options?.['density'] ?? 'comfort') === 'compact' ? 0.6 : 1);
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
      let fill: unknown = colors[l.s % colors.length];
      if (flowGradient) {
        defs.gradients.push({ id: `sk${l.s}_${l.t}`, x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: colors[l.s % colors.length] }, { offset: 1, color: colors[l.t % colors.length] }] });
        fill = { ref: `sk${l.s}_${l.t}` };
      }
      const fDim = focus != null && m.nodes[l.s].name !== focus && m.nodes[l.t].name !== focus;
      const dPath = `M${x1} ${sy} C${mx} ${sy} ${mx} ${dy} ${x2} ${dy} L${x2} ${dy + dh} C${mx} ${dy + dh} ${mx} ${sy + sh} ${x1} ${sy + sh} Z`;
      nodes.push({ type: 'path', d: dPath, fill: fill as never, opacity: fDim ? 0.05 : 0.28 });
      // 流向带命中区（先压栈，节点命中优先级更高）：悬停流带显示 source→target 流量
      hits.push({ shape: { type: 'path', d: dPath }, datum: { kind: 'link', index: l.s, series: `${m.nodes[l.s].name} → ${m.nodes[l.t].name}`, value: l.v, tooltip: { title: `${m.nodes[l.s].name} → ${m.nodes[l.t].name}`, rows: [{ swatch: colors[l.s % colors.length], name: '流量', value: f(l.v) }] } } });
    }
    // D4/H8：节点标签走 placeLabels 贪心避让（左列放节点左侧，其余右侧）
    const cands: import('@virta/chart-core').LabelCandidate[] = [];
    m.nodes.forEach((n, i) => {
      const p = pos[i];
      const c = colors[i % colors.length];
      const datum = { kind: 'node', index: i, series: n.name, label: n.name, value: n.value, tooltip: { title: n.name, rows: [{ swatch: c, name: '流量', value: f(n.value) }] } };
      const nDim = focus != null && n.name !== focus;
      nodes.push({ type: 'rect', x: p.x, y: p.y, w: 14, h: p.h, r: 2, fill: c, opacity: nDim ? 0.25 : 1, datum });
      if (labelMode !== 'none' && p.h > 10) {
        const txt = labelMode === 'both' ? `${n.name} ${f(n.value)}` : n.name;
        cands.push({ x: n.depth === 0 ? p.x - 8 : p.x + 22, y: p.y + p.h / 2, text: txt,
          width: measureText(txt, 'body', 10.5), height: 12, priority: n.value, leader: true, datum });
      }
      hits.push({ shape: { type: 'rect', x: p.x, y: p.y, w: 14, h: p.h }, datum });
    });
    const placed = placeLabels(cands, [ctx.plot.x, ctx.plot.y, ctx.plot.x + ctx.plot.w, ctx.plot.y + ctx.plot.h]).placed;
    for (const pl of placed) {
      if (pl.leader) nodes.push({ type: 'line', x1: pl.leader[0], y1: pl.leader[1], x2: pl.leader[2], y2: pl.leader[3], stroke: t.faint, strokeWidth: 0.8, opacity: 0.6 });
      const left = pl.x + pl.w / 2 < pl.anchorX;
      nodes.push({ type: 'text', x: left ? pl.x + pl.w : pl.x, y: pl.y + pl.h / 2, text: pl.text, font: 'body', size: 10.5, anchor: left ? 'end' : 'start', baseline: 'middle', fill: t.muted, datum: pl.datum });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};

// —— boxplot ——
export const boxplotRenderer: FamilyRenderer<BoxplotModel> = {
  interactions: ['select'],
  view: 'boxplot' as ViewId,
  layout(m: BoxplotModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const defs = emptyDefs();
    const padL = Math.max(64, ...m.groups.map((g2) => measureText(g2.name, 'mono', 11) + 16));
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 18, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 36 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const xx = scaleLinear([m.counts.vmin, Math.max(m.counts.vmin + 1, m.counts.vmax)], [plot.x, plot.x + plot.w]);
    const n = m.groups.length;
    const rowH = plot.h / Math.max(1, n);
    const f = fmt(ctx);
    const showMean = ctx.options?.['mean'] !== false;
    const rawPoints = ctx.options?.['rawPoints'] === true;
    const sort = String(ctx.options?.['sort'] ?? 'none');
    const groups = [...m.groups];
    if (sort === 'asc') groups.sort((a, b) => a.med - b.med);
    else if (sort === 'desc') groups.sort((a, b) => b.med - a.med);
    // 横向网格+刻度
    xx.ticks.forEach((v) => {
      nodes.push({ type: 'line', x1: xx(v), y1: plot.y, x2: xx(v), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: xx(v), y: plot.y + plot.h + 5, text: f(v), font: 'mono', size: 10, anchor: 'middle', baseline: 'top', fill: t.faint });
    });
    groups.forEach((g2, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const bh = Math.min(22, rowH * 0.5);
      const c = colors[i % colors.length];
      const datum = { kind: 'box', index: i, series: g2.name, label: g2.name, value: g2.med, tooltip: { title: g2.name, rows: [{ swatch: c, name: '中位', value: f(g2.med) }, { name: 'Q1–Q3', value: `${f(g2.q1)}–${f(g2.q3)}` }, { name: 'min–max', value: `${f(g2.min)}–${f(g2.max)}` }] } };
      const gDim = ctx.state?.focus != null && ctx.state.focus !== g2.name;
      nodes.push({ type: 'line', x1: xx(g2.min), y1: cy, x2: xx(g2.max), y2: cy, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'line', x1: xx(g2.min), y1: cy - bh / 3, x2: xx(g2.min), y2: cy + bh / 3, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'line', x1: xx(g2.max), y1: cy - bh / 3, x2: xx(g2.max), y2: cy + bh / 3, stroke: t.muted, strokeWidth: 1 });
      nodes.push({ type: 'rect', x: xx(g2.q1), y: cy - bh / 2, w: Math.max(1, xx(g2.q3) - xx(g2.q1)), h: bh, r: 2, fill: styleFill(defs, ctx, c, i), opacity: gDim ? 0.08 : 0.3, stroke: c, strokeWidth: 1.2, datum });
      if (gDim) nodes.push({ type: 'rect', x: plot.x - 4, y: cy - rowH / 2 + 2, w: plot.w + 8, h: rowH - 4, fill: t.paper, opacity: 0.55 });
      nodes.push({ type: 'line', x1: xx(g2.med), y1: cy - bh / 2, x2: xx(g2.med), y2: cy + bh / 2, stroke: c, strokeWidth: 2 });
      if (ctx.options?.['valueLabels']) {
        nodes.push({ type: 'text', x: xx(g2.med) + 4, y: cy - bh / 2 - 2, text: f(g2.med), font: 'mono', size: 9.5, baseline: 'bottom', fill: c, weight: 600 });
        nodes.push({ type: 'text', x: xx(g2.min), y: cy + bh / 2 + 3, text: f(g2.min), font: 'mono', size: 8.5, anchor: 'middle', baseline: 'top', fill: t.faint });
        nodes.push({ type: 'text', x: xx(g2.max), y: cy + bh / 2 + 3, text: f(g2.max), font: 'mono', size: 8.5, anchor: 'middle', baseline: 'top', fill: t.faint });
      }
      if (showMean && g2.mean) nodes.push({ type: 'path', d: `M${xx(g2.mean)} ${cy - 4} L${xx(g2.mean) + 4} ${cy} L${xx(g2.mean)} ${cy + 4} L${xx(g2.mean) - 4} ${cy} Z`, fill: t.ink });
      if (rawPoints && g2.values.length) {
        const step2 = Math.max(1, Math.ceil(g2.values.length / 60));
        g2.values.forEach((v, vi) => {
          if (vi % step2) return;
          const jy = cy + (((vi * 37) % 17) / 16 - 0.5) * bh * 1.6;
          nodes.push({ type: 'circle', cx: xx(v), cy: jy, r: 1.8, fill: t.ink, opacity: 0.35 });
        });
      }
      for (const o of g2.outliers) nodes.push({ type: 'circle', cx: xx(o), cy, r: 2, fill: 'none', stroke: t.neg, strokeWidth: 1 });
      nodes.push({ type: 'text', x: plot.x - 8, y: cy, text: g2.name, font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};

// —— radar ——
export const radarRenderer: FamilyRenderer<RadarModel> = {
  view: 'radar' as ViewId,
  interactions: ['select'],
  layout(m: RadarModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 52;
    const n = m.nax;
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i: number, r: number) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const fillPoly = ctx.options?.['fillPoly'] !== false;
    const gridAxes = ctx.options?.['gridAxes'] !== false;
    const ringLabels = ctx.options?.['ringLabels'] === true;
    const vertexLabels = ctx.options?.['vertexLabels'] === true;
    const vmax = Math.max(1e-9, ...m.items.flatMap((it) => it.values));
    // 蛛网 + 轴
    if (gridAxes) {
      for (const lv of [0.25, 0.5, 0.75, 1]) {
        nodes.push({ type: 'path', d: m.axes.map((_, i) => `${i ? 'L' : 'M'}${pt(i, R * lv).join(' ')}`).join(' ') + ' Z', fill: 'none', stroke: t.grid, strokeWidth: 1 });
        if (ringLabels) nodes.push({ type: 'text', x: cx, y: cy - R * lv - 2, text: fmt(ctx)(vmax * lv), font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.faint });
      }
      m.axes.forEach((_, i) => {
        const [x2, y2] = pt(i, R);
        nodes.push({ type: 'line', x1: cx, y1: cy, x2, y2, stroke: t.grid, strokeWidth: 1 });
      });
    }
    m.axes.forEach((ax, i) => {
      const [lx, ly] = pt(i, R + 30);
      nodes.push({ type: 'text', x: lx, y: ly, text: ax.label, font: 'body', size: 11.5, weight: 500, anchor: 'middle', baseline: 'middle', fill: t.ink });
    });
    const focus = ctx.state?.focus;
    const hidden = ctx.state?.hiddenSeries ?? [];
    m.items.forEach((it, si) => {
      if (hidden.includes(it.name)) return;
      const dim = focus !== undefined && focus !== null && it.name !== focus;
      const c = colors[si % colors.length];
      const pts = it.norm.map((v, i) => pt(i, v * R));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ' Z';
      if (fillPoly) nodes.push({ type: 'path', d, fill: c, opacity: dim ? 0.03 : 0.15 });
      nodes.push({ type: 'path', d, fill: 'none', stroke: c, strokeWidth: dim ? 1 : 2, opacity: dim ? 0.22 : 1 });
      // 系列多边形命中区（先压栈，顶点命中优先级更高）：悬停系列面显示该轴全部值
      hits.push({ shape: { type: 'path', d }, datum: { kind: 'series', index: si, series: it.name, tooltip: { title: it.name, rows: m.axes.slice(0, 8).map((ax, ai) => ({ swatch: c, name: ax.label, value: fmt(ctx)(it.values[ai]!) })) } } });
      pts.forEach(([px, py], i) => {
        if (vertexLabels) nodes.push({ type: 'text', x: px + (px > cx ? 5 : -5), y: py + (py > cy ? 5 : -5), text: fmt(ctx)(it.values[i]), font: 'mono', size: 9.5, anchor: px > cx ? 'start' : 'end', baseline: py > cy ? 'top' : 'bottom', fill: c });
        hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 9 }, datum: { kind: 'vertex', index: i, series: it.name, label: m.axes[i].label, value: it.values[i], tooltip: { title: `${it.name} · ${m.axes[i].label}`, rows: [{ swatch: c, name: '值', value: fmt(ctx)(it.values[i]) }] } } });
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.items.map((it, i) => ({ name: it.name, color: colors[i % colors.length] }));
    return sc;
  },
};
