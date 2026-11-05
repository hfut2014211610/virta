// pie.to_pie 移植：分类值 = 各系列求和；负/零剔除；小份额并「其他」。
import { esc } from '../legacy-core.js';
import { toChart, type Raw, type BarlineModel } from './barline.js';

const PIE_SMALL_THRESHOLD = 0.03;

export interface PieSlice { label: string; value: number; share: number }
export interface PieModel {
  slices: PieSlice[]; grand: number; top: PieSlice;
  mode: unknown; mapping: Record<string, string>; series_n: number;
  quality: BarlineModel['quality']; kinds: string[];
}

export function toPie(raw: Raw): PieModel {
  const chart = toChart(raw);
  const { labels, series } = chart;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const warnings = [...chart.quality.warnings];
  const keepIdx: number[] = [], negIdx: number[] = [], zeroIdx: number[] = [];
  totals.forEach((v, i) => {
    if (v < 0) negIdx.push(i);
    else if (v === 0) zeroIdx.push(i);
    else keepIdx.push(i);
  });
  if (negIdx.length) warnings.push(`${negIdx.length} 个分类为负值（${negIdx.slice(0, 3).map((i) => esc(labels[i])).join(', ')}），饼图无法表示，已剔除；请用柱状图看正负对比`);
  if (zeroIdx.length) warnings.push(`${zeroIdx.length} 个分类为 0，已剔除（占比不可见）`);
  if (!keepIdx.length) throw new Error('所有分类数值之和 ≤ 0，饼图无法表示；请确认数值列或改用柱状图');
  const keptLabels = keepIdx.map((i) => labels[i]);
  const keptVals = keepIdx.map((i) => totals[i]);
  const keptGrand = keptVals.reduce((a, b) => a + b, 0);
  const order = keptVals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const sortedLabels = order.map((k) => keptLabels[k]);
  const sortedVals = order.map((k) => keptVals[k]);
  const shares = sortedVals.map((v) => v / keptGrand);
  let keepN = shares.length;
  while (keepN > 1 && shares[keepN - 1] < PIE_SMALL_THRESHOLD) keepN -= 1;
  const slices: PieSlice[] = sortedLabels.slice(0, keepN).map((l, i) => ({ label: l, value: sortedVals[i], share: shares[i] }));
  const otherN = shares.length - keepN;
  if (otherN) {
    const ov = sortedVals.slice(keepN).reduce((a, b) => a + b, 0);
    slices.push({ label: `其他（${otherN} 项）`, value: ov, share: ov / keptGrand });
    warnings.push(`${otherN} 个分类占比 < ${Math.round(PIE_SMALL_THRESHOLD * 100)}%，已并入「其他」`);
  }
  const top = slices[0] ?? { label: '—', value: 0, share: 0 };
  chart.quality.warnings = warnings.slice(0, 6);
  return {
    slices, grand: keptGrand, top, mode: chart.quality.mode,
    mapping: chart.quality.mapping, series_n: series.length,
    quality: chart.quality, kinds: chart.kinds,
  };
}
