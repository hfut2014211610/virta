// B3：gantt / fishbone / grid / report / pie3d / line3d / scatter3d。
import type { ViewId } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, ellipsize, measureText, niceTicks, scaleLinear, scene } from '@virta/chart-core';
import { formatNumber, type LegendItem } from '@virta/chart-skin';
import { accentFor, lerpOklch, paletteColors, rampDiverging } from '@virta/design-system';
import type { DocModel, FishboneModel, GanttModel, GridModel, Line3dModel, Pie3dModel, ScatterModel, BarlineModel } from '@virta/data-engine';
import type { FamilyRenderer, LayoutContext } from './types.js';
import { emptyDefs, styleFill } from './finish.js';
import { project3d } from './b1.js';

const fmt = (ctx: LayoutContext) => (v: number) => formatNumber(v, ctx.format, 'number');
// 甘特日期序数为 Python toordinal 纪元（1970-01-01 = 719163），转 ms 需先减偏移
const ORD_OFF = 719163;
const ISO = (ord: number) => new Date((ord - ORD_OFF) * 86400000).toISOString().slice(0, 10);

// —— gantt ——
type GanttTask = GanttModel['tasks'][number];
export const ganttRenderer: FamilyRenderer<GanttModel> = {
  view: 'gantt' as ViewId,
  interactions: ['select', 'scroll'],
  // 日历变体按周泳道排布，跨泳道依赖连线不适用 → 置灰；今日超出数据范围 → 今日线置灰；
  // 粒度仅日历有效（时间轴下置灰）；无真实日期时月历无意义 → 锁周历
  resolve(m: GanttModel, req) {
    const variant = req.variant ?? 'timeline';
    const options: Record<string, string | number | boolean> = { ...(req.options ?? {}) };
    if (variant === 'calendar') options['deps'] = false; else options['calView'] = 'week';
    if (variant === 'calendar' && m.baseOrd === null) options['calView'] = 'week';
    if (m.today === null) options['todayLine'] = false;
    return { variant, options };
  },
  // 行数驱动：按可见行（任务+组头，扣除隐藏分组）给最小行高，交互页据此外扩滚动
  preferredHeight(m: GanttModel, req) {
    const summary = req.options?.['summary'] !== false;
    const hidden = new Set((req.state?.hiddenSeries ?? []) as string[]);
    if ((req.variant ?? 'timeline') === 'calendar') {
      if (req.options?.['calView'] === 'month' && m.baseOrd !== null) {
        const mOf = (ord: number) => { const d = new Date((ord - ORD_OFF) * 86400000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
        const n = mOf(m.baseOrd + Math.max(1, m.span) - 1) - mOf(m.baseOrd) + 1;
        const dW = Math.min(840, Math.max(360, req.width) - 80) / 7;
        return Math.round(n * (49 + 6 * dW) + 80);
      }
      const off = m.baseOrd !== null ? (new Date((m.baseOrd - ORD_OFF) * 86400000).getUTCDay() + 6) % 7 : 0;
      const weeks = Math.max(1, Math.ceil((Math.max(1, m.span) + off) / 7));
      return Math.round(weeks * 40 + 80);
    }
    const vis = m.tasks.filter((k) => !hidden.has(k.group));
    const visGroups = summary ? new Set(vis.map((k) => k.group)) : null;
    const rows = vis.length + (visGroups && visGroups.size > 1 ? visGroups.size : 0);
    return Math.round(rows * 26 + 116);
  },
  layout(m: GanttModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const opt = (k: string, d: unknown) => ctx.options?.[k] ?? d;
    const variant = String(ctx.variant ?? 'timeline');
    const colorBy = String(opt('colorBy', 'group'));
    const calView = String(opt('calView', 'week'));
    const weekendShading = opt('weekendShading', true) !== false;
    const showDeps = opt('deps', true) !== false && variant !== 'calendar';
    const showToday = opt('todayLine', true) !== false;
    const showProgress = opt('progress', true) !== false;
    const showSummary = opt('summary', true) !== false;
    const baselineMark = opt('baselineMark', true) !== false;
    const varianceLabel = opt('varianceLabel', true) !== false;
    const x0 = 0, x1 = Math.max(1, m.span);
    const iso = (d: number) => (m.baseOrd !== null ? ISO(m.baseOrd + d) : `D${Math.round(d)}`);
    const gi = new Map(m.groups.map((gn, i) => [gn, i]));
    const acc = accentFor(ctx.palette, ctx.theme);
    const statusColor = (st: string | null) => st === 'done' ? t.pos : (st === 'delayed' || st === 'late') ? t.neg : (st === 'active' || st === 'doing') ? acc : t.faint;
    const taskColor = (k: { group: string; status: string | null }, i: number) => colorBy === 'status' ? statusColor(k.status) : colors[(gi.get(k.group) ?? i) % colors.length];
    // 图例点击 → hiddenSeries 隐藏整组；点击组头/任务 → state.focus 高亮该组（其余调暗）
    const hidden = new Set((ctx.state?.hiddenSeries ?? []) as string[]);
    const focus = ctx.state?.focus ?? null;
    const tasks = m.tasks.filter((k) => !hidden.has(k.group));
    const dimF = (gn: string) => (focus && gn !== focus ? 0.12 : 1);
    const labelSize = 11;
    const trunc = (s: string, w: number, size = labelSize) => {
      if (measureText(s, 'body', size) <= w) return s;
      let r = s;
      while (r.length > 1 && measureText(`${r}…`, 'body', size) > w) r = r.slice(0, -1);
      return `${r}…`;
    };
    const tip = (k: GanttTask, c: string) => {
      const rows: { swatch?: string; name: string; value: string }[] = [
        { swatch: c, name: '区间', value: `${iso(k.s)} → ${iso(k.e)}` },
        { name: '进度', value: k.progress !== null ? `${Math.round(k.progress * 100)}%` : '—' },
      ];
      if (k.baseline !== null) rows.push({ name: '基线截止', value: iso(k.baseline) });
      if (k.actual !== null) rows.push({ name: '实际完成', value: iso(k.actual) });
      else if (m.hasActual) rows.push({ name: '实际完成', value: '未上报' });
      if (k.slipDays !== null && k.slipDays !== 0) rows.push({ name: '较基线', value: `${k.slipDays > 0 ? '+' : ''}${k.slipDays} 天` });
      if (k.lateDays !== null && k.lateDays > 0) rows.push({ name: '逾期', value: `${k.lateDays} 天` });
      return { kind: 'task', index: k.i, series: k.group, label: k.label, value: k.e - k.s, tooltip: { title: `${k.label}（${k.group}）`, rows } };
    };
    // 行窗口虚拟化：行高固定（不随数据量压缩），放不下时按 state.range 切片 + 右缘滚动条
    const scrollState = () => Math.floor(Number(ctx.state?.range?.[0] ?? 0));
    const scrollUI = (total: number, page: number, start: number, sx: number, sy: number, sh: number) => {
      if (total <= page) return;
      nodes.push({ type: 'rect', x: sx, y: sy, w: 4, h: sh, r: 2, fill: t.grid });
      const th = Math.max(18, (page / total) * sh);
      nodes.push({ type: 'rect', x: sx, y: sy + (start / total) * sh, w: 4, h: Math.min(th, sh - (start / total) * sh), r: 2, fill: t.faint });
    };
    const setScroll = (sc: Scene, total: number, page: number, start: number, step = 3) => {
      (sc as { scroll?: { total: number; page: number; start: number; step?: number } }).scroll = { total, page, start, step };
    };
    // 整体进度条（时间轴画在刻度上方右侧；日历画在表头右侧）
    const drawOverall = (cx: number, cy: number, bw: number) => {
      if (!showSummary || m.counts.avg_progress === null) return;
      const pct = m.counts.avg_progress;
      nodes.push({ type: 'text', x: cx - 6, y: cy, text: '总进度', font: 'mono', size: 10, anchor: 'end', baseline: 'middle', fill: t.faint });
      nodes.push({ type: 'rect', x: cx, y: cy - 3.5, w: bw, h: 7, r: 3.5, fill: t.grid });
      nodes.push({ type: 'rect', x: cx, y: cy - 3.5, w: Math.max(3, bw * pct), h: 7, r: 3.5, fill: acc });
      nodes.push({ type: 'text', x: cx + bw + 6, y: cy, text: `${Math.round(pct * 100)}%`, font: 'mono', size: 10, baseline: 'middle', fill: t.muted });
    };

    // —— 日历变体：周一至周日 7 列；周历 = 周泳道行，月历 = 按月分块格子 ——
    if (variant === 'calendar') {
      const real = m.baseOrd !== null;
      const headH = 28;
      const top = ctx.plot.y + headH + 4, bot = ctx.plot.y + ctx.plot.h - 4;
      // 首列偏移使各列对齐周一至周日（真实日期）；相对天数则 day%7 分桶
      const dow = (d: number) => real ? (new Date((m.baseOrd! + d - ORD_OFF) * 86400000).getUTCDay() + 6) % 7 : Math.floor(d) % 7;
      const off = dow(0);
      const gridW = Math.min(1120, ctx.plot.w - 40);
      // —— 月历：按月分块（月标题 + 星期行 + 周行格，格内含日号/任务条/周末底纹/今日框）——
      if (calView === 'month' && real) {
        // 限宽后格高=格宽 → 日格近正方形，块内周行可容多行任务条
        const gw = Math.min(840, ctx.plot.w - 40);
        const gx = ctx.plot.x + (ctx.plot.w - gw) / 2;
        const dayW = gw / 7;
        const cellH = Math.round(dayW), titleH = 22, wkHeadH = 15, gapM = 12;
        const mTop = ctx.plot.y + 10, avail = bot - mTop;
        const mOf = (ord: number) => { const d = new Date((ord - ORD_OFF) * 86400000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
        const firstOrd = (mi: number) => { const y = Math.floor(mi / 12); return Date.UTC(y, mi - y * 12, 1) / 86400000 + ORD_OFF; };
        const blocks: { mi: number; ms: number; me: number; ws0: number; rows: number; bh: number }[] = [];
        for (let mi = mOf(m.baseOrd!); mi <= mOf(m.baseOrd! + x1 - 1); mi++) {
          const ms = firstOrd(mi) - m.baseOrd!, me = firstOrd(mi + 1) - 1 - m.baseOrd!;
          const ws0 = ms - dow(ms), rows = Math.ceil((dow(ms) + (me - ms + 1)) / 7);
          blocks.push({ mi, ms, me, ws0, rows, bh: titleH + wkHeadH + rows * cellH + gapM });
        }
        const page = Math.max(1, Math.floor(avail / Math.max(...blocks.map((b) => b.bh))));
        const mStart = Math.max(0, Math.min(Math.max(0, blocks.length - page), scrollState()));
        let y0 = mTop;
        for (const b of blocks.slice(mStart, mStart + page)) {
          const d0 = new Date((firstOrd(b.mi) - ORD_OFF) * 86400000);
          nodes.push({ type: 'text', x: gx, y: y0, text: `${d0.getUTCFullYear()}-${String(d0.getUTCMonth() + 1).padStart(2, '0')}`, font: 'display', size: 13, weight: 600, baseline: 'top', fill: t.ink });
          const gy = y0 + titleH;
          for (let c = 0; c < 7; c++) nodes.push({ type: 'text', x: gx + c * dayW + dayW / 2, y: gy + wkHeadH - 3, text: ['一', '二', '三', '四', '五', '六', '日'][c], font: 'mono', size: 9, anchor: 'middle', baseline: 'bottom', fill: t.faint });
          const gridY = gy + wkHeadH;
          const chipH = 6, maxSub = Math.max(1, Math.floor((cellH - 16) / 8));
          for (let w = 0; w < b.rows; w++) {
            const ws = b.ws0 + w * 7, ly = gridY + w * cellH;
            nodes.push({ type: 'line', x1: gx, y1: ly, x2: gx + gw, y2: ly, stroke: t.grid, strokeWidth: 1 });
            for (let c = 0; c < 7; c++) {
              const day = ws + c, inM = day >= b.ms && day <= b.me;
              if (!inM) nodes.push({ type: 'rect', x: gx + c * dayW, y: ly, w: dayW, h: cellH, fill: t.grid, opacity: 0.16 });
              else if (weekendShading && c >= 5) nodes.push({ type: 'rect', x: gx + c * dayW, y: ly, w: dayW, h: cellH, fill: t.grid, opacity: 0.4 });
              nodes.push({ type: 'text', x: gx + c * dayW + 4, y: ly + 3, text: String(new Date((m.baseOrd! + day - ORD_OFF) * 86400000).getUTCDate()), font: 'mono', size: 8, baseline: 'top', fill: t.muted, opacity: inM ? 1 : 0.45 });
              if (c) nodes.push({ type: 'line', x1: gx + c * dayW, y1: ly, x2: gx + c * dayW, y2: ly + cellH, stroke: t.grid, strokeWidth: 0.5 });
            }
            let slot = 0, over = 0;
            for (const k of tasks) {
              if (k.e < ws || k.s >= ws + 7) continue;
              const ds = Math.max(k.s, ws), de = Math.min(k.e, ws + 6);
              const c0 = Math.max(0, Math.floor(ds - ws)), c1 = Math.min(6, Math.floor(de - ws));
              if (slot >= maxSub) { over += 1; continue; }
              const c = taskColor(k, k.i), df = dimF(k.group);
              const cx = gx + c0 * dayW + 1, cw = Math.max(3, (c1 + 1 - c0) * dayW - 2);
              const cy = ly + 14 + slot * 8; slot += 1;
              const datum = tip(k, c);
              if (k.milestone) {
                nodes.push({ type: 'path', d: `M${cx + cw / 2} ${cy - 1} L${cx + cw / 2 + 4} ${cy + chipH / 2} L${cx + cw / 2} ${cy + chipH + 1} L${cx + cw / 2 - 4} ${cy + chipH / 2} Z`, fill: acc, opacity: df, datum });
              } else {
                nodes.push({ type: 'rect', x: cx, y: cy, w: cw, h: chipH, r: chipH / 2, fill: c, opacity: 0.35 * df, datum });
                if (showProgress && k.progress) nodes.push({ type: 'rect', x: cx, y: cy, w: Math.max(2, cw * k.progress), h: chipH, r: chipH / 2, fill: c, opacity: df, datum });
              }
              hits.push({ shape: { type: 'rect', x: cx, y: cy - 1, w: cw, h: chipH + 2 }, datum });
            }
            if (over) nodes.push({ type: 'text', x: gx + gw - 4, y: ly + cellH - 2, text: `+${over}`, font: 'mono', size: 8, anchor: 'end', baseline: 'bottom', fill: t.faint });
            if (showToday && m.today !== null && m.today >= ws && m.today < ws + 7 && m.today >= b.ms && m.today <= b.me) {
              const tc = (m.today + off) % 7;
              nodes.push({ type: 'rect', x: gx + tc * dayW + 1, y: ly + 1, w: dayW - 2, h: cellH - 2, r: 3, fill: 'none', stroke: t.warn, strokeWidth: 1.4 });
            }
          }
          const by = gridY + b.rows * cellH;
          nodes.push({ type: 'line', x1: gx, y1: by, x2: gx + gw, y2: by, stroke: t.grid, strokeWidth: 1 });
          y0 = by + gapM;
        }
        drawOverall(gx + gw - 96, mTop + 6, 36);
        scrollUI(blocks.length, page, mStart, gx + gw + 8, mTop, avail);
        const sc = scene(ctx.width, ctx.height, [g(nodes)]);
        setScroll(sc, blocks.length, page, mStart, 1);
        sc.hits = hits;
        (sc as { legend?: LegendItem[] }).legend = m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length], hidden: hidden.has(gn) }));
        return sc;
      }
      // —— 周历：周泳道行，泳道高固定 40，限宽居中，放不下按 state.range 滚动 ——
      const padLc = 58;
      const gw = Math.min(gridW - padLc, ctx.plot.w - padLc - 24);
      const gx = ctx.plot.x + padLc + Math.max(0, (ctx.plot.w - padLc - gw - 24) / 2);
      const weeks = Math.max(1, Math.ceil((x1 + off) / 7));
      const laneH = (bot - top) / weeks >= 40 ? (bot - top) / weeks : 40;
      const wPage = Math.max(1, Math.floor((bot - top) / laneH));
      const wStart = Math.max(0, Math.min(Math.max(0, weeks - wPage), scrollState()));
      const wEnd = Math.min(weeks, wStart + wPage);
      const dayW = gw / 7;
      const names = real ? ['一', '二', '三', '四', '五', '六', '日'] : ['1', '2', '3', '4', '5', '6', '7'];
      names.forEach((nm, c) => nodes.push({ type: 'text', x: gx + c * dayW + dayW / 2, y: top - 4, text: nm, font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.faint }));
      const chipH = Math.min(7, Math.max(4, laneH * 0.26));
      const maxSub = Math.max(1, Math.floor((laneH - 6) / (chipH + 2)));
      for (let w = wStart; w < wEnd; w++) {
        const ws = w * 7 - off;
        const y0 = top + (w - wStart) * laneH;
        if (w % 2) nodes.push({ type: 'rect', x: gx, y: y0, w: gw, h: laneH, fill: t.grid, opacity: 0.22 });
        nodes.push({ type: 'line', x1: gx, y1: y0, x2: gx + gw, y2: y0, stroke: t.grid, strokeWidth: 1 });
        nodes.push({ type: 'text', x: gx - 8, y: y0 + laneH / 2, text: real ? iso(Math.max(0, ws)).slice(5) : `W${w + 1}`, font: 'mono', size: 10, anchor: 'end', baseline: 'middle', fill: t.muted });
        for (let c = 0; c < 7; c++) {
          if (weekendShading && real && c >= 5) nodes.push({ type: 'rect', x: gx + c * dayW, y: y0, w: dayW, h: laneH, fill: t.grid, opacity: 0.4 });
          if (c) nodes.push({ type: 'line', x1: gx + c * dayW, y1: y0, x2: gx + c * dayW, y2: y0 + laneH, stroke: t.grid, strokeWidth: 0.5 });
        }
        let slot = 0, over = 0;
        for (const k of tasks) {
          if (k.e < ws || k.s >= ws + 7) continue;
          const ds = Math.max(k.s, ws), de = Math.min(k.e, ws + 6);
          const c0 = Math.max(0, Math.floor(ds - ws)), c1 = Math.min(6, Math.floor(de - ws));
          if (slot >= maxSub) { over += 1; continue; }
          const c = taskColor(k, k.i), df = dimF(k.group);
          const cx = gx + c0 * dayW + 1, cw = Math.max(3, (c1 + 1 - c0) * dayW - 2);
          const cy = y0 + 3 + slot * (chipH + 2); slot += 1;
          const datum = tip(k, c);
          if (k.milestone) {
            nodes.push({ type: 'path', d: `M${cx + cw / 2} ${cy - 1} L${cx + cw / 2 + 4.5} ${cy + chipH / 2} L${cx + cw / 2} ${cy + chipH + 1} L${cx + cw / 2 - 4.5} ${cy + chipH / 2} Z`, fill: acc, opacity: df, datum });
          } else {
            nodes.push({ type: 'rect', x: cx, y: cy, w: cw, h: chipH, r: chipH / 2, fill: c, opacity: 0.35 * df, datum });
            if (showProgress && k.progress) nodes.push({ type: 'rect', x: cx, y: cy, w: Math.max(2, cw * k.progress), h: chipH, r: chipH / 2, fill: c, opacity: df, datum });
          }
          hits.push({ shape: { type: 'rect', x: cx, y: cy - 1, w: cw, h: chipH + 2 }, datum });
        }
        if (over) nodes.push({ type: 'text', x: gx + gw - 4, y: y0 + laneH - 3, text: `+${over}`, font: 'mono', size: 9, anchor: 'end', baseline: 'bottom', fill: t.faint });
        if (showToday && m.today !== null && m.today >= ws && m.today < ws + 7) {
          const tc = (m.today + off) % 7;
          nodes.push({ type: 'rect', x: gx + tc * dayW + 1, y: y0 + 1, w: dayW - 2, h: laneH - 2, r: 3, fill: 'none', stroke: t.warn, strokeWidth: 1.4 });
        }
      }
      nodes.push({ type: 'line', x1: gx, y1: top + (wEnd - wStart) * laneH, x2: gx + gw, y2: top + (wEnd - wStart) * laneH, stroke: t.grid, strokeWidth: 1 });
      drawOverall(gx + gw - 96, ctx.plot.y + 9, 36);
      scrollUI(weeks, wPage, wStart, gx + gw + 8, top, (wEnd - wStart) * laneH);
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
      setScroll(sc, weeks, wPage, wStart);
      sc.hits = hits;
      (sc as { legend?: LegendItem[] }).legend = m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length], hidden: hidden.has(gn) }));
      return sc;
    }

    // —— 时间轴变体：进度汇总开 → 任务按泳道分组，组头行带小组进度条 ——
    const nameW = Math.max(...tasks.map((k) => measureText(k.label, 'body', labelSize)), ...m.groups.map((gn) => measureText(gn, 'body', labelSize) + 60));
    const padL = Math.min(210, Math.max(78, nameW + 18));
    const plot = { x: ctx.plot.x + padL, y: ctx.plot.y + 30, w: ctx.plot.w - padL - 20, h: ctx.plot.h - 50 };
    const x = scaleLinear([x0, x1], [plot.x, plot.x + plot.w]);
    type GRow = { kind: 'g'; name: string; pct: number | null; c: string } | { kind: 't'; k: GanttTask };
    const rows: GRow[] = [];
    if (showSummary && m.groups.length > 1) {
      for (const gn of m.groups) {
        const gt = tasks.filter((k) => k.group === gn);
        if (!gt.length) continue;
        const ps = gt.map((k) => k.progress).filter((p): p is number => p !== null);
        rows.push({ kind: 'g', name: gn, pct: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null, c: colors[(gi.get(gn) ?? 0) % colors.length] });
        for (const k of gt) rows.push({ kind: 't', k });
      }
    } else for (const k of tasks) rows.push({ kind: 't', k });
    // 行高固定 26，放得下则拉伸铺满，放不下按 state.range 滚动窗口
    const rowH = Math.max(26, plot.h / Math.max(1, rows.length));
    const rPage = Math.max(1, Math.floor(plot.h / rowH));
    const rStart = Math.max(0, Math.min(Math.max(0, rows.length - rPage), scrollState()));
    const vrows = rows.slice(rStart, rStart + rPage);
    const rowOf = new Map<number, number>();
    vrows.forEach((r, ri) => { if (r.kind === 't') rowOf.set(r.k.i, ri); });
    const barH = Math.min(18, rowH * 0.58);
    const cyOf = (ri: number) => plot.y + ri * rowH + rowH / 2;
    // 周末底纹（有真实日期时逐日扫描 Sat/Sun）
    if (weekendShading && m.baseOrd !== null) {
      for (let d = x0; d <= x1; d++) {
        const dow2 = new Date((m.baseOrd + d - ORD_OFF) * 86400000).getUTCDay();
        if (dow2 === 0 || dow2 === 6) nodes.push({ type: 'rect', x: x(d), y: plot.y, w: Math.max(1, x(Math.min(x1, d + 1)) - x(d)), h: plot.h, fill: t.grid, opacity: 0.4 });
      }
    }
    // 时间刻度（~8 格）
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let d = 0; d <= x1; d += step) {
      nodes.push({ type: 'line', x1: x(d), y1: plot.y, x2: x(d), y2: plot.y + plot.h, stroke: t.grid, strokeWidth: 1 });
      nodes.push({ type: 'text', x: x(d), y: plot.y - 4, text: iso(d).slice(5), font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: t.faint });
    }
    drawOverall(plot.x + plot.w - 104, plot.y - 22, 64);
    vrows.forEach((r, ri) => {
      const cy = cyOf(ri);
      if (r.kind === 'g') {
        // 组头融合：左缘色条 + 标签列内按 pct 填充的进度带，组名压其上、百分比组色靠右；点击聚焦
        const df = dimF(r.name), focused = focus === r.name;
        const colX = ctx.plot.x, colW = plot.x - 10 - colX;
        nodes.push({ type: 'rect', x: colX, y: cy - rowH / 2, w: plot.x + plot.w - colX, h: rowH, fill: r.c, opacity: (focused ? 0.14 : 0.06) * df });
        nodes.push({ type: 'rect', x: colX, y: cy - rowH / 2 + 2, w: 3, h: rowH - 4, r: 1.5, fill: r.c, opacity: df });
        if (r.pct !== null && r.pct > 0.005) nodes.push({ type: 'rect', x: colX + 3, y: cy - rowH / 2 + 3, w: Math.max(8, (colW - 6) * r.pct), h: rowH - 6, r: 4, fill: r.c, opacity: 0.22 * df });
        nodes.push({ type: 'text', x: colX + 12, y: cy, text: trunc(r.name, colW - 62), font: 'body', size: labelSize, weight: 600, baseline: 'middle', fill: t.ink, opacity: df });
        nodes.push({ type: 'text', x: colX + colW - 2, y: cy, text: r.pct !== null ? `${Math.round(r.pct * 100)}%` : '—', font: 'mono', size: 10, weight: 600, anchor: 'end', baseline: 'middle', fill: r.c, opacity: df });
        const gdatum = { kind: 'group', index: gi.get(r.name) ?? 0, series: r.name, label: r.name, tooltip: { title: `${r.name}（点击聚焦/再点取消）`, rows: [{ swatch: r.c, name: '任务', value: `${rows.filter((rr) => rr.kind === 't' && (rr as { k: GanttTask }).k.group === r.name).length} 项` }, { name: '平均进度', value: r.pct !== null ? `${Math.round(r.pct * 100)}%` : '—' }] } };
        hits.push({ shape: { type: 'rect', x: ctx.plot.x, y: cy - rowH / 2, w: plot.x + plot.w - ctx.plot.x, h: rowH }, datum: gdatum });
        return;
      }
      const k = r.k, c = taskColor(k, k.i), df = dimF(k.group);
      const s = k.s, e = k.e ?? k.s;
      nodes.push({ type: 'text', x: plot.x - 8, y: cy, text: trunc(k.label, padL - 16), font: 'body', size: labelSize, anchor: 'end', baseline: 'middle', fill: t.muted, opacity: df });
      const datum = tip(k, c);
      // A8 幽灵基线：start→baseline 的虚线空框，画在主条下方
      if (baselineMark && k.baseline !== null && !k.milestone) {
        nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2 - 3, w: Math.max(2, x(k.baseline) - x(s)), h: barH + 6, r: 4, fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [4, 3], opacity: df });
      }
      if (k.milestone) {
        nodes.push({ type: 'path', d: `M${x(s)} ${cy - 7} L${x(s) + 7} ${cy} L${x(s)} ${cy + 7} L${x(s) - 7} ${cy} Z`, fill: acc, opacity: df, datum });
      } else {
        nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, x(e) - x(s)), h: barH, r: 4, fill: c, opacity: 0.32 * df, datum });
        if (showProgress && k.progress) nodes.push({ type: 'rect', x: x(s), y: cy - barH / 2, w: Math.max(2, (x(e) - x(s)) * k.progress), h: barH, r: 4, fill: c, opacity: df, datum });
      }
      if (k.status === 'delayed' || k.status === 'late') nodes.push({ type: 'circle', cx: x(e) + 10, cy, r: 3, fill: t.neg, opacity: df });
      // A8 实际完成 ◆ 标记 / 差异标签 / 未上报
      if (k.actual !== null) {
        nodes.push({ type: 'path', d: `M${x(k.actual)} ${cy - 5} L${x(k.actual) + 5} ${cy} L${x(k.actual)} ${cy + 5} L${x(k.actual) - 5} ${cy} Z`, fill: t.ink, stroke: t.paper, strokeWidth: 1, opacity: df });
      }
      if (varianceLabel) {
        if (k.slipDays !== null && k.slipDays !== 0) {
          nodes.push({ type: 'text', x: x(e) + 16, y: cy, text: `${k.slipDays > 0 ? '+' : ''}${k.slipDays}天`, font: 'mono', size: 9, baseline: 'middle', fill: k.slipDays > 0 ? t.neg : t.pos, opacity: df });
        } else if (m.hasActual && k.actual === null && !k.milestone) {
          nodes.push({ type: 'text', x: x(e) + 16, y: cy, text: '未上报', font: 'mono', size: 9, baseline: 'middle', fill: t.faint, opacity: df });
        }
      }
      hits.push({ shape: { type: 'rect', x: plot.x, y: cy - rowH / 2, w: plot.w, h: rowH }, datum });
    });
    // 依赖连线
    if (showDeps) tasks.forEach((k) => {
      const ri2 = rowOf.get(k.i);
      if (ri2 === undefined) return;
      const cy2 = cyOf(ri2);
      for (const d of k.deps) {
        const ri1 = rowOf.get(d), src = m.tasks[d];
        if (!src || ri1 === undefined || hidden.has(src.group)) continue;
        const cy1 = cyOf(ri1);
        const x1p = x(src.e ?? src.s), x2p = x(k.s);
        nodes.push({ type: 'path', d: `M${x1p} ${cy1} L${x1p + 8} ${cy1} L${x1p + 8} ${cy2} L${x2p} ${cy2}`, fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [3, 2], opacity: Math.min(dimF(k.group), dimF(src.group)) });
      }
    });
    if (showToday && m.today !== null) nodes.push({ type: 'line', x1: x(m.today), y1: plot.y - 4, x2: x(m.today), y2: plot.y + plot.h, stroke: t.warn, strokeWidth: 1.5, dash: [5, 3] });
    scrollUI(rows.length, rPage, rStart, plot.x + plot.w + 8, plot.y, Math.min(plot.h, rPage * rowH));
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    setScroll(sc, rows.length, rPage, rStart);
    sc.hits = hits;
    (sc as { legend?: LegendItem[] }).legend = m.groups.map((gn, i) => ({ name: gn, color: colors[i % colors.length], hidden: hidden.has(gn) }));
    return sc;
  },
};

