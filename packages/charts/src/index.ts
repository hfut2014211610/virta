// @virta/charts · 图族渲染注册表
export * from './types.js';
import type { ViewId } from '@virta/contracts';
import type { FamilyRenderer } from './types.js';
import { barRenderer } from './bar.js';
import { lineRenderer } from './line.js';

import { matrix3dRenderer, scatterRenderer, pieRenderer, bulletRenderer, funnelRenderer } from './b1.js';
import { heatmapRenderer, treemapRenderer, sunburstRenderer, sankeyRenderer, boxplotRenderer, radarRenderer } from './b2.js';
import { ganttRenderer, fishboneRenderer, gridRenderer, reportRenderer, pie3dRenderer, line3dRenderer, scatter3dRenderer } from './b3.js';
import { cohortRenderer, comboRenderer, compareRenderer, histogramRenderer, kpiRenderer, rankRenderer } from './t1.js';
import { controlRenderer, networkRenderer, parallelRenderer, treeRenderer } from './t2.js';
import { burndownRenderer, erRenderer, flowchartRenderer, formulaRenderer, sequenceRenderer } from './t3.js';

const RENDERERS: Partial<Record<ViewId, FamilyRenderer<never>>> = {
  bar: barRenderer as never,
  line: lineRenderer as never,
  matrix3d: matrix3dRenderer as never,
  scatter: scatterRenderer as never,
  pie: pieRenderer as never,
  bullet: bulletRenderer as never,
  funnel: funnelRenderer as never,
  heatmap: heatmapRenderer as never,
  treemap: treemapRenderer as never,
  sunburst: sunburstRenderer as never,
  sankey: sankeyRenderer as never,
  boxplot: boxplotRenderer as never,
  radar: radarRenderer as never,
  gantt: ganttRenderer as never,
  fishbone: fishboneRenderer as never,
  grid: gridRenderer as never,
  report: reportRenderer as never,
  pie3d: pie3dRenderer as never,
  line3d: line3dRenderer as never,
  scatter3d: scatter3dRenderer as never,
  combo: comboRenderer as never,
  rank: rankRenderer as never,
  histogram: histogramRenderer as never,
  kpi: kpiRenderer as never,
  compare: compareRenderer as never,
  cohort: cohortRenderer as never,
  tree: treeRenderer as never,
  network: networkRenderer as never,
  control: controlRenderer as never,
  parallel: parallelRenderer as never,
  er: erRenderer as never,
  flowchart: flowchartRenderer as never,
  sequence: sequenceRenderer as never,
  burndown: burndownRenderer as never,
  formula: formulaRenderer as never,
};

export function getRenderer(view: ViewId): FamilyRenderer<never> | undefined {
  return RENDERERS[view];
}
export const RENDERED_VIEWS = Object.keys(RENDERERS) as ViewId[];
export { pivotView, GRID_AGGS, wrapText, type GridRowView, type PivotView } from './b3.js';
