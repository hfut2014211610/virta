// T3 简版图族渲染：er / flowchart / sequence / burndown / formula。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, niceTicks, scaleLinear, scene } from '@virta/chart-core';
import { formatNumber, type LegendItem } from '@virta/chart-skin';
import { accentFor, lerpOklch, paletteColors } from '@virta/design-system';
import type { BurndownModel, ErModel, FlowchartModel, FormulaModel, SequenceModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { emptyDefs, styleFill } from './finish.js';

// —— er：实体框（标题栏+字段行）网格排布 + 引用连线 ——
export const erRenderer: FamilyRenderer<ErModel> = {
  view: 'er' as ViewId,
  interactions: ['select'],
  layout(m: ErModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const defs = emptyDefs();
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const showTypes = ctx.options?.['fieldTypes'] !== false;
    const showLabels = ctx.options?.['edgeLabels'] !== false;
    const ents = m.entities;
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ents.length))));
    const rowH = 14, headH = 24, bw = Math.min(240, (ctx.plot.w - (cols - 1) * 60) / cols);
    const gapX = (ctx.plot.w - cols * bw) / Math.max(1, cols - 1) || 0;
    const boxH = (e: ErModel['entities'][number]) => headH + Math.max(1, e.fields.length) * rowH + 6;
    const pos = ents.map((_, i) => ({ x: ctx.plot.x + (i % cols) * (bw + gapX), y: 0 }));
    for (let i = 0, y = ctx.plot.y + 8; i < ents.length; i += cols) {
      const rh = Math.max(...ents.slice(i, i + cols).map(boxH));
      for (let j = i; j < Math.min(i + cols, ents.length); j++) pos[j] = { x: pos[j].x, y };
      y += rh + 44;
    }
    const cx = (i: number) => pos[i].x + bw / 2;
    for (const e of m.edges) {
      const a = pos[e.from], b = pos[e.to];
      const sameRow = Math.abs(a.y - b.y) < 20;
      const x1 = sameRow ? (a.x < b.x ? a.x + bw : a.x) : cx(e.from);
      const y1 = sameRow ? a.y + headH / 2 + 6 : a.y + boxH(ents[e.from]);
      const x2 = sameRow ? (a.x < b.x ? b.x : b.x + bw) : cx(e.to);
      const y2 = sameRow ? b.y + headH / 2 + 6 : b.y;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      nodes.push({ type: 'path', d: sameRow ? `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` : `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`, fill: 'none', stroke: t.faint, strokeWidth: 1.3 });
      const ang = Math.atan2(y2 - (sameRow ? y1 : my), x2 - (sameRow ? mx : x2));
      nodes.push({ type: 'path', d: `M${x2} ${y2} l${-7 * Math.cos(ang - 0.4)} ${-7 * Math.sin(ang - 0.4)} l${7 * Math.cos(ang - 0.4) - 7 * Math.cos(ang + 0.4)} ${7 * Math.sin(ang - 0.4) - 7 * Math.sin(ang + 0.4)} Z`, fill: t.faint });
      if (showLabels && e.label) nodes.push({ type: 'text', x: mx, y: my - 4, text: e.label, font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.faint });
    }
    ents.forEach((e, i) => {
      const p = pos[i], c = colors[i % colors.length], h = boxH(e);
      nodes.push({ type: 'rect', x: p.x, y: p.y, w: bw, h, r: 6, fill: t.paper, stroke: t.line2, strokeWidth: 1 });
      nodes.push({ type: 'rect', x: p.x, y: p.y, w: bw, h: headH, r: 6, fill: styleFill(defs, ctx, c, i), opacity: 0.9 });
      nodes.push({ type: 'rect', x: p.x, y: p.y + headH - 6, w: bw, h: 6, fill: c, opacity: 0.9 });
      nodes.push({ type: 'text', x: p.x + 10, y: p.y + headH / 2, text: e.name, font: 'body', size: 12, weight: 700, baseline: 'middle', fill: t.paper });
      const frows = e.fields.length ? e.fields : [{ name: '（无字段）', type: '' }];
      frows.forEach((f, fi) => {
        const fy = p.y + headH + 4 + fi * rowH + rowH / 2;
        const key = /pk|主键/i.test(f.type) ? 'PK' : /fk|外键/i.test(f.type) ? 'FK' : '';
        nodes.push({ type: 'text', x: p.x + 10, y: fy, text: f.name, font: 'mono', size: 10, baseline: 'middle', fill: key ? t.ink : t.muted, weight: key ? 700 : 400 });
        if (showTypes && f.type) nodes.push({ type: 'text', x: p.x + bw - 8, y: fy, text: key || f.type, font: 'mono', size: 9, anchor: 'end', baseline: 'middle', fill: key ? c : t.faint });
      });
      hits.push({ shape: { type: 'rect', x: p.x, y: p.y, w: bw, h }, datum: { kind: 'entity', index: i, series: e.name, label: e.name, tooltip: { title: e.name, rows: [{ name: '字段', value: `${e.fields.length}` }] } } });
      if (ctx.state?.focus != null && ctx.state.focus !== e.name) nodes.push({ type: 'rect', x: p.x, y: p.y, w: bw, h, r: 6, fill: t.paper, opacity: 0.65 });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
    sc.hits = hits;
    return sc;
  },
};

