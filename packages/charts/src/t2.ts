// T2 新视图渲染器（M7）：tree / network / control / parallel。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, scaleBand, scaleLinear, scalePoint, scene } from '@virta/chart-core';
import { axisTitle, formatNumber, xAxisTicks, yAxis } from '@virta/chart-skin';
import { paletteColors } from '@virta/design-system';
import type { ControlModel, NetworkModel, ParallelModel, TreeModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';

const fm = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');
const seed = (s: number) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// ── tree ────────────────────────────────────────────────────────────
export const treeRenderer: FamilyRenderer<TreeModel> = {
  view: 'tree' as ViewId,
  interactions: ['drill'],
  layout(m: TreeModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const variant = ctx.variant ?? 'tidy';
    const showV = ctx.options?.['showValues'] !== false;
    const collapse = Number(ctx.options?.['collapseDepth'] ?? 0);
    const kids = new Map<string, TreeModel['nodes']>();
    const byId = new Map(m.nodes.map((nd) => [nd.id, nd]));
    for (const nd of m.nodes) {
      if (nd.parent === null) continue;
      if (!kids.has(nd.parent)) kids.set(nd.parent, []);
      kids.get(nd.parent)!.push(nd);
    }
    // 折叠：depth >= collapse 的不画（collapse=0 全展开）
    const visible = (nd: TreeModel['nodes'][number]) => !collapse || nd.depth < collapse;
    const truncated = (nd: TreeModel['nodes'][number]) => collapse > 0 && nd.depth === collapse - 1 && (kids.get(nd.id)?.length ?? 0) > 0;

    if (variant === 'indented') {
      const rowH = 24;
      const ordered: TreeModel['nodes'] = [];
      const walk = (id: string) => {
        const nd = byId.get(id)!;
        if (!visible(nd)) return;
        ordered.push(nd);
        for (const c of kids.get(id) ?? []) walk(c.id);
      };
      for (const rid of m.roots) walk(rid);
      // 层级引导竖线（每层一条，覆盖全部行）
      const maxD = Math.max(0, ...ordered.map((nd) => nd.depth));
      for (let d = 1; d <= maxD; d++) {
        nodes.push({
          type: 'line', x1: ctx.plot.x + d * 18 - 9, y1: ctx.plot.y,
          x2: ctx.plot.x + d * 18 - 9, y2: ctx.plot.y + ordered.length * rowH,
          stroke: t.grid, strokeWidth: 1,
        });
      }
      ordered.forEach((nd, i) => {
        const y = ctx.plot.y + i * rowH + rowH / 2;
        const hasKids = truncated(nd) || (!collapse && (kids.get(nd.id)?.length ?? 0) > 0);
        if (hasKids) {
          const mx = ctx.plot.x + nd.depth * 18 - 12;
          const d = truncated(nd)
            ? `M${mx} ${y - 4} L${mx + 6} ${y} L${mx} ${y + 4} Z`
            : `M${mx - 1} ${y - 3} L${mx + 5} ${y - 3} L${mx + 2} ${y + 3} Z`;
          nodes.push({ type: 'path', d, fill: t.muted });
        }
        nodes.push({
          type: 'text', x: ctx.plot.x + nd.depth * 18, y, text: nd.name,
          font: 'body', size: 12, anchor: 'start', baseline: 'middle', fill: nd.depth === 0 ? t.ink : t.muted,
        });
        if (showV && nd.value !== undefined) {
          nodes.push({ type: 'text', x: ctx.plot.x + ctx.plot.w, y, text: fm(ctx)(nd.value), font: 'mono', size: 11.5, anchor: 'end', baseline: 'middle', fill: t.ink });
        }
        hits.push({
          shape: { type: 'rect', x: ctx.plot.x, y: y - rowH / 2, w: ctx.plot.w, h: rowH },
          datum: { kind: 'node', index: i, label: nd.name, value: nd.value, tooltip: { title: nd.name, rows: [{ name: '汇总', value: nd.value !== undefined ? fm(ctx)(nd.value) : '—' }] } },
        });
      });
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
    }

    // 布局：叶子均布、父节点取子节点中位（tidy/org 纵向；mindmap 横向）
    let leafX = 0;
    const pos = new Map<string, { u: number; depth: number }>();
    const place = (id: string) => {
      const nd = byId.get(id)!;
      const cs = (kids.get(id) ?? []).filter(visible);
      if (!cs.length) { pos.set(id, { u: leafX++, depth: nd.depth }); return; }
      for (const c of cs) place(c.id);
      const us = cs.map((c) => pos.get(c.id)!.u);
      pos.set(id, { u: (us[0] + us[us.length - 1]) / 2, depth: nd.depth });
    };
    for (const rid of m.roots) place(rid);
    const leafN = Math.max(1, leafX);
    const maxDepth = Math.max(1, ...m.nodes.filter(visible).map((nd) => nd.depth));
    const horiz = variant === 'mindmap';
    const draw = m.nodes.filter(visible);
    const xy = (id: string) => {
      const p = pos.get(id)!;
      const u = ctx.plot.x + 40 + (p.u / Math.max(1, leafN - 1 || 1)) * (ctx.plot.w - 80);
      const d = ctx.plot.y + 10 + (p.depth / Math.max(1, maxDepth)) * (ctx.plot.h - 30);
      return horiz ? { x: ctx.plot.x + 40 + (p.depth / Math.max(1, maxDepth)) * (ctx.plot.w - 110), y: ctx.plot.y + 10 + (p.u / Math.max(1, leafN - 1 || 1)) * (ctx.plot.h - 30) } : { x: u, y: d };
    };
    // 边：肘形连接线
    for (const nd of draw) {
      if (nd.parent === null || !byId.get(nd.parent) || !visible(byId.get(nd.parent)!)) continue;
      const a = xy(nd.parent), b = xy(nd.id);
      const mid = horiz ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
      nodes.push({
        type: 'path',
        d: horiz ? `M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}` : `M${a.x} ${a.y} V${mid} H${b.x} V${b.y}`,
        fill: 'none', stroke: t.line, strokeWidth: 1.2,
      });
    }
    draw.forEach((nd, di) => {
      const p = xy(nd.id);
      const col = colors[nd.depth % colors.length];
      const isRoot = nd.depth === 0;
      const label = showV && nd.value !== undefined ? `${nd.name} ${fm(ctx)(nd.value)}` : nd.name;
      if (variant === 'org') {
        const w = Math.max(64, label.length * 12 + 16), h = 30;
        nodes.push({ type: 'rect', x: p.x - w / 2, y: p.y - h / 2, w, h, r: 4, fill: isRoot ? col : t.tip, stroke: col, strokeWidth: isRoot ? 0 : 1.2 });
        nodes.push({ type: 'text', x: p.x, y: p.y, text: label, font: 'body', size: 11, anchor: 'middle', baseline: 'middle', fill: isRoot ? t.tipInk : t.ink });
        hits.push({ shape: { type: 'rect', x: p.x - w / 2, y: p.y - h / 2, w, h }, datum: { kind: 'node', index: di, label: nd.name, value: nd.value, tooltip: { title: nd.name, rows: [{ name: '汇总', value: nd.value !== undefined ? fm(ctx)(nd.value) : '—' }] } } });
      } else {
        nodes.push({ type: 'circle', cx: p.x, cy: p.y, r: isRoot ? 6 : 4.5, fill: col });
        nodes.push({
          type: 'text',
          x: horiz ? p.x + 8 : p.x, y: horiz ? p.y : p.y + 14,
          text: truncated(nd) ? `${label} +` : label,
          font: 'body', size: isRoot ? 12 : 11,
          anchor: horiz ? 'start' : 'middle', baseline: 'middle',
          fill: isRoot ? t.ink : t.muted,
        });
        hits.push({ shape: { type: 'circle', cx: p.x, cy: p.y, r: 8 }, datum: { kind: 'node', index: di, label: nd.name, value: nd.value, tooltip: { title: nd.name, rows: [{ name: '汇总', value: nd.value !== undefined ? fm(ctx)(nd.value) : '—' }] } } });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// ── network ─────────────────────────────────────────────────────────
export const networkRenderer: FamilyRenderer<NetworkModel> = {
  view: 'network' as ViewId,
  interactions: ['drag-node'],
  layout(m: NetworkModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const variant = ctx.variant ?? 'force';
    const plot = ctx.plot;
    const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2;
    const maxFlow = Math.max(1e-9, ...m.nodes.map((n) => n.flow));
    const maxV = Math.max(1e-9, ...m.links.map((l) => l.value));
    const pos = new Map<string, { x: number; y: number }>();

    if (variant === 'circular') {
      const R = Math.min(plot.w, plot.h) / 2 - 30;
      const sorted = [...m.nodes].sort((a, b) => b.flow - a.flow);
      sorted.forEach((nd, i) => {
        const a = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(nd.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
      });
    } else {
      // 确定性力导向：velocity Verlet + 库仑斥力 + 弹簧 + 向心引力，固定 300 步
      const rest = Number(ctx.options?.['linkDistance'] ?? 80);
      const rnd = seed(42);
      const N = m.nodes.length;
      const R = Math.min(plot.w, plot.h) / 2 - 40;
      const P = m.nodes.map((nd, i) => {
        const a = (i / Math.max(1, N)) * Math.PI * 2 + (rnd() - 0.5);
        return { id: nd.id, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), vx: 0, vy: 0 };
      });
      const idx = new Map(P.map((p, i) => [p.id, i]));
      for (let step = 0; step < 300; step++) {
        const cool = 1 - step / 300;
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 4) { dx = rnd() - 0.5; dy = rnd() - 0.5; d2 = 4; }
          const f = Math.min(22, 12000 / d2) * cool;
          const d = Math.sqrt(d2);
          P[i].vx += (dx / d) * f; P[i].vy += (dy / d) * f;
          P[j].vx -= (dx / d) * f; P[j].vy -= (dy / d) * f;
        }
        for (const l of m.links) {
          const a = P[idx.get(l.source)!], b = P[idx.get(l.target)!];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - rest) * 0.03;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        for (const p of P) {
          p.vx += (cx - p.x) * 0.008; p.vy += (cy - p.y) * 0.008;
          p.x += p.vx * 0.9; p.y += p.vy * 0.9;
          p.vx *= 0.6; p.vy *= 0.6;
          p.x = Math.max(plot.x + 14, Math.min(plot.x + plot.w - 14, p.x));
          p.y = Math.max(plot.y + 14, Math.min(plot.y + plot.h - 14, p.y));
        }
      }
      // 归一化到绘图区（斥力相对尺度不定，按包围盒铺满）
      const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const sx = (plot.w - 90) / Math.max(1, x1 - x0), sy = (plot.h - 90) / Math.max(1, y1 - y0);
      const s = Math.min(sx, sy);
      for (const p of P) pos.set(p.id, { x: plot.x + 45 + (p.x - x0) * s, y: plot.y + 45 + (p.y - y0) * s });
    }

    // 边
    m.links.forEach((l, ei) => {
      const a = pos.get(l.source)!, b = pos.get(l.target)!;
      const w = 0.8 + 3.5 * (l.value / maxV);
      nodes.push({
        type: 'path',
        d: variant === 'circular'
          ? `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`
          : `M${a.x} ${a.y} L${b.x} ${b.y}`,
        fill: 'none', stroke: t.line2, strokeWidth: w, opacity: 0.65,
      });
      hits.push({ shape: { type: 'path', d: `M${a.x} ${a.y} L${b.x} ${b.y}` }, datum: { kind: 'edge', index: ei, label: `${l.source} → ${l.target}`, value: l.value, tooltip: { title: `${l.source} → ${l.target}`, rows: [{ name: '权重', value: fm(ctx)(l.value) }] } } });
    })
    // 节点
    const showLbl = ctx.options?.['nodeLabels'] !== false;
    m.nodes.forEach((nd, ni) => {
      const p = pos.get(nd.id)!;
      const r = 5 + 11 * Math.sqrt(nd.flow / maxFlow);
      const col = colors[Math.abs([...nd.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
      nodes.push({ type: 'circle', cx: p.x, cy: p.y, r, fill: col, stroke: t.tip, strokeWidth: 1.5 });
      if (showLbl) nodes.push({ type: 'text', x: p.x, y: p.y + r + 9, text: nd.id, font: 'body', size: 11, anchor: 'middle', baseline: 'middle', fill: t.ink });
      hits.push({ shape: { type: 'circle', cx: p.x, cy: p.y, r: r + 3 }, datum: { kind: 'node', index: ni, label: nd.id, value: nd.flow, tooltip: { title: nd.id, rows: [{ name: '流量', value: fm(ctx)(nd.flow) }] } } });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// ── control ─────────────────────────────────────────────────────────
export const controlRenderer: FamilyRenderer<ControlModel> = {
  view: 'control' as ViewId,
  interactions: ['brush'],
  layout(m: ControlModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const bands = ctx.options?.['showSigmaBands'] !== false;
    const weRules = ctx.options?.['weRules'] !== false;
    // 右缘预留限线标签位：多系列时标签带系列名（"UCL·3号线" ≈66px），单系列仅 "UCL"
    const rpad = m.lines.some((ln) => ln.name) ? 76 : 34;
    const plot = { x: ctx.plot.x + 50, y: ctx.plot.y + 14, w: ctx.plot.w - 50 - rpad, h: ctx.plot.h - 52 };
    const xs = [...new Set(m.lines.flatMap((l) => l.points.map((p) => p.x)))].sort();
    const x = scalePoint(xs, [plot.x, plot.x + plot.w]);
    const allV = m.lines.flatMap((l) => [...l.points.map((p) => p.v), l.ucl, l.lcl, l.cl]);
    const y = scaleLinear([Math.min(...allV), Math.max(...allV) * 1.02 || 1], [plot.y + plot.h, plot.y]);
    nodes.push(...yAxis(y, plot, t, fm(ctx)));
    nodes.push(...xAxisTicks(
      xs.filter((_, i) => i % Math.max(1, Math.ceil(xs.length / 10)) === 0).map((v) => ({ pos: x(v), text: v.length > 10 ? v.slice(5) : v })),
      plot, t,
    ));
    nodes.push(...axisTitle(ctx.text?.unit, plot, t));
    m.lines.forEach((ln, li) => {
      const col = colors[li % colors.length];
      // σ 色带：±1σ / ±2σ
      if (bands) {
        nodes.push({ type: 'rect', x: plot.x, y: y(ln.cl + ln.s2), w: plot.w, h: y(ln.cl) - y(ln.cl + ln.s2), fill: col, opacity: 0.06 });
        nodes.push({ type: 'rect', x: plot.x, y: y(ln.cl), w: plot.w, h: y(ln.cl - ln.s2) - y(ln.cl), fill: col, opacity: 0.06 });
        nodes.push({ type: 'rect', x: plot.x, y: y(ln.cl + ln.s1), w: plot.w, h: y(ln.cl) - y(ln.cl + ln.s1), fill: col, opacity: 0.1 });
        nodes.push({ type: 'rect', x: plot.x, y: y(ln.cl), w: plot.w, h: y(ln.cl - ln.s1) - y(ln.cl), fill: col, opacity: 0.1 });
      }
      // 控制限
      nodes.push({ type: 'line', x1: plot.x, y1: y(ln.cl), x2: plot.x + plot.w, y2: y(ln.cl), stroke: col, strokeWidth: 1.4 });
      for (const v of [ln.ucl, ln.lcl]) {
        nodes.push({ type: 'line', x1: plot.x, y1: y(v), x2: plot.x + plot.w, y2: y(v), stroke: col, strokeWidth: 1, dash: [5, 3] });
      }
      const limTag = (nm: string) => (ln.name ? `${nm}·${ln.name}` : nm);
      nodes.push({ type: 'text', x: plot.x + plot.w + 4, y: y(ln.ucl), text: limTag('UCL'), font: 'mono', size: 9, anchor: 'start', baseline: 'middle', fill: col });
      nodes.push({ type: 'text', x: plot.x + plot.w + 4, y: y(ln.lcl), text: limTag('LCL'), font: 'mono', size: 9, anchor: 'start', baseline: 'middle', fill: col });
      // 折线 + 点
      const pts = ln.points.map((p) => ({ p, x: x(p.x), y: y(p.v) }));
      nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), fill: 'none', stroke: col, strokeWidth: 2 });
      pts.forEach(({ p, x: px, y: py }, pi) => {
        const bad = weRules && (p.flag === 'r1' || p.flag === 'r2');
        nodes.push({ type: 'circle', cx: px, cy: py, r: bad ? 5 : 3, fill: bad ? t.warn : col, ...(bad ? { stroke: t.tip, strokeWidth: 1.5 } : {}) });
        hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 7 }, datum: { kind: 'point', index: pi, label: p.x, value: p.v, series: ln.name || undefined, tooltip: { title: p.x, rows: [{ swatch: col, name: ln.name || m.value_key, value: `${fm(ctx)(p.v)}${bad && p.flag === 'r1' ? '（失控·超3σ）' : bad && p.flag === 'r2' ? '（异常·同侧2σ）' : ''}` }] } } });
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// ── parallel ────────────────────────────────────────────────────────
export const parallelRenderer: FamilyRenderer<ParallelModel> = {
  view: 'parallel' as ViewId,
  interactions: ['brush'],
  layout(m: ParallelModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const plot = { x: ctx.plot.x + 30, y: ctx.plot.y + 26, w: ctx.plot.w - 60, h: ctx.plot.h - 60 };
    const opacity = Number(ctx.options?.['opacity'] ?? 0.4);
    const zero = ctx.options?.['axisRange'] === 'zero';
    const order = String((ctx.state as Record<string, unknown> | undefined)?.['axisOrder'] ?? '').split(',').filter(Boolean);
    const keys = order.length === m.axes.length ? order : m.axes.map((a) => a.key);
    const axes = keys.map((k) => m.axes.find((a) => a.key === k)!);
    const step = axes.length > 1 ? plot.w / (axes.length - 1) : 0;
    const scales = axes.map((a) => {
      const lo = zero ? Math.min(0, a.min) : a.min, hi = Math.max(zero ? 0 : a.min, a.max);
      return scaleLinear([lo, hi === lo ? lo + 1 : hi], [plot.y + plot.h, plot.y]);
    });
    const groups = [...new Set(m.rows.map((r) => r.group))];
    const gcol = new Map(groups.map((gn, i) => [gn, colors[i % colors.length]]));
    // 折线
    m.rows.forEach((r, ri) => {
      const col = gcol.get(r.group)!;
      const pts = r.vals.map((v, i) => ({ x: plot.x + i * step, y: scales[i](v) }));
      nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '), fill: 'none', stroke: col, strokeWidth: 1.4, opacity });
      hits.push({ shape: { type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') }, datum: { kind: 'row', index: ri, label: r.label ?? r.group, series: r.group || undefined, tooltip: { title: r.label ?? '—', rows: axes.map((a, i) => ({ swatch: col, name: a.key, value: fm(ctx)(r.vals[i]) })) } } });
    });
    // 轴
    axes.forEach((a, i) => {
      const px = plot.x + i * step;
      nodes.push({ type: 'line', x1: px, y1: plot.y, x2: px, y2: plot.y + plot.h, stroke: t.line2, strokeWidth: 1.2 });
      nodes.push({ type: 'text', x: px, y: plot.y - 8, text: a.key, font: 'body', size: 11.5, anchor: 'middle', baseline: 'bottom', fill: t.ink });
      const s = scales[i];
      for (const tv of s.ticks.slice(0, 6)) {
        nodes.push({ type: 'line', x1: px - 3, y1: s(tv), x2: px + 3, y2: s(tv), stroke: t.line });
        nodes.push({ type: 'text', x: px + 5, y: s(tv), text: fm(ctx)(tv), font: 'mono', size: 9, anchor: 'start', baseline: 'middle', fill: t.faint });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};
