// 画像 profile（§5.1）：列分类 number/percent/date/temporal-label/category/text/boolean/empty
// + 维度/度量划分 + 层级链检测（子→父 映射唯一）。
import type { ColumnProfile, ColumnType, Table, TableProfile } from '@virta/contracts';
import { NUM_RATIO, parseGanttDate, parseNumber, TEMPORAL_RE } from './legacy-core.js';
import {
  normKey,
  LABEL_ALIASES, VALUE_ALIAS, SERIES_ALIAS, TYPE_ALIAS,
  ACTUAL_ALIAS, TARGET_ALIAS, POOR_ALIAS, GOOD_ALIAS, MAX_ALIAS,
  X_ALIAS, Y_ALIAS, SIZE_ALIAS, Z_ALIAS,
  SANKEY_SOURCE_ALIAS, SANKEY_TARGET_ALIAS,
  HEAT_X_ALIAS, HEAT_Y_ALIAS, HEAT_DATE_ALIAS,
  GANTT_TASK_ALIAS, GANTT_START_ALIAS, GANTT_END_ALIAS, GANTT_DUR_ALIAS,
  GANTT_GROUP_ALIAS, GANTT_PROGRESS_ALIAS, GANTT_STATUS_ALIAS, GANTT_OWNER_ALIAS, GANTT_DEPS_ALIAS,
  BOX_GROUP_ALIAS, BOX_Q1_ALIAS, BOX_MED_ALIAS, BOX_Q3_ALIAS, BOX_MIN_ALIAS, BOX_MAX_ALIAS,
  FISH_CAT_ALIAS, FISH_CAUSE_ALIAS, FISH_SUB_ALIAS, TREEMAP_GROUP_ALIAS,
} from './aliases.js';
import type { Cell } from '@virta/contracts';

const BOOL_TOKENS = new Set(['true', 'false', '是', '否', '0', '1', 'y', 'n', 'yes', 'no']);

const ROLE_ALIAS_SETS: [string, readonly string[]][] = [
  ['label', LABEL_ALIASES], ['series', SERIES_ALIAS], ['type', TYPE_ALIAS],
  ['value', VALUE_ALIAS], ['actual', ACTUAL_ALIAS], ['target', TARGET_ALIAS],
  ['poor', POOR_ALIAS], ['good', GOOD_ALIAS], ['max', MAX_ALIAS],
  ['x', X_ALIAS], ['y', Y_ALIAS], ['size', SIZE_ALIAS], ['z', Z_ALIAS],
  ['source', SANKEY_SOURCE_ALIAS], ['target', SANKEY_TARGET_ALIAS],
  ['heatX', HEAT_X_ALIAS], ['heatY', HEAT_Y_ALIAS], ['date', HEAT_DATE_ALIAS],
  ['task', GANTT_TASK_ALIAS], ['start', GANTT_START_ALIAS], ['end', GANTT_END_ALIAS],
  ['duration', GANTT_DUR_ALIAS], ['lane', GANTT_GROUP_ALIAS],
  ['progress', GANTT_PROGRESS_ALIAS], ['status', GANTT_STATUS_ALIAS],
  ['owner', GANTT_OWNER_ALIAS], ['deps', GANTT_DEPS_ALIAS],
  ['boxGroup', BOX_GROUP_ALIAS], ['q1', BOX_Q1_ALIAS], ['median', BOX_MED_ALIAS],
  ['q3', BOX_Q3_ALIAS], ['min', BOX_MIN_ALIAS], ['boxMax', BOX_MAX_ALIAS],
  ['category', FISH_CAT_ALIAS], ['cause', FISH_CAUSE_ALIAS], ['sub', FISH_SUB_ALIAS],
  ['hierGroup', TREEMAP_GROUP_ALIAS],
];

export function roleHints(name: string): string[] {
  const nk = normKey(name);
  return ROLE_ALIAS_SETS.filter(([, a]) => a.includes(nk)).map(([r]) => r);
}

const cellStr = (v: Cell) => (v === null || v === undefined ? '' : String(v).trim());
const isMissingCell = (v: Cell) => parseNumber(v)[1] === 'missing';

