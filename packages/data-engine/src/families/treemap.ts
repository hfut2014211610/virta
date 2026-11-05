// treemap.to_treemap 移植：label+value 平铺 / group+label+value 两层。
import {
  esc, firstKey, newQuality, normKey, parseNumber, VALUE_ALIAS,
  type LegacyQuality, type RawRow,
} from '../legacy-core.js';
import { TREEMAP_GROUP_ALIAS } from '../aliases.js';
import { isNumericCol } from './radar.js';
import type { Raw } from './barline.js';


export interface TreemapCols { group_key: string | null; label_key: string | null; value_key: string | null; numeric_keys: string[] }

export function detectTreemapColumns(raw: RawRow[]): TreemapCols {
  const sample = raw[0];
  const keys = Object.keys(sample);
  const textKeys = keys.filter((k) => !isNumericCol(raw, k));
  const numericKeys = keys.filter((k) => isNumericCol(raw, k));
  const valueAliasKey = firstKey(sample, VALUE_ALIAS);
  let valueKey: string | null;
  if (valueAliasKey && isNumericCol(raw, valueAliasKey)) valueKey = valueAliasKey;
  else valueKey = numericKeys[0] ?? null;
  if (!textKeys.length || valueKey === null) {
    return { group_key: null, label_key: textKeys[0] ?? null, value_key: valueKey, numeric_keys: numericKeys };
  }
  if (textKeys.length === 1) {
    return { group_key: null, label_key: textKeys[0], value_key: valueKey, numeric_keys: numericKeys };
  }
  const aliasGrp = firstKey(sample, TREEMAP_GROUP_ALIAS);
  let grp: string, labelKey: string;
  if (aliasGrp && textKeys.includes(aliasGrp)) {
    grp = aliasGrp;
    labelKey = textKeys.find((k) => k !== grp)!;
  } else {
    const uniq = (k: string) => new Set(raw.map((r) => String(r[k]))).size;
    const sorted = [...textKeys].sort((a, b) => uniq(a) - uniq(b));
    grp = sorted[0];
    labelKey = sorted[sorted.length - 1];
  }
  return { group_key: grp, label_key: labelKey, value_key: valueKey, numeric_keys: numericKeys };
}

export interface TreemapChild { label: string; value: number; share: number }
export interface TreemapModel {
  mode: 'grouped' | 'flat'; total: number; warnings: string[];
  groups?: { name: string; value: number; share: number; children: TreemapChild[] }[];
  flat?: TreemapChild[];
  n_groups?: number; n_leaf: number;
  top: TreemapChild;
  mapping: Record<string, string>; quality: LegacyQuality;
}

export function toTreemap(raw: Raw): TreemapModel {
  if (!Array.isArray(raw)) throw new Error('树状图暂不支持 ECharts JSON；请用 CSV/Excel 的 label+value 或 group+label+value');
  if (!raw.length) throw new Error('数据为空');
  const cols = detectTreemapColumns(raw);
  if (cols.value_key === null) throw new Error('树状图需要数值列（label+value 或 group+label+value）');
  if (cols.label_key === null) throw new Error('树状图需要标签列（label/name/名称/分类等）');
  const { value_key: valueKey, label_key: labelKey, group_key: groupKey } = cols;
  const quality = newQuality(raw.length, groupKey ? 'long' : 'single');

  const rows: { label: string; group: string | null; value: number }[] = [];
  const neg: [string, number][] = [], zero: string[] = [];
  let missing = 0;
  const labelCount = new Map<string, number>();
  raw.forEach((r, idx) => {
    let lab = r[labelKey];
    lab = lab !== null && lab !== undefined && lab !== '' ? String(lab) : `行${idx + 1}`;
    const cnt = labelCount.get(lab as string);
    if (cnt !== undefined) { labelCount.set(lab as string, cnt + 1); lab = `${lab}#${cnt + 1}`; }
    else labelCount.set(lab as string, 1);
    const [val, status] = parseNumber(r[valueKey]);
    let grp: string | null = null;
    if (groupKey) {
      const g = r[groupKey];
      grp = g !== null && g !== undefined && g !== '' ? String(g) : '未分组';
    }
    if (status === 'missing') { missing += 1; return; }
    if (val < 0) neg.push([lab as string, val]);
    else if (val === 0) zero.push(lab as string);
    else rows.push({ label: lab as string, group: grp, value: val });
  });
  const warnings: string[] = [...quality.warnings];
  if (neg.length) warnings.push(`${neg.length} 项为负值（如 ${neg.slice(0, 3).map(([l]) => esc(l)).join(', ')}），矩形面积无意义，已剔除`);
  if (zero.length) warnings.push(`${zero.length} 项为 0，已剔除（面积不可见）`);
  if (missing) warnings.push(`${missing} 项数值缺失，已跳过`);
  if (!rows.length) throw new Error('树状图没有正值数据；请确认数值列或改用柱状图');
  const total = rows.reduce((a, x) => a + x.value, 0);
  if (total <= 0) throw new Error('树状图数值之和 ≤ 0，无法表示；请确认数值列');

  const result: TreemapModel = {
    mode: groupKey ? 'grouped' : 'flat', total, warnings,
    n_leaf: rows.length, top: { label: '', value: 0, share: 0 }, mapping: {}, quality,
  };
  if (groupKey) {
    const gmap = new Map<string, typeof rows>();
    for (const x of rows) {
      const g = gmap.get(x.group!) ?? [];
      g.push(x); gmap.set(x.group!, g);
    }
    const groupNames = [...gmap.keys()].sort((a, b) =>
      -(gmap.get(a)!.reduce((s, x) => s + x.value, 0) - gmap.get(b)!.reduce((s, x) => s + x.value, 0)));
    const groups = groupNames.map((gname) => {
      const children = [...gmap.get(gname)!].sort((a, b) => b.value - a.value);
      const gval = children.reduce((s, c) => s + c.value, 0);
      return {
        name: gname, value: gval, share: gval / total,
        children: children.map((c) => ({ label: c.label, value: c.value, share: c.value / total })),
      };
    });
    result.groups = groups;
    result.n_groups = groups.length;
    const top = rows.reduce((a, b) => (b.value > a.value ? b : a));
    result.top = { label: top.label, value: top.value, share: top.value / total };
    quality.mapping = { group: groupKey, label: labelKey, value: valueKey };
    quality.mode = 'long';
  } else {
    const flat = [...rows].sort((a, b) => b.value - a.value)
      .map((x) => ({ label: x.label, value: x.value, share: x.value / total }));
    result.flat = flat;
    result.top = { ...flat[0] };
    quality.mapping = { label: labelKey, value: valueKey };
    quality.mode = 'single';
  }
  quality.warnings = warnings.slice(0, 6);
  result.mapping = quality.mapping;
  result.quality = quality;
  return result;
}
