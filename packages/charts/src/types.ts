// 图族渲染接口（§5.5）。
import type { NumberFormat, Theme, PaletteId, ViewId, ViewSpec, Annotation } from '@virta/contracts';
import type { Scene } from '@virta/chart-core';
import type { ThemeTokens } from '@virta/design-system';

export interface LayoutContext {
  width: number; height: number;
  /** 可用绘图区（由 frameStatic 扣除头部/图例/脚注后给出） */
  plot: { x: number; y: number; w: number; h: number };
  theme: Theme; palette: PaletteId; tokens: ThemeTokens;
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
  interactions?: ('brush' | 'drag-node' | 'rotate' | 'zoom' | 'drill' | 'play')[];
}
