// grid.to_grid 移植：列分类 + 规范化行 + 质量骨架；≥2 维度且有数值列 → pivot。
import { newQuality, NUM_RATIO, numericStats, parseNumber, type LegacyQuality } from '../legacy-core.js';
import type { Raw } from './barline.js';

const MAX_ROWS = 5000;

export interface GridModel {
  mode: 'pivot' | 'detail';
  columns: { key: string; numeric: boolean; distinct: number }[];
  rows: Record<string, number | string | null>[];
  dims: string[]; measures: string[];
  n_rows: number; n_raw: number; quality: LegacyQuality;
}

export function toGrid(raw: Raw): GridModel {
  if (!Array.isArray(raw) || !raw.length) throw new Error('动态表需要行式表格数据（list[dict]）');
  const sample = raw[0];
  const keys = Object.keys(sample);
  const stats = numericStats(raw, keys);
  const numeric: Record<string, boolean> = {};
  for (const k of keys) numeric[k] = stats[k].ratio >= NUM_RATIO;
  const dims = keys.filter((k) => !numeric[k]);
  const measures = keys.filter((k) => numeric[k]);
  const truncated = raw.length > MAX_ROWS;
  const rows = raw.slice(0, MAX_ROWS).map((r) => {
    const row: Record<string, number | string | null> = {};
    for (const k of keys) {
      const v = r[k];
      if (numeric[k]) {
        const [num, status] = parseNumber(v);
        row[k] = (status === 'ok' || status === 'percent') && Number.isFinite(num) ? num : null;
      } else {
        row[k] = v === null || v === undefined || v === '' ? '—' : String(v);
      }
    }
    return row;
  });
  const q = newQuality(rows.length, 'grid');
  q.mapping = { label: '—', series: '—', value: measures.join(', ') || '—' };
  q.numeric_columns = measures;
  const miss = keys.reduce((a, k) => a + stats[k].missing, 0);
  const inv = keys.reduce((a, k) => a + stats[k].invalid, 0);
  q.missing = miss;
  q.invalid = inv;
  if (inv) q.warnings.push(`数值列含 ${inv} 个无法解析值，已置空（显示 —）`);
  if (miss) q.warnings.push(`全表含 ${miss} 个空值，显示为 —`);
  if (truncated) q.warnings.push(`行数超过 ${MAX_ROWS}，已截断（原始 ${raw.length} 行）`);
  if (!measures.length) q.warnings.push('无数值列：透视模式不可用，仅明细模式');
  if (!dims.length) q.warnings.push('无维度列：透视模式退化为单行合计');
  q.confidence = inv ? 'low' : miss ? 'medium' : 'high';
  return {
    mode: dims.length >= 2 && measures.length ? 'pivot' : 'detail',
    columns: keys.map((k) => ({
      key: k, numeric: numeric[k],
      distinct: new Set(raw.slice(0, MAX_ROWS).map((r) => String(r[k]))).size,
    })),
    rows, dims, measures,
    n_rows: rows.length, n_raw: raw.length, quality: q,
  };
}
