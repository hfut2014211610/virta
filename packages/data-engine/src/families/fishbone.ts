// fishbone.to_fishbone 移植：category+cause（可选 sub/owner），首见顺序，(类,因,子) 去重。
import { esc, firstKey, normKey } from '../legacy-core.js';
import { FISH_CAT_ALIAS, FISH_CAUSE_ALIAS, FISH_SUB_ALIAS, GANTT_OWNER_ALIAS } from '../aliases.js';
import type { Raw } from './barline.js';


export interface FishboneModel {
  cats: { name: string; causes: { label: string; sub: string; owner: string }[] }[];
  counts: { cats: number; causes: number; subs: number; owners: number; maxK: number; maxCat: string; depth: number };
  quality: { rows: number; kept: number; warnings: string[]; confidence: string; mapping: Record<string, string> };
}

const cell = (v: unknown) => (v !== null && v !== undefined && v !== '' ? String(v).trim() : '');

export function toFishbone(raw: Raw): FishboneModel {
  if (!Array.isArray(raw)) throw new Error('鱼骨图需要 category/cause 形式的行数据，暂不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  const catKey = firstKey(sample, FISH_CAT_ALIAS);
  let causeKey = firstKey(sample, FISH_CAUSE_ALIAS);
  const subKey = firstKey(sample, FISH_SUB_ALIAS);
  const ownerKey = firstKey(sample, GANTT_OWNER_ALIAS);
  if (catKey && causeKey && catKey === causeKey) causeKey = null;
  if (!causeKey) throw new Error('未找到原因列（cause / 原因 / 小骨 / 因素）；鱼骨图至少需要 类别 + 原因');
  const cats = new Map<string, { name: string; causes: { label: string; sub: string; owner: string }[]; seen: Set<string> }>();
  const order: string[] = [];
  let skipCause = 0, dup = 0, ownerN = 0;
  for (const row of raw) {
    const cause = cell(row[causeKey]);
    if (!cause) { skipCause += 1; continue; }
    const cat = catKey && cell(row[catKey]) ? cell(row[catKey]) : '未分类';
    const sub = subKey ? cell(row[subKey]) : '';
    const owner = ownerKey ? cell(row[ownerKey]) : '';
    let c = cats.get(cat);
    if (!c) { c = { name: cat, causes: [], seen: new Set() }; cats.set(cat, c); order.push(cat); }
    const sig = `${cause}\x00${sub}`;
    if (c.seen.has(sig)) { dup += 1; continue; }
    c.seen.add(sig);
    if (owner) ownerN += 1;
    c.causes.push({ label: cause, sub, owner });
  }
  if (!order.length) throw new Error('没有可解析的原因行（至少需要 类别 + 原因两列）');
  const warnings: string[] = [];
  if (skipCause) warnings.push(`${skipCause} 行原因为空，已跳过`);
  if (dup) warnings.push(`${dup} 条重复（类别+原因+子原因），已合并`);
  const ks = order.map((c) => cats.get(c)!.causes.length);
  const maxK = Math.max(...ks), minK = Math.min(...ks);
  const maxI = ks.indexOf(maxK);
  if (order.length > 1 && maxK >= 3 * minK) {
    warnings.push(`类目不均衡：「${esc(order[maxI])}」${maxK} 条 vs 最少 ${minK} 条，版面会偏向一侧`);
  }
  const depth = order.some((c) => cats.get(c)!.causes.some((x) => x.sub)) ? 3 : 2;
  return {
    cats: order.map((c) => ({ name: cats.get(c)!.name, causes: cats.get(c)!.causes })),
    counts: {
      cats: order.length, causes: ks.reduce((a, b) => a + b, 0),
      subs: order.reduce((a, c) => a + cats.get(c)!.causes.filter((x) => x.sub).length, 0),
      owners: ownerN, maxK, maxCat: order[maxI], depth,
    },
    quality: {
      rows: raw.length, kept: ks.reduce((a, b) => a + b, 0), warnings: warnings.slice(0, 6),
      confidence: warnings.length ? 'medium' : 'high',
      mapping: { category: catKey ?? '—（未分类）', cause: causeKey, sub: subKey ?? '—', owner: ownerKey ?? '—' },
    },
  };
}
