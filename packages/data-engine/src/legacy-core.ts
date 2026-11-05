// core.py 的忠实移植：别名、parseNumber、parseGanttDate、数值画像、类型映射、质量报告骨架。
// 字段名与输出字符串保持 legacy 原样（含 esc() 转义位），保证 golden 对拍逐字节一致。
// 别名总表在 ./aliases.ts（§5.1 统一入口）；此处 re-export 便于 family 文件单点导入。
import {
  ABS_TOKENS, DELTA_TOKENS, normKey,
} from './aliases.js';
export {
  ABS_TOKENS, ACTUAL_ALIAS, DELTA_TOKENS, GOOD_ALIAS, LABEL_ALIASES, MAX_ALIAS,
  normKey, POOR_ALIAS, RAW_ACTUAL_ALIAS, RAW_GOOD_ALIAS, RAW_LABEL_ALIASES,
  RAW_MAX_ALIAS, RAW_POOR_ALIAS, RAW_SERIES_ALIAS, RAW_SIZE_ALIAS, RAW_TARGET_ALIAS,
  RAW_TYPE_ALIAS, RAW_VALUE_ALIAS, RAW_X_ALIAS, RAW_Y_ALIAS, SERIES_ALIAS,
  SIZE_ALIAS, TARGET_ALIAS, TYPE_ALIAS, VALUE_ALIAS, X_ALIAS, Y_ALIAS,
} from './aliases.js';

export type RawRow = Record<string, unknown>;
export type Raw = RawRow[] | { echarts: unknown };

export const MISSING_TOKENS = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', '-', '—', '缺失', '空值']);

export const NUM_RATIO = 0.8;