// —— fishbone ——
export const fishboneRenderer: FamilyRenderer<FishboneModel> = {
  view: 'fishbone' as ViewId,
  interactions: ['select'],
  layout(m: FishboneModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    const acc = accentFor(ctx.palette, ctx.theme);
    const left = String(ctx.options?.['direction'] ?? 'right') === 'left';
    const showLegend = ctx.options?.['legend'] !== false;
    const plot = { x: ctx.plot.x + 96, y: ctx.plot.y + 34, w: ctx.plot.w - 150, h: ctx.plot.h - 68 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const spineY = ctx.plot.y + ctx.plot.h / 2;
    const headX = plot.x + plot.w + 30;
    const focus = ctx.state?.focus;
    // 方向镜像：left 时所有 x 绕绘图区中线翻转，文本锚点对换
    const mid = ctx.plot.x + ctx.plot.w / 2;
    const fx = (x: number) => (left ? 2 * mid - x : x);
    const anch = (a: 'start' | 'end' | 'middle') => (left ? (a === 'start' ? 'end' : a === 'end' ? 'start' : a) : a);
    // 主骨 + 鱼头（凹尾箭头 + 眼点）
    nodes.push({ type: 'line', x1: fx(plot.x), y1: spineY, x2: fx(headX), y2: spineY, stroke: t.ink, strokeWidth: 3 });
    nodes.push({ type: 'path', d: `M${fx(headX)} ${spineY - 20} L${fx(headX + 50)} ${spineY} L${fx(headX)} ${spineY + 20} L${fx(headX + 16)} ${spineY} Z`, fill: acc });
    nodes.push({ type: 'circle', cx: fx(headX + 30), cy: spineY - 7, r: 2.6, fill: t.paper });
    const n = m.cats.length;
    const per = Math.ceil(n / 2);
    const ribH = plot.h * 0.38, ribDx = ribH * 0.72;
    m.cats.forEach((cat, ci) => {
      const up = ci < per;
      const slot = up ? ci : ci - per;
      const cnt = up ? per : n - per;
      const bx = plot.x + ((slot + 1) / (cnt + 1)) * plot.w;
      const by = spineY + (up ? -1 : 1) * ribH;
      const ex = bx - ribDx;
      const c = colors[ci % colors.length];
      const dim = focus != null && focus !== cat.name;
      const op = dim ? 0.22 : 1;
      const catDatum = { kind: 'cat', index: ci, series: cat.name, label: cat.name, tooltip: { title: cat.name, rows: [{ name: '原因数', value: `${cat.causes.length}` }] } };
      // 类别斜肋（~54°）+ 末端色块标签
      nodes.push({ type: 'line', x1: fx(bx), y1: spineY, x2: fx(ex), y2: by, stroke: c, strokeWidth: 2.6, opacity: op, datum: catDatum });
      const tagW = cat.name.length * 12.5 + 18;
      const tagX = left ? fx(ex) : fx(ex) - tagW;
      const tagY = by + (up ? -26 : 6);
      nodes.push({ type: 'rect', x: tagX, y: tagY, w: tagW, h: 20, r: 10, fill: c, opacity: op, datum: catDatum });
      nodes.push({ type: 'text', x: tagX + tagW / 2, y: tagY + 10, text: cat.name, font: 'body', size: 11.5, weight: 600, anchor: 'middle', baseline: 'middle', fill: t.paper, opacity: op });
      hits.push({ shape: { type: 'rect', x: Math.min(fx(ex), fx(bx)) - 8, y: Math.min(by, spineY) - 14, w: Math.abs(bx - ex) + 16, h: Math.abs(spineY - by) + 28 }, datum: catDatum });
      // 原因短横：沿肋均匀分布，向外（左）水平伸出，文字置于支线左端
      cat.causes.forEach((cause, k) => {
        const tt = (k + 1) / (cat.causes.length + 1);
        const px = bx - ribDx * tt, py = spineY + (by - spineY) * tt;
        const stub = 42;
        const tip = { kind: 'cause', index: k, series: cat.name, label: cause.label, tooltip: { title: cause.label, rows: [{ swatch: c, name: cat.name, value: cause.sub || '—' }, { name: '负责人', value: cause.owner || '—' }] } };
        nodes.push({ type: 'line', x1: fx(px), y1: py, x2: fx(px - stub), y2: py, stroke: c, strokeWidth: 1.3, opacity: op * 0.85, datum: tip });
        nodes.push({ type: 'text', x: fx(px - stub - 4), y: py - 3, text: cause.label + (cause.sub ? `/${cause.sub}` : ''), font: 'body', size: 10, anchor: anch('end'), baseline: 'bottom', fill: t.muted, opacity: op, datum: tip });
        hits.push({ shape: { type: 'rect', x: Math.min(fx(px), fx(px - stub)) - measureText(cause.label, 'body', 10) - 10, y: py - 8, w: measureText(cause.label, 'body', 10) + stub + 20, h: 16 }, datum: tip });
      });
    });
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.hits = hits;
    if (showLegend) (sc as { legend?: LegendItem[] }).legend = m.cats.map((c2, i) => ({ name: c2.name, color: colors[i % colors.length] }));
    return sc;
  },
};

// —— grid（明细 / 透视交叉表）——
export const GRID_AGGS: Record<string, { label: string; f: (vs: number[]) => number }> = {
  sum: { label: '求和', f: (vs) => vs.reduce((a, b) => a + b, 0) },
  count: { label: '计数', f: (vs) => vs.length },
  avg: { label: '均值', f: (vs) => vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length) },
  min: { label: '最小', f: (vs) => Math.min(...vs) },
  max: { label: '最大', f: (vs) => Math.max(...vs) },
};
export interface GridRowView { label: string; depth: number; head?: boolean; vals: (number | null)[] }
export interface PivotView { colDim: string; colVals: string[]; rowDims: string[]; extraDims: string[]; body: GridRowView[]; grand: (number | null)[] }

