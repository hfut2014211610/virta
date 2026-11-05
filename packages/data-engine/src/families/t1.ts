// T1 新视图适配器（M6，无 legacy 对应）：rank / histogram / kpi / compare / cohort。
// 风格沿用 legacy 适配器：firstKey 别名解析 + newQuality + 抛中文错误。
import {
  ACTUAL_ALIAS, firstKey, LABEL_ALIASES, newQuality, parseNumber, rowLabel, TARGET_ALIAS, VALUE_ALIAS,
  type LegacyQuality,
} from '../legacy-core.js';
import { isEcharts, type Raw } from './barline.js';
import {
  COHORT_KEY_ALIAS, COHORT_PERIOD_ALIAS, COMPARE_FROM_ALIAS, COMPARE_TO_ALIAS,
  HIST_GROUP_ALIAS, KPI_METRIC_ALIAS, KPI_PREV_ALIAS, RANK_LABEL_ALIAS, RANK_TIME_ALIAS,
} from '../aliases.js';

interface Row { [k: string]: unknown }
const cols = (r: Row) => (r ? Object.keys(r) : []);
const isNum = (x: unknown) => typeof x === 'number' || ['ok', 'percent'].includes(parseNumber(x)[1]);
/** 标签列兜底：首个非数值列（数字列名如 2024 会被 JS 提到对象前部，不能用 cols[0]）。 */
const firstCat = (sample: Row, exclude: (string | null)[] = []) =>
  cols(sample).find((k) => !exclude.includes(k) && !isNum(sample[k])) ?? cols(sample)[0];

// ── rank ────────────────────────────────────────────────────────────
export interface RankModel {
  mode: 'static' | 'race';
  items: { label: string; value: number }[];
  frames?: { time: string; items: { label: string; value: number }[] }[];
  label_key: string; value_key: string; time_key?: string;
  quality: LegacyQuality;
}
export function toRank(raw: Raw): RankModel {
  if (isEcharts(raw)) throw new Error('rank 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0] as Row;
  const timeKey = firstKey(sample, RANK_TIME_ALIAS);
  const labelKey = firstKey(sample, RANK_LABEL_ALIAS)
    ?? cols(sample).find((k) => k !== timeKey && !isNum(sample[k]))
    ?? firstCat(sample, [timeKey]);
  const valueKey = firstKey(sample, VALUE_ALIAS)
    ?? cols(sample).find((k) => k !== labelKey && k !== timeKey && isNum(sample[k]));
  if (!valueKey) throw new Error('缺少数值列；rank 需要 label + value（可选 time）');
  const q = newQuality(raw.length, timeKey ? 'race' : 'static');
  q.mapping = { label: labelKey, value: valueKey, ...(timeKey ? { time: timeKey } : {}) };
  const aggregate = (rows: Row[]) => {
    const acc = new Map<string, number>();
    for (const r of rows) {
      const lab = rowLabel(r, labelKey);
      const [v] = parseNumber(r[valueKey]);
      acc.set(lab, (acc.get(lab) ?? 0) + v);
    }
    return [...acc.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  if (timeKey) {
    const byTime = new Map<string, Row[]>();
    for (const r of raw as Row[]) {
      const t = String(r[timeKey] ?? '');
      if (!byTime.has(t)) byTime.set(t, []);
      byTime.get(t)!.push(r);
    }
    const frames = [...byTime.keys()].sort().map((t) => ({ time: t, items: aggregate(byTime.get(t)!) }));
    return { mode: 'race', items: frames[frames.length - 1]?.items ?? [], frames, label_key: labelKey, value_key: valueKey, time_key: timeKey, quality: q };
  }
  return { mode: 'static', items: aggregate(raw as Row[]), label_key: labelKey, value_key: valueKey, quality: q };
}

// ── histogram ───────────────────────────────────────────────────────
export interface HistBin { x0: number; x1: number; count: number; cum: number }
export interface HistGroup { name: string; bins: HistBin[]; n: number }
export interface HistogramModel {
  bins: HistBin[]; groups: HistGroup[]; n: number; min: number; max: number; binW: number;
  value_key: string; group_key?: string; quality: LegacyQuality;
}
function binOf(vals: number[], lo: number, w: number, nb: number): HistBin[] {
  const bins: HistBin[] = Array.from({ length: nb }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0, cum: 0 }));
  for (const v of vals) bins[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / w)))].count++;
  let acc = 0;
  for (const b of bins) { acc += b.count; b.cum = acc; }
  return bins;
}
export function toHistogram(raw: Raw): HistogramModel {
  if (isEcharts(raw)) throw new Error('histogram 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0] as Row;
  const groupKey = firstKey(sample, HIST_GROUP_ALIAS);
  const valueKey = firstKey(sample, VALUE_ALIAS)
    ?? cols(sample).find((k) => k !== groupKey && isNum(sample[k]));
  if (!valueKey) throw new Error('缺少数值列；histogram 需要 value（可选 group）');
  const q = newQuality(raw.length, 'histogram');
  q.mapping = { value: valueKey, ...(groupKey ? { group: groupKey } : {}) };
  const all = (raw as Row[]).map((r) => parseNumber(r[valueKey])[0]);
  const groups = new Map<string, number[]>();
  for (const r of raw as Row[]) {
    const g = groupKey ? String(r[groupKey] ?? '—') : '__all__';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(parseNumber(r[valueKey])[0]);
  }
  const min = Math.min(...all), max = Math.max(...all);
  // Freedman–Diaconis：w = 2·IQR/∛n；退化时退回 Sturges
  const sorted = [...all].sort((a, b) => a - b);
  const iqr = (sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)]) || 0;
  const n = all.length;
  const w = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : (max - min || 1) / Math.ceil(Math.log2(n) + 1);
  const nb = Math.min(40, Math.max(1, Math.ceil((max - min) / w))) || 1;
  const binW = (max - min) / nb || 1;
  const mk = (vals: number[]): HistBin[] => binOf(vals, min, binW, nb);
  const gs = [...groups.entries()].map(([name, vals]) => ({ name, bins: mk(vals), n: vals.length }));
  return { bins: mk(all), groups: gs, n, min, max, binW, value_key: valueKey, group_key: groupKey ?? undefined, quality: q };
}