export const TEMPORAL_RE = /^(?:(?:19|20)\d{2}(?:年(?:\d{1,2}月?)?|[-/.]\d{1,2}(?:[-/.]\d{1,2})?)?|\d{1,2}月|[一二三四五六七八九十]+月|\d{1,2}[日号时点]|\d{1,2}:\d{2}(?::\d{2})?|Q[1-4]|第?[一二三四]季度|周[一二三四五六日天]|星期[一二三四五六日天]|(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?|(?:January|February|March|April|May|June|July|August|September|October|November|December))$/i;

/** Python html.escape(v, quote=True) */
export function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/** <script> 内嵌 JSON：防 </script> 提前闭合 */
export const jsJson = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

export type NumStatus = 'ok' | 'percent' | 'missing' | 'invalid';
/** parse_number → [number, status, unit]。percent 保留原刻度（10% = 10）。 */
export function parseNumber(v: unknown): [number, NumStatus, string | null] {
  if (v === null || v === undefined) return [0.0, 'missing', null];
  let s = String(v).trim();
  if (MISSING_TOKENS.has(s.toLowerCase().replace(/ /g, ''))) return [0.0, 'missing', null];
  const paren = /^\(\s*([+-]?[\d,，]+(?:\.\d+)?)\s*\)$/.exec(s);
  if (paren) s = '-' + paren[1];
  s = s.replace(/，/g, ',').replace(/￥|¥|\$|€|£/g, '');
  s = s.replace(/\s+/g, '');
  const percent = s.endsWith('%');
  if (percent) s = s.slice(0, -1);
  s = s.replace(/,/g, '');
  const num = Number(s);
  if (Number.isNaN(num) || s === '') return [0.0, 'invalid', percent ? 'percent' : null];
  return [num, percent ? 'percent' : 'ok', percent ? '%' : null];
}

/** Python int(v) if v == int(v) else v → JS 里 number 已统一，仅用于标注；此函数保证 -0→0。 */
export const pyInt = (v: number) => (v === Math.trunc(v) ? Math.trunc(v) : v);

export interface NumStat {
  total: number; missing: number; invalid: number; percent: number; ok: number; negative: number;
  examplesInvalid: string[]; ratio: number;
}
export function numericStats(raw: RawRow[], keys: string[]): Record<string, NumStat> {
  const stats: Record<string, NumStat> = {};
  for (const k of keys) stats[k] = { total: 0, missing: 0, invalid: 0, percent: 0, ok: 0, negative: 0, examplesInvalid: [], ratio: 0 };
  for (const row of raw) {
    for (const k of keys) {
      const [v, status] = parseNumber(row[k]);
      const st = stats[k];
      st.total += 1;
      if (status === 'missing') st.missing += 1;
      else if (status === 'invalid') {
        st.invalid += 1;
        if (st.examplesInvalid.length < 3) st.examplesInvalid.push(String(row[k]).slice(0, 32));
      } else {
        if (status === 'percent') st.percent += 1;
        st.ok += 1;
        if (v < 0) st.negative += 1;
      }
    }
  }
  for (const st of Object.values(stats)) {
    st.ratio = st.ok / Math.max(1, st.total - st.missing);
  }
  return stats;
}

export function firstKey(sample: RawRow, aliases: readonly string[]): string | null {
  const normToOrig = new Map<string, string>();
  for (const k of Object.keys(sample)) normToOrig.set(normKey(k), k);
  for (const a of aliases) if (normToOrig.has(a)) return normToOrig.get(a)!;
  return null;
}

export function rowLabel(row: RawRow | undefined, labelKey: string): string {
  const value = row?.[labelKey];
  return value !== null && value !== undefined && value !== '' ? String(value) : '?';
}

export function kindMap(raw: RawRow[], labelKey: string, typeKey: string | null): [Map<string, string>, number, number] {
  const map = new Map<string, string>();
  if (!typeKey) return [map, 0, 0];
  let unknown = 0, conflicts = 0;
  for (const row of raw) {
    const lab = rowLabel(row, labelKey);
    const rawType = String(row[typeKey] ?? '').trim().toLowerCase();
    let kind: string;
    if (!rawType || DELTA_TOKENS.has(rawType)) kind = 'delta';
    else if (ABS_TOKENS.has(rawType)) kind = 'absolute';
    else { unknown += 1; kind = 'delta'; }
    if (map.has(lab) && map.get(lab) !== kind) conflicts += 1;
    else map.set(lab, kind);
  }
  return [map, unknown, conflicts];
}

export const numericKeys = (stats: Record<string, NumStat>, keys: string[], exclude: Set<string>) =>
  keys.filter((k) => !exclude.has(k) && stats[k].ratio >= NUM_RATIO);

export function addGroup(grouped: Map<string, Record<string, number>>, quality: LegacyQuality, seriesName: string, label: string, value: number): void {
  let cur = grouped.get(seriesName);
  if (!cur) { cur = {}; grouped.set(seriesName, cur); }
  if (label in cur) quality.duplicate_pairs += 1;
  cur[label] = (cur[label] ?? 0) + value;
}

/** legacy 质量报告骨架（与 _new_quality 同形；TS 侧再经 toQualityReport 投影成契约结构） */
export interface LegacyQuality {
  rows: number; mode: string;
  mapping: Record<string, string>;
  numeric_columns: string[];
  missing: number; invalid: number; percent: number; negative: number;
  anchors: number; unknown_types: number; kind_conflicts: number;
  type_column: string; duplicate_pairs: number; duplicate_labels?: number;
  warnings: string[]; confidence: 'high' | 'medium' | 'low';
  [extra: string]: unknown;
}
export function newQuality(rows: number, mode: string): LegacyQuality {
  return {
    rows, mode,
    mapping: { label: '?', series: '—', value: '—' },
    numeric_columns: [], missing: 0, invalid: 0, percent: 0, negative: 0,
    anchors: 0, unknown_types: 0, kind_conflicts: 0, type_column: '—',
    duplicate_pairs: 0, warnings: [], confidence: 'high',
  };
}

export function finishQuality(
  quality: LegacyQuality,
  stats: Record<string, NumStat>,
  chosenNumeric: string[],
  excluded: Set<string>,
): LegacyQuality {
  const warnings = quality.warnings;
  for (const [k, st] of Object.entries(stats)) {
    if (excluded.has(k)) continue;
    quality.missing += st.missing;
    quality.invalid += st.invalid;
    quality.percent += st.percent;
    quality.negative += st.negative;
    if (st.invalid) warnings.push(`数值列「${esc(k)}」含 ${st.invalid} 个无法解析值，已按 0 计：${st.examplesInvalid.map(esc).join(', ')}`);
    if (st.missing) warnings.push(`「${esc(k)}」含 ${st.missing} 个空值，已按 0 计`);
    if (st.percent) warnings.push(`「${esc(k)}」含百分号，数值按原刻度保留（10% = 10）`);
    if (st.negative) warnings.push(`「${esc(k)}」含 ${st.negative} 个负值；Pareto / 100%堆叠 / 3D 矩阵自动停用，分组/堆叠/瀑布保持可用`);
  }
  if (chosenNumeric.length) quality.numeric_columns = chosenNumeric.map(esc);
  if (quality.duplicate_pairs) warnings.push(`重复 label/series 组合 ${quality.duplicate_pairs} 次，已求和`);
  quality.warnings = warnings.slice(0, 6);
  quality.confidence = quality.invalid || quality.percent || quality.missing
    ? (quality.invalid === 0 ? 'medium' : 'low')
    : 'high';
  return quality;
}

// ---- 甘特日期解析（parse_gantt_date 移植） ----
export type GanttDateStatus = 'date' | 'offset' | 'missing' | 'invalid';
const GANTT_DATE_RE = /^(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2})\s*日?)?$/;
const GANTT_DATE_COMPACT_RE = /^((?:19|20)\d{2})(\d{2})(\d{2})$/;
const GANTT_YEAR_RE = /^(?:19|20)\d{2}$/;

