// ADR-0010/0009 统一适配入口（A7）：render、compose CLI 与运行期共用。
// 输入可以是表格，也可以是文档（report）；消除「CLI 和运行期各走一套逻辑」的分叉（F5）。
import type { Insight, QualityReport, Table, ViewId, ViewSpec } from '@virta/contracts';
import { ADAPTERS, DOC_ADAPTER, projectQuality } from './families/index.js';
import type { DocModel } from './families/docmd.js';

export interface AdaptInput { table?: Table; doc?: string; name?: string }
export interface Adapted {
  model: unknown;
  quality: QualityReport | undefined;
  insights: Insight[];
  counts: Record<string, number>;
}

export function adaptInput(input: AdaptInput, view: ViewId, spec: ViewSpec): Adapted {
  if (input.doc !== undefined) {
    if (view !== 'report') throw new Error(`文档输入仅支持 report 视图（收到 ${view}）`);
    const dm: DocModel = DOC_ADAPTER.buildDoc(input.doc, input.name ?? 'doc');
    return {
      model: dm,
      quality: projectQuality(dm.quality),
      insights: [
        { kind: 'distribution', text: `共 ${dm.stats.sections} 个章节、${dm.stats.paragraphs} 段`, importance: 50 },
        { kind: 'target', text: `识别 ${dm.metrics.length} 个指标`, importance: 40 },
      ],
      counts: { 章节: dm.stats.sections, 段落: dm.stats.paragraphs, 表格: dm.stats.tables, 指标: dm.metrics.length },
    };
  }
  if (!input.table) throw new Error('adaptInput：缺少 table 或 doc 输入');
  const adapter = ADAPTERS[view];
  if (!adapter) throw new Error(`视图 ${view} 无适配器`);
  const a = adapter.adapt(input.table, spec);
  return { model: a.model, quality: a.quality, insights: adapter.insights(a.model, spec), counts: adapter.counts(a.model) };
}