// ── kpi ─────────────────────────────────────────────────────────────
export interface KpiItem {
  label: string; value: number; target?: number; previous?: number;
  pct?: number; trend?: number[];
}
export interface KpiModel {
  items: KpiItem[]; hits: number; metric_key: string; value_key: string; quality: LegacyQuality;
}
export function toKpi(raw: Raw): KpiModel {
  if (isEcharts(raw)) throw new Error('kpi 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0] as Row;
  const metricKey = firstKey(sample, KPI_METRIC_ALIAS) ?? firstCat(sample);
  const valueKey = firstKey(sample, VALUE_ALIAS) ?? firstKey(sample, ACTUAL_ALIAS);
  const targetKey = firstKey(sample, TARGET_ALIAS);
  const prevKey = firstKey(sample, KPI_PREV_ALIAS);
  if (!valueKey) throw new Error('缺少数值列；kpi 需要 metric + value（可选 target/previous）');
  const q = newQuality(raw.length, 'kpi');
  q.mapping = { metric: metricKey, value: valueKey, ...(targetKey ? { target: targetKey } : {}), ...(prevKey ? { previous: prevKey } : {}) };
  let hits = 0;
  const items: KpiItem[] = (raw as Row[]).map((r) => {
    const it: KpiItem = { label: rowLabel(r, metricKey), value: parseNumber(r[valueKey])[0] };
    if (targetKey) { it.target = parseNumber(r[targetKey])[0]; it.pct = it.target ? it.value / it.target : undefined; if ((it.pct ?? 0) >= 1) hits++; }
    if (prevKey) it.previous = parseNumber(r[prevKey])[0];
    return it;
  });
  return { items, hits, metric_key: metricKey, value_key: valueKey, quality: q };
}

// ── compare ─────────────────────────────────────────────────────────
export interface CompareItem { label: string; from: number; to: number; delta: number; dpct: number }
export interface CompareModel {
  items: CompareItem[]; reversed: number; up: number; down: number;
  from_key: string; to_key: string; quality: LegacyQuality;
}
export function toCompare(raw: Raw): CompareModel {
  if (isEcharts(raw)) throw new Error('compare 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0] as Row;
  const labelKey = firstKey(sample, LABEL_ALIASES) ?? firstCat(sample);
  let fromKey = firstKey(sample, COMPARE_FROM_ALIAS), toKey = firstKey(sample, COMPARE_TO_ALIAS);
  // 兜底：两个度量列按列序取（如 2024/2025 列名命中年份）
  if (!fromKey || !toKey) {
    const ms = cols(sample).filter((k) => k !== labelKey && isNum(sample[k]));
    if (ms.length === 2) { [fromKey, toKey] = ms; }
    else if (ms.length > 2) {
      const y = ms.filter((k) => /^\d{4}$/.test(k.trim()));
      if (y.length === 2) [fromKey, toKey] = y;
    }
  }
  if (!fromKey || !toKey || fromKey === toKey) throw new Error('需要恰好两个对比期度量列；compare 需要 label + from + to');
  const q = newQuality(raw.length, 'compare');
  q.mapping = { label: labelKey, from: fromKey, to: toKey };
  const items: CompareItem[] = (raw as Row[]).map((r) => {
    const from = parseNumber(r[fromKey!])[0], to = parseNumber(r[toKey!])[0];
    return { label: rowLabel(r, labelKey), from, to, delta: to - from, dpct: from !== 0 ? (to - from) / Math.abs(from) : 0 };
  });
  const up = items.filter((i) => i.delta > 0).length, down = items.filter((i) => i.delta < 0).length;
  const majorityUp = up >= down;
  const reversed = items.filter((i) => (majorityUp ? i.delta < 0 : i.delta > 0)).length;
  return { items, reversed, up, down, from_key: fromKey, to_key: toKey, quality: q };
}

// ── cohort ──────────────────────────────────────────────────────────
export interface CohortRow { name: string; size: number; cells: (number | null)[] }
export interface CohortModel {
  rows: CohortRow[]; maxPeriod: number; periods: number[];
  cohort_key: string; period_key: string; value_key: string; quality: LegacyQuality;
}
export function toCohort(raw: Raw): CohortModel {
  if (isEcharts(raw)) throw new Error('cohort 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0] as Row;
  const cohortKey = firstKey(sample, COHORT_KEY_ALIAS) ?? firstCat(sample);
  const periodKey = firstKey(sample, COHORT_PERIOD_ALIAS);
  const valueKey = firstKey(sample, VALUE_ALIAS)
    ?? cols(sample).find((k) => ![cohortKey, periodKey].includes(k) && isNum(sample[k]));
  if (!periodKey || !valueKey) throw new Error('缺少 period/value 列；cohort 需要 cohort + period + value');
  const q = newQuality(raw.length, 'cohort');
  q.mapping = { cohort: cohortKey, period: periodKey, value: valueKey };
  const data = new Map<string, Map<number, number>>();
  let maxP = 0;
  for (const r of raw as Row[]) {
    const c = String(r[cohortKey] ?? '');
    const p = Math.trunc(parseNumber(r[periodKey])[0]);
    const v = parseNumber(r[valueKey])[0];
    if (!data.has(c)) data.set(c, new Map());
    data.get(c)!.set(p, (data.get(c)!.get(p) ?? 0) + v);
    maxP = Math.max(maxP, p);
  }
  const rows: CohortRow[] = [...data.keys()].sort().map((name) => {
    const m = data.get(name)!;
    const size = m.get(0) ?? [...m.values()][0] ?? 0;
    const cells: (number | null)[] = [];
    for (let p = 0; p <= maxP; p++) cells.push(m.has(p) ? m.get(p)! : null);
    return { name, size, cells };
  });
  return { rows, maxPeriod: maxP, periods: [...Array(maxP + 1)].map((_, i) => i), cohort_key: cohortKey, period_key: periodKey, value_key: valueKey, quality: q };
}
