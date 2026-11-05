// T2 新视图适配器（M7，无 legacy 对应）：tree / network / control / parallel。
import {
  firstKey, LABEL_ALIASES, newQuality, parseNumber, rowLabel, VALUE_ALIAS,
  type LegacyQuality,
} from '../legacy-core.js';
import { isEcharts, type Raw } from './barline.js';
import {
  CONTROL_DATE_ALIAS, CONTROL_GROUP_ALIAS, CONTROL_LCL_ALIAS, CONTROL_N_ALIAS, CONTROL_UCL_ALIAS,
  PARALLEL_GROUP_ALIAS, SANKEY_SOURCE_ALIAS, SANKEY_TARGET_ALIAS,
  TREE_ID_ALIAS, TREE_NAME_ALIAS, TREE_PARENT_ALIAS,
} from '../aliases.js';

interface Row { [k: string]: unknown }
const cols = (r: Row) => (r ? Object.keys(r) : []);
const isNum = (x: unknown) => typeof x === 'number' || ['ok', 'percent'].includes(parseNumber(x)[1]);
const isDate = (x: unknown) => typeof x === 'string' && /^\d{4}[-/]\d{1,2}/.test(x.trim());

// ── tree ────────────────────────────────────────────────────────────
export interface TreeNode {
  id: string; parent: string | null; name: string; value?: number; depth: number;
}
export interface TreeModel {
  nodes: TreeNode[]; roots: string[]; form: 'idparent' | 'levels';
  value_key?: string; quality: LegacyQuality;
}
export function toTree(raw: Raw): TreeModel {
  if (isEcharts(raw)) throw new Error('tree 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const rows = raw as Row[];
  const sample = rows[0];
  const idKey = firstKey(sample, TREE_ID_ALIAS);
  const parentKey = firstKey(sample, TREE_PARENT_ALIAS);
  const q = newQuality(rows.length, 'tree');

  if (idKey && parentKey) {
    const nameKey = firstKey(sample, TREE_NAME_ALIAS)
      ?? cols(sample).find((k) => ![idKey, parentKey].includes(k) && !isNum(sample[k]));
    const valueKey = cols(sample).find((k) => ![idKey, parentKey, nameKey].includes(k)
      && rows.some((r) => isNum(r[k])));
    q.mapping = { id: idKey, parent: parentKey, name: nameKey ?? idKey, ...(valueKey ? { value: valueKey } : {}) };
    const nodes: TreeNode[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const id = rowLabel(r, idKey);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const pid = rowLabel(r, parentKey);
      nodes.push({
        id, parent: pid || null,
        name: nameKey ? rowLabel(r, nameKey) || id : id,
        value: valueKey ? parseNumber(r[valueKey])[0] : undefined,
        depth: 0,
      });
    }
    // 未知父引用 → 挂为根
    const byId = new Map(nodes.map((nd) => [nd.id, nd]));
    for (const nd of nodes) if (nd.parent && !byId.has(nd.parent)) nd.parent = null;
    const kids = new Map<string | null, TreeNode[]>();
    for (const nd of nodes) { const p = nd.parent ?? null; if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(nd); }
    // depth + 后代求和（汇总值）
    const sum = (nd: TreeNode, d: number): number => {
      nd.depth = d;
      let acc = nd.value ?? 0;
      for (const c of kids.get(nd.id) ?? []) acc += sum(c, d + 1);
      nd.value = acc || undefined;
      return acc;
    };
    const roots = (kids.get(null) ?? []).map((nd) => nd.id);
    for (const rid of roots) sum(byId.get(rid)!, 0);
    return { nodes, roots, form: 'idparent', value_key: valueKey, quality: q };
  }

  // level1..N 形态：非数值列按列序成层级
  const levelKeys = cols(sample).filter((k) => !isNum(sample[k]));
  const valueKey = cols(sample).find((k) => isNum(sample[k]));
  if (levelKeys.length < 2) throw new Error('需要 id+parent 列或 ≥2 个层级列；tree 无法成树');
  q.mapping = { level: levelKeys.join('|'), ...(valueKey ? { value: valueKey } : {}) };
  const nodes: TreeNode[] = [];
  const seen = new Map<string, TreeNode>();
  const roots: string[] = [];
  const touch = (path: string[]): TreeNode => {
    const key = path.join('/');
    let nd = seen.get(key);
    if (!nd) {
      nd = {
        id: key, parent: path.length > 1 ? path.slice(0, -1).join('/') : null,
        name: path[path.length - 1], depth: path.length - 1, value: 0,
      };
      seen.set(key, nd); nodes.push(nd);
      if (path.length === 1) roots.push(key);
    }
    return nd;
  };
  for (const r of rows) {
    const [v] = valueKey ? parseNumber(r[valueKey]) : [0];
    const path: string[] = [];
    for (const lk of levelKeys) {
      const name = rowLabel(r, lk);
      if (!name) break;
      path.push(name);
      const nd = touch(path);
      nd.value = (nd.value ?? 0) + v;
    }
  }
  if (!valueKey) for (const nd of nodes) nd.value = undefined;
  return { nodes, roots, form: 'levels', value_key: valueKey, quality: q };
}

// ── network ─────────────────────────────────────────────────────────
export interface NetworkModel {
  nodes: { id: string; flow: number; group?: string }[];
  links: { source: string; target: string; value: number }[];
  cyclic: boolean; source_key: string; target_key: string; value_key?: string;
  quality: LegacyQuality;
}
export function toNetwork(raw: Raw): NetworkModel {
  if (isEcharts(raw)) throw new Error('network 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const rows = raw as Row[];
  const sample = rows[0];
  const sKey = firstKey(sample, SANKEY_SOURCE_ALIAS);
  const tKey = firstKey(sample, SANKEY_TARGET_ALIAS);
  if (!sKey || !tKey) throw new Error('缺少 source/target 列；network 需要 source + target（可选 value）');
  const valueKey = firstKey(sample, VALUE_ALIAS)
    ?? cols(sample).find((k) => ![sKey, tKey].includes(k) && isNum(sample[k]));
  const q = newQuality(rows.length, 'network');
  q.mapping = { source: sKey, target: tKey, ...(valueKey ? { value: valueKey } : {}) };
  const links = new Map<string, { source: string; target: string; value: number }>();
  const flow = new Map<string, number>();
  for (const r of rows) {
    const s = rowLabel(r, sKey), t = rowLabel(r, tKey);
    if (!s || !t) continue;
    const [v] = valueKey ? parseNumber(r[valueKey]) : [1];
    const key = `${s}${t}`;
    const e = links.get(key) ?? { source: s, target: t, value: 0 };
    e.value += v; links.set(key, e);
    flow.set(s, (flow.get(s) ?? 0) + v);
    flow.set(t, (flow.get(t) ?? 0) + v);
  }
  // 环检测（DFS 三色）
  const adj = new Map<string, string[]>();
  for (const e of links.values()) { if (!adj.has(e.source)) adj.set(e.source, []); adj.get(e.source)!.push(e.target); }
  const state = new Map<string, number>();
  let cyclic = false;
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const w of adj.get(u) ?? []) {
      if (state.get(w) === 1) { cyclic = true; continue; }
      if (!state.get(w)) dfs(w);
    }
    state.set(u, 2);
  };
  for (const u of adj.keys()) if (!state.get(u)) dfs(u);
  const nodes = [...flow.entries()].map(([id, fl]) => ({ id, flow: fl }));
  return { nodes, links: [...links.values()], cyclic, source_key: sKey, target_key: tKey, value_key: valueKey, quality: q };
}

