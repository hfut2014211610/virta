// 标注（§5.4）：refLine（acc 虚线+右端标签）、band（acc 8% 透明）、marker（圆点+说明）、event（时间轴竖线+顶部标签）。
import type { Annotation } from '@virta/contracts';
import type { Node } from '@virta/chart-core';
import type { ChartTheme } from '@virta/design-system';

export interface AnnotateCtx {
  plot: { x: number; y: number; w: number; h: number };
  /** 类目 → x 中心；连续 x 用 xOf(value) */
  xBand?: (label: string) => number | undefined;
  xOf?: (v: number | string) => number | undefined;
  yOf: (v: number) => number;
  format: (v: number) => string;
}

export function annotationNodes(annotations: Annotation[] | undefined, c: AnnotateCtx, t: ChartTheme): Node[] {
  const out: Node[] = [];
  for (const a of annotations ?? []) {
    if (a.type === 'refLine' && a.axis === 'y') {
      const y = c.yOf(Number(a.value));
      if (y < c.plot.y || y > c.plot.y + c.plot.h) continue;
      out.push({ type: 'line', x1: c.plot.x, y1: y, x2: c.plot.x + c.plot.w, y2: y, stroke: t.acc, strokeWidth: 1, dash: [5, 4] });
      out.push({ type: 'text', x: c.plot.x + c.plot.w - 4, y: y - 4, text: a.label ?? c.format(Number(a.value)), font: 'mono', size: 10.5, anchor: 'end', baseline: 'bottom', fill: t.acc });
    }
    if (a.type === 'band' && a.axis === 'y') {
      const y1 = c.yOf(Number(a.from)), y2 = c.yOf(Number(a.to));
      const top = Math.min(y1, y2), h = Math.abs(y1 - y2);
      out.push({ type: 'rect', x: c.plot.x, y: top, w: c.plot.w, h, fill: t.acc, opacity: 0.08 });
      if (a.label) out.push({ type: 'text', x: c.plot.x + 6, y: top + 4, text: a.label, font: 'mono', size: 10.5, baseline: 'top', fill: t.acc });
    }
    if (a.type === 'marker' && a.at) {
      const x = a.at.label !== undefined ? c.xBand?.(String(a.at.label)) : c.xOf?.(a.at.x ?? '');
      const y = a.at.y !== undefined ? c.yOf(Number(a.at.y)) : undefined;
      if (x !== undefined && y !== undefined) {
        out.push({ type: 'circle', cx: x, cy: y, r: 4, fill: t.acc });
        if (a.text) {
          out.push({ type: 'line', x1: x + 5, y1: y - 5, x2: x + 16, y2: y - 18, stroke: t.acc, strokeWidth: 1 });
          out.push({ type: 'text', x: x + 18, y: y - 22, text: a.text, font: 'body', size: 11, baseline: 'alphabetic', fill: t.acc });
        }
      }
    }
    if (a.type === 'event') {
      const x = c.xBand?.(a.at) ?? c.xOf?.(a.at);
      if (x !== undefined) {
        out.push({ type: 'line', x1: x, y1: c.plot.y, x2: x, y2: c.plot.y + c.plot.h, stroke: t.warn, strokeWidth: 1, dash: [3, 3] });
        if (a.text) out.push({ type: 'text', x: x + 4, y: c.plot.y + 2, text: a.text, font: 'mono', size: 10.5, baseline: 'top', fill: t.warn });
      }
    }
  }
  return out;
}
