// B3：gantt / fishbone / grid / report / pie3d / line3d / scatter3d。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, measureText, niceTicks, scaleLinear, scene } from '@virta/chart-core';
import { formatNumber, type LegendItem } from '@virta/chart-skin';
import { accentFor, lerpOklch, paletteColors, rampDiverging } from '@virta/design-system';
import type { DocModel, FishboneModel, GanttModel, GridModel, Line3dModel, Pie3dModel, ScatterModel, BarlineModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { project3d } from './b1.js';

const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');
const ISO = (ord: number) => new Date(ord * 86400000).toISOString().slice(0, 10);

// —— gantt ——
export const ganttRenderer: FamilyRenderer<GanttModel> = {
  view: 'gantt' as ViewId,
  layout(m: GanttModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const padL = Math.min(160, Math.max(70, ...m.tasks.map((k) => measureText(k.label, 'body', 11) + 16)));
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 26, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 46 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const colorBy = String(opt('colorBy', 'group'));
    const compact = String(opt('density', 'comfort')) === 'compact';
    const weekendShading = opt('weekendShading', true) !== false;
    const showDeps = opt('deps', true) !== false;
    const showToday = opt('todayLine', true) !== false;
    const showProgress = opt('progress', true) !== false;
    const x0 = 0, x1 = Math.max(1, m.span);
    const x = scaleLinear([x0, x1], [plot.x, plot.x + plot.w]);
    const iso = (d: number) => (m.baseOrd !== null ? ISO(m.baseOrd + d) : `D${Math.round(d)}`);
    const rowH = plot.h / Math.max(1, m.tasks.length);
    const barH = Math.min(compact ? 13 : 18, rowH * (compact ? 0.42 : 0.55));
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    const acc = accentFor(ctx.palette, ctx.theme);
    const statusColor = (st: string | null) => st === 'done' ? t.pos : (st === 'delayed' || st === 'late') ? t.neg : st === 'doing' ? acc : t.faint;
    const taskColor = (k: { group: string; status: string | null }, i: number) => colorBy === 'status' ? statusColor(k.status) : colors[(gi.get(k.group) ?? i) % colors.length];
    // 周末底纹（有真实日期时逐日扫描 Sat/Sun）
    if (weekendShading && m.baseOrd !== null) {
      for (let d = x0; d <= x1; d++) {
        const dow = new Date((m.baseOrd + d) * 86400000).getUTCDay();
        if (dow === 0 || dow === 6) nodes.push({ type: 'rect', x: x(d), y: plot.y, w: Math.max(1, x(Math.min(x1, d + 1)) - x(d)), h: plot.h, fill: t.grid, opacity: 0.4 });
      }
    }
    // 时间刻度（~8 格）
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let d = 0; d <= x1; d += step) {
      nodes.push({ type: 'line', x1: x(d), y1: plot.y, x2: x(d), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: x(d), y: plot.y - 4, text: iso(d).slice(5), font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.faint });
    }
    const todayOrd = m.today;
    m.tasks.forEach((k, i) => {
      const cy = plot.y + i * rowH + rowH / 2;
      const c = taskColor(k, i);
      const s = k.s, e = k.e ?? k.s;
      nodes.push({ type: 'text', x: plot.x - 8, y: cy, text: k.label, font: 'body', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
      const datum = { kind: 'task', index: i, label: k.label, value: e - s, tooltip: { title: `${k.label}（${k.group}）`, rows: [{ swatch: c, name: '区间', value: `${iso(s)} → ${iso(e)}` }, { name: '进度', value: k.progress !== null ? `${Math.round(k.progress * 100)}%` : '—' }] } };
      if (k.milestone) {
        nodes.push({ type: 'path', d: `M${x(s)} ${cy - 7} L${x(s) + 7} ${cy} L${x(s)} ${cy + 7} L${x(s) - 7} ${cy} Z`, fill: acc, datum });
      } else {
        nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, x(e) - x(s)), h: barH, r: 4, fill: c, opacity: 0.32, datum });
        if (showProgress && k.progress) nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, (x(e) - x(s)) * k.progress), h: barH, r: 4, fill: c, datum });
      }
      if (k.status === 'delayed' || k.status === 'late') nodes.push({ type: 'circle', cx: x(e) + 10, cy, r: 3, fill: t.neg });
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    // 依赖连线
    if (showDeps) m.tasks.forEach((k, i) => {
      const cy2 = plot.y + i * rowH + rowH / 2;
      for (const d of k.deps) {
        const src = m.tasks[d];
        if (!src) continue;
        const cy1 = plot.y + d * rowH + rowH / 2;
        const x1p = x(src.e ?? src.s), x2p = x(k.s);
        nodes.push({ type: 'path', d: `M${x1p} ${cy1} L${x1p + 8} ${cy1} L${x1p + 8} ${cy2} L${x2p} ${cy2}`, fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [3, 2] });
      }
    });
    if (showToday && todayOrd !== null) nodes.push({ type: 'line', x1: x(todayOrd), y1: plot.y - 4, x2: x(todayOrd), y2: plot.y + plot.h, stroke: t.warn, strokeWidth: 1.5, dash: [5, 3] });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— fishbone ——
