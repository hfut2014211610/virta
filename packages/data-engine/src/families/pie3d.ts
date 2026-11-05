// pie3d.to_pie3d 移植：每层 = 层内占比饼，跨层同色；层按总值降序。
import { esc, parseNumber, type LegacyQuality } from '../legacy-core.js';
import type { Raw } from './barline.js';
import { detectTreemapColumns } from './treemap.js';

const SMALL = 0.03;

interface Slice { label: string; value: number; share: number }
function mergeSmall(items: [string, number][]): [Slice[], number] {
  const total = items.reduce((a, [, v]) => a + v, 0);
  const ordered = [...items].sort((a, b) => b[1] - a[1]);
  let keepN = ordered.length;
  const shares = ordered.map(([, v]) => v / total);
  while (keepN > 1 && shares[keepN - 1] < SMALL) keepN -= 1;
  const slices: Slice[] = ordered.slice(0, keepN).map(([l, v], i) => ({ label: l, value: v, share: shares[i] }));
  const otherN = ordered.length - keepN;
  if (otherN) {
    const ov = ordered.slice(keepN).reduce((a, [, v]) => a + v, 0);
    slices.push({ label: `其他（${otherN} 项）`, value: ov, share: total ? ov / total : 0 });
  }
  return [slices, otherN];
}

export interface Pie3dModel {
  mode: string;
  layers: { name: string | null; value: number; share: number; slices: Slice[] }[];
  grand: number; n_layers: number;
  categories: string[]; n_categories: number;
  peak: { label: string; value: number; share: number; layer: string | null };
  mapping: Record<string, string>; quality: LegacyQuality;
}

export function toPie3d(raw: Raw): Pie3dModel {
  if (!Array.isArray(raw)) throw new Error('3D 饼图需要 group+label+value 或 label+value（CSV/Excel）；ECharts JSON 请先展开成表格');
  if (!raw.length) throw new Error('数据为空');
  const cols = detectTreemapColumns(raw);
  if (cols.value_key === null) throw new Error('3D 饼图需要数值列（label+value 或 group+label+value）');
  if (cols.label_key === null) throw new Error('3D 饼图需要标签列（label/名称/分类等）');
  const { value_key: valueKey, label_key: labelKey, group_key: groupKey } = cols;

  const rows: { label: string; group: string | null; value: number }[] = [];
  const neg: [string, number][] = [], zero: string[] = [];
  let missing = 0;
  raw.forEach((r, idx) => {
    const lv = r[labelKey];
    const lab = lv !== null && lv !== undefined && lv !== '' ? String(lv) : `行${idx + 1}`;
    let grp: string | null = null;
    if (groupKey) {
      const g = r[groupKey];
      grp = g !== null && g !== undefined && g !== '' ? String(g) : '未分组';
    }
    const [val, status] = parseNumber(r[valueKey]);
    if (status === 'missing') { missing += 1; return; }
    if (val < 0) neg.push([lab, val]);
    else if (val === 0) zero.push(lab);
    else rows.push({ label: lab, group: grp, value: val });
  });
  const warnings: string[] = [];
  if (neg.length) warnings.push(`${neg.length} 项为负值（如 ${neg.slice(0, 3).map(([l]) => esc(l)).join(', ')}），扇区面积无意义，已剔除`);
  if (zero.length) warnings.push(`${zero.length} 项为 0，已剔除（占比不可见）`);
  if (missing) warnings.push(`${missing} 项数值缺失，已跳过`);
  if (!rows.length) throw new Error('3D 饼图没有正值数据；请确认数值列或改用柱状图');
  const grand = rows.reduce((a, r) => a + r.value, 0);
  if (grand <= 0) throw new Error('所有数值之和 ≤ 0，3D 饼图无法表示；请确认数值列');

  let mode = groupKey ? 'grouped' : 'flat';
  const layerItems = new Map<string | null, [string, number][]>();
  for (const r of rows) {
    const g = groupKey ? r.group : null;
    const l = layerItems.get(g) ?? [];
    l.push([r.label, r.value]);
    layerItems.set(g, l);
  }
  const layers: Pie3dModel['layers'] = [];
  let mergedTotal = 0;
  const unique = new Map<string, number>();
  for (const [gname, items] of layerItems) {
    const lt = items.reduce((a, [, v]) => a + v, 0);
    const [slices, otherN] = mergeSmall(items);
    mergedTotal += otherN;
    for (const s of slices) if (!s.label.startsWith('其他')) unique.set(s.label, (unique.get(s.label) ?? 0) + s.value);
    layers.push({ name: gname, value: lt, share: grand ? lt / grand : 0, slices });
  }
  layers.sort((a, b) => b.value - a.value);
  if (mergedTotal) warnings.push(`共 ${mergedTotal} 个小份额（< 3%），已并入「其他」`);
  if (layers.length === 1 && groupKey === null) mode = 'flat';
  const categories = [...unique.keys()].sort((a, b) => unique.get(b)! - unique.get(a)!);
  let peak: { s: Slice; layer: string | null } = { s: { label: '—', value: 0, share: 0 }, layer: null };
  for (const l of layers) for (const s of l.slices) if (s.value > peak.s.value) peak = { s, layer: l.name };

  const quality: LegacyQuality = {
    rows: raw.length, mode,
    mapping: groupKey ? { group: groupKey, label: labelKey, value: valueKey } : { label: labelKey, value: valueKey },
    numeric_columns: [esc(valueKey)], missing, invalid: 0, percent: 0,
    negative: neg.length, anchors: 0, unknown_types: 0, kind_conflicts: 0,
    type_column: '—', duplicate_pairs: 0, warnings: warnings.slice(0, 6),
    confidence: warnings.length ? 'medium' : 'high',
  };
  return {
    mode, layers, grand, n_layers: layers.length,
    categories, n_categories: categories.length,
    peak: { label: peak.s.label, value: peak.s.value, share: peak.s.share, layer: peak.layer },
    mapping: quality.mapping, quality,
  };
}
