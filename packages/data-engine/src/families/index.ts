// 图族注册表：view → adaptRaw（= legacy to_*）。adapt/score/insights 在 adapters 层组装。
import type { Insight, QualityReport, Table, TableProfile, ViewId, ViewSpec } from '@virta/contracts';
import type { Raw } from './barline.js';
import type { FamilyAdapter, ScoreResult } from './types.js';
import type { LegacyQuality } from '../legacy-core.js';
import { toQualityReport } from '../quality.js';
import { toChart } from './barline.js';
import { toBoxplot } from './boxplot.js';
import { toBullet } from './bullet.js';
import { toFishbone } from './fishbone.js';
import { toFunnel } from './funnel.js';
import { toGantt } from './gantt.js';
import { toGrid } from './grid.js';
import { toHeatmap } from './heatmap.js';
import { toLine3d, toLine3dCurve } from './line3d.js';
import { toPie } from './pie.js';
import { toPie3d } from './pie3d.js';
import { toRadar } from './radar.js';
import { toSankey } from './sankey.js';
import { toScatter } from './scatter.js';
import { toScatter3d } from './scatter3d.js';
import { toSunburst } from './sunburst.js';
import { toTreemap } from './treemap.js';
import { buildDoc } from './docmd.js';
import { toCohort, toCompare, toHistogram, toKpi, toRank } from './t1.js';
import { toControl, toNetwork, toParallel, toTree } from './t2.js';
import { toBurndown, toEr, toFlowchart, toFormula, toSequence } from './t3.js';
import { scoreView } from '../score.js';
import { insights as familyInsights } from '../insights.js';
import { counts as familyCounts } from '../counts.js';
import { runPipeline, tableToRaw, type PostHook } from '../pipeline.js';
import { POST_HOOKS } from './post.js';

export const TO_MODEL: Partial<Record<ViewId, (raw: Raw) => unknown>> = {
  bar: toChart, line: toChart, matrix3d: toChart,
  boxplot: toBoxplot, bullet: toBullet, fishbone: toFishbone, funnel: toFunnel,
  gantt: toGantt, grid: toGrid, heatmap: toHeatmap, line3d: toLine3d,
  pie: toPie, pie3d: toPie3d, radar: toRadar, sankey: toSankey,
  scatter: toScatter, scatter3d: toScatter3d, sunburst: toSunburst, treemap: toTreemap,
  // T1（M6）：combo 复用 barline 模型（标签+多系列），渲染层决定左右轴
  combo: toChart,
  rank: toRank, histogram: toHistogram, kpi: toKpi, compare: toCompare, cohort: toCohort,
  // T2（M7）
  tree: toTree, network: toNetwork, control: toControl, parallel: toParallel,
  // T3（简版）
  er: toEr, flowchart: toFlowchart, sequence: toSequence, burndown: toBurndown, formula: toFormula,
};

/** Table.rows → legacy Raw（含 ECharts 透传）。行副本语义见 pipeline.tableToRaw。 */
export { tableToRaw };

interface LiteQuality {
  rows?: number; kept?: number; warnings?: string[];
  confidence?: string; mapping?: Record<string, string | null>;
  chips?: [string, unknown][];
}

/** legacy 各图族质量 dict → 契约 QualityReport（LiteQuality 与 LegacyQuality 两种形状）。 */
export function projectQuality(q: unknown): QualityReport {
  const qq = (q ?? {}) as LiteQuality & Partial<LegacyQuality>;
  const warnings = qq.warnings ?? [];
  const legacy: LegacyQuality = {
    rows: qq.rows ?? 0, mode: qq.mode ?? '',
    mapping: (qq.mapping ?? {}) as Record<string, string>,
    numeric_columns: qq.numeric_columns ?? [],
    missing: qq.missing ?? 0, invalid: qq.invalid ?? 0, percent: qq.percent ?? 0,
    negative: qq.negative ?? 0, anchors: qq.anchors ?? 0,
    unknown_types: qq.unknown_types ?? 0, kind_conflicts: qq.kind_conflicts ?? 0,
    type_column: qq.type_column ?? '—', duplicate_pairs: qq.duplicate_pairs ?? 0,
    warnings,
    confidence: (qq.confidence ?? 'high') as LegacyQuality['confidence'],
  };
  const report = toQualityReport(legacy, { kept: qq.kept });
  if (qq.chips) for (const [k, v] of qq.chips) report.stats[String(k)] = String(v);
  return report;
}

/** 视图级管线差异：line3d curve 变体换 toModel；gantt 用 post 钩子写今日线（C2）。 */
const PIPELINE_TOMODEL: Partial<Record<ViewId, (raw: Raw, spec?: ViewSpec) => unknown>> = {
  line3d: (raw, spec) => (spec?.variant === 'curve' ? toLine3dCurve(raw) : toLine3d(raw)),
};
const PIPELINE_POST = POST_HOOKS as unknown as Partial<Record<ViewId, PostHook<never>>>;

/** 通用适配器包装：adaptRaw=to_*；adapt 统一走 runPipeline（C1：与运行期/compose 同一条路径）；
 *  score/insights/counts 分别委托 §5.1 打分表、洞察模板与计数器。 */
export function makeAdapter<M>(view: ViewId, toModel: (raw: Raw) => M, extras?: Partial<FamilyAdapter<M>>): FamilyAdapter<M> {
  return {
    view,
    adaptRaw: toModel,
    adapt(table: Table, spec: ViewSpec) {
      const tm = (PIPELINE_TOMODEL[view] ?? ((raw: Raw) => toModel(raw))) as (raw: Raw, spec?: ViewSpec) => M;
      const { model, issues } = runPipeline(table, spec, view, (raw) => tm(raw, spec), PIPELINE_POST[view] as PostHook<M> | undefined);
      const mq = (model as { quality?: unknown })?.quality;
      const quality = mq ? projectQuality(mq) : (undefined as unknown as QualityReport);
      if (issues.length && quality) quality.issues.push(...issues);
      return { model, quality };
    },
    score: extras?.score ?? ((profile, table) => scoreView(view, profile, table)),
    insights: extras?.insights ?? ((model, spec) => familyInsights(view, model, spec)),
    counts: extras?.counts ?? ((model) => familyCounts(view, model)),
  };
}

export const ADAPTERS: Partial<Record<ViewId, FamilyAdapter<unknown>>> = {};
for (const [view, fn] of Object.entries(TO_MODEL)) {
  ADAPTERS[view as ViewId] = makeAdapter(view as ViewId, fn);
}

// report：文档管线，raw 不适用
export const DOC_ADAPTER = { buildDoc };

export const ADAPTED_VIEWS = Object.keys(TO_MODEL) as ViewId[];
