// contracts v1 · §4.2 视图 ID 与别名
export const VIEW_IDS = [
  // legacy 对等（17 图族 / 20 模板）
  'bar', 'line', 'matrix3d', 'bullet', 'report', 'scatter', 'pie', 'pie3d', 'funnel', 'radar',
  'treemap', 'gantt', 'scatter3d', 'line3d', 'fishbone', 'heatmap', 'sankey', 'boxplot', 'sunburst', 'grid',
  // 本期新增
  'combo', 'rank', 'histogram', 'kpi', 'compare', 'cohort', 'tree', 'network', 'control', 'parallel',
  // 'map' 本期搁置，见 docs/plan/NEXT_PHASE.md §13；届时作为契约变更新增
] as const;
export type ViewId = typeof VIEW_IDS[number];
// pivot 映射为 grid，并默认 variant='pivot'
export const VIEW_ALIASES: Record<string, ViewId> = {
  heat: 'heatmap', box: 'boxplot', fish: 'fishbone', pivot: 'grid', spc: 'control',
};
