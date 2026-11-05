// @virta/data-engine · 读取 / 解析 / 画像 / 适配 / 质量 / 推荐 / 校验 / 洞察（M2，同构无 Node API）
export { normKey } from './aliases.js';
export * from './read.js';
export { profileTable, profileColumn, detectHierarchy, roleHints } from './profile.js';
export { recommend, scoreView, type Candidate } from './score.js';
export { validate } from './validate.js';
export { insights } from './insights.js';
export { counts } from './counts.js';
export {
  ADAPTERS, ADAPTED_VIEWS, DOC_ADAPTER, TO_MODEL, makeAdapter, projectQuality, tableToRaw,
} from './families/index.js';
export type { FamilyAdapter, ScoreResult } from './families/types.js';

import type { Row, SourceMeta, Table } from '@virta/contracts';
import type { Raw } from './families/barline.js';
import type { EchartsWrap } from './families/barline.js';
import type { RawRow } from './legacy-core.js';

/** Raw → Table（columns 取首行键序并集；ECharts 进 passthrough）。 */
export function rawToTable(raw: Raw, source: SourceMeta): Table {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && '__echarts' in (raw as EchartsWrap)) {
    return { columns: [], rows: [], source, passthrough: { kind: 'echarts', data: (raw as EchartsWrap).__echarts } };
  }
  const rows = (Array.isArray(raw) ? raw : []) as RawRow[];
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  }
  return { columns: cols, rows: rows as Row[], source };
}
