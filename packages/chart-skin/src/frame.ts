// 静态卡片框 frameStatic（§5.4）：card 框 = 标题/副标题/最多3条洞察/图例/脚注 + 图表；
// chart 框 = 仅绘图区。产出新的外层 Scene（内嵌图位子 Scene 以 group 包裹）。
import type { Insight, ViewSpec } from '@virta/contracts';
import type { Node, Scene } from '@virta/chart-core';
import { g, scene } from '@virta/chart-core';
import type { ChartTheme } from '@virta/design-system';
import { legendNodes, type LegendItem } from './legend.js';

export interface FrameOpts {
  text?: ViewSpec['text'];
  insights?: Insight[];
  legend?: LegendItem[];
  theme: ChartTheme;
  frame?: 'card' | 'chart';
  /** 图表绘制区（card 模式下自动扣除头部/脚部） */
  plotWidth?: number; plotHeight?: number;
}

export interface Framed { scene: Scene; plot: { x: number; y: number; w: number; h: number } }

/** 输出 {scene, plot}：调用方用 plot 矩形做图表 layout，再把子节点挂到 scene.root。 */
export function frameStatic(width: number, height: number, opts: FrameOpts): Framed {
  const { text, insights = [], legend, theme, frame = 'card' } = opts;
  if (frame === 'chart' || (!text?.title && !text?.subtitle && !legend?.length && !insights.length && !text?.source && !text?.unit)) {
    const sc = scene(width, height, []);
    return { scene: sc, plot: { x: 0, y: 0, w: width, h: height } };
  }
  const pad = 20;
  const head: Node[] = [];
  let y = pad + 4;
  if (text?.title) {
    head.push({ type: 'text', x: pad, y, text: text.title, font: 'display', size: 20, weight: 600, baseline: 'top', fill: theme.ink });
    y += 28;
  }
  if (text?.subtitle) {
    head.push({ type: 'text', x: pad, y, text: text.subtitle, font: 'body', size: 12, baseline: 'top', fill: theme.muted });
    y += 20;
  }
  for (const ins of insights.slice(0, 3)) {
    head.push({ type: 'text', x: pad, y, text: `· ${ins.text}`, font: 'body', size: 11.5, baseline: 'top', fill: theme.faint });
    y += 17;
  }
  y += 6;
  const foot: Node[] = [];
  const footBits = [text?.source, text?.unit].filter(Boolean).join(' · ');
  const footH = footBits ? 22 : 8;
  const legendH = legend?.length ? legendNodes(legend, pad, 0, width - pad * 2, theme).height + 8 : 0;
  const plot = { x: pad, y: y + legendH, w: width - pad * 2, h: Math.max(60, height - y - legendH - footH - pad) };
  const sc = scene(width, height, [g(head)]);
  if (legend?.length) {
    const ln = legendNodes(legend, pad, y, width - pad * 2, theme);
    sc.root.children.push(g(ln.nodes));
  }
  if (footBits) {
    foot.push({ type: 'text', x: pad, y: height - 14, text: footBits, font: 'mono', size: 10.5, baseline: 'bottom', fill: theme.faint });
    sc.root.children.push(g(foot));
  }
  return { scene: sc, plot };
}
