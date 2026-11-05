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
export type { BarlineModel, BarlineSeries, Raw } from './families/barline.js';
export type { ScatterModel, ScatterPoint, ScatterFit } from './families/scatter.js';
export type { PieModel, PieSlice } from './families/pie.js';
export type { BulletModel, BulletItem } from './families/bullet.js';
export type { FunnelModel, FunnelStage } from './families/funnel.js';
export type { HeatmapModel } from './families/heatmap.js';
export type { SankeyModel } from './families/sankey.js';
export type { TreemapModel, TreemapChild } from './families/treemap.js';
export type { SunburstModel, SBTree } from './families/sunburst.js';
export type { RadarModel } from './families/radar.js';
export type { BoxplotModel, BoxGroup } from './families/boxplot.js';
export type { GanttModel } from './families/gantt.js';
export type { FishboneModel } from './families/fishbone.js';
export type { GridModel } from './families/grid.js';
export type { Pie3dModel } from './families/pie3d.js';
export type { Line3dModel } from './families/line3d.js';
export type { DocModel } from './families/docmd.js';

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
