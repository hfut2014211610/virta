// contracts v1 · §4.2 视图 ID 与别名
export const VIEW_IDS = [
  // legacy 对等（17 图族 / 20 模板）
  'bar', 'line', 'matrix3d', 'bullet', 'report', 'scatter', 'pie', 'pie3d', 'funnel', 'radar',
  'treemap', 'gantt', 'scatter3d', 'line3d', 'fishbone', 'heatmap', 'sankey', 'boxplot', 'sunburst', 'grid',
  // 本期新增
  'combo', 'rank', 'histogram', 'kpi', 'compare', 'cohort', 'tree', 'network', 'control', 'parallel',
  // T3 简版补充（画廊分组补齐）
  'er', 'flowchart', 'sequence', 'burndown', 'formula',
  // 'map' 本期搁置，见 docs/plan/NEXT_PHASE.md §13；届时作为契约变更新增
] as const;
export type ViewId = typeof VIEW_IDS[number];
// pivot 映射为 grid，并默认 variant='pivot'
export const VIEW_ALIASES: Record<string, ViewId> = {
  heat: 'heatmap', box: 'boxplot', fish: 'fishbone', pivot: 'grid', spc: 'control',
};

/** ADR-0014 C8：视图解析唯一入口。别名→规范 id；pivot 附带默认 variant='pivot'。
 *  返回 { view, variant? } 或 undefined（未知视图由调用方报 UNKNOWN_VIEW）。 */
export function resolveView(id: string): { view: ViewId; variant?: string } | undefined {
  const v = (VIEW_IDS as readonly string[]).includes(id) ? (id as ViewId) : VIEW_ALIASES[id];
  if (!v) return undefined;
  return v === 'grid' && id === 'pivot' ? { view: 'grid', variant: 'pivot' } : { view: v };
}
