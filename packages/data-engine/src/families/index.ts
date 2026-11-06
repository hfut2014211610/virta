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
import { applyDerives, resolveTime } from '../derive.js';
import { ordinalOf } from '../time/zoned.js';
import type { GanttModel } from './gantt.js';

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

/** Table.rows → legacy Raw（含 ECharts 透传）。 */
export function tableToRaw(table: Table): Raw {
  if (table.passthrough?.kind === 'echarts') return { __echarts: table.passthrough.data as Record<string, unknown> };
  return table.rows as unknown as Raw;
}

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

/** 通用适配器包装：adaptRaw=to_*；adapt 组合 tableToRaw+projectQuality；
 *  score/insights/counts 分别委托 §5.1 打分表、洞察模板与计数器。 */
export function makeAdapter<M>(view: ViewId, toModel: (raw: Raw) => M, extras?: Partial<FamilyAdapter<M>>): FamilyAdapter<M> {
  return {
    view,
    adaptRaw: toModel,
    adapt(table: Table, spec: ViewSpec) {
      // ADR-0010 派生列：适配前统一执行，新列进入 columns 后可被 mapping/model 引用
      const derived = spec?.derive?.length ? applyDerives(table, spec) : null;
      const raw = tableToRaw(derived?.table ?? table);
      // spec.mapping 显式映射：把映射列的值复制到角色名键上（角色名本身在别名表内，
      // 如 bullet 的 actual/target），让 --set mapping.x=列 / spec.mapping 真正生效；
      // 只写未存在的键——数据里已有同名列时不覆盖（显式同名列优先）。
      const mapping = spec?.mapping;
      if (mapping && Array.isArray(raw)) {
        for (const [role, col] of Object.entries(mapping)) {
          if (typeof col !== 'string' || col === role) continue;
          for (const r of raw as Record<string, unknown>[]) {
            if (r[role] === undefined && r[col] !== undefined) r[role] = r[col];
          }
        }
      }
      const model = toModel(raw);
      // ADR-0011 缺失值：默认 gap（null=未观测）；missingValue=zero 回填 0（legacy 行为）
      const series = (model as { series?: { name: string; values: (number | null)[] }[] }).series;
      if (series?.length) {
        const zero = spec?.options?.['missingValue'] === 'zero';
        let gaps = 0;
        for (const s of series) {
          if (zero) s.values = s.values.map((v) => v ?? 0);
          else gaps += s.values.filter((v) => v === null).length;
        }
        if (gaps) {
          const q2 = (model as { quality?: { warnings?: string[] } }).quality;
          q2?.warnings?.push(`${gaps} 个未观测点按 gap 处理（--set options.missingValue=zero 恢复补 0）`);
        }
      }
      const mq = (model as { quality?: unknown })?.quality;
      const quality = mq ? projectQuality(mq) : (undefined as unknown as QualityReport);
      if (derived?.issues.length && quality) quality.issues.push(...derived.issues);
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

// gantt 今日线（ADR-0010/F3）：给 spec.time 时按 asOf+tz 计算（默认实现是 UTC 的 Date.now()）。
{
  const g = ADAPTERS['gantt' as ViewId];
  const prev = g!.adapt.bind(g!);
  g!.adapt = (table: Table, spec: ViewSpec) => {
    const out = prev(table, spec);
    if (spec?.time?.asOf || spec?.time?.tz) {
      const { asOfMs, tz } = resolveTime(spec);
      const m = out.model as GanttModel;
      const rel = ordinalOf(asOfMs, tz) - (m.baseOrd ?? 0);
      m.today = m.baseOrd !== null && rel >= 0 && rel <= m.span ? Math.floor(rel) : null;
    }
    return out;
  };
}

// line3d curve 变体：x/y/z 数值列 → 三维空间轨迹模型（其余变体走通用 adapt）。
{
  const base = ADAPTERS['line3d' as ViewId];
  if (base?.adapt) {
    const prev = base.adapt.bind(base);
    base.adapt = (table: Table, spec: ViewSpec) => {
      if (spec?.variant !== 'curve') return prev(table, spec);
      const model = toLine3dCurve(tableToRaw(table));
      const mq = (model as { quality?: unknown })?.quality;
      return { model, quality: mq ? projectQuality(mq) : (undefined as unknown as QualityReport) };
    };
  }
}
