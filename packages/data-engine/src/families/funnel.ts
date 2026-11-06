// funnel.to_funnel 移植：行序 = 阶段序；step/cum/drop/drop_rate/worst。
import { esc, parseNumber } from '../legacy-core.js';
import { toChart, type Raw, type BarlineModel } from './barline.js';

export interface FunnelStage {
  label: string; value: number; step: number | null; cum: number;
  drop: number; drop_rate: number; index: number;
}
export interface FunnelModel {
  stages: FunnelStage[]; top: number; bottom: number; overall: number;
  worst: { label: string; drop_rate: number; drop: number } | null;
  mode: unknown; mapping: Record<string, string>; series_n: number;
  seriesStages?: { name: string; stages: { label: string; value: number; step: number | null }[] }[];
  quality: BarlineModel['quality']; kinds: string[];
}

export function toFunnel(raw: Raw): FunnelModel {
  const chart = toChart(raw);
  let { labels, series } = chart;
  // 漏斗兜底：label + 第二文本维（月份/渠道等，不在通用 series 别名）+ 数值 → 当系列用，让 multi 变体可用
  if (series.length <= 1 && Array.isArray(raw) && raw.length) {
    const cols = Object.keys(raw[0] as Record<string, unknown>);
    const labelKey = String(chart.quality.mapping.label ?? cols[0]);
    const valueKey = cols.filter((c) => c !== labelKey).reverse().find((c) => raw.some((r) => parseNumber((r as Record<string, unknown>)[c])[1] === 'ok'));
    const seriesKey = cols.find((c) => c !== labelKey && c !== valueKey && typeof (raw[0] as Record<string, unknown>)[c] === 'string');
    if (seriesKey && valueKey) {
      const labArr: string[] = [];
      const cell = new Map<string, number>();
      for (const r of raw as Record<string, unknown>[]) {
        const lab = String(r[labelKey] ?? ''); if (!lab) continue;
        if (!labArr.includes(lab)) labArr.push(lab);
        const [v, st] = parseNumber(r[valueKey]);
        if (st === 'ok' || st === 'percent') cell.set(`${lab}|${String(r[seriesKey] ?? '')}`, v);
      }
      const names = [...new Set(raw.map((r) => String((r as Record<string, unknown>)[seriesKey] ?? '')))].filter(Boolean);
      if (names.length > 1) {
        labels = labArr;
        series = names.map((name) => ({ name, values: labArr.map((l) => cell.get(`${l}|${name}`) ?? 0) }));
      }
    }
  }
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const warnings = [...chart.quality.warnings];
  const keep: number[] = [], neg: number[] = [], zero: number[] = [];
  totals.forEach((v, i) => {
    if (v < 0) neg.push(i);
    else if (v === 0) zero.push(i);
    else keep.push(i);
  });
  if (neg.length) warnings.push(`${neg.length} 个阶段为负值（${neg.slice(0, 3).map((i) => esc(labels[i])).join(', ')}），漏斗无法表示，已剔除`);
  if (zero.length) warnings.push(`${zero.length} 个阶段为 0，已剔除（后续转化率不可计算）`);
  if (!keep.length) throw new Error('没有有效的正值阶段，漏斗无法绘制；请确认数值列');
  if (keep.length < 2) warnings.push('仅 1 个有效阶段，漏斗至少需 2 级才能看转化');
  const keptLabels = keep.map((i) => labels[i]);
  const keptVals = keep.map((i) => totals[i]);
  const top = keptVals[0];
  const rises: [number, number][] = [];
  for (let i = 1; i < keptVals.length; i++) if (keptVals[i] > keptVals[i - 1]) rises.push([i, keptVals[i] - keptVals[i - 1]]);
  if (rises.length) warnings.push(`${rises.length} 处后一阶段大于前一阶段（如 ${esc(keptLabels[rises[0][0]])}），漏斗通常应单调递减，请确认阶段顺序`);
  const stages: FunnelStage[] = [];
  let prev: number | null = null;
  keptLabels.forEach((lab, i) => {
    const v = keptVals[i];
    stages.push({
      label: lab, value: v,
      step: prev ? v / prev : null,
      cum: v / top,
      drop: prev !== null ? prev - v : 0,
      drop_rate: prev ? (prev - v) / prev : 0,
      index: i,
    });
    prev = v;
  });
  const withStep = stages.filter((s) => s.step !== null);
  const worst = withStep.length ? withStep.reduce((a, b) => (b.drop_rate > a.drop_rate ? b : a)) : null;
  chart.quality.warnings = warnings.slice(0, 6);
  return {
    stages, top, bottom: keptVals[keptVals.length - 1],
    overall: top ? keptVals[keptVals.length - 1] / top : 0,
    worst: worst ? { label: worst.label, drop_rate: worst.drop_rate, drop: worst.drop } : null,
    mode: chart.quality.mode, mapping: chart.quality.mapping,
    series_n: series.length,
    seriesStages: series.length > 1 ? series.map((s) => ({
      name: s.name,
      stages: keep.map((ki, i) => {
        const v = s.values[ki] ?? 0;
        const prev = i ? s.values[keep[i - 1]] : null;
        return { label: keptLabels[i], value: v, step: prev ? v / prev : null };
      }),
    })) : undefined,
    quality: chart.quality, kinds: chart.kinds,
  };
}
