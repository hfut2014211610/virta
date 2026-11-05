// barline.to_chart 移植：统一 label+series 表格模型（bar/line/matrix3d/pie/funnel 共用）。
import {
  addGroup, esc, finishQuality, firstKey, kindMap, LABEL_ALIASES, newQuality,
  numericKeys, numericStats, parseNumber, pyInt, SERIES_ALIAS, TYPE_ALIAS, VALUE_ALIAS,
  type LegacyQuality, type RawRow,
} from '../legacy-core.js';

export interface EchartsWrap { __echarts: Record<string, unknown> }
export type Raw = RawRow[] | EchartsWrap;
export const isEcharts = (r: Raw): r is EchartsWrap =>
  !Array.isArray(r) && typeof r === 'object' && r !== null && '__echarts' in r;

export interface BarlineSeries { name: string; values: number[] }
export interface BarlineModel {
  labels: string[];
  series: BarlineSeries[];
  quality: LegacyQuality;
  kinds: string[];
}

export function toChart(raw: Raw): BarlineModel {
  if (isEcharts(raw)) {
    const e = raw.__echarts;
    const xAxis = (e['xAxis'] ?? {}) as Record<string, unknown>;
    const labels = ((xAxis['data'] ?? []) as unknown[]).map(String);
    const series: BarlineSeries[] = [];
    let missing = 0, invalid = 0, percent = 0;
    const eSeries = (e['series'] ?? []) as Record<string, unknown>[];
    eSeries.forEach((s, i) => {
      const vals: number[] = [];
      for (const v of (s['data'] ?? []) as unknown[]) {
        const [num, status] = parseNumber(v);
        vals.push(num);
        if (status === 'missing') missing += 1;
        else if (status === 'invalid') invalid += 1;
        else if (status === 'percent') percent += 1;
      }
      series.push({ name: String(s['name'] ?? `系列${i + 1}`), values: vals });
    });
    const quality = newQuality(labels.length, 'echarts');
    quality.mapping = { label: 'xAxis.data', series: 'series[].name', value: 'series[].data' };
    quality.type_column = '—';
    quality.missing = missing;
    quality.invalid = invalid;
    quality.percent = percent;
    if (missing || invalid || percent) {
      quality.warnings.push('ECharts JSON 含缺失/非法/百分号数值，已按 0 计或原刻度保留');
      quality.confidence = invalid === 0 ? 'medium' : 'low';
    }
    for (const s of series) s.values = s.values.map(pyInt);
    return { labels, series, quality, kinds: labels.map(() => 'delta') };
  }
  if (!raw.length) throw new Error('数据为空');

  const sample = raw[0];
  const keys = Object.keys(sample);
  const labelKey = firstKey(sample, LABEL_ALIASES) ?? keys[0];
  const seriesKey = firstKey(sample, SERIES_ALIAS);
  const typeKey = firstKey(sample, TYPE_ALIAS);
  const stats = numericStats(raw, keys);
  const excluded = new Set<string>([labelKey, ...(seriesKey ? [seriesKey] : []), ...(typeKey ? [typeKey] : [])]);
  const numericCols = numericKeys(stats, keys, excluded);
  const valueAliasKey = firstKey(sample, VALUE_ALIAS);

  const grouped = new Map<string, Record<string, number>>();
  const labelsOrder: string[] = [];
  let mode: string;
  let valueKey: string | null = null;
  let quality: LegacyQuality;

  const labOf = (r: RawRow) => {
    const v = r[labelKey];
    return v !== null && v !== undefined && v !== '' ? String(v) : '?';
  };

  if (seriesKey) {
    mode = 'long';
    valueKey = valueAliasKey && valueAliasKey !== labelKey ? valueAliasKey : numericCols[numericCols.length - 1] ?? null;
    quality = newQuality(raw.length, mode);
    quality.mapping = { label: labelKey, series: seriesKey, value: valueKey ?? '(末列兜底)' };
    for (const r of raw) {
      const lab = labOf(r);
      const sv = r[seriesKey];
      const sname = sv !== null && sv !== undefined && sv !== '' ? String(sv) : '系列';
      const rawVal = valueKey ? r[valueKey] : Object.values(r).at(-1);
      const [val] = parseNumber(rawVal);
      if (!labelsOrder.includes(lab)) labelsOrder.push(lab);
      addGroup(grouped, quality, sname, lab, val);
    }
  } else if (numericCols.length >= 2) {
    mode = 'wide';
    valueKey = '(宽表多数值列)';
    quality = newQuality(raw.length, mode);
    quality.mapping = { label: labelKey, series: '(每个数值列=一个系列)', value: numericCols.slice(0, 4).join(', ') };
    for (const r of raw) {
      const lab = labOf(r);
      if (!labelsOrder.includes(lab)) labelsOrder.push(lab);
      for (const col of numericCols) {
        const [val] = parseNumber(r[col]);
        addGroup(grouped, quality, col, lab, val);
      }
    }
  } else {
    mode = 'single';
    valueKey = valueAliasKey ?? numericCols[0] ?? keys.find((k) => k !== labelKey) ?? null;
    if (valueKey === null) throw new Error('找不到数值列（需 label + value，或 label + series + value，或宽表）');
    grouped.set('数值', {});
    quality = newQuality(raw.length, mode);
    quality.mapping = { label: labelKey, series: '(单系列)', value: valueKey };
    for (const r of raw) {
      const lab = labOf(r);
      if (!labelsOrder.includes(lab)) labelsOrder.push(lab);
      const [val] = parseNumber(r[valueKey]);
      addGroup(grouped, quality, '数值', lab, val);
    }
  }

  const [kmap, unknownTypes, kindConflicts] = kindMap(raw, labelKey, typeKey);
  quality.type_column = typeKey ? esc(typeKey) : '—';
  quality.anchors = [...kmap.values()].filter((k) => k === 'absolute').length;
  quality.unknown_types = unknownTypes;
  quality.kind_conflicts = kindConflicts;
  if (unknownTypes) quality.warnings.push(`类型列「${esc(typeKey!)}」含 ${unknownTypes} 个未知标记，已按 delta 处理`);
  if (kindConflicts) quality.warnings.push('同一分类出现多种行类型，已按首次出现的类型绘制');
  const kinds = labelsOrder.map((lab) => kmap.get(lab) ?? 'delta');

  const chosen = mode !== 'single' ? numericCols : [valueKey];
  finishQuality(quality, stats, chosen, excluded);
  if ((unknownTypes || kindConflicts) && quality.confidence === 'high') quality.confidence = 'medium';
  const series: BarlineSeries[] = [...grouped.entries()].map(([name, g]) => ({
    name,
    values: labelsOrder.map((lab) => pyInt(g[lab] ?? 0)),
  }));
  return { labels: labelsOrder, series, quality, kinds };
}