/** 行维度 ≤2 级（组头=小计）× 列维度 1 级 × 度量×聚合 的静态交叉表。
 *  列维度取除首维外基数最小者；列值 >8 按合计收拢为「其他」；多余维度页脚注明。
 *  viewer flow-table 与 gridRenderer 共用（ADR-0009：DOM/SVG 同一 model 语义）。 */
export function pivotView(m: GridModel, aggKey: string, showTotals: boolean): PivotView | null {
  if (m.dims.length < 2 || !m.measures.length) return null;
  const agg = GRID_AGGS[aggKey] ?? GRID_AGGS['sum']!;
  const distinct = (d: string) => m.columns.find((c) => c.key === d)?.distinct ?? Infinity;
  const colDim = m.dims.slice(1).reduce((a, b) => (distinct(a) <= distinct(b) ? a : b));
  const rest = m.dims.filter((d) => d !== colDim);
  const rowDims = rest.slice(0, 2);
  const extraDims = rest.slice(2);
  const M = m.measures.length;
  const seen = new Map<string, number>();
  for (const r of m.rows) {
    const k = String(r[colDim] ?? '—');
    let s = 0;
    for (const me of m.measures) { const v = Number(r[me]); if (Number.isFinite(v)) s += v; }
    seen.set(k, (seen.get(k) ?? 0) + s);
  }
  let colVals = [...seen.keys()];
  let top: Set<string> | null = null;
  if (colVals.length > 8) {
    top = new Set([...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k));
    colVals = [...colVals.filter((k) => top!.has(k)), '其他'];
  }
  const colKey = (r: Record<string, number | string | null>) => {
    const v = String(r[colDim] ?? '—');
    return top && !top.has(v) ? '其他' : v;
  };
  const nCols = colVals.length * M + (showTotals ? M : 0);
  const colIdx = new Map<string, number>();
  colVals.forEach((cv, i) => m.measures.forEach((me, j) => colIdx.set(`${cv}|${me}`, i * M + j)));
  if (showTotals) m.measures.forEach((me, j) => colIdx.set(`*|${me}`, colVals.length * M + j));
  type Cells = number[][];
  const newCells = () => Array.from({ length: nCols }, () => [] as number[]);
  interface G1 { all: Cells; subs: Map<string, Cells> }
  const groups = new Map<string, G1>();
  const grand: Cells = newCells();
  for (const r of m.rows) {
    const g1 = String(r[rowDims[0]!] ?? '—');
    let e = groups.get(g1);
    if (!e) { e = { all: newCells(), subs: new Map() }; groups.set(g1, e); }
    const g2 = rowDims[1] ? String(r[rowDims[1]] ?? '—') : null;
    let sub: Cells | undefined;
    if (g2 !== null) { sub = e.subs.get(g2); if (!sub) { sub = newCells(); e.subs.set(g2, sub); } }
    const cv = colKey(r);
    const targets = sub ? [e.all, grand, sub] : [e.all, grand];
    for (const me of m.measures) {
      const v = Number(r[me]);
      if (!Number.isFinite(v)) continue;
      for (const cells of targets) {
        cells[colIdx.get(`${cv}|${me}`)!]!.push(v);
        if (showTotals) cells[colIdx.get(`*|${me}`)!]!.push(v);
      }
    }
  }
  const valOf = (cells: Cells) => cells.map((vs) => (vs.length ? agg.f(vs) : null));
  const body: GridRowView[] = [];
  for (const [g1, e] of groups) {
    if (rowDims[1]) {
      body.push({ label: g1, depth: 0, head: true, vals: valOf(e.all) });
      for (const [g2, cells] of e.subs) body.push({ label: g2, depth: 1, vals: valOf(cells) });
    } else body.push({ label: g1, depth: 0, vals: valOf(e.all) });
  }
  return { colDim, colVals, rowDims, extraDims, body, grand: valOf(grand) };
}

