// sunburst.to_sunburst 移植：非数值列按列顺序成层级（≤4 层）+ 数值列。
import { firstKey, parseNumber, VALUE_ALIAS } from '../legacy-core.js';
import type { Raw } from './barline.js';

interface SBNode { name: string; children: Map<string, SBNode>; value: number }
export interface SBTree { name: string; value: number; children: SBTree[] }
export interface SunburstModel {
  tree: SBTree; level_names: string[];
  counts: { levels: number; leaves: number; depth: number; total: number };
  quality: { rows: number; kept: number; warnings: string[]; confidence: string; mapping: Record<string, string> };
}

export function toSunburst(raw: Raw): SunburstModel {
  if (!Array.isArray(raw)) throw new Error('旭日图需要多级类目列 + value 行数据，暂不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  let vKey = firstKey(sample, VALUE_ALIAS);
  if (!vKey) {
    for (const k of Object.keys(sample)) {
      const ok = raw.slice(0, 50).filter((row) => !['missing', 'invalid'].includes(parseNumber(row[k])[1])).length;
      if (ok >= Math.max(1, Math.floor(0.8 * Math.min(raw.length, 50)))) { vKey = k; break; }
    }
  }
  if (!vKey) throw new Error('旭日图需要一列数值作为扇区大小');
  let lvlKeys = Object.keys(sample).filter((k) => {
    if (k === vKey) return false;
    const bad = raw.slice(0, 50).filter((row) => ['missing', 'invalid'].includes(parseNumber(row[k])[1])).length;
    return bad >= Math.max(1, Math.floor(0.2 * Math.min(raw.length, 50)));
  }).slice(0, 4);
  if (!lvlKeys.length) throw new Error('旭日图需要至少一列类目（层级）列');
  const warnings: string[] = [];
  let bad = 0;
  const root: SBNode = { name: '全部', children: new Map(), value: 0 };
  let total = 0;
  for (const row of raw) {
    const [num, st] = parseNumber(row[vKey]);
    if (st === 'missing' || st === 'invalid' || num <= 0) { bad += 1; continue; }
    const path: string[] = [];
    let skip = false;
    for (const k of lvlKeys) {
      const v = row[k];
      if (v === null || v === undefined || v === '') {
        if (!path.length) { skip = true; break; }
        path.push('未填');
      } else path.push(String(v).trim());
    }
    if (skip) { bad += 1; continue; }
    let node = root;
    for (const name of path) {
      let c = node.children.get(name);
      if (!c) { c = { name, children: new Map(), value: 0 }; node.children.set(name, c); }
      node = c;
    }
    node.value += num;
    total += num;
  }
  if (!root.children.size) throw new Error('没有可解析的层级行');
  if (bad) warnings.push(`${bad} 行数值缺失/非正或首层为空，已跳过`);

  const agg = (node: SBNode): SBTree => {
    const kids = [...node.children.values()];
    if (!kids.length) return { name: node.name, value: round4(node.value), children: [] };
    const children = kids.map(agg).sort((a, b) => b.value - a.value);
    return { name: node.name, value: round4(node.value + children.reduce((s, c) => s + c.value, 0)), children };
  };
  const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const tree = agg(root);

  let maxDepth = 0, leafCnt = 0;
  const walk = (n: SBTree, d: number) => {
    maxDepth = Math.max(maxDepth, d);
    if (!n.children.length) leafCnt += 1;
    for (const c of n.children) walk(c, d + 1);
  };
  walk(tree, 0);
  if (lvlKeys.length >= 4) warnings.push('层级列超过 4 层，已截断到前 4 层');
  let tiny = 0;
  const tinyWalk = (n: SBTree, dv: number) => {
    for (const c of n.children) {
      if (c.value < dv * 0.005) tiny += 1;
      tinyWalk(c, dv);
    }
  };
  tinyWalk(tree, tree.value);
  if (tiny) warnings.push(`${tiny} 个扇区占比 < 0.5%，视觉不可读，建议合并为「其他」`);
  const counts = { levels: lvlKeys.length, leaves: leafCnt, depth: maxDepth, total: round4(total) };
  return {
    tree, level_names: lvlKeys, counts,
    quality: {
      rows: raw.length, kept: leafCnt, warnings: warnings.slice(0, 6),
      confidence: warnings.length ? 'medium' : 'high',
      mapping: { levels: lvlKeys.join(' / '), value: vKey },
    },
  };
}
