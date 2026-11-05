// contracts v1 · §4.4 ViewSpec
import type { ViewId } from './views.js';

export type Theme = 'light' | 'dark';
export type PaletteId =
  | 'signal' | 'cinnabar' | 'patina' | 'blueprint' | 'inkwash'
  | 'mono' | 'sundown' | 'dunhuang' | 'aurora' | 'morandi';

export interface ViewSpec {
  version: 1;
  view: ViewId | 'auto';
  /** 如 bar: grouped|stacked|pct|pareto|waterfall */
  variant?: string;
  /** 强制输入模式，如 heatmap: calendar|matrix */
  mode?: string;
  /** role → 列名，覆盖自动识别 */
  mapping?: Record<string, string | string[]>;
  theme?: Theme;
  palette?: PaletteId;
  /** 必须在 contract.options 中声明 */
  options?: Record<string, string | number | boolean>;
  state?: Partial<ViewState>;
  text?: { title?: string; subtitle?: string; note?: string; source?: string; unit?: string };
  annotations?: Annotation[];
  format?: NumberFormat;
  facet?: { column: string; columns?: number; sharedScale?: boolean };
  layout?: 'read' | 'edit';
  /** 静态导出尺寸（CSS px），默认 1200×675 */
  size?: { width: number; height: number };
}

export type Annotation =
  | { type: 'refLine'; axis: 'x' | 'y' | 'y2'; value: number | string; label?: string }
  | { type: 'band'; axis: 'x' | 'y'; from: number | string; to: number | string; label?: string }
  | { type: 'marker'; at: { label?: string; series?: string; x?: number | string; y?: number }; text: string }
  | { type: 'event'; at: string; text: string };

export interface NumberFormat {
  style?: 'auto' | 'raw' | 'thousands' | 'wan' | 'percent' | 'currency';
  currency?: 'CNY' | 'USD' | 'EUR';
  decimals?: number;
}

export interface ViewState {
  sort?: 'none' | 'asc' | 'desc';
  /** 由 legacy 的 number[] 改为系列名（更稳定），见 ADR-0004 */
  hiddenSeries?: string[];
  /** 列 → 保留值（联动筛选） */
  filter?: Record<string, string[]>;
  /** 时间或类目窗口（索引） */
  range?: [number, number];
  /** 高亮项 */
  focus?: string | null;
  /** 3D */
  azimuth?: number;
  tilt?: number;
  zoom?: number;
  /** 动态排行、时间滑块的当前帧 */
  time?: string | number;
}
