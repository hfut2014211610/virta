// contracts v1 · §4.3 图族契约（机器可读，替代 legacy 的 CONTRACT）
import type { ViewId } from './views.js';
import type { ViewSpec } from './spec.js';

export type RoleType = 'number' | 'category' | 'date' | 'text' | 'any';
export interface RoleSpec {
  role: string;
  label: string;
  type: RoleType;
  required: boolean;
  /** 可映射多列，如 radar 的多个系列、sunburst 的 level1..N */
  multiple?: boolean;
  /** 原始别名（中英文），比较前统一 normKey */
  aliases: string[];
  note?: string;
  /** ADR-0010 时刻语义：日期角色只有日期时落到当天起点（00:00）或末时刻（23:59:59.999） */
  instant?: 'start' | 'end';
}
/** 互斥的输入模式（取代伪列名） */
export interface ModeSpec { id: string; label: string; requires: string[]; when: string }
export interface VariantSpec {
  id: string;
  label: string;
  description: string;
  requires?: string[];
  disabledWhen?: string;
}
export interface OptionSpec {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'number' | 'string';
  values?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default: string | number | boolean;
  /** 编辑抽屉里的分组 */
  group: 'view' | 'style' | 'display' | 'data';
  /** 静态导出是否生效 */
  static: boolean;
  description?: string;
  /** 仅在指定变体下展示/生效（缺省 = 所有变体）。如甘特"粒度"仅日历变体有意义 */
  variants?: string[];
}
export interface ChartContract {
  version: 1;
  view: ViewId;
  aliases: string[];
  title: string;
  summary: string;
  roles: RoleSpec[];
  modes?: ModeSpec[];
  variants: VariantSpec[];
  options: OptionSpec[];
  /** 自动判定与清洗规则（人类可读） */
  inference: string[];
  example: { csv: string; spec?: Partial<ViewSpec> };
  staticExport: boolean;
  legacyTemplate?: string;
  /** ADR-0009 流式视图：内容高度由内容决定，HTML 端用 DOM 渲染 */
  flow?: boolean;
}