// ── control ─────────────────────────────────────────────────────────
export interface ControlPoint { x: string; v: number; n?: number; flag?: 'r1' | 'r2' }
export interface ControlLine {
  name: string; points: ControlPoint[]; cl: number; ucl: number; lcl: number; s1: number; s2: number;
}
export interface ControlModel {
  lines: ControlLine[]; x_key: string; value_key: string; group_key?: string;
  mode: 'i' | 'p'; quality: LegacyQuality;
}
export function toControl(raw: Raw): ControlModel {
  if (isEcharts(raw)) throw new Error('control 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const rows = raw as Row[];
  const sample = rows[0];
  const dateKey = firstKey(sample, CONTROL_DATE_ALIAS)
    ?? cols(sample).find((k) => isDate(sample[k]));
  const nKey = firstKey(sample, CONTROL_N_ALIAS);
  const uclKey = firstKey(sample, CONTROL_UCL_ALIAS);
  const lclKey = firstKey(sample, CONTROL_LCL_ALIAS);
  const groupKey = firstKey(sample, CONTROL_GROUP_ALIAS)
    ?? cols(sample).find((k) => k !== dateKey && !isNum(sample[k]));
  const valueKey = cols(sample).find((k) => ![dateKey, nKey, uclKey, lclKey, groupKey].includes(k)
    && rows.some((r) => isNum(r[k])));
  if (!dateKey || !valueKey) throw new Error('缺少日期/数值列；control 需要 date + value（可选 n/ucl/lcl/group）');
  const mode: 'i' | 'p' = nKey ? 'p' : 'i';
  const q = newQuality(rows.length, mode === 'p' ? 'control-p' : 'control-i');
  q.mapping = {
    date: dateKey, value: valueKey,
    ...(nKey ? { n: nKey } : {}), ...(uclKey ? { ucl: uclKey } : {}), ...(lclKey ? { lcl: lclKey } : {}),
    ...(groupKey ? { group: groupKey } : {}),
  };
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const gname = groupKey ? rowLabel(r, groupKey) || '—' : '';
    if (!groups.has(gname)) groups.set(gname, []);
    groups.get(gname)!.push(r);
  }
  const lines: ControlLine[] = [];
  for (const [name, rs] of groups) {
    const sorted = [...rs].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey])));
    const pts: ControlPoint[] = sorted.map((r) => ({
      x: String(r[dateKey] ?? ''),
      v: parseNumber(r[valueKey])[0],
      ...(nKey ? { n: Math.max(1, parseNumber(r[nKey])[0] || 1) } : {}),
    }));
    // 中心线：p 图按 n 加权，I 图算术均值；显式列优先
    const wsum = pts.reduce((a, p) => a + p.v * (p.n ?? 1), 0);
    const wn = pts.reduce((a, p) => a + (p.n ?? 1), 0);
    const cl = uclKey ? 0 : wsum / Math.max(1e-9, wn);
    // σ：p 图 √(p̄(1-p̄)/n̄)（比例按百分口径自动转 0–1）；I 图 MR̄/1.128
    let sigma: number;
    if (uclKey) sigma = 0;
    else if (mode === 'p') {
      const pbar = cl > 1 ? cl / 100 : cl;
      const nbar = wn / pts.length;
      sigma = Math.sqrt(Math.max(0, pbar * (1 - pbar)) / Math.max(1, nbar));
      if (cl > 1) sigma *= 100;
    } else {
      let mr = 0;
      for (let i = 1; i < pts.length; i++) mr += Math.abs(pts[i].v - pts[i - 1].v);
      sigma = (mr / Math.max(1, pts.length - 1)) / 1.128;
    }
    const ucl = uclKey ? parseNumber(sorted[0][uclKey])[0] : cl + 3 * sigma;
    const lcl = lclKey ? parseNumber(sorted[0][lclKey])[0] : Math.max(cl - 3 * sigma, pts.every((p) => p.v >= 0) ? 0 : cl - 3 * sigma);
    // Western Electric：规则 1 超 3σ；规则 2 连续 3 点中 ≥2 点同侧超 2σ
    const beyond = (p: ControlPoint, k: number) => (p.v > cl + k * sigma ? 1 : p.v < cl - k * sigma ? -1 : 0);
    for (const p of pts) if (beyond(p, 3)) p.flag = 'r1';
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].flag) continue;
      const win = pts.slice(Math.max(0, i - 2), i + 1);
      if (win.length === 3) {
        const s = win.map((p) => beyond(p, 2));
        const pos = s.filter((x) => x === 1).length, neg = s.filter((x) => x === -1).length;
        if (pos >= 2 || neg >= 2) for (const p of win) if (!p.flag) p.flag = 'r2';
      }
    }
    lines.push({ name, points: pts, cl, ucl, lcl, s1: sigma, s2: sigma * 2 });
  }
  return { lines, x_key: dateKey, value_key: valueKey, group_key: groupKey ?? undefined, mode, quality: q };
}

