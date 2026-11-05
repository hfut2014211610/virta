// heatmap.to_heatmap 移植：x/y/value → 矩阵；date/value → 日历（多年）。
import { firstKey, normKey, parseGanttDate, parseNumber, VALUE_ALIAS } from '../legacy-core.js';
import { HEAT_DATE_ALIAS, HEAT_X_ALIAS, HEAT_Y_ALIAS } from '../aliases.js';
import type { Raw } from './barline.js';


const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const okParse = (st: string) => st !== 'missing' && st !== 'invalid';
const fromOrdinal = (od: number) => new Date((od - 719163) * 86400000);
const isoOf = (od: number) => fromOrdinal(od).toISOString().slice(0, 10);
const yearOf = (od: number) => fromOrdinal(od).getUTCFullYear();
const NUM_ONLY = /^[+-]?\d+(\.\d+)?$/;

export interface HeatmapModel {
  mode: 'matrix' | 'calendar';
  xs?: string[]; ys?: string[];
  cells?: { x: number; y: number; v: number }[];
  years?: Record<string, [number, number][]>;
  vmin: number; vmax: number;
  counts: Record<string, unknown>;
  quality: { rows: number; kept: number; warnings: string[]; confidence: string; mapping: Record<string, string> };
}

export function toHeatmap(raw: Raw): HeatmapModel {
  if (!Array.isArray(raw)) throw new Error('热力图需要 x/y/value 或 date/value 形式的行数据，暂不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  const dateKey = firstKey(sample, HEAT_DATE_ALIAS);
  let xKey = firstKey(sample, HEAT_X_ALIAS);
  let yKey = firstKey(sample, HEAT_Y_ALIAS);
  let valKey = firstKey(sample, VALUE_ALIAS);
  if (!valKey || valKey === dateKey || valKey === xKey || valKey === yKey) {
    const used = new Set([dateKey, xKey, yKey].filter(Boolean) as string[]);
    valKey = null;
    for (const k of Object.keys(sample)) {
      if (used.has(k)) continue;
      const ok = raw.slice(0, 50).filter((row) => okParse(parseNumber(row[k])[1])).length;
      if (ok >= Math.max(1, Math.floor(0.8 * Math.min(raw.length, 50)))) { valKey = k; break; }
    }
  }
  let mode: 'calendar' | 'matrix';
  if (dateKey && valKey && dateKey !== valKey) {
    mode = 'calendar';
  } else {
    const isTextCol = (k: string) => {
      const bad = raw.slice(0, 50).filter((row) => !okParse(parseNumber(row[k])[1])).length;
      return bad >= Math.max(1, Math.floor(0.2 * Math.min(raw.length, 50)));
    };
    const used = new Set([valKey, dateKey].filter(Boolean) as string[]);
    if (!xKey) xKey = Object.keys(sample).find((k) => !used.has(k) && isTextCol(k)) ?? null;
    if (xKey) used.add(xKey);
    if (!yKey) yKey = Object.keys(sample).find((k) => !used.has(k) && isTextCol(k)) ?? null;
    if (xKey && yKey && valKey && valKey !== xKey && valKey !== yKey) mode = 'matrix';
    else throw new Error('热力图需要 x+y+value（矩阵）或 date+value（日历）三组列');
  }
  const warnings: string[] = [];
  let badVal = 0, badKey = 0;

  if (mode === 'matrix') {
    const xk = xKey!, yk = yKey!, vk = valKey!;
    const xs: string[] = [], ys: string[] = [];
    const cells = new Map<string, number>();
    let dup = 0;
    for (const row of raw) {
      const xv = row[xk], yv = row[yk];
      if (xv === null || xv === undefined || xv === '' || yv === null || yv === undefined || yv === '') { badKey += 1; continue; }
      const [num, st] = parseNumber(row[vk]);
      if (!okParse(st)) { badVal += 1; continue; }
      const xs_ = String(xv).trim(), ys_ = String(yv).trim();
      if (!xs.includes(xs_)) xs.push(xs_);
      if (!ys.includes(ys_)) ys.push(ys_);
      const sig = `${xs_}\x00${ys_}`;
      if (cells.has(sig)) dup += 1;
      cells.set(sig, (cells.get(sig) ?? 0) + num);
    }
    if (!cells.size) throw new Error('没有可解析的 (x, y, value) 行');
    const axisSort = (vals: string[]) =>
      vals.every((v) => NUM_ONLY.test(v)) ? [...vals].sort((a, b) => parseFloat(a) - parseFloat(b)) : vals;
    const xsS = axisSort(xs), ysS = axisSort(ys);
    const xi = new Map(xsS.map((v, i) => [v, i]));
    const yi = new Map(ysS.map((v, i) => [v, i]));
    const dataCells = [...cells.entries()].map(([sig, v]) => {
      const [a, b] = sig.split('\x00');
      return { x: xi.get(a)!, y: yi.get(b)!, v: r4(v) };
    });
    const vals = dataCells.map((c) => c.v);
    if (dup) warnings.push(`${dup} 个重复 (x,y) 格子，已求和合并`);
    if (badKey) warnings.push(`${badKey} 行缺 x 或 y，已跳过`);
    if (badVal) warnings.push(`${badVal} 行数值无法解析，已跳过`);
    const cover = dataCells.length / (xsS.length * ysS.length);
    if (cover < 0.5) warnings.push(`网格稀疏：覆盖率仅 ${Math.round(cover * 100)}%，空白格子过多`);
    const counts = { xs: xsS.length, ys: ysS.length, cells: dataCells.length, vmin: Math.min(...vals), vmax: Math.max(...vals), cover };
    return {
      mode: 'matrix', xs: xsS, ys: ysS, cells: dataCells,
      vmin: Math.min(...vals), vmax: Math.max(...vals), counts,
      quality: {
        rows: raw.length, kept: dataCells.length, warnings: warnings.slice(0, 6),
        confidence: warnings.length ? 'medium' : 'high',
        mapping: { x: xk, y: yk, value: vk },
      },
    };
  }

  const days = new Map<number, number>();
  for (const row of raw) {
    const [od, , dst] = parseGanttDate(row[dateKey!]);
    if (dst !== 'date' || od === null) { badKey += 1; continue; }
    const [num, st] = parseNumber(row[valKey!]);
    if (!okParse(st)) { badVal += 1; continue; }
    days.set(od, (days.get(od) ?? 0) + num);
  }
  if (!days.size) throw new Error('date 列无法解析为日期（支持 YYYY-MM-DD / YYYYMMDD / Y/M/D 等）');
  const years = new Map<number, [number, number][]>();
  for (const [od, v] of days) {
    const y = yearOf(od);
    const l = years.get(y) ?? [];
    l.push([od, r4(v)]);
    years.set(y, l);
  }
  const vals = [...days.values()];
  const peakOd = [...days.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  if (badKey) warnings.push(`${badKey} 行日期无法解析，已跳过`);
  if (badVal) warnings.push(`${badVal} 行数值无法解析，已跳过`);
  const total = Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
  const counts = {
    days: days.size, years: years.size, vmin: Math.min(...vals), vmax: Math.max(...vals),
    total, avg: Math.round((vals.reduce((a, b) => a + b, 0) / days.size) * 100) / 100,
    peak: isoOf(peakOd), peakv: Math.round(days.get(peakOd)! * 100) / 100,
  };
  const yearsOut: Record<string, [number, number][] > = {};
  for (const [y, ds] of [...years.entries()].sort((a, b) => a[0] - b[0])) {
    yearsOut[String(y)] = ds.sort((a, b) => a[0] - b[0]);
  }
  return {
    mode: 'calendar', years: yearsOut,
    vmin: Math.min(...vals), vmax: Math.max(...vals), counts,
    quality: {
      rows: raw.length, kept: days.size, warnings: warnings.slice(0, 6),
      confidence: warnings.length ? 'medium' : 'high',
      mapping: { date: dateKey!, value: valKey! },
    },
  };
}