export const gridRenderer: FamilyRenderer<GridModel> = {
  view: 'grid' as ViewId,
  interactions: ['scroll'],
  resolve(m: GridModel, req) {
    const want = String(req.variant ?? m.mode);
    return { variant: want === 'pivot' && m.mode === 'pivot' ? 'pivot' : 'detail', options: { ...(req.options ?? {}) } };
  },
  preferredHeight(m: GridModel, req) {
    const compact = String(req.options?.['density'] ?? 'comfort') === 'compact';
    const pageSize = Math.max(5, Number(req.options?.['pageSize'] ?? 50));
    const rowH = compact ? 18 : 24;
    const pivot = String(req.variant ?? m.mode) === 'pivot' && m.mode === 'pivot';
    const showTotals = req.options?.['showTotals'] !== false;
    const headH = pivot && m.measures.length > 1 ? 44 : 30;
    const n = pivot ? (pivotView(m, String(req.options?.['agg'] ?? 'sum'), showTotals)?.body.length ?? m.rows.length) : m.rows.length;
    // +128 ≈ 卡片框头部/脚注开销（≈75）+ 表内上下边距/页脚带/取整余量，保证 pageSize 行完整落进 plot
    return Math.round(headH + Math.min(n, pageSize) * rowH + (showTotals ? rowH : 0) + 128);
  },
  // ADR-0009：自然高度 = 全量行（不受 pageSize 限）；breaks 为各行边界（plot 相对 y）
  measure(m: GridModel, req) {
    const compact = String(req.options?.['density'] ?? 'comfort') === 'compact';
    const rowH = compact ? 18 : 24;
    const showTotals = req.options?.['showTotals'] !== false;
    const pivot = String(req.variant ?? m.mode) === 'pivot' && m.mode === 'pivot';
    const headH = pivot && m.measures.length > 1 ? 44 : 30;
    const n = pivot ? (pivotView(m, String(req.options?.['agg'] ?? 'sum'), showTotals)?.body.length ?? m.rows.length) : m.rows.length;
    const breaks = Array.from({ length: n }, (_, i) => 8 + headH + (i + 1) * rowH);
    return { height: Math.round(8 + headH + n * rowH + (showTotals ? rowH : 0) + 20), breaks };
  },
  layout(m: GridModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const compact = String(ctx.options?.['density'] ?? 'comfort') === 'compact';
    const pageSize = Math.max(5, Number(ctx.options?.['pageSize'] ?? 50));
    const showTotals = ctx.options?.['showTotals'] !== false;
    const zebra = ctx.options?.['zebra'] !== false;
    const f = fmt(ctx);
    // 合计行显式千分位（auto 会把 53550/53672 都压成 5.4万）；用户指定格式时从指定
    const fTot = (v: number) => (ctx.format && ctx.format.style && ctx.format.style !== 'auto' ? f(v) : formatNumber(v, { style: 'thousands' }));
    const scrollState = () => Math.floor(Number(ctx.state?.range?.[0] ?? 0));
    const setScroll = (sc: Scene, total: number, page: number, start: number, step = 5) => {
      (sc as { scroll?: { total: number; page: number; start: number; step?: number } }).scroll = { total, page, start, step };
    };
    const scrollUI = (total: number, page: number, start: number, sx: number, sy: number, sh: number) => {
      if (total <= page) return;
      nodes.push({ type: 'rect', x: sx, y: sy, w: 4, h: sh, r: 2, fill: t.grid });
      const th = Math.max(18, (page / total) * sh);
      nodes.push({ type: 'rect', x: sx, y: sy + (start / total) * sh, w: 4, h: Math.min(th, sh - (start / total) * sh), r: 2, fill: t.faint });
    };
    const x0 = ctx.plot.x + 8, w = ctx.plot.w - 16, footH = 20;
    const bodyBot = ctx.plot.y + ctx.plot.h - footH;
    let y = ctx.plot.y + 8;
    const pv = String(ctx.variant ?? m.mode) === 'pivot' && m.mode === 'pivot'
      ? pivotView(m, String(ctx.options?.['agg'] ?? 'sum'), showTotals) : null;

    // —— 明细 ——
    if (!pv) {
      const totalLabel = `合计（全部 ${m.rows.length} 行）`;
      const colW = m.columns.map((c, i) => Math.min(220, Math.max(70,
        measureText(c.key, 'mono', 11) + 30,
        i === 0 ? measureText(totalLabel, 'mono', 10.5) + 16 : 0)));
      const totW = colW.reduce((a, b) => a + b, 0);
      const scale = Math.min(1, w / Math.max(1, totW));
      const rowH = (compact ? 18 : 24) * scale, headH = 30;
      nodes.push({ type: 'rect', x: x0, y, w, h: headH, fill: acc, opacity: 0.12 });
      let x = x0;
      m.columns.forEach((c, i) => {
        nodes.push({ type: 'text', x: c.numeric ? x + colW[i] * scale - 6 : x + 6, y: y + headH / 2, text: ellipsize(c.key, 'mono', 11, colW[i] * scale - 12), font: 'mono', size: 11, weight: 600, anchor: c.numeric ? 'end' : 'start', baseline: 'middle', fill: t.ink });
        x += colW[i] * scale;
      });
      y += headH;
      nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.ink, strokeWidth: 1.2 });
      const page = Math.max(1, Math.min(pageSize, Math.floor((bodyBot - y - (showTotals ? rowH : 0) - 2) / Math.max(14, rowH))));
      const start = Math.max(0, Math.min(Math.max(0, m.rows.length - page), scrollState()));
      const end = Math.min(m.rows.length, start + page);
      m.rows.slice(start, end).forEach((r, ri) => {
        x = x0;
        if (zebra && ri % 2) nodes.push({ type: 'rect', x: x0, y, w, h: rowH, fill: t.grid, opacity: 0.8 });
        const cells: { name: string; value: string }[] = [];
        m.columns.forEach((c, i) => {
          const v = r[c.key];
          const txt = v === null || v === undefined ? '—' : c.numeric ? f(Number(v)) : String(v);
          cells.push({ name: c.key, value: txt });
          nodes.push({ type: 'text', x: c.numeric ? x + colW[i] * scale - 6 : x + 6, y: y + rowH / 2, text: ellipsize(txt, 'mono', 10.5, colW[i] * scale - 12), font: 'mono', size: 10.5, anchor: c.numeric ? 'end' : 'start', baseline: 'middle', fill: t.muted });
          x += colW[i] * scale;
        });
        hits.push({ shape: { type: 'rect', x: x0, y, w, h: rowH }, datum: { kind: 'row', index: start + ri, label: `第 ${start + ri + 1} 行`, tooltip: { title: `第 ${start + ri + 1} 行`, rows: cells.slice(0, 8) } } });
        y += rowH;
        nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.grid, strokeWidth: 0.5 });
      });
      if (showTotals && m.columns.some((c) => c.numeric) && m.rows.length > 1) {
        x = x0;
        nodes.push({ type: 'rect', x: x0, y, w, h: rowH, fill: acc, opacity: 0.12 });
        nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.ink, strokeWidth: 1 });
        m.columns.forEach((c, i) => {
          if (c.numeric) {
            const sum = m.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
            nodes.push({ type: 'text', x: x + colW[i] * scale - 6, y: y + rowH / 2, text: fTot(sum), font: 'mono', size: 10.5, weight: 600, anchor: 'end', baseline: 'middle', fill: t.ink });
          } else if (i === 0) nodes.push({ type: 'text', x: x + 6, y: y + rowH / 2, text: totalLabel, font: 'mono', size: 10.5, weight: 600, baseline: 'middle', fill: t.ink });
          x += colW[i] * scale;
        });
        y += rowH;
      }
      nodes.push({ type: 'text', x: x0, y: bodyBot - 2, text: `第 ${end ? start + 1 : 0}–${end} 行 · 共 ${m.rows.length} 行${m.n_raw > m.rows.length ? `（原始 ${m.n_raw} 行已截断）` : ''}`, font: 'mono', size: 10, baseline: 'bottom', fill: t.faint });
      scrollUI(m.rows.length, page, start, x0 + w + 2, ctx.plot.y + 38, Math.min(bodyBot - ctx.plot.y - 38, page * rowH));
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
      setScroll(sc, m.rows.length, page, start);
      sc.hits = hits;
      return sc;
    }

    // —— 透视交叉表 ——
    const M = m.measures.length;
    const showSub = M > 1;
    const headH = showSub ? 44 : 30;
    const labelW = Math.min(220, Math.max(90,
      ...pv.body.map((r) => measureText(r.label, 'body', 11) + 26 + r.depth * 12),
      measureText(`${pv.rowDims.join('/')} × ${pv.colDim}`, 'mono', 11) + 16));
    const valW = Math.min(120, Math.max(56,
      ...m.measures.map((me) => measureText(me, 'mono', 9.5) + 14),
      ...pv.colVals.map((cv) => measureText(cv, 'mono', 10.5) / M + 14)));
    const totW = labelW + valW * (pv.colVals.length * M + (showTotals ? M : 0));
    const scale = Math.min(1, w / Math.max(1, totW));
    const lw = labelW * scale, vw = valW * scale;
    const rowH = compact ? 18 : 24;
    nodes.push({ type: 'rect', x: x0, y, w, h: headH, fill: acc, opacity: 0.12 });
    nodes.push({ type: 'text', x: x0 + 8, y: y + headH / 2, text: ellipsize(`${pv.rowDims.join(' / ')} × ${pv.colDim}`, 'mono', 10.5, lw - 16), font: 'mono', size: 10.5, weight: 600, baseline: 'middle', fill: t.ink });
    let x = x0 + lw;
    const headCell = (cx: number, cvw: number, label: string, bold: boolean) => {
      nodes.push({ type: 'text', x: cx + cvw / 2, y: y + (showSub ? 12 : headH / 2), text: ellipsize(label, 'mono', 10.5, cvw - 8), font: 'mono', size: 10.5, weight: bold ? 600 : 400, anchor: 'middle', baseline: 'middle', fill: t.ink });
      if (showSub) m.measures.forEach((me, j) => nodes.push({ type: 'text', x: cx + j * vw + vw / 2, y: y + 34, text: ellipsize(me, 'mono', 9.5, vw - 8), font: 'mono', size: 9.5, anchor: 'middle', baseline: 'middle', fill: t.muted }));
    };
    pv.colVals.forEach((cv) => { headCell(x, vw * M, cv, true); x += vw * M; });
    if (showTotals) headCell(x, vw * M, '合计', true);
    y += headH;
    nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.ink, strokeWidth: 1.2 });
    const bodyTop = y;
    const page = Math.max(1, Math.min(pageSize, Math.floor((bodyBot - bodyTop - (showTotals ? rowH : 0) - 2) / rowH)));
    const start = Math.max(0, Math.min(Math.max(0, pv.body.length - page), scrollState()));
    const end = Math.min(pv.body.length, start + page);
    pv.body.slice(start, end).forEach((r, ri) => {
      if (zebra && ri % 2 && !r.head) nodes.push({ type: 'rect', x: x0, y, w, h: rowH, fill: t.grid, opacity: 0.8 });
      if (r.head) nodes.push({ type: 'rect', x: x0, y, w, h: rowH, fill: acc, opacity: 0.1 });
      nodes.push({ type: 'text', x: x0 + 8 + r.depth * 14, y: y + rowH / 2, text: ellipsize(r.label, 'body', 11, lw - 16 - r.depth * 14), font: 'body', size: 11, weight: r.head ? 600 : 400, baseline: 'middle', fill: r.head ? t.ink : t.muted });
      let x2 = x0 + lw;
      r.vals.forEach((v, ci) => {
        const colCv = ci < pv.colVals.length * M ? pv.colVals[Math.floor(ci / M)]! : null;
        const colMe = m.measures[ci % M]!;
        nodes.push({ type: 'text', x: x2 + vw - 6, y: y + rowH / 2, text: v === null ? '—' : f(v), font: 'mono', size: 10.5, anchor: 'end', baseline: 'middle', fill: r.head ? t.ink : t.muted });
        hits.push({ shape: { type: 'rect', x: x2, y, w: vw, h: rowH }, datum: { kind: 'cell', index: ri * r.vals.length + ci, label: `${r.label} × ${colCv ?? '合计'}`, value: v ?? undefined, tooltip: { title: `${r.label} × ${colCv ?? '合计'}${showSub ? ` · ${colMe}` : ''}`, rows: [{ name: GRID_AGGS[String(ctx.options?.['agg'] ?? 'sum')]?.label ?? '求和', value: v === null ? '—' : f(v) }] } } });
        x2 += vw;
      });
      y += rowH;
      nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.grid, strokeWidth: 0.5 });
    });
    if (showTotals) {
      nodes.push({ type: 'rect', x: x0, y, w, h: rowH, fill: acc, opacity: 0.12 });
      nodes.push({ type: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, stroke: t.ink, strokeWidth: 1 });
      nodes.push({ type: 'text', x: x0 + 8, y: y + rowH / 2, text: '合计', font: 'body', size: 11, weight: 600, baseline: 'middle', fill: t.ink });
      let x2 = x0 + lw;
      pv.grand.forEach((v) => {
        nodes.push({ type: 'text', x: x2 + vw - 6, y: y + rowH / 2, text: v === null ? '—' : fTot(v), font: 'mono', size: 10.5, weight: 600, anchor: 'end', baseline: 'middle', fill: t.ink });
        x2 += vw;
      });
      y += rowH;
    }
    const aggLabel = GRID_AGGS[String(ctx.options?.['agg'] ?? 'sum')]?.label ?? '求和';
    const extra = pv.extraDims.length ? ` · 未入透视：${pv.extraDims.join('、')}` : '';
    nodes.push({ type: 'text', x: x0, y: bodyBot - 2, text: `第 ${end ? start + 1 : 0}–${end} 行 · 共 ${pv.body.length} 行 · ${aggLabel}(${m.measures.join('/')})${extra}`, font: 'mono', size: 10, baseline: 'bottom', fill: t.faint });
    scrollUI(pv.body.length, page, start, x0 + w + 2, bodyTop, Math.min(bodyBot - bodyTop, page * rowH));
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    setScroll(sc, pv.body.length, page, start);
    sc.hits = hits;
    return sc;
  },
};

