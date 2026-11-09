// 坐标轴（§5.4 + ADR-0008）：刻度标签 muted 色、网格线（skin.grid 控制）、零基线（skin.baseline）、左上角轴标题/单位。
import type { Node } from '@virta/chart-core';
import { ellipsize, measureText, type LinearScale, type BandScale } from '@virta/chart-core';
import type { ChartTheme } from '@virta/design-system';

export interface AxisOpts { x: number; y: number; w: number; h: number }

/** y 轴：网格 + 刻度标签（左侧）。 */
export function yAxis(scale: LinearScale, o: AxisOpts, t: ChartTheme, labelFmt?: (v: number) => string): Node[] {
  const out: Node[] = [];
  const grid = t.skin.grid;
  const dash = grid === 'dash' ? [4, 3] : grid === 'dot' ? [0.6, 3] : undefined;
  const linecap = grid === 'dot' ? 'round' as const : undefined;
  for (const v of scale.ticks) {
    const py = scale(v);
    if (py < o.y - 0.5 || py > o.y + o.h + 0.5) continue;
    if (grid !== 'none') {
      out.push({ type: 'line', x1: o.x, y1: py, x2: o.x + o.w, y2: py, stroke: t.grid, strokeWidth: 1, dash, linecap });
    }
    out.push({ type: 'text', x: o.x - 8, y: py, text: (labelFmt ?? scale.fmt)(v), font: 'mono', size: 11, anchor: 'end', baseline: 'middle', fill: t.muted });
  }
  // 零基线
  const z = scale(0);
  if (t.skin.baseline.width > 0 && z >= o.y && z <= o.y + o.h) {
    out.push({ type: 'line', x1: o.x, y1: z, x2: o.x + o.w, y2: z, stroke: t[t.skin.baseline.color], strokeWidth: t.skin.baseline.width });
  }
  return out;
}

/** x 轴（band 类目）：底部刻度标签；过密按步抽样。 */
export function xAxisBand(band: BandScale, o: AxisOpts, t: ChartTheme, maxLabels = 12): Node[] {
  return xTicksFit(band.domain.filter((_, i) => i % Math.max(1, Math.ceil(band.domain.length / maxLabels)) === 0)
    .map((lab) => ({ pos: band(lab) + band.bandwidth / 2, text: lab })), o, t);
}

/**
 * H9 x 轴自适应：实测标签宽度 → ①放不下则隔 n 取一（保首尾）
 * ②仍挤则整组旋转 −45° ③再不行截断加省略号。timeOf 可选：时间刻度优先年份变化处。
 */
export function xTicksFit(values: { pos: number; text: string }[], o: AxisOpts, t: ChartTheme): Node[] {
  const W = (s: string) => measureText(s, 'mono', 11);
  const step = (vals: typeof values) => {
    const n = vals.length;
    return n > 1 ? (vals[n - 1]!.pos - vals[0]!.pos) / (n - 1) : Infinity;
  };
  // ① 稀疏：等距取点（首尾必含），相邻标签间至少留 4px 空隙
  let vals = values;
  for (let thin = 1; thin <= values.length; thin++) {
    const keep = Math.max(1, Math.ceil(values.length / thin));
    vals = [...Array(keep)].map((_, i) => values[Math.round((i * (values.length - 1)) / Math.max(1, keep - 1))]!).filter(Boolean);
    const worst = Math.max(0, ...vals.map((v) => W(v.text)));
    if (keep === 1 || step(vals) >= worst + 4) break;
  }
  const gap = step(vals);
  const rot = vals.length > 1 && Math.max(0, ...vals.map((v) => W(v.text))) > gap - 4;
  const maxW = rot ? gap * Math.SQRT2 - 4 : gap - 4;
  return vals.map((v) => {
    const text = rot || maxW < W(v.text) ? ellipsize(v.text, 'mono', 11, Math.max(24, maxW)) : v.text;
    return { type: 'text' as const, x: v.pos, y: o.y + o.h + 6, text, font: 'mono' as const, size: 11,
      anchor: (rot ? 'end' : 'middle') as 'start' | 'middle' | 'end', baseline: 'top' as const, fill: t.muted, rotate: rot ? -45 : undefined };
  });
}

/** x 轴（point/连续刻度）：按实测宽度稀疏/旋转/截断。 */
export function xAxisTicks(values: { pos: number; text: string }[], o: AxisOpts, t: ChartTheme): Node[] {
  return xTicksFit(values, o, t);
}

/** 左上角轴标题/单位。 */
export function axisTitle(text: string | undefined, o: AxisOpts, t: ChartTheme): Node[] {
  return text ? [{ type: 'text', x: o.x, y: o.y - 10, text, font: 'mono', size: 11, baseline: 'bottom', fill: t.faint }] : [];
}
