// line3d.to_line3d 移植：barline 模型 + Z 刻度/时间标记。
import { TEMPORAL_RE } from '../legacy-core.js';
import { toChart, type Raw, type BarlineModel } from './barline.js';

const isTemporal = (labels: string[]) => {
  const ls = labels.map((x) => String(x).trim());
  return ls.length >= 3 && ls.filter((x) => TEMPORAL_RE.test(x)).length >= 0.8 * ls.length;
};

export interface Line3dModel extends BarlineModel {
  x_key: string; z_key: string; y_key: string;
  value_range: [number, number]; temporal: boolean;
  n_labels: number; n_series: number;
}

export function toLine3d(raw: Raw): Line3dModel {
  const chart = toChart(raw);
  const { labels, series } = chart;
  if (!labels.length || !series.length) throw new Error('数据为空或没有有效系列');
  const mapping = chart.quality.mapping ?? {};
  const xKey = String(mapping['label'] ?? '分类');
  let valueKey = String(mapping['value'] ?? '数值') || '数值';
  if (valueKey.startsWith('(') || ['宽表', 'series[]', ', ', '，'].some((t) => valueKey.includes(t))) valueKey = '数值';
  const allVals = series.flatMap((s) => s.values);
  return {
    ...chart,
    x_key: xKey, z_key: valueKey, y_key: '系列',
    value_range: [Math.min(...allVals), Math.max(...allVals)],
    temporal: isTemporal(labels),
    n_labels: labels.length, n_series: series.length,
  };
}
