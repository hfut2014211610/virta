// contracts v1 · §4.1 数据与画像
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type SourceFormat = 'csv' | 'json' | 'xlsx' | 'md' | 'txt' | 'inline' | 'stdin';
export interface SourceMeta {
  name: string;
  format: SourceFormat;
  rows: number;
  sheet?: string;
  encoding?: string;
}
export interface Table {
  columns: string[];
  rows: Row[];
  source: SourceMeta;
  passthrough?: { kind: 'echarts'; data: unknown };
}

export type ColumnType =
  | 'number' | 'percent' | 'date' | 'temporal-label'
  | 'category' | 'text' | 'boolean' | 'empty';
export interface ColumnProfile {
  name: string;
  type: ColumnType;
  /** 主类型占非空值比例 */
  ratio: number;
  distinct: number;
  missing: number;
  invalid: number;
  negative: number;
  min?: number;
  max?: number;
  /** 最多 5 个 */
  sample: Cell[];
  monotonic: 'asc' | 'desc' | null;
  /** 命中的别名角色，如 ['label','stage'] */
  roleHints: string[];
}
export interface TableProfile {
  rows: number;
  columns: ColumnProfile[];
  dims: string[];
  measures: string[];
  temporal: string[];
  /** 检测到的父 → 子维度链 */
  hierarchy: string[] | null;
}
