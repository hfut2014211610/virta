// 坐标轴（§5.4 + ADR-0008）：刻度标签 muted 色、网格线（skin.grid 控制）、零基线（skin.baseline）、左上角轴标题/单位。
import type { Node } from '@virta/chart-core';
import type { LinearScale, BandScale } from '@virta/chart-core';
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
  const out: Node[] = [];
  const step = Math.max(1, Math.ceil(band.domain.length / maxLabels));
  band.domain.forEach((lab, i) => {
    if (i % step) return;
    const cx = band(lab) + band.bandwidth / 2;
    out.push({ type: 'text', x: cx, y: o.y + o.h + 6, text: lab, font: 'mono', size: 11, anchor: 'middle', baseline: 'top', fill: t.muted });
  });
  return out;
}

/** x 轴（point/连续刻度）。 */
export function xAxisTicks(values: { pos: number; text: string }[], o: AxisOpts, t: ChartTheme): Node[] {
  return values.map((v) => ({ type: 'text' as const, x: v.pos, y: o.y + o.h + 6, text: v.text, font: 'mono' as const, size: 11, anchor: 'middle' as const, baseline: 'top' as const, fill: t.muted }));
}

/** 左上角轴标题/单位。 */
export function axisTitle(text: string | undefined, o: AxisOpts, t: ChartTheme): Node[] {
  return text ? [{ type: 'text', x: o.x, y: o.y - 10, text, font: 'mono', size: 11, baseline: 'bottom', fill: t.faint }] : [];
}
