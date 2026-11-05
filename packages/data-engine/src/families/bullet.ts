// bullet.to_bullet 移植：label + actual + target（可选 poor/good/max），scale=1.08*max。
import {
  ACTUAL_ALIAS, firstKey, GOOD_ALIAS, LABEL_ALIASES, MAX_ALIAS, newQuality,
  parseNumber, POOR_ALIAS, rowLabel, TARGET_ALIAS, type LegacyQuality,
} from '../legacy-core.js';
import { isEcharts, type Raw } from './barline.js';

export interface BulletItem {
  label: string; actual: number; target: number;
  poor: number | null; good: number | null; max: number | null;
  ratio?: number | null; gap?: number; status?: string;
}
export interface BulletModel {
  items: BulletItem[]; scale: number; hits: number; rows: number;
  avg_ratio: number; under_08: number;
  mapping: Record<string, string>; quality: LegacyQuality;
}

export function toBullet(raw: Raw): BulletModel {
  if (isEcharts(raw)) throw new Error('Bullet 子弹图不支持 ECharts JSON；请使用 label/actual/target 宽表');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  const keys = Object.keys(sample);
  const labelKey = firstKey(sample, LABEL_ALIASES) ?? keys[0];
  const actualKey = firstKey(sample, ACTUAL_ALIAS);
  const targetKey = firstKey(sample, TARGET_ALIAS);
  const poorKey = firstKey(sample, POOR_ALIAS);
  const goodKey = firstKey(sample, GOOD_ALIAS);
  const maxKey = firstKey(sample, MAX_ALIAS);
  if (!actualKey || !targetKey) {
    const missing = [['actual/实际', actualKey], ['target/目标', targetKey]]
      .filter(([, k]) => !k).map(([n]) => n).join('、');
    throw new Error(`缺少必需列 ${missing}；Bullet 需要 label + actual + target（可选 poor/good/max）`);
  }
  const items: BulletItem[] = [];
  const stats = { missing: 0, invalid: 0, negative: 0, poor_gte_good: 0, duplicate_labels: 0 };
  const seen = new Set<string>();
  let maxSeed = 0;
  for (const row of raw) {
    const lab = rowLabel(row, labelKey);
    const [av, aSt] = parseNumber(row[actualKey]);
    const [tv, tSt] = parseNumber(row[targetKey]);
    const [pv0, pSt] = poorKey ? parseNumber(row[poorKey]) : [0, 'missing' as const, null];
    const [gv0, gSt] = goodKey ? parseNumber(row[goodKey]) : [0, 'missing' as const, null];
    const [mv0, mSt] = maxKey ? parseNumber(row[maxKey]) : [0, 'missing' as const, null];
    const pv = pSt !== 'missing' ? pv0 : null;
    const gv = gSt !== 'missing' ? gv0 : null;
    const mv = mSt !== 'missing' ? mv0 : null;
    const pairs: [string | null, string][] = [
      [actualKey, aSt], [targetKey, tSt], [poorKey, pSt], [goodKey, gSt], [maxKey, mSt],
    ];
    for (const [key, status] of pairs) {
      if (key === null) continue;
      if (status === 'missing') stats.missing += 1;
      else if (status === 'invalid') stats.invalid += 1;
    }
    if (aSt !== 'missing' && av < 0) stats.negative += 1;
    if (tSt !== 'missing' && tv < 0) stats.negative += 1;
    if (seen.has(lab)) stats.duplicate_labels += 1;
    seen.add(lab);
    const candidates = pairs.filter(([k, st]) => k && st !== 'missing')
      .map(([k], i) => [av, tv, pv0, gv0, mv0][i]);
    maxSeed = Math.max(maxSeed, ...candidates.map(Math.abs));
    items.push({ label: lab, actual: av, target: tv, poor: pv, good: gv, max: mv });
  }
  if (stats.negative) throw new Error('Bullet 指标不能为负数；负值请使用分组/堆叠/瀑布图');
  const scale = Math.max(maxSeed, 1) * 1.08;
  for (const item of items) {
    if (item.poor === null) item.poor = scale * 0.55;
    if (item.good === null) item.good = scale * 0.8;
    if (item.poor >= item.good) {
      stats.poor_gte_good += 1;
      item.poor = scale * 0.55;
      item.good = scale * 0.8;
    }
    item.max = scale;
    const denom = item.target;
    item.ratio = denom ? item.actual / denom : null;
    item.gap = item.actual - denom;
    item.status = denom && item.actual >= denom ? 'hit' : (denom && item.actual >= denom * 0.8 ? 'watch' : 'miss');
  }
  const rows = items.length;
  const hits = items.filter((x) => x.status === 'hit').length;
  const ratios = items.filter((x) => x.ratio !== null).map((x) => x.ratio!);
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / Math.max(1, ratios.length);
  const under08 = items.filter((x) => x.ratio !== null && x.ratio! < 0.8).length;
  const quality = newQuality(rows, 'bullet');
  quality.mapping = { label: labelKey, series: '(actual/target)', value: `${actualKey} / ${targetKey}` };
  quality.type_column = '—';
  quality.missing = stats.missing;
  quality.invalid = stats.invalid;
  quality.negative = stats.negative;
  quality.duplicate_labels = stats.duplicate_labels;
  quality.numeric_columns = [actualKey, targetKey, poorKey, goodKey, maxKey].filter(Boolean) as string[];
  if (stats.missing || stats.poor_gte_good || stats.duplicate_labels) {
    if (stats.missing) quality.warnings.push(`指标含 ${stats.missing} 个空值/缺失，已按 0 计`);
    if (stats.poor_gte_good) quality.warnings.push(`${stats.poor_gte_good} 行 poor ≥ good，已回退为 55%/80% 默认刻度`);
    if (stats.duplicate_labels) quality.warnings.push(`重复指标名 ${stats.duplicate_labels} 次；Bullet 不求和，请确认是否需要去重`);
    quality.confidence = stats.invalid === 0 ? 'medium' : 'low';
  }
  if (stats.invalid) {
    quality.warnings.push(`含 ${stats.invalid} 个无法解析数值，已按 0 计`);
    quality.confidence = 'low';
  }
  quality.warnings = quality.warnings.slice(0, 6);
  return { items, scale, hits, rows, avg_ratio: avgRatio, under_08: under08, mapping: quality.mapping, quality };
}
