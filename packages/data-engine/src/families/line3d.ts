// line3d.to_line3d 移植：barline 模型 + Z 刻度/时间标记。
import { newQuality, normKey, numericKeys, numericStats, NUM_RATIO, parseNumber, TEMPORAL_RE, type RawRow } from '../legacy-core.js';
import { toChart, type Raw, type BarlineModel } from './barline.js';

const isTemporal = (labels: string[]) => {
  const ls = labels.map((x) => String(x).trim());
  return ls.length >= 3 && ls.filter((x) => TEMPORAL_RE.test(x)).length >= 0.8 * ls.length;
};

export interface Line3dModel extends BarlineModel {
  x_key: string; z_key: string; y_key: string;
  value_range: [number, number]; temporal: boolean;
  n_labels: number; n_series: number;
  /** curve 变体：x/y/z 三数值列的三维空间轨迹点（有序） */
  curve?: { points: { x: number; y: number; z: number; label: string }[]; cx_key: string; cy_key: string; cz_key: string };
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

/** curve 变体：x/y/z 数值列 → 三维空间轨迹（按行序连线；x/y/z 列名优先，否则前三个数值列）。 */
export function toLine3dCurve(raw: Raw): Line3dModel {
  if (!Array.isArray(raw) || !raw.length) throw new Error('三维曲线需要行式数据（x/y/z 数值列）');
  const rows = raw as RawRow[];
  const keys = Object.keys(rows[0]);
  const stats = numericStats(rows, keys);
  const nums = numericKeys(stats, keys, new Set());
  if (nums.length < 3) throw new Error('三维曲线需要至少 3 个数值列（x/y/z）');
  const xKey = nums.find((k) => normKey(k) === 'x') ?? nums[0];
  const yKey = nums.find((k) => normKey(k) === 'y') ?? nums[1];
  const zKey = nums.find((k) => normKey(k) === 'z') ?? nums[2];
  const labelKey = keys.find((k) => stats[k].ratio < NUM_RATIO) ?? null;
  const pts = rows.map((r, i) => ({
    x: parseNumber(r[xKey])[0], y: parseNumber(r[yKey])[0], z: parseNumber(r[zKey])[0],
    label: labelKey ? String(r[labelKey] ?? `#${i + 1}`) : `#${i + 1}`,
  })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 2) throw new Error('有效三维点不足 2 个');
  const vals = pts.flatMap((p) => [p.x, p.y, p.z]);
  const q = newQuality(rows.length, 'line3d-curve');
  q.mapping = { label: labelKey ?? '—', series: '—', value: '—', x: xKey, y: yKey, z: zKey };
  q.numeric_columns = nums;
  return {
    labels: [], series: [], quality: q, kinds: ['line'],
    x_key: xKey, y_key: yKey, z_key: zKey,
    value_range: [Math.min(...vals), Math.max(...vals)],
    temporal: false, n_labels: pts.length, n_series: 1,
    curve: { points: pts, cx_key: xKey, cy_key: yKey, cz_key: zKey },
  };
}
