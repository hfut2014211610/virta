// scatter.to_scatter 移植：x/y 数值散点 + 可选 size/group/label。
import {
  firstKey, normKey, numericKeys, numericStats, NUM_RATIO, parseNumber,
  rowLabel, SERIES_ALIAS, SIZE_ALIAS, X_ALIAS, Y_ALIAS, type RawRow,
} from '../legacy-core.js';
import { SC_LABEL_ALIAS } from '../aliases.js';
import { isEcharts, type Raw } from './barline.js';


export interface ScatterPoint { label: string; group: string; x: number; y: number; size: number | null; z?: number }
export interface ScatterFit { m: number; b: number; x0: number; x1: number; r: number | null }
export interface ScatterModel {
  points: ScatterPoint[]; groups: string[]; fit: ScatterFit | null;
  label_key: string; x_key: string; y_key: string;
  size_key: string | null; group_key: string | null;
  stats: Record<string, number>; mode: string;
  [k: string]: unknown;
}

export function toScatter(raw: Raw): ScatterModel {
  if (!Array.isArray(raw) && !isEcharts(raw)) throw new Error('数据为空');
  let points: ScatterPoint[] = [];
  let groups: string[] = [];
  let labelKey: string, xKey: string, yKey: string;
  let sizeKey: string | null, groupKey: string | null;
  let stats2: Record<string, number>;

  if (isEcharts(raw)) {
    const e = raw.__echarts;
    const pts: ScatterPoint[] = [];
    let invalid = 0;
    const xa = e['xAxis'];
    const xLabels = xa && typeof xa === 'object' ? ((xa as Record<string, unknown>)['data'] ?? []) as unknown[] : [];
    ((e['series'] ?? []) as Record<string, unknown>[]).forEach((s, i) => {
      const gname = String(s['name'] ?? `系列${i + 1}`);
      ((s['data'] ?? []) as unknown[]).forEach((p, j) => {
        if (Array.isArray(p) && p.length >= 2) {
          const [x, sx] = parseNumber(p[0]);
          const [y, sy] = parseNumber(p[1]);
          if (sx === 'invalid') invalid += 1;
          if (sy === 'invalid') invalid += 1;
          let sz: number | null = null;
          if (p.length >= 3) [sz] = parseNumber(p[2]);
          const lab = j < xLabels.length ? String(xLabels[j]) : `${gname}·${j + 1}`;
          pts.push({ label: lab, group: gname, x, y, size: sz });
        }
      });
    });
    if (!pts.length) throw new Error('ECharts 散点需 series[].data 为 [x, y] 或 [x, y, size] 数组');
    stats2 = { x_missing: 0, y_missing: 0, x_invalid: invalid, y_invalid: 0 };
    points = pts;
    labelKey = '(序号)'; xKey = '(x)'; yKey = '(y)';
    sizeKey = null; groupKey = '(series)';
    groups = [...new Set(pts.map((p) => p.group))].sort();
  } else {
    const raw0 = raw as RawRow[];
    if (!raw0.length) throw new Error('数据为空');
    const sample = raw0[0];
    const keys = Object.keys(sample);
    xKey = firstKey(sample, X_ALIAS) as string;
    yKey = firstKey(sample, Y_ALIAS) as string;
    sizeKey = firstKey(sample, SIZE_ALIAS);
    const stats = numericStats(raw0, keys);
    const numericCols = numericKeys(stats, keys, new Set());
    const textCols = keys.filter((k) => stats[k].ratio < NUM_RATIO);
    groupKey = textCols.find((k) => k !== xKey && k !== yKey && k !== sizeKey && SERIES_ALIAS.includes(normKey(k))) ?? null;
    labelKey = textCols.find((k) => SC_LABEL_ALIAS.includes(normKey(k)) && k !== groupKey) ?? null as unknown as string;
    if (labelKey === null || labelKey === undefined) {
      labelKey = (textCols.find((k) => k !== groupKey) ?? null)
        ?? (textCols.find((k) => SC_LABEL_ALIAS.includes(normKey(k))) ?? null)
        ?? groupKey ?? keys[0];
    }
    if (labelKey === groupKey) groupKey = null;
    const excluded = new Set<string>([labelKey, ...(groupKey ? [groupKey] : []), ...(sizeKey ? [sizeKey] : [])]);
    const xyCands = numericCols.filter((k) => !excluded.has(k));
    if (!xKey && !yKey) {
      if (xyCands.length < 2) {
        throw new Error(`找不到两个数值列：散点需要 x / y 两列数值（当前数值列：${xyCands.join(', ') || '无'}）。`);
      }
      [xKey, yKey] = [xyCands[0], xyCands[1]];
    } else if (!xKey) xKey = xyCands.find((k) => k !== yKey) as string;
    else if (!yKey) yKey = xyCands.find((k) => k !== xKey) as string;
    if (!xKey || !yKey || xKey === yKey) throw new Error(`散点需要两个不同的数值列（当前数值列：${xyCands.join(', ') || '无'}）`);

    stats2 = { x_missing: 0, y_missing: 0, x_invalid: 0, y_invalid: 0 };
    const groupsSet = new Map<string, true>();
    for (const r of raw0) {
      const lab = rowLabel(r, labelKey);
      const g = groupKey ? rowLabel(r, groupKey) : '全部';
      groupsSet.set(g, true);
      const [x, xs] = parseNumber(r[xKey]);
      const [y, ys] = parseNumber(r[yKey]);
      let sz: number | null = null;
      if (sizeKey) [sz] = parseNumber(r[sizeKey]);
      if (xs === 'missing') stats2.x_missing += 1;
      else if (xs === 'invalid') stats2.x_invalid += 1;
      if (ys === 'missing') stats2.y_missing += 1;
      else if (ys === 'invalid') stats2.y_invalid += 1;
      points.push({ label: lab, group: g, x, y, size: sz });
    }
    groups = [...groupsSet.keys()];
  }

  const xsAll = points.map((p) => p.x), ysAll = points.map((p) => p.y);
  const n = points.length;
  const mx = xsAll.reduce((a, b) => a + b, 0) / n;
  const my = ysAll.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xsAll[i] - mx) * (ysAll[i] - my);
    sxx += (xsAll[i] - mx) ** 2;
    syy += (ysAll[i] - my) ** 2;
  }
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  const fit: ScatterFit | null = sxx > 0
    ? { m: sxy / sxx, b: my - (sxy / sxx) * mx, x0: Math.min(...xsAll), x1: Math.max(...xsAll), r }
    : null;
  return {
    points, groups, fit,
    label_key: labelKey, x_key: xKey, y_key: yKey,
    size_key: sizeKey, group_key: groupKey, stats: stats2,
    mode: isEcharts(raw) ? 'echarts' : 'table',
  };
}
