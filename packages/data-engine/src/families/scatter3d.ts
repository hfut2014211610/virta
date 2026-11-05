// scatter3d.to_scatter3d 移植：to_scatter + 第三数值列作 Z。
import {
  firstKey, normKey, numericKeys, numericStats, parseNumber, type RawRow,
} from '../legacy-core.js';
import { Z_ALIAS } from '../aliases.js';
import { isEcharts, type Raw } from './barline.js';
import { toScatter, type ScatterModel } from './scatter.js';


export function toScatter3d(raw: Raw): ScatterModel {
  const base = toScatter(raw);
  const points = base.points;
  if (!points.length) throw new Error('数据为空');
  if (isEcharts(raw)) throw new Error('3D 散点暂不支持 ECharts JSON；请用 CSV/Excel，需 x/y/z 三个数值列');
  const rawRows = raw as RawRow[];
  const sample = rawRows[0];
  const keys = Object.keys(sample);
  const stats = numericStats(rawRows, keys);
  const numericCols = numericKeys(stats, keys, new Set());
  let zKey = firstKey(sample, Z_ALIAS);
  const xKey = base.x_key, yKey = base.y_key;
  let sizeKey = base.size_key;
  const used = new Set([xKey, yKey]);
  const remaining = numericCols.filter((k) => !used.has(k));
  if (zKey && !used.has(zKey)) {
    // 显式 z
  } else if (remaining.length) zKey = remaining[0];
  else if (sizeKey) { zKey = sizeKey; sizeKey = null; }
  else {
    throw new Error(`3D 散点需要三个数值列（x/y/z），当前只有 x=${xKey}、y=${yKey}。`);
  }
  used.add(zKey);
  const remaining2 = numericCols.filter((k) => !used.has(k));
  if (sizeKey === null && remaining2.length) sizeKey = remaining2[0];
  else if (sizeKey !== null && used.has(sizeKey)) sizeKey = null;

  points.forEach((p, i) => {
    [p.z] = parseNumber(rawRows[i][zKey]);
    if (sizeKey) [p.size] = parseNumber(rawRows[i][sizeKey]);
  });
  base.stats['z_missing'] = rawRows.filter((r) => parseNumber(r[zKey])[1] === 'missing').length;
  base.stats['z_invalid'] = rawRows.filter((r) => parseNumber(r[zKey])[1] === 'invalid').length;
  base['z_key'] = zKey;
  base.size_key = sizeKey;

  const ys = points.map((p) => p.y), zs = points.map((p) => p.z!);
  const n = points.length;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const mz = zs.reduce((a, b) => a + b, 0) / n;
  let syz = 0, syy = 0, szz = 0;
  for (let i = 0; i < n; i++) {
    syz += (ys[i] - my) * (zs[i] - mz);
    syy += (ys[i] - my) ** 2;
    szz += (zs[i] - mz) ** 2;
  }
  base['r_yz'] = syy > 0 && szz > 0 ? syz / Math.sqrt(syy * szz) : null;
  return base;
}