/** 与 Python date.toordinal() 一致（1/1/1 = 1） */
export function toOrdinal(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 719163;
}
const fromTimestamp = (sec: number) => Math.floor(sec / 86400) + 719163;

export function parseGanttDate(v: unknown): [number | null, number | null, GanttDateStatus] {
  if (v === null || v === undefined) return [null, null, 'missing'];
  if (v instanceof Date) return [toOrdinal(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()), null, 'date'];
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 1e12) return [fromTimestamp(v / 1000), null, 'date'];
    if (v >= 1e9) return [fromTimestamp(v), null, 'date'];
    return [null, v, 'offset'];
  }
  if (typeof v === 'boolean') return [null, null, 'invalid'];
  let s = String(v).trim();
  if (MISSING_TOKENS.has(s.toLowerCase().replace(/ /g, ''))) return [null, null, 'missing'];
  if (s.includes('T')) s = s.split('T')[0];
  else if (s.includes(' ')) s = s.split(' ')[0];
  let m = GANTT_DATE_RE.exec(s);
  if (m) {
    const d = m[3] ? +m[3] : 1;
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, d));
    if (dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === d) {
      return [toOrdinal(+m[1], +m[2], d), null, 'date'];
    }
    return [null, null, 'invalid'];
  }
  m = GANTT_DATE_COMPACT_RE.exec(s);
  if (m) {
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3]) {
      return [toOrdinal(+m[1], +m[2], +m[3]), null, 'date'];
    }
    return [null, null, 'invalid'];
  }
  if (GANTT_YEAR_RE.test(s)) return [toOrdinal(+s, 1, 1), null, 'date'];
  const f = Number(s);
  if (!Number.isNaN(f)) return [null, f, 'offset'];
  return [null, null, 'invalid'];
}

/** _fmt_num：千分位整数 / 1 位小数 */
export const fmtNum = (v: number) =>
  v === Math.trunc(v) ? Math.trunc(v).toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
