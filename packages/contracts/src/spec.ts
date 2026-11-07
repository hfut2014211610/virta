// contracts v1 · §4.4 ViewSpec
import type { ViewId } from './views.js';

// ADR-0008：主题从 light/dark 扩为 6 套（新增 minimal/sketch/pastel/tech 四套可切换图表主题）。
export const THEME_IDS = ['light', 'dark', 'minimal', 'sketch', 'pastel', 'tech'] as const;
export type Theme = typeof THEME_IDS[number];
export const PALETTE_IDS = ['signal', 'cinnabar', 'patina', 'blueprint', 'inkwash', 'mono', 'sundown', 'dunhuang', 'aurora', 'morandi'] as const;
export type PaletteId = typeof PALETTE_IDS[number];

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
  /** 静态导出尺寸（CSS px），默认 1200×675；height='auto' 时按内容自然高度（ADR-0009） */
  size?: { width: number; height: number | 'auto' };
  /** 时间契约（ADR-0010）：报告时刻与时区，CLI 缺省时解析后写回回执 */
  time?: {
    /** ISO 8601，必须带时区偏移或 Z，如 '2026-11-05T17:00:00+08:00' */
    asOf?: string;
    /** IANA 时区，如 'Asia/Shanghai'；缺省 = 系统时区 */
    tz?: string;
    weekStart?: 1 | 7;
    workdays?: number[];
    holidays?: string[];
    extraWorkdays?: string[];
  };
  /** 派生列（ADR-0010）：适配前统一计算，新列进 Table.columns */
  derive?: Derive[];
  /** 流式视图的静态分页（ADR-0009） */
  page?: { height?: number; break?: 'auto' | 'section' | 'none' };
}

export type Derive =
  | { type: 'dueStatus'; due: string; done?: string; soonWorkdays?: number; as?: string }
  | { type: 'dateDiff'; from: string; to: string; unit?: 'day' | 'workday'; as?: string };

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
  /** 选择放大：被点选扇区/元素的索引（饼图 explode） */
  explode?: number;
  /** 动态排行、时间滑块的当前帧 */
  time?: string | number;
  /** flow-table 全文搜索串（ADR-0009） */
  query?: string;
  /** flow-table 按该列排序（配合 state.sort 方向） */
  sortBy?: string;
}
