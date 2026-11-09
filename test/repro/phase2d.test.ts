// M2d.0 复现锚点：PHASE_2D.md §1 的 D5/D6/D8，每个 it.fails 对应当前缺陷。
// 修复完成后把对应 it.fails 改为 it 并保持转绿（同 phase2a/2b 的锚点机制）。
import { describe, expect, it } from 'vitest';
import * as core from '@virta/chart-core';
import { scaleLinear, type Node, type Scene } from '@virta/chart-core';
import { ADAPTERS } from '@virta/data-engine';
import { getRenderer } from '@virta/charts';
import { resolveTheme } from '@virta/design-system';
import type { Table, ViewSpec } from '@virta/contracts';

const ctxOf = (w = 1200, h = 675, extra: Record<string, unknown> = {}) => ({
  width: w, height: h,
  plot: { x: 20, y: 20, w: w - 40, h: h - 40 },
  theme: 'light' as const, palette: 'signal' as const,
  tokens: resolveTheme('light'),
  options: {}, state: undefined,
  ...extra,
}) as never;

const table = (columns: string[], rows: Record<string, unknown>[]): Table =>
  ({ columns, rows, source: { name: 'repro.csv', format: 'csv' as const, rows: rows.length } });

const adapt = (view: string, t: Table, spec: Partial<ViewSpec> = {}) =>
  ADAPTERS[view as never]!.adapt(t, { version: 1, view: view as never, ...spec } as ViewSpec).model;

/** 深度优先收集场景内全部节点（g 的 children 递归展开）。 */
const walk = (sc: Scene): Node[] => {
  const out: Node[] = [];
  const f = (n: Node) => { out.push(n); (n as { children?: Node[] }).children?.forEach(f); };
  sc.root.children.forEach(f);
  return out;
};

describe('D8 treemap squarify 面积保真（H11，M2d.2 修复）', () => {
  it('flat：每矩形面积 = 值占比 × 画布面积（≤0.5%），总和 = 画布面积', () => {
    const rows = [
      { label: 'A', value: 120 }, { label: 'B', value: 80 }, { label: 'C', value: 60 },
      { label: 'D', value: 40 }, { label: 'E', value: 20 }, { label: 'F', value: 10 },
    ];
    const m = adapt('treemap', table(['label', 'value'], rows));
    const sc = getRenderer('treemap')!.layout(m, ctxOf(1200, 675, { variant: 'flat' }));
    // treemap plot = ctx.plot 内缩 {x+6,y+6,w-12,h-12}
    const plotW = 1160 - 12, plotH = 635 - 12, plotArea = plotW * plotH;
    const rects = walk(sc).filter((n) => n.type === 'rect' && (n.datum as { kind?: string })?.kind === 'tile')
      .map((n) => n as Node & { x: number; y: number; w: number; h: number });
    const total = rows.reduce((a, r) => a + r.value, 0);
    expect(rects.length).toBe(rows.length);
    let sum = 0;
    for (const r of rects) {
      sum += r.w * r.h;
      const target = ((r.datum as { value: number }).value / total) * plotArea;
      expect(Math.abs(r.w * r.h - target) / target, `「${(r.datum as { label: string }).label}」面积偏差`).toBeLessThanOrEqual(0.005);
    }
    expect(Math.abs(sum - plotArea) / plotArea).toBeLessThanOrEqual(0.005);
    // 非退化：退化成单行满高条带（现状缺陷形态）时平均长宽比远超 3
    const avgAspect = rects.reduce((a, r) => a + Math.max(r.w, r.h) / Math.max(0.01, Math.min(r.w, r.h)), 0) / rects.length;
    expect(avgAspect).toBeLessThanOrEqual(3);
  });

  it('sample-treemap 1200×675：叶子矩形平均长宽比 ≤3', () => {
    const rows = [
      { 大区: '华东', 城市: '上海', 销售额: 120 }, { 大区: '华东', 城市: '杭州', 销售额: 80 }, { 大区: '华东', 城市: '南京', 销售额: 60 },
      { 大区: '华南', 城市: '深圳', 销售额: 150 }, { 大区: '华南', 城市: '广州', 销售额: 95 },
      { 大区: '华北', 城市: '北京', 销售额: 110 }, { 大区: '华北', 城市: '天津', 销售额: 45 },
    ];
    const m = adapt('treemap', table(['大区', '城市', '销售额'], rows));
    const sc = getRenderer('treemap')!.layout(m, ctxOf());
    const rects = walk(sc).filter((n) => n.type === 'rect' && (n.datum as { kind?: string })?.kind === 'tile')
      .map((n) => n as Node & { w: number; h: number });
    expect(rects.length).toBe(7);
    const aspects = rects.map((r) => Math.max(r.w, r.h) / Math.max(0.01, Math.min(r.w, r.h)));
    const avg = aspects.reduce((a, b) => a + b, 0) / aspects.length;
    expect(avg).toBeLessThanOrEqual(3);
  });
});

