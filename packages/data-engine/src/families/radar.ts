// radar.to_radar 移植：宽表（label + N 数值列）或长表（axis+item+value）→ 各轴归一。
import { newQuality, parseNumber, type LegacyQuality, type RawRow } from '../legacy-core.js';
import { toChart, type Raw } from './barline.js';

export function isNumericCol(rows: RawRow[], key: string): boolean {
  let ok = 0;
  for (const r of rows) {
    const [, status] = parseNumber(r[key]);
    if (status === 'ok' || status === 'percent') ok += 1;
  }
  return ok >= 0.8 * Math.max(1, rows.length);
}

interface RadarAxis { label: string; max: number; min: number }
interface RadarItem {
  name: string; values: number[]; norm: number[];
  area: number; avg: number; min_i: number; max_i: number;
}
export interface RadarModel {
  axes: RadarAxis[]; items: RadarItem[]; nax: number; leader: string;
  mapping: Record<string, string>; series_n: number; mode: unknown;
  quality: LegacyQuality; kinds: string[];
}

const polyArea = (pts: number[]) => {
  const n = pts.length;
  if (n < 3) return 0;
  const ang = (2 * Math.PI) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += 0.5 * pts[i] * pts[(i + 1) % n] * Math.sin(ang);
  return Math.abs(s);
};

const norm = (axis: RadarAxis, v: number) =>
  axis.max === axis.min ? 0 : Math.max(0, Math.min(1, (v - axis.min) / (axis.max - axis.min)));

export function toRadar(raw: Raw): RadarModel {
  const chart = toChart(raw);
  const { labels, series } = chart;
  // 长表展开：单系列"数值"且 ≥2 文本列 + 1 数值列 → (维度, 对比项)
  if (series.length === 1 && series[0].name === '数值' && Array.isArray(raw) && raw.length) {
    const keys = Object.keys(raw[0]);
    const textKeys = keys.filter((k) => !isNumericCol(raw, k));
    const valueKeys = keys.filter((k) => isNumericCol(raw, k));
    if (textKeys.length >= 2 && valueKeys.length === 1) {
      return radarFromLong(raw, textKeys[0], textKeys[1], valueKeys[0]);
    }
  }
  const nax = labels.length;
  if (nax < 3) throw new Error(`雷达图至少需要 3 个轴（当前 ${nax} 个）；请提供 ≥3 行数据，每行是一个维度轴`);
  const axisMax = labels.map((_, i) => (series.length ? Math.max(...series.map((s) => s.values[i])) : 0));
  const negAxes = labels.filter((_, i) => series.some((s) => s.values[i] < 0));
  const warnings = [...chart.quality.warnings];
  if (negAxes.length) {
    warnings.push(`${negAxes.length} 个轴含负值（${negAxes.slice(0, 3).join(', ')}），归一化时按该轴最小值平移，占比仅在该轴内可比`);
  }
  const axes: RadarAxis[] = labels.map((lab, i) => {
    const vals = series.map((s) => s.values[i]);
    const mn = Math.min(...vals);
    return { label: lab, max: axisMax[i], min: mn < 0 ? mn : 0 };
  });
  const items: RadarItem[] = series.map((s) => {
    const pts = axes.map((a, i) => norm(a, s.values[i]));
    return {
      name: s.name, values: s.values, norm: pts,
      area: polyArea(pts), avg: pts.reduce((a, b) => a + b, 0) / nax,
      min_i: pts.indexOf(Math.min(...pts)), max_i: pts.indexOf(Math.max(...pts)),
    };
  });
  const ranked = [...items].sort((a, b) => b.area - a.area);
  chart.quality.warnings = warnings.slice(0, 6);
  return {
    axes, items, nax, leader: ranked[0]?.name ?? '—',
    mapping: chart.quality.mapping, series_n: series.length, mode: chart.quality.mode,
    quality: chart.quality, kinds: chart.kinds,
  };
}

function radarFromLong(rows: RawRow[], axisKey: string, itemKey: string, valueKey: string): RadarModel {
  const axesOrder: string[] = [], itemsOrder: string[] = [];
  const grouped = new Map<string, number>();
  for (const r of rows) {
    const ax = r[axisKey] !== null && r[axisKey] !== undefined && r[axisKey] !== '' ? String(r[axisKey]) : '?';
    const it = r[itemKey] !== null && r[itemKey] !== undefined && r[itemKey] !== '' ? String(r[itemKey]) : '?';
    const [val] = parseNumber(r[valueKey]);
    if (!axesOrder.includes(ax)) axesOrder.push(ax);
    if (!itemsOrder.includes(it)) itemsOrder.push(it);
    const sig = `${it}\x00${ax}`;
    grouped.set(sig, (grouped.get(sig) ?? 0) + val);
  }
  const nax = axesOrder.length;
  const axes: RadarAxis[] = axesOrder.map((a) => ({ label: a, max: 0, min: 0 }));
  const items: RadarItem[] = itemsOrder.map((item) => ({
    name: item, values: axesOrder.map((a) => grouped.get(`${item}\x00${a}`) ?? 0),
    norm: [], area: 0, avg: 0, min_i: 0, max_i: 0,
  }));
  for (let i = 0; i < nax; i++) {
    axes[i].max = items.length ? Math.max(...items.map((it) => it.values[i])) : 0;
    const mn = items.length ? Math.min(...items.map((it) => it.values[i])) : 0;
    axes[i].min = mn < 0 ? mn : 0;
  }
  const warnings: string[] = [];
  const negAxes = axes.filter((_, i) => items.some((it) => it.values[i] < 0)).map((a) => a.label);
  if (negAxes.length) warnings.push(`${negAxes.length} 个轴含负值（${negAxes.slice(0, 3).join(', ')}），归一化时按该轴最小值平移，占比仅在该轴内可比`);
  for (const it of items) {
    it.norm = axes.map((a, i) => norm(a, it.values[i]));
    it.area = polyArea(it.norm);
    it.avg = it.norm.reduce((a, b) => a + b, 0) / nax;
    it.min_i = it.norm.indexOf(Math.min(...it.norm));
    it.max_i = it.norm.indexOf(Math.max(...it.norm));
  }
  const ranked = [...items].sort((a, b) => b.area - a.area);
  const quality = newQuality(rows.length, 'long');
  quality.mapping = { label: axisKey, series: itemKey, value: valueKey };
  quality.warnings = warnings.slice(0, 6);
  return {
    axes, items, nax, leader: ranked[0]?.name ?? '—',
    mapping: quality.mapping, series_n: items.length, mode: 'long',
    quality, kinds: axesOrder.map(() => 'delta'),
  };
}
