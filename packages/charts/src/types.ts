// 图族渲染接口（§5.5）。
import type { NumberFormat, Theme, PaletteId, ViewId, ViewSpec, Annotation } from '@virta/contracts';
import type { Scene } from '@virta/chart-core';
import type { ChartTheme } from '@virta/design-system';

export interface LayoutContext {
  width: number; height: number;
  /** 可用绘图区（由 frameStatic 扣除头部/图例/脚注后给出） */
  plot: { x: number; y: number; w: number; h: number };
  theme: Theme; palette: PaletteId; tokens: ChartTheme;
  variant?: string; mode?: string;
  options: Record<string, string | number | boolean>;
  state: ViewSpec['state'];
  format?: NumberFormat;
  annotations?: Annotation[];
  text?: ViewSpec['text'];
}
export interface ControlHint { key: string; label: string; hint: string }
export interface FamilyRenderer<M = unknown> {
  view: ViewId;
  layout(model: M, ctx: LayoutContext): Scene;
  controls?: ControlHint[];
  interactions?: ('brush' | 'drag-node' | 'rotate' | 'zoom' | 'drill' | 'play' | 'select' | 'scroll')[];
  /** 生效性解析：返回给定 variant/options 下实际生效值（含回退/自动关闭）。
   *  viewer 工具栏据此置灰不可选控件；未实现时控件全部可选。 */
  resolve?: (model: M, req: { variant?: string; options?: Record<string, string | number | boolean>; state?: ViewSpec['state'] }) => { variant: string; options: Record<string, string | number | boolean> };
  /** 期望场景高度（px）：行数驱动的图族（甘特等）按数据量要求更高画布，
   *  viewer 交互页据此撑高（页面滚动）；静态导出仍用 --height。未实现时按默认高度。 */
  preferredHeight?: (model: M, req: { width: number; variant?: string; options?: Record<string, string | number | boolean>; state?: ViewSpec['state'] }) => number | null;
  /** ADR-0009 流式视图：自然内容高度与可分页位置（标题/表格行边界，plot 相对 y）。
   *  layout 在 flow 视图下用 ctx.height = measure().height；静态分页按 breaks 拆页。 */
  measure?: (model: M, ctx: { width: number; variant?: string; options?: Record<string, string | number | boolean>; format?: NumberFormat }) => { height: number; breaks: number[] };
}