describe('D6 值域零界（H10，M2d.2 修复）', () => {
  it('paddedDomain：全正/全负 clamp 于零界，跨零不钳', () => {
    const pd = (core as unknown as { paddedDomain?: (min: number, max: number, o?: { pad?: number; zero?: string }) => [number, number] }).paddedDomain;
    expect(typeof pd).toBe('function');
    // 全正：朴素留白会越过 0 → clamp 到 0；不越界时保留留白
    expect(pd!(10, 500, { zero: 'clamp' })[0]).toBe(0);
    const [lo2, hi2] = pd!(100, 200, { zero: 'clamp' });
    expect(lo2).toBeLessThan(100); expect(lo2).toBeGreaterThan(0); expect(hi2).toBeGreaterThan(200);
    // 全负：上界 clamp 到 0
    expect(pd!(-500, -10, { zero: 'clamp' })[1]).toBe(0);
    // 跨零：两端正常留白，不钳
    const [lo4, hi4] = pd!(-50, 80, { zero: 'clamp' });
    expect(lo4).toBeLessThan(-50); expect(hi4).toBeGreaterThan(80);
  });

  it('paddedDomain：include 恒含 0；free 不钳；单点退化为区间', () => {
    const pd = (core as unknown as { paddedDomain?: (min: number, max: number, o?: { pad?: number; zero?: string }) => [number, number] }).paddedDomain;
    expect(typeof pd).toBe('function');
    const [lo, hi] = pd!(100, 200, { zero: 'include' });
    expect(lo).toBeLessThanOrEqual(0); expect(hi).toBeGreaterThanOrEqual(200);
    const [, hiN] = pd!(-200, -100, { zero: 'include' });
    expect(hiN).toBeGreaterThanOrEqual(0);
    const [loF] = pd!(10, 500, { zero: 'free' });
    expect(loF).toBeLessThan(0);
    const [loS, hiS] = pd!(5, 5, { zero: 'clamp' });
    expect(loS).toBeLessThanOrEqual(5); expect(hiS).toBeGreaterThanOrEqual(5); expect(loS).toBeGreaterThanOrEqual(0);
    const [loE, hiE] = pd!(0, 0, { zero: 'include' });
    expect(loE).toBeLessThan(0.5); expect(hiE).toBeGreaterThan(0);
  });
});

describe('D5 堆叠面积底边（§4.2，M2d.2 修复）', () => {
  it('第 k 层填充底边 = 前 k−1 层累加值换算后的像素位置', () => {
    const rows = [{ m: '1月', a: 10, b: 5 }, { m: '2月', a: 20, b: 8 }, { m: '3月', a: 15, b: 12 }];
    const m = adapt('line', table(['m', 'a', 'b'], rows)) as { series: { name: string; values: (number | null)[] }[] };
    const sc = getRenderer('line')!.layout(m, ctxOf(1200, 675, { options: { fill: 'stack' } }));
    // line plot：ctx.plot 内缩 padL56/padR18/padT22/padB34 → {x:76,y:42,w:1086,h:579}
    // vMax = 各标签正向累计最大值 = max(15, 28, 27) = 28；值域走 paddedDomain(include)
    const y = scaleLinear(core.paddedDomain(0, 28, { zero: 'include' }), [42 + 579, 42]);
    const fills = walk(sc).filter((n) =>
      n.type === 'path' && typeof n.fill === 'object' && n.fill !== null && (n.fill as { ref?: string }).ref === 'area1',
    ) as (Node & { d: string })[];
    expect(fills.length).toBeGreaterThan(0);
    const tail = fills[0]!.d.match(/L(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) Z$/);
    expect(tail, `面积路径缺少闭合底边：${fills[0]!.d.slice(-60)}`).not.toBeNull();
    const b1 = Number(tail![2]), b0 = Number(tail![4]);
    // 第 2 层（系列 b）底边 = 第 1 层（系列 a）逐点累计值：首点 a=10 → y(10)，末点 a=15 → y(15)
    expect(b0).toBeCloseTo(y(10), 1);
    expect(b1).toBeCloseTo(y(15), 1);
  });
});
