// 图例（§5.4）：静态版作为 Scene 节点（色块 + 名称），交互版由 viewer 渲染 DOM chip。
import type { Node } from '@virta/chart-core';
import { measureText } from '@virta/chart-core';
import type { ThemeTokens } from '@virta/design-system';

export interface LegendItem { name: string; color: string; hidden?: boolean }

/** 静态图例：水平排列，超宽换行。返回节点与消耗高度。 */
export function legendNodes(items: LegendItem[], x: number, y: number, maxW: number, t: ThemeTokens): { nodes: Node[]; height: number } {
  const nodes: Node[] = [];
  let cx = x, cy = y, rowH = 16;
  for (const it of items) {
    const w = 10 + 6 + measureText(it.name, 'body', 11) + 14;
    if (cx + w > x + maxW && cx > x) { cx = x; cy += rowH + 4; }
    nodes.push({ type: 'rect', x: cx, y: cy + 3, w: 10, h: 10, r: 2, fill: it.color, opacity: it.hidden ? 0.25 : 1 });
    nodes.push({ type: 'text', x: cx + 16, y: cy + 8, text: it.name, font: 'body', size: 11, baseline: 'middle', fill: it.hidden ? t.faint : t.muted });
    cx += w;
  }
  return { nodes, height: cy - y + rowH };
}