export const fishboneRenderer: FamilyRenderer<FishboneModel> = {
  view: 'fishbone' as ViewId,
  layout(m: FishboneModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const acc = accentFor(ctx.palette, ctx.theme);
    const left = String(ctx.options?.['direction'] ?? 'right') === 'left';
    const showLegend = ctx.options?.['legend'] !== false;
    const cgap = String(ctx.options?.['density'] ?? 'comfort') === 'compact' ? 11 : 15;
    const plot = { x: ctx.plot.x + 30, y: ctx.plot.y + 30, w: ctx.plot.w - 130, h: ctx.plot.h - 60 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const spineY = ctx.plot.y + ctx.plot.h / 2;
    const headX = plot.x + plot.w + 40;
    // 方向镜像：left 时所有 x 绕绘图区中线翻转，文本锚点对换
    const mid = ctx.plot.x + ctx.plot.w / 2;
    const fx = (x: number) => (left ? 2 * mid - x : x);
    const anch = (a: 'start' | 'end' | 'middle') => (left ? (a === 'start' ? 'end' : a === 'end' ? 'start' : a) : a);
    // 主骨 + 鱼头
    nodes.push({ type: 'line', x1: fx(plot.x), y1: spineY, x2: fx(headX), y2: spineY, stroke: t.ink, strokeWidth: 2.5 });
    nodes.push({ type: 'path', d: `M${fx(headX)} ${spineY - 22} L${fx(headX + 46)} ${spineY} L${fx(headX)} ${spineY + 22} L${fx(headX + 14)} ${spineY} Z`, fill: acc });
    const n = m.cats.length;
    const per = Math.ceil(n / 2);
    m.cats.forEach((cat, ci) => {
      const up = ci < per;
      const slot = up ? ci : ci - per;
      const cnt = up ? per : n - per;
      const bx = plot.x + ((slot + 1) / (cnt + 1)) * plot.w;
      const by = spineY + (up ? -1 : 1) * plot.h * 0.34;
      const c = colors[ci % colors.length];
      nodes.push({ type: 'line', x1: fx(bx), y1: spineY, x2: fx(bx + (up ? -40 : -40) + plot.w * 0.08), y2: by, stroke: c, strokeWidth: 1.8 });
      nodes.push({ type: 'text', x: fx(bx + plot.w * 0.08 - 30), y: by + (up ? -6 : 14), text: cat.name, font: 'body', size: 12, weight: 600, baseline: up ? 'bottom' : 'top', fill: c, anchor: anch('start') });
      cat.causes.forEach((cause, k) => {
        const k2 = k + 1;
        const lx = bx + ((plot.w * 0.08 - 30) * k2) / (cat.causes.length + 1) * 0.9;
        const ty = up ? by + 8 + k * cgap : by - 8 - k * cgap;
        const tip = { kind: 'cause', index: k, label: cause.label, tooltip: { title: cause.label, rows: [{ swatch: c, name: cat.name, value: cause.sub || '—' }, { name: '负责人', value: cause.owner || '—' }] } };
        nodes.push({ type: 'line', x1: fx(bx + plot.w * 0.08 * (k2 / (cat.causes.length + 1)) - 30), y1: by, x2: fx(lx), y2: ty, stroke: t.faint, strokeWidth: 1 });
        nodes.push({ type: 'text', x: fx(lx - 4), y: ty, text: cause.label + (cause.sub ? `/${cause.sub}` : ''), font: 'body', size: 10, anchor: anch('end'), baseline: 'middle', fill: t.muted, datum: tip });
        const tw = measureText(cause.label, 'body', 10);
        hits.push({ shape: { type: 'rect', x: fx(left ? lx + 8 : lx - tw - 8), y: ty - 7, w: tw + 8, h: 14 }, datum: tip });
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    if (showLegend) (sc as { legend?: LegendItem[] }).legend = m.cats.map((c2, i) => ({ name: c2.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— grid（明细/pivot 表）——
export const gridRenderer: FamilyRenderer<GridModel> = {
  view: 'grid' as ViewId,
  layout(m: GridModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const x0 = ctx.plot.x + 8, y0 = ctx.plot.y + 8;
    const colW = m.columns.map((c) => Math.min(220, Math.max(70, measureText(c.key, 'mono', 11) + 30)));
    const totW = colW.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, ctx.plot.w / Math.max(1, totW));
    const compact = String(ctx.options?.['density'] ?? 'comfort') === 'compact';
    const pageSize = Math.max(5, Number(ctx.options?.['pageSize'] ?? 50));
    const showTotals = ctx.options?.['showTotals'] !== false;
    const zebra = ctx.options?.['zebra'] !== false;
    const rowH = (compact ? 18 : 24) * scale, headH = 30;
    let y = y0;
    // 表头
    nodes.push({ type: 'rect', x: x0, y, w: ctx.plot.w - 16, h: headH, fill: acc, opacity: 0.1 });
    let x = x0;
    m.columns.forEach((c, i) => {
      nodes.push({ type: 'text', x: x + 6, y: y + headH / 2, text: c.key, font: 'mono', size: 11, weight: 600, baseline: 'middle', fill: t.ink });
      x += colW[i] * scale;
    });
    y += headH;
    nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + ctx.plot.w - 16, y2: y, stroke: t.ink, strokeWidth: 1.2 });
    const maxRows = Math.min(m.rows.length, pageSize, Math.floor((ctx.plot.h - headH - 16) / Math.max(14, rowH)));
    m.rows.slice(0, maxRows).forEach((r, ri) => {
      x = x0;
      if (zebra && ri % 2) nodes.push({ type: 'rect', x: x0, y, w: ctx.plot.w - 16, h: rowH, fill: t.grid, opacity: 0.35 });
      m.columns.forEach((c, i) => {
        const v = r[c.key];
        const txt = v === null || v === undefined ? '—' : c.numeric ? fmt(ctx)(Number(v)) : String(v);
        nodes.push({ type: 'text', x: c.numeric ? x + colW[i] * scale - 6 : x + 6, y: y + rowH / 2, text: txt, font: 'mono', size: 10.5, anchor: c.numeric ? 'end' : 'start', baseline: 'middle', fill: t.muted });
        x += colW[i] * scale;
      });
      y += rowH;
      nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + ctx.plot.w - 16, y2: y, stroke: t.grid, strokeWidth: 0.5 });
    });
    if (showTotals && m.columns.some((c) => c.numeric) && m.rows.length > 1) {
      x = x0;
      nodes.push({ type: 'rect', x: x0, y, w: ctx.plot.w - 16, h: rowH, fill: acc, opacity: 0.08 });
      m.columns.forEach((c, i) => {
        if (c.numeric) {
          const sum = m.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
          nodes.push({ type: 'text', x: x + colW[i] * scale - 6, y: y + rowH / 2, text: fmt(ctx)(sum), font: 'mono', size: 10.5, weight: 600, anchor: 'end', baseline: 'middle', fill: t.ink });
        } else if (i === 0) nodes.push({ type: 'text', x: x + 6, y: y + rowH / 2, text: '合计', font: 'mono', size: 10.5, weight: 600, baseline: 'middle', fill: t.ink });
        x += colW[i] * scale;
      });
      y += rowH;
    }
    if (m.rows.length > maxRows) nodes.push({ type: 'text', x: x0, y: y + 14, text: `… 共 ${m.rows.length} 行，显示前 ${maxRows}`, font: 'mono', size: 10, baseline: 'top', fill: t.faint });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    return sc;
  },
};

// —— report（文档报告：DocModel → SVG 排版）——
export const reportRenderer: FamilyRenderer<DocModel> = {
  view: 'report' as ViewId,
  layout(m: DocModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const fs = Math.max(12, Math.min(18, Number(ctx.options?.['fontSize'] ?? 15)));
    const k = fs / 15;
    const W = Math.min(ctx.options?.['wide'] === true ? 980 : 720, ctx.plot.w - 40);
    let x = ctx.plot.x + (ctx.plot.w - W) / 2, y = ctx.plot.y + 10;
    const wrap = (text: string, size: number, font: 'body' | 'display') => {
      const per = Math.floor(W / (size * 1.0));
      const lines: string[] = [];
      for (let i = 0; i < text.length; i += per) lines.push(text.slice(i, i + per));
      return lines;
    };
    // 指标卡（每行 ≤4，字号按宽度自适应）
    if (m.metrics.length) {
      const perRow = Math.min(4, m.metrics.length);
      const cw = (W - (perRow - 1) * 12) / perRow;
      m.metrics.slice(0, 8).forEach((mt, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const mx = x + col * (cw + 12), my = y + row * 72;
        nodes.push({ type: 'rect', x: mx, y: my, w: cw, h: 62, r: 10, fill: t.grid, opacity: 0.4 });
        const label = mt.label ?? '指标';
        const labelTxt = measureText(label, 'mono', 10.5) > cw - 20 ? label.slice(0, Math.max(2, Math.floor((cw - 20) / 10.5))) : label;
        nodes.push({ type: 'text', x: mx + 10, y: my + 12, text: labelTxt, font: 'mono', size: 10.5 * k, baseline: 'top', fill: t.faint });
        const vtxt = `${mt.value_text}${mt.unit}`;
        const vw = measureText(vtxt, 'display', 19 * k);
        const vs = vw > cw - 20 ? Math.max(11, 19 * k * (cw - 20) / vw) : 19 * k;
        nodes.push({ type: 'text', x: mx + 10, y: my + 42, text: vtxt, font: 'display', size: vs, weight: 600, baseline: 'middle', fill: t.ink });
      });
      y += Math.ceil(Math.min(8, m.metrics.length) / perRow) * 72 + 10;
    }
    for (const b of m.blocks.slice(0, 400)) {
      if (y > ctx.plot.y + ctx.plot.h - 30) break;
      const bt = b as { type: string; text?: string; level?: number; items?: { text: string }[]; rows?: string[][]; head?: string[]; paras?: string[]; lang?: string };
      if (bt.type === 'heading') {
        const size = (bt.level === 1 ? 24 : bt.level === 2 ? 18 : 15) * k;
        y += bt.level === 1 ? 10 : 6;
        for (const ln of wrap(bt.text ?? '', size, 'display')) { nodes.push({ type: 'text', x, y, text: ln, font: 'display', size, weight: 600, baseline: 'top', fill: t.ink }); y += size * 1.3; }
      } else if (bt.type === 'list' && bt.items) {
        for (const it of bt.items) for (const ln of wrap(`· ${it.text}`, 12.5 * k, 'body')) { nodes.push({ type: 'text', x: x + 10, y, text: ln, font: 'body', size: 12.5 * k, baseline: 'top', fill: t.muted }); y += 19 * k; }
      } else if (bt.type === 'table' && bt.rows?.length) {
        const trows = [bt.head ?? [], ...bt.rows];
        const cols = Math.max(...trows.map((r) => r.length));
        const cw = W / cols;
        trows.slice(0, 30).forEach((r, ri) => {
          r.forEach((cell, ci) => {
            if (ri === 0) nodes.push({ type: 'rect', x: x + ci * cw, y, w: cw, h: 22 * k, fill: t.grid, opacity: 0.4 });
            nodes.push({ type: 'text', x: x + ci * cw + 5, y: y + 11 * k, text: cell ?? '', font: 'mono', size: 10.5 * k, baseline: 'middle', fill: ri === 0 ? t.ink : t.muted });
          });
          y += 22 * k;
          nodes.push({ type: 'line', x1: x, y1: y, x2: x + W, y2: y, stroke: t.grid, strokeWidth: 0.5 });
        });
        y += 8;
      } else if (bt.type === 'quote' && bt.paras) {
        const qh = bt.paras.reduce((a, p) => a + wrap(p, 12.5 * k, 'body').length, 0) * 19 * k;
        for (const para of bt.paras) for (const ln of wrap(para, 12.5 * k, 'body')) { nodes.push({ type: 'text', x: x + 10, y, text: ln, font: 'body', size: 12.5 * k, baseline: 'top', fill: t.faint }); y += 19 * k; }
        nodes.push({ type: 'rect', x: x - 2, y: y - qh - 2, w: 3, h: qh + 4, fill: acc });
        y += 6;
      } else if (bt.type === 'code' && bt.text) {
        const lines = bt.text.split('\n');
        nodes.push({ type: 'rect', x: x + 4, y: y - 2, w: W - 8, h: lines.length * 17 * k + 8, r: 6, fill: t.grid, opacity: 0.35 });
        for (const ln of lines) { nodes.push({ type: 'text', x: x + 12, y: y + 3, text: ln, font: 'mono', size: 11 * k, baseline: 'top', fill: t.muted }); y += 17 * k; }
        y += 12;
      } else if (bt.type === 'hr') {
        nodes.push({ type: 'line', x1: x, y1: y + 8, x2: x + W, y2: y + 8, stroke: t.grid, strokeWidth: 1 }); y += 18;
      } else if (bt.text) {
        // 图片引用 ![alt](src)：离线产物不加载外链，画占位框 + 说明
        const img = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(bt.text.trim());
        if (img) {
          const iw = Math.min(W, 460), ih = 110;
          nodes.push({ type: 'rect', x, y, w: iw, h: ih, r: 8, fill: t.grid, opacity: 0.4, stroke: t.line2, strokeWidth: 1 });
          const ix = x + iw / 2, iy = y + ih / 2 - 8;
          nodes.push({ type: 'rect', x: ix - 18, y: iy - 15, w: 36, h: 30, r: 3, fill: 'none', stroke: t.faint, strokeWidth: 1.4 });
          nodes.push({ type: 'circle', cx: ix - 8, cy: iy - 6, r: 3, fill: 'none', stroke: t.faint, strokeWidth: 1.2 });
          nodes.push({ type: 'path', d: `M${ix - 14} ${iy + 12} l10 -11 7 7 5 -5 10 9 Z`, fill: t.faint, opacity: 0.5 });
          nodes.push({ type: 'text', x: ix, y: y + ih - 12, text: img[1] || img[2] || '图片', font: 'mono', size: 10.5, anchor: 'middle', baseline: 'bottom', fill: t.faint });
          y += ih + 10;
          continue;
        }
        for (const ln of wrap(bt.text, 13 * k, 'body')) { nodes.push({ type: 'text', x, y, text: ln, font: 'body', size: 13 * k, baseline: 'top', fill: t.muted }); y += 20 * k; }
        y += 4;
      }
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    return sc;
  },
};

// —— pie3d：多层环（沿用 2D 环 + 深度偏移）——
export const pie3dRenderer: FamilyRenderer<Pie3dModel> = {
  view: 'pie3d' as ViewId,
  layout(m: Pie3dModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const n = Math.max(1, m.n_layers);
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 30;
    const ringW = R / (n + 0.4);
    const dz = 8; // 伪 3D 厚度
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const layerLabels = ctx.options?.['layerLabels'] !== false;
    const sliceLabels = ctx.options?.['sliceLabels'] !== false;
    m.layers.forEach((layer, li) => {
      const r0 = li * ringW, r1 = (li + 1) * ringW - 2;
      let a = -Math.PI / 2;
      layer.slices.forEach((s, i) => {
        const a1 = a + s.share * Math.PI * 2;
        const c = colors[i % colors.length];
        const p = (r: number, aa: number) => `${(cx + r * Math.cos(aa)).toFixed(2)} ${(cy + r * Math.sin(aa)).toFixed(2)}`;
        const lg = a1 - a > Math.PI ? 1 : 0;
        const datum = { kind: 'slice', index: i, label: s.label, value: s.value, tooltip: { title: `${layer.name ?? '层'} · ${s.label}`, rows: [{ swatch: c, name: '值', value: f(s.value), share: `${(s.share * 100).toFixed(1)}%` }] } };
        // 厚度侧壁
        nodes.push({ type: 'path', d: `M${p(r1, a)} v${dz} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} v-${dz} A${r1} ${r1} 0 ${lg} 0 ${p(r1, a)} Z`, fill: c, opacity: 0.7 });
        nodes.push({ type: 'path', d: `M${p(r1, a)} A${r1} ${r1} 0 ${lg} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${lg} 0 ${p(r0, a)} Z`, fill: c, datum });
        if (sliceLabels && s.share > 0.06) {
          const am = (a + a1) / 2, rr = (r0 + r1) / 2;
          nodes.push({ type: 'text', x: cx + rr * Math.cos(am), y: cy + rr * Math.sin(am) + dz / 2, text: s.label, font: 'mono', size: 9.5, anchor: 'middle', baseline: 'middle', fill: t.paper });
        }
        a = a1;
      });
      if (layerLabels) {
        nodes.push({ type: 'text', x: cx - r1 - 8, y: cy, text: layer.name ?? `层 ${li + 1}`, font: 'mono', size: 10, anchor: 'end', baseline: 'middle', fill: t.faint });
      }
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    return sc;
  },
};

// —— 三维坐标框：x/z 底面网格 + 左后角 y 竖轴 + 三轴刻度标签（floor/axes 可分别开关）——
type P3 = (x: number, y: number, z: number) => [number, number];
function box3d(
  P: P3, t: { grid: string; faint: string }, box: { w: number; d: number; h: number },
  ticks: { x?: { v: number; label: string }[]; y?: { v: number; label: string }[]; z?: { v: number; label: string }[] } = {},
  parts: { floor?: boolean; axes?: boolean } = {},
): Node[] {
  const nodes: Node[] = [];
  const floor = parts.floor !== false, axes = parts.axes !== false;
  const hw = box.w / 2, hd = box.d / 2;
  const L = (a: [number, number, number], b: [number, number, number], stroke = t.grid, w = 1) => {
    const [x1, y1] = P(a[0], a[1], a[2]); const [x2, y2] = P(b[0], b[1], b[2]);
    nodes.push({ type: 'line', x1, y1, x2, y2, stroke, strokeWidth: w });
  };
  if (floor) {
    // 底面四边
    L([-hw, 0, -hd], [hw, 0, -hd]); L([hw, 0, -hd], [hw, 0, hd]);
    L([hw, 0, hd], [-hw, 0, hd]); L([-hw, 0, hd], [-hw, 0, -hd]);
    // x/z 向底网格
    for (const tk of ticks.x ?? []) L([tk.v, 0, -hd], [tk.v, 0, hd]);
    for (const tk of ticks.z ?? []) L([-hw, 0, tk.v], [hw, 0, tk.v]);
  }
  if (axes) {
    // 刻度标签
    for (const tk of ticks.x ?? []) {
      const [lx, ly] = P(tk.v, 0, hd);
      nodes.push({ type: 'text', x: lx, y: ly + 12, text: tk.label, font: 'mono', size: 9.5, anchor: 'middle', baseline: 'top', fill: t.faint });
    }
    for (const tk of ticks.z ?? []) {
      const [lx, ly] = P(hw, 0, tk.v);
      nodes.push({ type: 'text', x: lx + 12, y: ly + 4, text: tk.label, font: 'mono', size: 9.5, anchor: 'start', baseline: 'middle', fill: t.faint });
    }
    // y 竖轴（左后角）+ 背墙水平网格 + 刻度
    L([-hw, 0, -hd], [-hw, -box.h, -hd], t.faint, 1.2);
    L([hw, 0, -hd], [hw, -box.h, -hd]);
    for (const tk of ticks.y ?? []) {
      const yy = -tk.v;
      L([-hw, yy, -hd], [-hw, yy, hd]);
      L([-hw, yy, -hd], [hw, yy, -hd]);
      const [lx, ly] = P(-hw, yy, -hd);
      nodes.push({ type: 'text', x: lx - 10, y: ly, text: tk.label, font: 'mono', size: 9.5, anchor: 'end', baseline: 'middle', fill: t.faint });
    }
  }
  return nodes;
}

// —— line3d：真三维坐标系（x=类目 / y=数值 / z=系列纵深）——
export const line3dRenderer: FamilyRenderer<Line3dModel> = {
  view: 'line3d' as ViewId,
  interactions: ['rotate','zoom'],
  layout(m: Line3dModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const ribbon = opt('ribbon', true) !== false, dots = opt('dots', true) !== false;
    const floorOn = opt('floorGrid', true) !== false, axesOn = opt('axes3d', true) !== false;
    const az = Number(ctx.state?.azimuth ?? 40), ti = Number(ctx.state?.tilt ?? 28), zf = Number(ctx.state?.zoom ?? 1);
    const plot = { x: ctx.plot.x + 56, y: ctx.plot.y + 34, w: ctx.plot.w - 130, h: ctx.plot.h - 100 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    // —— curve 变体：x/y/z 连续坐标的三维空间轨迹 ——
    if (m.curve) {
      const gh = plot.h * 0.55, gdep = plot.h * 0.35;
      const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.7;
      const xs = m.curve.points.map((p) => p.x), ys = m.curve.points.map((p) => p.y), zs = m.curve.points.map((p) => p.z);
      const pad = (a: number, b: number) => (b - a < 1e-9 ? [a - 1, b + 1] : [a, b]);
      const nx = scaleLinear(pad(Math.min(...xs), Math.max(...xs)) as [number, number], [-plot.w / 2, plot.w / 2]);
      const ny = scaleLinear(pad(Math.min(...ys), Math.max(...ys)) as [number, number], [0, -gh]);
      const nz = scaleLinear(pad(Math.min(...zs), Math.max(...zs)) as [number, number], [-gdep / 2, gdep / 2]);
      const P: P3 = (x, y, z) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k * zf) as [number, number];
      if (axesOn) {
        nodes.push(...box3d(P, t, { w: plot.w, d: gdep, h: gh }, {
          x: niceTicks(Math.min(...xs), Math.max(...xs), 5).ticks.map((v) => ({ v: nx(v), label: f(v) })),
          y: niceTicks(Math.min(...ys), Math.max(...ys), 4).ticks.map((v) => ({ v: -ny(v), label: f(v) })),
          z: niceTicks(Math.min(...zs), Math.max(...zs), 4).ticks.map((v) => ({ v: nz(v), label: f(v) })),
        }, { floor: floorOn }));
      }
      const c0 = colors[0], c1 = colors[1] ?? colors[0];
      const pts = m.curve.points.map((p) => ({ p, xy: P(nx(p.x), ny(p.y), nz(p.z)), base: P(nx(p.x), 0, nz(p.z)) }));
      // 地面投影（轨迹的影子）
      if (floorOn) {
        nodes.push({ type: 'path', d: pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.base[0].toFixed(2)} ${pt.base[1].toFixed(2)}`).join(' '), fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [3, 4], opacity: 0.6 });
      }
      // 分段轨迹：沿行进方向做色阶渐变（起点浅→终点饱和）
      for (let i = 1; i < pts.length; i++) {
        const sc2 = lerpOklch(c0, c1, pts.length > 2 ? i / (pts.length - 1) : 0.5);
        nodes.push({ type: 'line', x1: pts[i - 1].xy[0], y1: pts[i - 1].xy[1], x2: pts[i].xy[0], y2: pts[i].xy[1], stroke: sc2, strokeWidth: 2.4 });
      }
      if (dots) {
        for (const { xy, p } of pts) {
          nodes.push({ type: 'line', x1: xy[0], y1: xy[1], x2: xy[0], y2: P(nx(p.x), 0, nz(p.z))[1], stroke: c0, strokeWidth: 0.5, opacity: 0.35 });
          nodes.push({ type: 'circle', cx: xy[0], cy: xy[1], r: 3, fill: c0 });
        }
      }
      // 起/终点标记
      const first = pts[0].xy, last = pts[pts.length - 1].xy;
      nodes.push({ type: 'circle', cx: first[0], cy: first[1], r: 5, fill: 'none', stroke: c0, strokeWidth: 1.6 });
      nodes.push({ type: 'circle', cx: last[0], cy: last[1], r: 5, fill: c1 });
      for (const { xy, p } of pts) {
        hits.push({ shape: { type: 'circle', cx: xy[0], cy: xy[1], r: 8 }, datum: { kind: 'point', index: 0, label: p.label, value: p.y, tooltip: { title: p.label, rows: [{ swatch: c0, name: m.curve.cx_key, value: f(p.x) }, { name: m.curve.cy_key, value: f(p.y) }, { name: m.curve.cz_key, value: f(p.z) }] } } });
      }
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
      sc.hits = hits;
      return sc;
    }
    const vmax = Math.max(1, ...m.series.flatMap((s) => s.values));
    const gw = plot.w / Math.max(1, m.labels.length - 1), gd = Math.min(90, plot.h * 0.2), gh = plot.h * 0.55;
    const depth = Math.max(1, m.series.length - 1) * gd;
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.7;
    const P: P3 = (x, y, z) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k * zf) as [number, number];
    const zc = (si: number) => si * gd - depth / 2;
    // 坐标框 + 三轴刻度
    const ytks = niceTicks(0, vmax, 4).ticks.map((v) => ({ v: (v / vmax) * gh, label: f(v) }));
    const step = Math.max(1, Math.ceil(m.labels.length / 8));
    const xtks = m.labels.filter((_, i) => i % step === 0).map((_, i) => ({ v: i * step * gw - plot.w / 2, label: String(m.labels[i * step]) }));
    const ztks = m.series.map((s, si) => ({ v: zc(si), label: s.name }));
    nodes.push(...box3d(P, t, { w: plot.w, d: depth + gd, h: gh }, { x: xtks, y: ytks, z: ztks }, { floor: floorOn, axes: axesOn }));
    // 系列折线（远→近）
    for (let si = m.series.length - 1; si >= 0; si--) {
      const s = m.series[si], c = colors[si % colors.length], z = zc(si);
      const pts = s.values.map((v, i) => P(i * gw - plot.w / 2, -(Math.max(0, v) / vmax) * gh, z));
      if (ribbon) {
        const base = pts.map((_, i) => P(i * gw - plot.w / 2, 0, z));
        nodes.push({ type: 'path', d: `${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ')} ${base.map((p) => `L${p[0].toFixed(2)} ${p[1].toFixed(2)}`).reverse().join(' ')} Z`, fill: c, opacity: 0.14 });
      }
      nodes.push({ type: 'path', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' '), fill: 'none', stroke: c, strokeWidth: 2 });
      if (dots) pts.forEach(([px, py]) => nodes.push({ type: 'circle', cx: px, cy: py, r: 2.6, fill: c }));
      pts.forEach(([px, py], i) => hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 8 }, datum: { kind: 'point', index: i, series: s.name, label: m.labels[i], value: s.values[i], tooltip: { title: `${s.name} · ${m.labels[i]}`, rows: [{ swatch: c, name: '值', value: f(s.values[i]) }] } } }));
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— scatter3d：真三维坐标系（x/y/z 连续数值轴）——
export const scatter3dRenderer: FamilyRenderer<ScatterModel> = {
  view: 'scatter3d' as ViewId,
  interactions: ['rotate','zoom'],
  layout(m: ScatterModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const showAxes = opt('axes3d', true) !== false, bubbles = opt('bubbles', true) !== false;
    const az = Number(ctx.state?.azimuth ?? 40), ti = Number(ctx.state?.tilt ?? 28), zf = Number(ctx.state?.zoom ?? 1);
    const plot = { x: ctx.plot.x + 56, y: ctx.plot.y + 34, w: ctx.plot.w - 130, h: ctx.plot.h - 100 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y), zs = m.points.map((p) => p.z ?? 0);
    const gh = plot.h * 0.55, gdep = plot.h * 0.35;
    const nx = scaleLinear([Math.min(...xs), Math.max(...xs)], [-plot.w / 2, plot.w / 2]);
    const ny = scaleLinear([Math.min(...ys), Math.max(...ys)], [0, -gh]);
    const nz = scaleLinear([Math.min(...zs), Math.max(...zs)], [-gdep / 2, gdep / 2]);
    const smax = Math.max(1e-9, ...m.points.map((p) => p.size ?? 0));
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.7;
    const P: P3 = (x, y, z) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k * zf) as [number, number];
    if (showAxes) {
      nodes.push(...box3d(P, t, { w: plot.w, d: gdep, h: gh }, {
        x: niceTicks(Math.min(...xs), Math.max(...xs), 5).ticks.map((v) => ({ v: nx(v), label: f(v) })),
        y: niceTicks(Math.min(...ys), Math.max(...ys), 4).ticks.map((v) => ({ v: -ny(v), label: f(v) })),
        z: niceTicks(Math.min(...zs), Math.max(...zs), 4).ticks.map((v) => ({ v: nz(v), label: f(v) })),
      }));
    }
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    const a = (az * Math.PI) / 180;
    // 远→近排序：深度 = x·sin(az) + z·cos(az)
    const ordered = [...m.points].sort((p1, p2) => (nx(p1.x) * Math.sin(a) + nz(p1.z ?? 0) * Math.cos(a)) - (nx(p2.x) * Math.sin(a) + nz(p2.z ?? 0) * Math.cos(a)));
    for (const p of ordered) {
      const [px, py] = P(nx(p.x), ny(p.y), nz(p.z ?? 0));
      const c = colors[(gi.get(p.group) ?? 0) % colors.length];
      const r = bubbles && p.size ? 3 + 5 * Math.sqrt(Math.max(0, p.size) / smax) : 4.5;
      const datum = { kind: 'point', index: 0, series: p.group, label: p.label, value: p.y, tooltip: { title: p.label, rows: [{ swatch: c, name: m.x_key || 'x', value: f(p.x) }, { name: m.y_key || 'y', value: f(p.y) }, { name: 'z', value: f(p.z ?? 0) }] } };
      nodes.push({ type: 'line', x1: px, y1: py, x2: px, y2: P(nx(p.x), 0, nz(p.z ?? 0))[1], stroke: c, strokeWidth: 0.5, opacity: 0.4 });
      nodes.push({ type: 'circle', cx: px, cy: py, r, fill: c, opacity: 0.85, datum });
      hits.push({ shape: { type: 'circle', cx: px, cy: py, r: r + 5 }, datum });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.length > 1 ? m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length] })) : [];
    return sc;
  },
};