export function profileColumn(table: Table, name: string): ColumnProfile {
  const rows = table.rows;
  const total = rows.length;
  let missing = 0, invalid = 0, ok = 0, percent = 0, negative = 0;
  let dateOk = 0, temporalOk = 0, boolOk = 0, nonMissing = 0;
  let mn = Infinity, mx = -Infinity;
  const distinct = new Set<string>();
  const sample: Cell[] = [];
  const numSeq: number[] = [];
  for (const r of rows) {
    const v = r[name];
    const raw = cellStr(v);
    if (sample.length < 5 && raw && !sample.includes(v)) sample.push(v);
    const [num, st] = parseNumber(v);
    if (st === 'missing') { missing += 1; continue; }
    nonMissing += 1;
    distinct.add(raw);
    if (st === 'invalid') invalid += 1;
    else {
      ok += 1;
      if (st === 'percent') percent += 1;
      if (num < 0) negative += 1;
      if (num < mn) mn = num;
      if (num > mx) mx = num;
      numSeq.push(num);
    }
    const [, , gst] = parseGanttDate(v);
    if (gst === 'date') dateOk += 1;
    if (TEMPORAL_RE.test(raw)) temporalOk += 1;
    if (BOOL_TOKENS.has(raw.toLowerCase())) boolOk += 1;
  }
  const numRatio = ok / Math.max(1, nonMissing);
  const dateRatio = dateOk / Math.max(1, nonMissing);
  const temporalRatio = temporalOk / Math.max(1, nonMissing);
  let type: ColumnType;
  if (!nonMissing) type = 'empty';
  else if (boolOk / nonMissing >= NUM_RATIO && distinct.size <= 2 && numRatio < NUM_RATIO) type = 'boolean';
  else if (numRatio >= NUM_RATIO) type = percent / Math.max(1, ok) >= 0.5 ? 'percent' : 'number';
  else if (dateRatio >= NUM_RATIO && nonMissing >= 3) type = 'date';
  else if (temporalRatio >= NUM_RATIO && nonMissing >= 3) type = 'temporal-label';
  else if (distinct.size <= Math.min(40, Math.max(8, Math.ceil(total * 0.5)))) type = 'category';
  else type = 'text';
  // 单调（仅数值列；按出现顺序的已解析值）
  let monotonic: ColumnProfile['monotonic'] = null;
  if (numSeq.length >= 2) {
    if (numSeq.every((v, i) => i === 0 || v >= numSeq[i - 1])) monotonic = 'asc';
    else if (numSeq.every((v, i) => i === 0 || v <= numSeq[i - 1])) monotonic = 'desc';
  }
  return {
    name, type, ratio: numRatio,
    distinct: distinct.size, missing, invalid, negative,
    min: ok ? mn : undefined, max: ok ? mx : undefined,
    sample, monotonic, roleHints: roleHints(name),
  };
}

/** 子→父 是否函数映射（每个子值只对一个父值） */
function functionalMap(rows: Table['rows'], child: string, parent: string): boolean {
  const m = new Map<string, string>();
  for (const r of rows) {
    const c = cellStr(r[child]), p = cellStr(r[parent]);
    if (!c || !p) continue;
    const prev = m.get(c);
    if (prev === undefined) m.set(c, p);
    else if (prev !== p) return false;
  }
  return m.size > 1;
}

/** 最长层级链 [顶层, ..., 叶子]；无层级返回 null */
export function detectHierarchy(table: Table, dims: string[]): string[] | null {
  const edges = new Map<string, string>(); // child → parent
  for (const child of dims) {
    let best: string | null = null;
    let bestDistinct = Infinity;
    for (const parent of dims) {
      if (parent === child) continue;
      if (functionalMap(table.rows, child, parent)) {
        const d = new Set(table.rows.map((r) => cellStr(r[parent]))).size;
        if (d < bestDistinct) { bestDistinct = d; best = parent; }
      }
    }
    if (best) edges.set(child, best);
  }
  // 最长链：从最深的叶子向上走
  let longest: string[] = [];
  for (const child of edges.keys()) {
    const chain = [child];
    let cur: string | undefined = child;
    const seen = new Set([cur]);
    while ((cur = edges.get(cur!)) !== undefined && !seen.has(cur)) {
      chain.push(cur);
      seen.add(cur);
    }
    if (chain.length > longest.length) longest = chain;
  }
  return longest.length >= 2 ? longest.reverse() : null;
}

export function profileTable(table: Table): TableProfile {
  const columns = table.columns.map((c) => profileColumn(table, c));
  const measures = columns.filter((c) => c.type === 'number' || c.type === 'percent').map((c) => c.name);
  const dims = columns.filter((c) => c.type !== 'number' && c.type !== 'percent' && c.type !== 'empty').map((c) => c.name);
  const temporal = columns.filter((c) => c.type === 'temporal-label' || c.type === 'date').map((c) => c.name);
  return {
    rows: table.rows.length, columns, dims, measures, temporal,
    hierarchy: detectHierarchy(table, dims),
  };
}