// —— flowchart：分层节点 + 正交连线（tb 纵向 / lr 横向）——
export const flowchartRenderer: FamilyRenderer<FlowchartModel> = {
  view: 'flowchart' as ViewId,
  interactions: ['select'],
  layout(m: FlowchartModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const lr = String(ctx.variant ?? 'tb') === 'lr';
    const showLabels = ctx.options?.['edgeLabels'] !== false;
    const n = m.nodes.length, depth = new Array<number>(n).fill(-1);
    const ind = new Array<number>(n).fill(0);
    for (const e of m.edges) ind[e.to] += 1;
    // 分层 BFS：无根（环）时取入度最小节点为种子；已分层节点不回溯（回边正常画）
    const adj = new Map<number, number[]>();
    for (const e of m.edges) (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    let q2 = m.nodes.map((_, i) => i).filter((i) => ind[i] === 0);
    if (!q2.length) q2 = [ind.indexOf(Math.min(...ind))];
    for (const r of q2) depth[r] = 0;
    let qi = 0;
    while (qi < q2.length) {
      const u = q2[qi++];
      for (const w of adj.get(u) ?? []) if (depth[w] < 0) { depth[w] = depth[u] + 1; q2.push(w); }
    }
    m.nodes.forEach((_, i) => { if (depth[i] < 0) depth[i] = 0; });
    const layers = new Map<number, number[]>();
    m.nodes.forEach((_, i) => { const d = depth[i]; (layers.get(d) ?? layers.set(d, []).get(d)!).push(i); });
    const maxD = Math.max(1, ...depth);
    const nw = 150, nh = 34;
    const pos = m.nodes.map((_, i) => {
      const lyr = layers.get(depth[i])!;
      const idx = lyr.indexOf(i);
      const fx = (idx + 1) / (lyr.length + 1);
      return lr
        ? { x: ctx.plot.x + 40 + (depth[i] / maxD) * (ctx.plot.w - nw - 80), y: ctx.plot.y + fx * ctx.plot.h - nh / 2 }
        : { x: ctx.plot.x + fx * ctx.plot.w - nw / 2, y: ctx.plot.y + 20 + (depth[i] / maxD) * (ctx.plot.h - nh - 40) };
    });
    for (const e of m.edges) {
      const a = pos[e.from], b = pos[e.to];
      const [sx, sy] = lr ? [a.x + nw, a.y + nh / 2] : [a.x + nw / 2, a.y + nh];
      const [tx2, ty2] = lr ? [b.x, b.y + nh / 2] : [b.x + nw / 2, b.y];
      const mid = lr ? (sx + tx2) / 2 : (sy + ty2) / 2;
      // 圆角肘线：转角处二次贝塞尔过渡
      const rr = Math.min(7, Math.abs(lr ? ty2 - sy : tx2 - sx) / 2, Math.abs(mid - (lr ? sx : sy)));
      const d = lr
        ? `M${sx} ${sy} L${mid - rr} ${sy} Q${mid} ${sy} ${mid} ${sy + Math.sign(ty2 - sy) * rr} L${mid} ${ty2 - Math.sign(ty2 - sy) * rr} Q${mid} ${ty2} ${mid + rr} ${ty2} L${tx2} ${ty2}`
        : `M${sx} ${sy} L${sx} ${mid - rr} Q${sx} ${mid} ${sx + Math.sign(tx2 - sx) * rr} ${mid} L${tx2 - Math.sign(tx2 - sx) * rr} ${mid} Q${tx2} ${mid} ${tx2} ${mid + rr} L${tx2} ${ty2}`;
      nodes.push({ type: 'path', d, fill: 'none', stroke: t.faint, strokeWidth: 1.4 });
      const ah = 5;
      nodes.push({ type: 'path', d: lr ? `M${tx2} ${ty2} l-8 -${ah} l0 ${ah * 2} Z` : `M${tx2} ${ty2} l-${ah} -8 l${ah * 2} 0 Z`, fill: t.faint });
      if (showLabels && e.label) nodes.push({ type: 'text', x: lr ? mid : (sx + tx2) / 2 + 6, y: lr ? (sy + ty2) / 2 - 4 : mid - 4, text: e.label, font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.faint });
    }
    const outDeg = new Map<number, number>();
    for (const e of m.edges) outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    const focus = ctx.state?.focus;
    m.nodes.forEach((nd, i) => {
      const p = pos[i], c = colors[i % colors.length];
      const ty = nd.type ?? '';
      const isDecision = /decision|judge|判断|分支/.test(ty) || (outDeg.get(i) ?? 0) > 1;
      const isTerm = /start|begin|开始|end|finish|结束|终止/.test(ty);
      const dim = focus != null && focus !== nd.name;
      const op = dim ? 0.25 : 1;
      const datum = { kind: 'node', index: i, series: nd.name, label: nd.name, tooltip: { title: nd.name, rows: [{ name: '出度', value: `${outDeg.get(i) ?? 0}` }] } };
      if (isDecision) {
        const cx2 = p.x + nw / 2, cy2 = p.y + nh / 2;
        nodes.push({ type: 'path', d: `M${cx2} ${cy2 - nh / 2 - 4} L${cx2 + nw / 2 + 10} ${cy2} L${cx2} ${cy2 + nh / 2 + 4} L${cx2 - nw / 2 - 10} ${cy2} Z`, fill: lerpOklch(acc, t.paper, 0.88), stroke: acc, strokeWidth: 1.6, opacity: op, datum });
      } else {
        nodes.push({ type: 'rect', x: p.x, y: p.y, w: nw, h: nh, r: isTerm ? nh / 2 : 8, fill: isTerm ? acc : lerpOklch(c, t.paper, 0.9), stroke: isTerm ? 'none' : c, strokeWidth: 1.4, opacity: op, datum });
      }
      nodes.push({ type: 'text', x: p.x + nw / 2, y: p.y + nh / 2, text: nd.name, font: 'body', size: 11, anchor: 'middle', baseline: 'middle', fill: isTerm ? t.paper : t.ink, weight: isTerm ? 600 : 400, opacity: op });
      hits.push({ shape: { type: 'rect', x: p.x - 8, y: p.y - 8, w: nw + 16, h: nh + 16 }, datum });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— sequence：生命线 + 编号消息箭头 ——
export const sequenceRenderer: FamilyRenderer<SequenceModel> = {
  view: 'sequence' as ViewId,
  layout(m: SequenceModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const showNum = ctx.options?.['numbers'] !== false;
    const na = Math.max(2, m.actors.length);
    const x = (i: number) => ctx.plot.x + 60 + ((i + 0.5) / na) * (ctx.plot.w - 120);
    const top = ctx.plot.y + 10, bot = ctx.plot.y + ctx.plot.h - 10;
    m.actors.forEach((a, i) => {
      const c = colors[i % colors.length];
      nodes.push({ type: 'rect', x: x(i) - 52, y: top, w: 104, h: 26, r: 6, fill: c, opacity: 0.9 });
      nodes.push({ type: 'text', x: x(i), y: top + 13, text: a, font: 'body', size: 11, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.paper });
      nodes.push({ type: 'line', x1: x(i), y1: top + 26, x2: x(i), y2: bot, stroke: t.grid, strokeWidth: 1.2, dash: [5, 4] });
    });
    const msgH = Math.min(46, (bot - top - 44) / Math.max(1, m.msgs.length));
    m.msgs.forEach((msg, i) => {
      const y = top + 38 + i * msgH;
      const x1 = x(msg.from), x2 = x(msg.to);
      const label = `${showNum ? `${i + 1}. ` : ''}${msg.label}`;
      if (msg.from === msg.to) {
        nodes.push({ type: 'path', d: `M${x1} ${y} h30 q8 0 8 8 v6 q0 8 -8 8 h-30`, fill: 'none', stroke: acc, strokeWidth: 1.4 });
        nodes.push({ type: 'path', d: `M${x1} ${y + 22} l7 -4 v8 Z`, fill: acc });
        nodes.push({ type: 'text', x: x1 + 44, y: y + 10, text: label, font: 'body', size: 10, baseline: 'middle', fill: t.muted });
      } else {
        const dir = x2 > x1 ? 1 : -1;
        nodes.push({ type: 'line', x1, y1: y, x2: x2 - dir * 6, y2: y, stroke: t.ink, strokeWidth: 1.3 });
        nodes.push({ type: 'path', d: `M${x2} ${y} l${-dir * 7} -4 v8 Z`, fill: t.ink });
        // 接收方激活框（时序图标准激活条，取参与者色）
        nodes.push({ type: 'rect', x: x2 - 4, y: y + 3, w: 8, h: Math.max(10, Math.min(18, msgH - 14)), r: 2, fill: colors[msg.to % colors.length], opacity: 0.9 });
        nodes.push({ type: 'text', x: (x1 + x2) / 2, y: y - 4, text: label, font: 'body', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.muted });
      }
      hits.push({ shape: { type: 'rect', x: Math.min(x1, x2), y: y - 8, w: Math.abs(x2 - x1) + 8, h: 16 }, datum: { kind: 'msg', index: i, label: msg.label, tooltip: { title: `${i + 1}. ${msg.label}`, rows: [{ name: '链路', value: `${m.actors[msg.from]} → ${m.actors[msg.to]}` }] } } });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— burndown：理想斜线 + 实际剩余折线 ——
export const burndownRenderer: FamilyRenderer<BurndownModel> = {
  view: 'burndown' as ViewId,
  layout(m: BurndownModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const showIdeal = ctx.options?.['ideal'] !== false;
    const showLabels = ctx.options?.['valueLabels'] === true;
    const padL = 52, padB = 26;
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 14, w: ctx.plot.w - padL - 16, h: ctx.plot.h - 14 - padB };
    const n = m.points.length, vmax = Math.max(1, m.total * 1.05);
    const x = scaleLinear([0, n - 1], [plot.x, plot.x + plot.w]);
    const y = scaleLinear([0, vmax], [plot.y + plot.h, plot.y]);
    for (const tk of niceTicks(0, vmax, 5).ticks) {
      nodes.push({ type: 'line', x1: plot.x, y1: y(tk), x2: plot.x + plot.w, y2: y(tk), stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: plot.x - 8, y: y(tk), text: formatNumber(tk, ctx.format, 'number'), font: 'mono', size: 10, anchor: 'end', baseline: 'middle', fill: t.faint });
    }
    const step = Math.max(1, Math.ceil(n / 12));
    m.points.forEach((p, i) => { if (i % step === 0 || i === n - 1) nodes.push({ type: 'text', x: x(i), y: plot.y + plot.h + 4, text: p.day, font: 'mono', size: 9.5, anchor: 'middle', baseline: 'top', fill: t.faint }); });
    if (showIdeal) {
      nodes.push({ type: 'line', x1: x(0), y1: y(m.total), x2: x(n - 1), y2: y(0), stroke: t.faint, strokeWidth: 1.4, dash: [6, 4] });
      nodes.push({ type: 'text', x: x(n - 1) - 8, y: y(0) - 8, text: '理想', font: 'mono', size: 10, anchor: 'end', baseline: 'bottom', fill: t.faint });
    }
    const pts = m.points.map((p, i) => [x(i), y(p.v)] as const);
    nodes.push({ type: 'path', d: `M${pts.map((p) => `${p[0]} ${p[1]}`).join(' L')}`, fill: 'none', stroke: acc, strokeWidth: 2 });
    m.points.forEach((p, i) => {
      nodes.push({ type: 'circle', cx: x(i), cy: y(p.v), r: 3.5, fill: t.paper, stroke: acc, strokeWidth: 1.6 });
      if (showLabels) nodes.push({ type: 'text', x: x(i), y: y(p.v) - 8, text: formatNumber(p.v, ctx.format, 'number'), font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.muted });
      hits.push({ shape: { type: 'rect', x: x(i) - 10, y: plot.y, w: 20, h: plot.h }, datum: { kind: 'point', index: i, label: p.day, value: p.v, tooltip: { title: p.day, rows: [{ swatch: acc, name: '剩余', value: formatNumber(p.v, ctx.format, 'number') }] } } });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = [{ name: '实际剩余', color: acc }, { name: '理想线', color: t.faint }];
    return sc;
  },
};

// —— formula：公式文本排版（上下标/√/希腊字母转写）——
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎', 'i': 'ᵢ', 'j': 'ⱼ', 'n': 'ₙ', 'k': 'ₖ', 'x': 'ₓ', 't': 'ₜ', 'a': 'ₐ', 'b': 'ᵦ' };
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾', 'i': 'ⁱ', 'j': 'ʲ', 'n': 'ⁿ', 'k': 'ᵏ', 'x': 'ˣ', 't': 'ᵗ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ' };
const GREEK: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Pi: 'Π', Omega: 'Ω', sum: '∑', prod: '∏', int: '∫', infty: '∞', inf: '∞' };
function mathPretty(s: string): string {
  let o = s;
  o = o.replace(/sqrt\s*\(([^)]*)\)|sqrt\s*\{([^}]*)\}/g, (_m, a, b) => `√(${a ?? b})`);
  o = o.replace(/\\?([a-zA-Z]+)/g, (w) => GREEK[w] ?? w);
  o = o.replace(/\^\{([^}]*)\}|\^([A-Za-z0-9+\-()]+)/g, (_m, g1, g2) => [...(g1 ?? g2)].map((ch) => SUP[ch] ?? ch).join(''));
  o = o.replace(/_\{([^}]*)\}|_([A-Za-z0-9+\-()]+)/g, (_m, g1, g2) => [...(g1 ?? g2)].map((ch) => SUB[ch] ?? ch).join(''));
  o = o.replace(/->|=>/g, '→').replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/!=|<>/g, '≠').replace(/\+-/g, '±').replace(/\*/g, '×');
  return o;
}
export const formulaRenderer: FamilyRenderer<FormulaModel> = {
  view: 'formula' as ViewId,
  layout(m: FormulaModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const baseFs = ({ s: 17, m: 22, l: 28 } as Record<string, number>)[String(ctx.options?.['size'] ?? 'm')] ?? 22;
    // H12/D9：按可用空间等比放大——最宽公式行或总高达到 plot 的 70% 为止，上限 48px
    const maxW = Math.max(1, ...m.items.map((it) => measureText(mathPretty(it.formula), 'display', 1)));
    const grow = Math.min(48 / baseFs, (ctx.plot.w * 0.7) / (maxW * baseFs), (ctx.plot.h * 0.7) / (m.items.length * 2.4 * baseFs));
    const fs = baseFs * Math.max(1, grow);
    const rowH = fs * 2.4;
    const y0 = ctx.plot.y + ctx.plot.h / 2 - (m.items.length * rowH) / 2 + rowH / 2;
    const hits: Scene['hits'] = [];
    m.items.forEach((it, i) => {
      const y = y0 + i * rowH;
      nodes.push({ type: 'text', x: ctx.plot.x + ctx.plot.w / 2, y, text: mathPretty(it.formula), font: 'display', size: fs, anchor: 'middle', baseline: 'middle', fill: t.ink });
      if (it.name) nodes.push({ type: 'text', x: ctx.plot.x + ctx.plot.w / 2, y: y + fs * 0.85, text: it.name, font: 'body', size: fs * 0.46, anchor: 'middle', baseline: 'middle', fill: t.faint });
      if (i) nodes.push({ type: 'line', x1: ctx.plot.x + ctx.plot.w / 2 - 60, y1: y - rowH / 2 + 4, x2: ctx.plot.x + ctx.plot.w / 2 + 60, y2: y - rowH / 2 + 4, stroke: acc, strokeWidth: 0.8, opacity: 0.3 });
      hits.push({ shape: { type: 'rect', x: ctx.plot.x + ctx.plot.w * 0.2, y: y - rowH / 2, w: ctx.plot.w * 0.6, h: rowH },
        datum: { kind: 'formula', index: i, label: it.name || `公式 ${i + 1}`, tooltip: { title: it.name || `公式 ${i + 1}`, rows: [{ name: '表达式', value: it.formula }] } } });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};
