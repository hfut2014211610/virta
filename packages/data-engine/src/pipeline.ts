// ADR-0012 单一适配管线（C1）：派生列 → tableToRaw（逐行浅拷贝）→ 映射复制 → toModel
// → 缺失值处理 → 视图后处理钩子。ADAPTERS / per-view bundle / compose bundle 三处共用，
// 输入 Table 不可变（C3：派生键与映射键只写入行副本）。
import type { QualityIssue, Table, ViewId, ViewSpec } from '@virta/contracts';
import { applyDerives, resolveTime } from './derive.js';
import type { Raw } from './families/barline.js';

export interface ResolvedTime { asOfMs: number; tz: string }

/** 视图后处理钩子（C2）：模型建成后的视图专属修正（gantt 今日线等）。 */
export type PostHook<M> = (model: M, ctx: { spec: ViewSpec; resolved: ResolvedTime }) => M;

/** Table → legacy Raw（含 ECharts 透传）；行对象一律浅拷贝，保证输入不可变。 */
export function tableToRaw(table: Table): Raw {
  if (table.passthrough?.kind === 'echarts') return { __echarts: table.passthrough.data as Record<string, unknown> };
  return table.rows.map((r) => ({ ...(r as Record<string, unknown>) })) as unknown as Raw;
}

/** 映射复制（不修改原数据）：映射列的值写到角色名键；只写原本不存在的键。 */
function applyMapping(raw: Raw, spec: ViewSpec): void {
  const mapping = spec?.mapping;
  if (!mapping || !Array.isArray(raw)) return;
  for (const [role, col] of Object.entries(mapping)) {
    if (typeof col !== 'string' || col === role) continue;
    for (const r of raw as Record<string, unknown>[]) {
      if (r[role] === undefined && r[col] !== undefined) r[role] = r[col];
    }
  }
}

/** ADR-0011 缺失值：默认 gap（null=未观测）；missingValue=zero 回填 0。 */
function applyMissingValue(model: unknown, spec: ViewSpec): void {
  const series = (model as { series?: { name: string; values: (number | null)[] }[] }).series;
  if (!series?.length) return;
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

export function runPipeline<M>(
  table: Table,
  spec: ViewSpec,
  view: ViewId,
  toModel: (raw: Raw) => M,
  post?: PostHook<M>,
): { model: M; issues: QualityIssue[] } {
  const resolved = resolveTime(spec);
  const derived = spec?.derive?.length ? applyDerives(table, spec, resolved) : { table, issues: [] as QualityIssue[] };
  const raw = tableToRaw(derived.table);
  applyMapping(raw, spec);
  let model = toModel(raw);
  applyMissingValue(model, spec);
  if (post) model = post(model, { spec, resolved });
  return { model, issues: derived.issues };
}
