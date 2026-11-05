// boxplot.to_boxplot 移植：group+value 原始观测 / group+min..max 汇总直绘。
import { firstKey, normKey, parseNumber, VALUE_ALIAS } from '../legacy-core.js';
import { BOX_GROUP_ALIAS, BOX_MAX_ALIAS, BOX_MED_ALIAS, BOX_MIN_ALIAS, BOX_Q1_ALIAS, BOX_Q3_ALIAS } from '../aliases.js';
import { isEcharts, type Raw } from './barline.js';


const quartile = (sv: number[], p: number) => {
  const n = sv.length;
  if (n === 1) return sv[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const frac = pos - lo;
  if (lo + 1 >= n) return sv[n - 1];
  return sv[lo] + frac * (sv[lo + 1] - sv[lo]);
};

export interface BoxGroup {
  name: string; n: number | null; min: number; q1: number; med: number;
  q3: number; max: number; mean: number; outliers: number[]; values: number[];
}
export interface BoxplotModel {
  mode: 'summary' | 'raw'; groups: BoxGroup[];
  counts: { groups: number; mode: string; outliers: number; vmin: number; vmax: number; n_total: number | null };
  quality: { rows: number; kept: number; warnings: string[]; confidence: string; mapping: Record<string, string | null> };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const okParse = (st: string) => st !== 'missing' && st !== 'invalid';

export function toBoxplot(raw: Raw): BoxplotModel {
  if (!Array.isArray(raw)) throw new Error('箱线图需要 group/value 行数据，暂不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  const gKey = firstKey(sample, BOX_GROUP_ALIAS) ?? Object.keys(sample)[0];
  const q1Key = firstKey(sample, BOX_Q1_ALIAS);
  const medKey = firstKey(sample, BOX_MED_ALIAS);
  const q3Key = firstKey(sample, BOX_Q3_ALIAS);
  const minKey = firstKey(sample, BOX_MIN_ALIAS);
  const maxKey = firstKey(sample, BOX_MAX_ALIAS);
  let vKey = firstKey(sample, VALUE_ALIAS);
  if (!vKey || vKey === gKey) {
    const used = new Set([gKey, q1Key, medKey, q3Key, minKey, maxKey].filter(Boolean) as string[]);
    vKey = null;
    for (const k of Object.keys(sample)) {
      if (used.has(k)) continue;
      const ok = raw.slice(0, 50).filter((row) => okParse(parseNumber(row[k])[1])).length;
      if (ok >= Math.max(1, Math.floor(0.8 * Math.min(raw.length, 50)))) { vKey = k; break; }
    }
  }
  const warnings: string[] = [];
  const groups: BoxGroup[] = [];
  let mode: 'summary' | 'raw';

  if (q1Key && medKey && q3Key) {
    mode = 'summary';
    let bad = 0;
    for (const row of raw) {
      const gv = row[gKey];
      if (gv === null || gv === undefined || gv === '') { bad += 1; continue; }
      const vals: Record<string, number | null> = {};
      let ok = true;
      for (const [name, k] of [['q1', q1Key], ['med', medKey], ['q3', q3Key], ['min', minKey], ['max', maxKey]] as [string, string | null][]) {
        if (!k) { vals[name] = null; continue; }
        const [num, st] = parseNumber(row[k]);
        if (!okParse(st)) {
          if (['q1', 'med', 'q3'].includes(name)) { ok = false; break; }
          vals[name] = null;
        } else vals[name] = num;
      }
      if (!ok) { bad += 1; continue; }
      if (vals['min'] === null) vals['min'] = vals['q1'];
      if (vals['max'] === null) vals['max'] = vals['q3'];
      const meanV = (vals['min']! + vals['q1']! + vals['med']! + vals['q3']! + vals['max']!) / 5;
      groups.push({
        name: String(gv).trim(), n: null, min: vals['min']!, q1: vals['q1']!,
        med: vals['med']!, q3: vals['q3']!, max: vals['max']!,
        mean: r4(meanV), outliers: [], values: [],
      });
    }
    if (!groups.length) throw new Error('汇总模式需要 min/q1/median/q3/max 可解析数值');
    if (bad) warnings.push(`${bad} 行分组或四分位缺失，已跳过`);
    if (!minKey || !maxKey) warnings.push('缺少 min/max 列：须线端点以 Q1/Q3 代替');
  } else {
    mode = 'raw';
    if (!vKey) throw new Error('箱线图需要 value 列（或 min/q1/median/q3/max 汇总列）');
    let bad = 0;
    const valsBy = new Map<string, number[]>();
    for (const row of raw) {
      const gv = row[gKey];
      if (gv === null || gv === undefined || gv === '') { bad += 1; continue; }
      const [num, st] = parseNumber(row[vKey]);
      if (!okParse(st)) { bad += 1; continue; }
      const name = String(gv).trim();
      const l = valsBy.get(name) ?? [];
      l.push(num); valsBy.set(name, l);
    }
    if (!valsBy.size) throw new Error('没有可解析的 (group, value) 行');
    if (bad) warnings.push(`${bad} 行分组或数值缺失，已跳过`);
    const small: string[] = [];
    for (const [name, vals] of valsBy) {
      vals.sort((a, b) => a - b);
      const n = vals.length;
      if (n < 5) small.push(`${name}(n=${n})`);
      const q1 = quartile(vals, 0.25), med = quartile(vals, 0.5), q3 = quartile(vals, 0.75);
      const iqr = q3 - q1;
      const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
      const inlier = vals.filter((v) => v >= loF && v <= hiF);
      const outliers = vals.filter((v) => v < loF || v > hiF).map(r4);
      groups.push({
        name, n, min: inlier.length ? inlier[0] : vals[0],
        q1: r4(q1), med: r4(med), q3: r4(q3),
        max: inlier.length ? inlier[inlier.length - 1] : vals[vals.length - 1],
        mean: r4(vals.reduce((a, b) => a + b, 0) / n),
        outliers,
        values: vals.length <= 2000 ? vals.map(r4) : [],
      });
    }
    if (small.length) warnings.push(`样本量过小（n<5），五数不稳定：${small.slice(0, 4).join('、')}`);
  }
  let allV = [...groups.map((g) => g.min), ...groups.map((g) => g.max)];
  for (const g of groups) allV = allV.concat(g.outliers);
  const nOut = groups.reduce((a, g) => a + g.outliers.length, 0);
  const counts = {
    groups: groups.length, mode, outliers: nOut,
    vmin: Math.min(...allV), vmax: Math.max(...allV),
    n_total: mode === 'raw' ? groups.reduce((a, g) => a + (g.n ?? 0), 0) : null,
  };
  return {
    mode, groups, counts,
    quality: {
      rows: raw.length, kept: groups.length, warnings: warnings.slice(0, 6),
      confidence: warnings.length ? 'medium' : 'high',
      mapping: mode === 'summary'
        ? { group: gKey, q1: q1Key, median: medKey, q3: q3Key, min: minKey, max: maxKey }
        : { group: gKey, value: vKey },
    },
  };
}