// ── parallel ────────────────────────────────────────────────────────
export interface ParallelModel {
  axes: { key: string; min: number; max: number }[];
  rows: { group: string; vals: number[]; label?: string }[];
  group_key?: string; quality: LegacyQuality;
}
export function toParallel(raw: Raw): ParallelModel {
  if (isEcharts(raw)) throw new Error('parallel 不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const rows = raw as Row[];
  const sample = rows[0];
  const groupKey = firstKey(sample, PARALLEL_GROUP_ALIAS);
  const labelKey = cols(sample).find((k) => k !== groupKey && !isNum(sample[k]));
  const axes = cols(sample).filter((k) => ![groupKey, labelKey].includes(k) && rows.some((r) => isNum(r[k])));
  if (axes.length < 2) throw new Error('需要 ≥2 个数值列；parallel 每个度量一轴');
  const q = newQuality(rows.length, 'parallel');
  q.mapping = { values: axes.join('|'), ...(groupKey ? { group: groupKey } : {}) };
  const out: ParallelModel['rows'] = [];
  for (const r of rows) {
    out.push({
      group: groupKey ? rowLabel(r, groupKey) || '—' : '',
      label: labelKey ? rowLabel(r, labelKey) : undefined,
      vals: axes.map((k) => parseNumber(r[k])[0]),
    });
  }
  const ax = axes.map((key, i) => ({
    key,
    min: Math.min(...out.map((r) => r.vals[i])),
    max: Math.max(...out.map((r) => r.vals[i])),
  }));
  return { axes: ax, rows: out, group_key: groupKey ?? undefined, quality: q };
}