// —— report（文档报告：DocModel → SVG 排版）——
// 断行禁则：闭口标点不置行首、开口标点不留行尾；拉丁/数字整词不可断（31.5% 不拆行）
const NO_LINE_START = new Set('，。、；：？！％‰…·—）】》」』’”.,;:!?)]}%"'.split(''));
const NO_LINE_END = new Set('（【《「『“‘([{'.split(''));
export function wrapText(text: string, font: 'body' | 'display' | 'mono', size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const part of text.split('\n')) {
    // 分词：空白独立；CJK/全角逐字；拉丁/数字等窄字符连成整词
    const tokens: string[] = [];
    let cur = '';
    for (const ch of part) {
      const cp = ch.codePointAt(0)!;
      if (/\s/.test(ch)) { if (cur) { tokens.push(cur); cur = ''; } if (tokens[tokens.length - 1] !== ' ') tokens.push(' '); }
      else if (cp >= 0x2e80) { if (cur) { tokens.push(cur); cur = ''; } tokens.push(ch); }
      else cur += ch;
    }
    if (cur) tokens.push(cur);
    // 开口标点并入后一个词，避免滞留行尾
    const merged: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i]!;
      merged.push(NO_LINE_END.has(tk) && i + 1 < tokens.length ? tk + tokens[++i]! : tk);
    }
    let line = '';
    for (const tk of merged) {
      if (tk === ' ') {
        if (line && measureText(line + ' ', font, size) <= maxW) line += ' ';
        continue;
      }
      if (measureText(tk, font, size) > maxW) {
        // 整词超行宽：逐字硬拆
        for (const ch of tk) {
          if (line && measureText(line + ch, font, size) > maxW) { out.push(line); line = ''; }
          line += ch;
        }
        continue;
      }
      if (!line || measureText(line + tk, font, size) <= maxW) { line += tk; continue; }
      if (NO_LINE_START.has(tk)) { line += tk; continue; }
      out.push(line.replace(/ +$/, ''));
      line = tk;
    }
    if (line) out.push(line.replace(/ +$/, ''));
    if (!part) out.push('');
  }
  return out.length ? out : [''];
}
export const reportRenderer: FamilyRenderer<DocModel> = {
  view: 'report' as ViewId,
  // 自然高度（与 layout 同口径，不截断）+ 块级分页位置
  measure(m: DocModel, req) {
    const fs = Math.max(12, Math.min(18, Number(req.options?.['fontSize'] ?? 15)));
    const k = fs / 15;
    const W = Math.min(req.options?.['wide'] === true ? 980 : 720, req.width - 120);
    const wrapLen = (text: string, size: number) => Math.max(1, wrapText(text, 'body', size, W).length);
    const breaks: number[] = [];
    let y = 10;
    if (m.metrics.length) { breaks.push(y); y += Math.ceil(m.metrics.length / Math.min(4, m.metrics.length)) * 72 + 10; }
    for (const b of m.blocks) {
      breaks.push(y);
      const bt = b as { type: string; text?: string; level?: number; items?: { text: string }[]; rows?: string[][]; head?: string[]; paras?: string[] };
      if (bt.type === 'heading') {
        const size = (bt.level === 1 ? 24 : bt.level === 2 ? 18 : 15) * k;
        y += (bt.level === 1 ? 10 : 6) + wrapLen(bt.text ?? '', size) * size * 1.3;
      } else if (bt.type === 'list' && bt.items) y += bt.items.reduce((a, it) => a + wrapLen(`· ${it.text}`, 12.5 * k) * 19 * k, 0);
      else if (bt.type === 'table' && bt.rows?.length) y += (bt.rows.length + 1) * 22 * k + 8;
      else if (bt.type === 'quote' && bt.paras) y += bt.paras.reduce((a, p) => a + wrapLen(p, 12.5 * k) * 19 * k, 0) + 6;
      else if (bt.type === 'code' && bt.text) y += bt.text.split('\n').length * 17 * k + 12;
      else if (bt.type === 'hr') y += 18;
      else if (bt.text) y += (/^!\[/.test(bt.text.trim()) ? 36 : wrapLen(bt.text, 13 * k) * 21 * k + 5);
    }
    return { height: Math.round(y + 20), breaks };
  },
  preferredHeight(m, req) {
    return reportRenderer.measure!(m, req).height + 40; // +40 ≈ 卡片框开销
  },
  layout(m: DocModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens;
    const acc = accentFor(ctx.palette, ctx.theme);
    const fs = Math.max(12, Math.min(18, Number(ctx.options?.['fontSize'] ?? 15)));
    const k = fs / 15;
    const W = Math.min(ctx.options?.['wide'] === true ? 980 : 720, ctx.plot.w - 40);
    let x = ctx.plot.x + (ctx.plot.w - W) / 2, y = ctx.plot.y + 10;
    const wrap = (text: string, size: number, font: 'body' | 'display') => wrapText(text, font, size, W);
    // ADR-0009：分页窗口（静态分页时只输出落在 [offset, offset+height) 的块）
    const flow = (ctx as { flow?: { offset: number; height: number } }).flow;
    const winY0 = flow?.offset ?? -Infinity, winY1 = flow ? flow.offset + flow.height : Infinity;
    const blocks: { y0: number; y1: number; nodes: Node[] }[] = [];
    // F2：[文字](url) → 显示文字 + 节点 link（仅 http(s)/mailto；其余协议剥掉链接）
    const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    const linksOf = (raw: string) => {
      const links = new Map<string, string>();
      const text = raw.replace(LINK_RE, (_m, label: string, url: string) => { if (/^(https?:|mailto:)/i.test(url)) links.set(label, url); return label; });
      return { text, links };
    };
    const emitLn = (arr: Node[], ln: string, links: Map<string, string>, n: Omit<Extract<Node, { type: 'text' }>, 'type' | 'text'>) => {
      let link: string | undefined;
      for (const [label, url] of links) if (ln.includes(label)) { link = url; break; }
      arr.push({ type: 'text', ...n, text: ln, ...(link ? { link } : {}), ...(link ? { fill: acc } : {}) });
    };
    // —— 指标卡（全部指标，不再限 8 个）——
    if (m.metrics.length) {
      const y0 = y;
      const bn: Node[] = [];
      const perRow = Math.min(4, m.metrics.length);
      const cw = (W - (perRow - 1) * 12) / perRow;
      m.metrics.forEach((mt, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const mx = x + col * (cw + 12), my = y + row * 72;
        bn.push({ type: 'rect', x: mx, y: my, w: cw, h: 62, r: 10, fill: t.grid, opacity: 0.4 });
        const label = mt.label ?? '指标';
        const labelTxt = measureText(label, 'mono', 10.5) > cw - 20 ? label.slice(0, Math.max(2, Math.floor((cw - 20) / 10.5))) : label;
        bn.push({ type: 'text', x: mx + 10, y: my + 12, text: labelTxt, font: 'mono', size: 10.5 * k, baseline: 'top', fill: t.muted });
        const vtxt = `${mt.value_text}${mt.unit}`;
        const vw = measureText(vtxt, 'display', 19 * k);
        const vs = vw > cw - 20 ? Math.max(11, 19 * k * (cw - 20) / vw) : 19 * k;
        bn.push({ type: 'text', x: mx + 10, y: my + 42, text: vtxt, font: 'display', size: vs, weight: 600, baseline: 'middle', fill: t.ink });
      });
      y += Math.ceil(m.metrics.length / perRow) * 72 + 10;
      blocks.push({ y0: y0 - ctx.plot.y, y1: y - ctx.plot.y, nodes: bn });
    }
    for (const b of m.blocks) {
      const y0 = y;
      if (!flow && y > ctx.plot.y + ctx.plot.h - 30) break; // 交互态仍按画布截断（HTML 端走 flow-doc DOM）
      if (flow && y0 > winY1) break; // 已越过本页窗口
      const bn: Node[] = [];
      const bt = b as { type: string; text?: string; level?: number; items?: { text: string }[]; rows?: string[][]; head?: string[]; paras?: string[]; lang?: string };
      if (bt.type === 'heading') {
        const size = (bt.level === 1 ? 24 : bt.level === 2 ? 18 : 15) * k;
        y += bt.level === 1 ? 10 : 6;
        for (const ln of wrap(bt.text ?? '', size, 'display')) { bn.push({ type: 'text', x, y, text: ln, font: 'display', size, weight: 600, baseline: 'top', fill: t.ink }); y += size * 1.3; }
      } else if (bt.type === 'list' && bt.items) {
        for (const it of bt.items) {
          const { text, links } = linksOf(it.text);
          for (const ln of wrap(`· ${text}`, 12.5 * k, 'body')) { emitLn(bn, ln, links, { x: x + 10, y, font: 'body', size: 12.5 * k, baseline: 'top', fill: t.muted }); y += 19 * k; }
        }
      } else if (bt.type === 'table' && bt.rows?.length) {
        const trows = [bt.head ?? [], ...bt.rows];
        const cols = Math.max(...trows.map((r) => r.length));
        const cw = W / cols;
        trows.forEach((r, ri) => {
          r.forEach((cell, ci) => {
            if (ri === 0) bn.push({ type: 'rect', x: x + ci * cw, y, w: cw, h: 22 * k, fill: t.grid, opacity: 0.4 });
            const { text: ct, links } = linksOf(cell ?? '');
            const cn: Node = { type: 'text', x: x + ci * cw + 5, y: y + 11 * k, text: ct, font: 'mono', size: 10.5 * k, baseline: 'middle', fill: ri === 0 ? t.ink : t.muted };
            for (const [label, url] of links) if (ct === label || ct.includes(label)) { cn.link = url; cn.fill = acc; break; }
            bn.push(cn);
          });
          y += 22 * k;
          bn.push({ type: 'line', x1: x, y1: y, x2: x + W, y2: y, stroke: t.grid, strokeWidth: 0.5 });
        });
        y += 8;
      } else if (bt.type === 'quote' && bt.paras) {
        const qh = bt.paras.reduce((a, p) => a + wrap(p, 12.5 * k, 'body').length, 0) * 19 * k;
        for (const para of bt.paras) for (const ln of wrap(para, 12.5 * k, 'body')) { bn.push({ type: 'text', x: x + 10, y, text: ln, font: 'body', size: 12.5 * k, baseline: 'top', fill: t.faint }); y += 19 * k; }
        bn.push({ type: 'rect', x: x - 2, y: y - qh - 2, w: 3, h: qh + 4, fill: acc });
        y += 6;
      } else if (bt.type === 'code' && bt.text) {
        const lines = bt.text.split('\n');
        bn.push({ type: 'rect', x: x + 4, y: y - 2, w: W - 8, h: lines.length * 17 * k + 8, r: 6, fill: t.grid, opacity: 0.35 });
        for (const ln of lines) { bn.push({ type: 'text', x: x + 12, y: y + 3, text: ln, font: 'mono', size: 11 * k, baseline: 'top', fill: t.muted }); y += 17 * k; }
        y += 12;
      } else if (bt.type === 'hr') {
        bn.push({ type: 'line', x1: x, y1: y + 8, x2: x + W, y2: y + 8, stroke: t.grid, strokeWidth: 1 }); y += 18;
      } else if (bt.text) {
        // 图片引用 ![alt](src)：离线产物不加载外链，画占位框 + 说明
        const img = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(bt.text.trim());
        if (img) {
          const ih = 26;
          bn.push({ type: 'rect', x, y, w: W, h: ih, r: 6, fill: t.grid, opacity: 0.35, stroke: t.line2, strokeWidth: 0.8 });
          bn.push({ type: 'rect', x: x + 8, y: y + 6, w: 18, h: 14, r: 2, fill: 'none', stroke: t.faint, strokeWidth: 1.2 });
          bn.push({ type: 'circle', cx: x + 13, cy: y + 10.5, r: 1.8, fill: 'none', stroke: t.faint, strokeWidth: 1 });
          bn.push({ type: 'path', d: `M${x + 9.5} ${y + 18} l5 -5 4 4 3 -3 4.5 4 Z`, fill: t.faint, opacity: 0.5 });
          bn.push({ type: 'text', x: x + 34, y: y + ih / 2, text: ellipsize(`图片未内嵌（离线）：${img[1] || img[2] || '图片'}`, 'mono', 10.5, W - 44), font: 'mono', size: 10.5, baseline: 'middle', fill: t.faint });
          y += ih + 10;
        } else {
          const { text, links } = linksOf(bt.text);
          for (const ln of wrap(text, 13 * k, 'body')) { emitLn(bn, ln, links, { x, y, font: 'body', size: 13 * k, baseline: 'top', fill: t.muted }); y += 20 * k; }
          y += 4;
        }
      }
      if (bn.length) blocks.push({ y0: y0 - ctx.plot.y, y1: y - ctx.plot.y, nodes: bn });
    }
    const nodes = blocks.filter((bl) => bl.y1 > winY0 && bl.y0 < winY1).flatMap((bl) => bl.nodes);
    const sc = scene(ctx.width, flow ? flow.height : ctx.height, [g(nodes, flow ? { transform: [1, 0, 0, 1, 0, -flow.offset] } : undefined)]);
    return sc;
  },
};

// —— pie3d：多层环（沿用 2D 环 + 深度偏移）——
export const pie3dRenderer: FamilyRenderer<Pie3dModel> = {
  view: 'pie3d' as ViewId,
  interactions: ['select'],
  layout(m: Pie3dModel, ctx: LayoutContext): Scene {
    const t = ctx.tokens, colors = paletteColors(ctx.palette, ctx.theme);
    // 伪 3D 单饼：椭圆压扁 + 外缘厚度侧壁；多层数据按标签合并为一个饼
    const R = Math.min(ctx.plot.w, ctx.plot.h) / 2 - 34;
    const defs = emptyDefs();
    const k = 0.55, WALL = ctx.options?.['wall'] === false ? 0 : Math.min(30, R * 0.26);
    const cx = ctx.plot.x + ctx.plot.w / 2, cy = ctx.plot.y + ctx.plot.h / 2;
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const sliceLabels = ctx.options?.['sliceLabels'] !== false;
    // 跨层按标签合并扇区
    const agg = new Map<string, number>();
    for (const layer of m.layers) for (const s of layer.slices) agg.set(s.label, (agg.get(s.label) ?? 0) + s.value);
    const total = Math.max(1e-9, [...agg.values()].reduce((a, b) => a + b, 0));
    const slices = [...agg.entries()].map(([label, value]) => ({ label, value, share: value / total }));
    const P = (r: number, a: number, h: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a) * k - h).toFixed(2)}`;
    const eArc = (r: number, a0: number, a1: number, h: number, sweep: 0 | 1) =>
      `A${r.toFixed(2)} ${(r * k).toFixed(2)} 0 ${a1 - a0 > Math.PI ? 1 : 0} ${sweep} ${P(r, a1, h)}`;
    const parts: { label: string; value: number; share: number; i: number; a0: number; a1: number; c: string }[] = [];
    let a = -Math.PI / 2;
    slices.forEach((s, i) => {
      const a1 = a + s.share * Math.PI * 2 * (slices.length === 1 ? 0.9999 : 1);
      parts.push({ ...s, i, a0: a, a1, c: colors[i % colors.length] });
      a = a1;
    });
    // 侧壁（先画）：观察者一侧（sin(a)>0）的外缘垂帘，压暗柱色
    for (const pt of parts) {
      const dark = lerpOklch(t.ink, pt.c, 0.52);
      const spans: [number, number][] = [
        [Math.max(pt.a0, 0), Math.min(pt.a1, Math.PI)],
        [Math.max(pt.a0, 2 * Math.PI), Math.min(pt.a1, 3 * Math.PI)],
      ];
      for (const [wa, wb] of spans) {
        if (wb - wa < 0.02) continue;
        nodes.push({ type: 'path', d: `M${P(R, wa, 0)} ${eArc(R, wa, wb, 0, 1)} L${P(R, wb, -WALL)} ${eArc(R, wb, wa, -WALL, 0)} Z`, fill: dark });
      }
    }
    // 顶面（后画）：椭圆扇区 + 标签 + 命中；select 聚焦其余扇区调光
    const focus = ctx.state?.focus;
    for (const pt of parts) {
      const dim = focus !== undefined && focus !== null && focus !== pt.label;
      const datum = { kind: 'slice', index: pt.i, series: pt.label, label: pt.label, value: pt.value, tooltip: { title: pt.label, rows: [{ swatch: pt.c, name: '值', value: f(pt.value), share: `${(pt.share * 100).toFixed(1)}%` }] } };
      nodes.push({ type: 'path', d: `M${P(R, pt.a0, 0)} ${eArc(R, pt.a0, pt.a1, 0, 1)} L${P(0, pt.a1, 0)} ${eArc(0, pt.a0, pt.a1, 0, 0)} Z`, fill: styleFill(defs, ctx, pt.c, Math.round(pt.a0 * 1000)), opacity: dim ? 0.16 : 1, datum });
      const am = (pt.a0 + pt.a1) / 2, rm = R * 0.62;
      const tx = cx + rm * Math.cos(am), ty = cy + rm * Math.sin(am) * k;
      if (sliceLabels && pt.share > 0.06) {
        nodes.push({ type: 'text', x: tx, y: ty, text: `${pt.label} ${(pt.share * 100).toFixed(0)}%`, font: 'mono', size: 10, anchor: 'middle', baseline: 'middle', fill: t.paper });
      }
      hits.push({ shape: { type: 'circle', cx: tx, cy: ty, r: Math.max(16, R * 0.2) }, datum });
    }
    const sc = scene(ctx.width, ctx.height, [g(nodes)]);
    sc.defs = defs;
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
    const ribbon = opt('ribbon', true) !== false;
    const floorOn = opt('floorGrid', true) !== false, axesOn = opt('axes3d', true) !== false;
    // 与 2D line 对齐的样式选项（dots 旧键兼容：dots=false → marker=none）
    const lineStyle = String(opt('lineStyle', 'smooth'));
    const lw = Number(opt('lineWidth', '2.4')) || 2.4;
    const marker = String(opt('marker', opt('dots', true) !== false ? 'circle' : 'none'));
    const hatch = opt('hatch', false) === true;
    const endLabels = opt('endLabels', false) === true;
    const dash = hatch ? [6, 3] : undefined;
    const win = String(opt('window', 'all'));
    const winIdx = (n: number): [number, number] =>
      win === 'first6' ? [0, Math.min(6, n)] : win === 'last6' ? [Math.max(0, n - 6), n] : win === 'last12' ? [Math.max(0, n - 12), n] : [0, n];
    const az = Number(ctx.state?.azimuth ?? 40), ti = Number(ctx.state?.tilt ?? 28), zf = Number(ctx.state?.zoom ?? 1);
    const plot = { x: ctx.plot.x + 56, y: ctx.plot.y + 34, w: ctx.plot.w - 130, h: ctx.plot.h - 100 };
    const nodes: Node[] = [];
    const hits: Scene['hits'] = [];
    const f = fmt(ctx);
    const fp = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
    // 线形 → 屏幕空间路径（中点平滑 / 阶梯 / 直线，与 2D line 同观感）
    const pathD = (pts: [number, number][], st: string): string => {
      if (pts.length < 2) return pts.length ? `M${fp(pts[0])}` : '';
      if (st === 'step') {
        let d = `M${fp(pts[0])}`;
        for (let i = 1; i < pts.length; i++) {
          const mx = (pts[i - 1][0] + pts[i][0]) / 2;
          d += ` L${mx.toFixed(2)} ${pts[i - 1][1].toFixed(2)} L${mx.toFixed(2)} ${pts[i][1].toFixed(2)} L${fp(pts[i])}`;
        }
        return d;
      }
      if (st === 'smooth' && pts.length > 2) {
        const mid = (i: number) => `${((pts[i][0] + pts[i + 1][0]) / 2).toFixed(2)} ${((pts[i][1] + pts[i + 1][1]) / 2).toFixed(2)}`;
        let d = `M${fp(pts[0])} L${mid(0)}`;
        for (let i = 1; i < pts.length - 1; i++) d += ` Q${fp(pts[i])} ${mid(i)}`;
        return `${d} L${fp(pts[pts.length - 1])}`;
      }
      return pts.map((p, i) => `${i ? 'L' : 'M'}${fp(p)}`).join(' ');
    };
    const mark = (x: number, y: number, c: string, r: number): Node[] => {
      if (marker === 'none') return [];
      if (marker === 'square') return [{ type: 'path', d: `M${(x - r).toFixed(1)} ${(y - r).toFixed(1)} h${(2 * r).toFixed(1)} v${(2 * r).toFixed(1)} h${(-2 * r).toFixed(1)} Z`, fill: c }];
      if (marker === 'diamond') return [{ type: 'path', d: `M${x.toFixed(1)} ${(y - r * 1.35).toFixed(1)} L${(x + r * 1.35).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + r * 1.35).toFixed(1)} L${(x - r * 1.35).toFixed(1)} ${y.toFixed(1)} Z`, fill: c }];
      return [{ type: 'circle', cx: x, cy: y, r, fill: c }];
    };
    // —— curve 变体：x/y/z 连续坐标的三维空间轨迹 ——
    if (m.curve) {
      const gh = plot.h * 0.55, gdep = plot.h * 0.35;
      const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.7;
      const allPts = m.curve.series.flatMap((s) => s.points);
      const xs = allPts.map((p) => p.x), ys = allPts.map((p) => p.y), zs = allPts.map((p) => p.z);
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
      const multi = m.curve.series.length > 1;
      const sc = scene(ctx.width, ctx.height, [g(nodes)]);
      m.curve.series.forEach((cs, si) => {
        const c = colors[si % colors.length];
        const cEnd = multi ? c : c1;
        const cStart = multi ? lerpOklch(t.paper, c, 0.55) : c0;
        const [w0, w1] = winIdx(cs.points.length);
        const cps = cs.points.slice(w0, w1);
        const pts = cps.map((p) => ({ p, xy: P(nx(p.x), ny(p.y), nz(p.z)), base: P(nx(p.x), 0, nz(p.z)) }));
        if (!pts.length) return;
        // 飘带填充：轨迹到地面投影的垂帘面（与 bands 变体同法）
        if (ribbon) {
          nodes.push({ type: 'path', d: `${pathD(pts.map((pt) => pt.xy), lineStyle)} ${pts.map((pt) => `L${pt.base[0].toFixed(2)} ${pt.base[1].toFixed(2)}`).reverse().join(' ')} Z`, fill: c, opacity: 0.13 });
        }
        // 地面投影（轨迹的影子）
        if (floorOn) {
          nodes.push({ type: 'path', d: pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.base[0].toFixed(2)} ${pt.base[1].toFixed(2)}`).join(' '), fill: 'none', stroke: t.faint, strokeWidth: 1, dash: [3, 4], opacity: 0.6 });
        }
        // 轨迹：沿行进方向线性渐变（defs 渐变描边），线形/线宽/纹理与 2D 一致
        sc.defs.gradients.push({ id: `traj${si}`, x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: cStart }, { offset: 1, color: cEnd }] });
        nodes.push({ type: 'path', d: pathD(pts.map((pt) => pt.xy), lineStyle), fill: 'none', stroke: { ref: `traj${si}` }, strokeWidth: lw, dash });
        if (marker !== 'none') {
          for (const { xy, p } of pts) {
            nodes.push({ type: 'line', x1: xy[0], y1: xy[1], x2: xy[0], y2: P(nx(p.x), 0, nz(p.z))[1], stroke: c, strokeWidth: 0.5, opacity: 0.35 });
            nodes.push(...mark(xy[0], xy[1], c, 3));
          }
        }
        // 起/终点标记 + 端点数值
        const first = pts[0].xy, last = pts[pts.length - 1].xy;
        nodes.push({ type: 'circle', cx: first[0], cy: first[1], r: 5, fill: 'none', stroke: cStart, strokeWidth: 1.6 });
        nodes.push({ type: 'circle', cx: last[0], cy: last[1], r: 5, fill: cEnd });
        if (endLabels) nodes.push({ type: 'text', x: last[0], y: last[1] - 10, text: f(cps[cps.length - 1].y), font: 'mono', size: 10, anchor: 'middle', baseline: 'bottom', fill: cEnd });
        for (const { xy, p } of pts) {
          hits.push({ shape: { type: 'circle', cx: xy[0], cy: xy[1], r: 8 }, datum: { kind: 'point', index: si, label: p.label, value: p.y, tooltip: { title: multi ? `${cs.name} · ${p.label}` : p.label, rows: [{ swatch: c, name: m.curve!.cx_key, value: f(p.x) }, { name: m.curve!.cy_key, value: f(p.y) }, { name: m.curve!.cz_key, value: f(p.z) }] } } });
        }
      });
      sc.hits = hits;
      if (multi) (sc as { legend?: LegendItem[] }).legend = m.curve.series.map((s, i) => ({ name: s.name, color: colors[i % colors.length] }));
      return sc;
    }
    const [w0, w1] = winIdx(m.labels.length);
    const labels = m.labels.slice(w0, w1);
    const wvals = (s: { values: (number | null)[] }) => s.values.slice(w0, w1).map((v) => v ?? 0);
    const vmax = Math.max(1, ...m.series.flatMap((s) => wvals(s)));
    const gw = plot.w / Math.max(1, labels.length - 1), gd = Math.min(90, plot.h * 0.2), gh = plot.h * 0.55;
    const depth = Math.max(1, m.series.length - 1) * gd;
    const cx0 = ctx.plot.x + ctx.plot.w / 2, cy0 = ctx.plot.y + ctx.plot.h * 0.7;
    const P: P3 = (x, y, z) => project3d(x, y, z, az, ti).map((k, i) => (i ? cy0 : cx0) + k * zf) as [number, number];
    const zc = (si: number) => si * gd - depth / 2;
    // 坐标框 + 三轴刻度
    const ytks = niceTicks(0, vmax, 4).ticks.map((v) => ({ v: (v / vmax) * gh, label: f(v) }));
    const step = Math.max(1, Math.ceil(labels.length / 8));
    const xtks = labels.filter((_, i) => i % step === 0).map((_, i) => ({ v: i * step * gw - plot.w / 2, label: String(labels[i * step]) }));
    const ztks = m.series.map((s, si) => ({ v: zc(si), label: s.name }));
    nodes.push(...box3d(P, t, { w: plot.w, d: depth + gd, h: gh }, { x: xtks, y: ytks, z: ztks }, { floor: floorOn, axes: axesOn }));
    // 系列折线（远→近）
    for (let si = m.series.length - 1; si >= 0; si--) {
      const s = m.series[si], c = colors[si % colors.length], z = zc(si);
      const vs = wvals(s);
      const pts = vs.map((v, i) => P(i * gw - plot.w / 2, -(Math.max(0, v) / vmax) * gh, z));
      if (ribbon) {
        const base = pts.map((_, i) => P(i * gw - plot.w / 2, 0, z));
        nodes.push({ type: 'path', d: `${pathD(pts, lineStyle)} ${base.map((p) => `L${p[0].toFixed(2)} ${p[1].toFixed(2)}`).reverse().join(' ')} Z`, fill: c, opacity: 0.14 });
      }
      nodes.push({ type: 'path', d: pathD(pts, lineStyle), fill: 'none', stroke: c, strokeWidth: lw, dash });
      nodes.push(...pts.flatMap(([px, py]) => mark(px, py, c, 2.6)));
      if (endLabels && pts.length) {
        const [ex, ey] = pts[pts.length - 1];
        nodes.push({ type: 'text', x: ex + 6, y: ey - 4, text: f(vs[vs.length - 1]), font: 'mono', size: 9, anchor: 'start', baseline: 'bottom', fill: c });
      }
      pts.forEach(([px, py], i) => hits.push({ shape: { type: 'circle', cx: px, cy: py, r: 8 }, datum: { kind: 'point', index: i, series: s.name, label: labels[i], value: vs[i], tooltip: { title: `${s.name} · ${labels[i]}`, rows: [{ swatch: c, name: '值', value: f(vs[i]) }] } } }));
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
