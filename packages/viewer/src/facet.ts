// spec.facet 小多图（M6）：按列值切分子表 → 网格面板布局 → 可选共享值域。
// 静态渲染（cli/render.ts）与浏览器运行期（viewer/runtime.ts）共用本模块。
import type { Node, Scene } from '@virta/chart-core';
import { g, scene as mkScene } from '@virta/chart-core';
import type { LayoutContext, FamilyRenderer } from '@virta/charts';

/** 支持分面的视图（bar/line/scatter/histogram/compare，§M6）。 */
export const FACETABLE = new Set<string>(['bar', 'line', 'scatter', 'histogram', 'compare']);

/** 各视图共享值域 → 注入 renderer ctx.options 的键。 */
function sharedRange(view: string, models: unknown[]): Record<string, number> {
  const ms = models as {
    series?: { values: number[] }[];
    bins?: { count: number }[]; groups?: { bins: { count: number }[]; n: number }[];
    items?: { from: number; to: number }[]; points?: { x: number; y: number }[];
  }[];
  const flat = (f: (m: (typeof ms)[number]) => number[]) => ms.flatMap(f);
  if (view === 'bar' || view === 'line' || view === 'combo') {
    const vs = flat((m) => (m.series ?? []).flatMap((s) => s.values));
    return { yMax: Math.max(0, ...vs) * 1.08 || 1, yMin: Math.min(0, ...vs) };
  }
  if (view === 'histogram') {
    const vs = flat((m) => (m.groups && m.groups.length > 1 ? m.groups : [{ bins: m.bins ?? [], n: 1 }])
      .flatMap((gr) => gr.bins.map((b) => b.count / Math.max(1, gr.n ?? 1))));
    return { yMax: Math.max(...vs, 0) * 1.08 || 1 };
  }
  if (view === 'compare') {
    const vs = flat((m) => (m.items ?? []).flatMap((i) => [i.from, i.to]));
    return { vLo: Math.min(0, ...vs), vHi: Math.max(...vs) };
  }
  if (view === 'scatter') {
    const xs = flat((m) => (m.points ?? []).map((p) => p.x));
    const ys = flat((m) => (m.points ?? []).map((p) => p.y));
    return { xMin: Math.min(0, ...xs), xMax: Math.max(1, ...xs), yMin: Math.min(0, ...ys), yMax: Math.max(1, ...ys) };
  }
  return {};
}

/**
 * 小多图布局：subs = [{name: 分面值, model}]。
 * 每面板 18px 标题带 + renderer.layout（plot=单元格）。
 */
export function facetLayout(
  view: string,
  renderer: FamilyRenderer<never>,
  subs: { name: string; model: unknown }[],
  ctx: LayoutContext,
  sharedScale: boolean,
  columns?: number,
): Scene {
  const t = ctx.tokens;
  const n = Math.max(1, subs.length);
  const cols = Math.min(6, Math.max(1, columns ?? Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const titleH = 20, gap = 12;
  const cw = (ctx.plot.w - gap * (cols - 1)) / cols;
  const ch = (ctx.plot.h - gap * (rows - 1)) / rows;
  const rng = sharedScale ? sharedRange(view, subs.map((s) => s.model)) : {};
  const sc = mkScene(ctx.width, ctx.height, []);
  subs.forEach((s, i) => {
    const cx = ctx.plot.x + (i % cols) * (cw + gap);
    const cy = ctx.plot.y + Math.floor(i / cols) * (ch + gap);
    const title: Node = {
      type: 'text', x: cx + cw / 2, y: cy + 3, text: s.name, font: 'body',
      size: 11.5, weight: 600, anchor: 'middle', baseline: 'top', fill: t.ink,
    };
    const sub = renderer.layout(s.model as never, {
      ...ctx,
      plot: { x: cx, y: cy + titleH, w: cw, h: ch - titleH },
      options: { ...(ctx.options ?? {}), ...rng },
    } as never);
    sc.root.children.push(g([title, ...sub.root.children]));
    sc.hits.push(...sub.hits);
    sc.defs.gradients.push(...sub.defs.gradients);
    sc.defs.radials.push(...sub.defs.radials);
    sc.defs.patterns.push(...sub.defs.patterns);
    sc.defs.clips.push(...sub.defs.clips);
    if (i === 0) {
      const lg = (sub as { legend?: unknown }).legend;
      if (lg) (sc as { legend?: unknown }).legend = lg;
    }
  });
  return sc;
}

/** 按分面列把 rows 分组（保持首现顺序）。 */
export function facetGroups<R extends Record<string, unknown>>(rows: R[], column: string): { name: string; rows: R[] }[] {
  const map = new Map<string, R[]>();
  for (const r of rows) {
    const k = String(r[column] ?? '—');
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.entries()].map(([name, rs]) => ({ name, rows: rs }));
}
