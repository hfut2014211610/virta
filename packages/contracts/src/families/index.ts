// 图族 contract 注册表。M1 覆盖 17 个 legacy 图族（20 视图）；
// M6/M7 新增的 combo/rank/histogram/kpi/compare/cohort/tree/network/control/parallel 逐步并入。
import type { ChartContract, ViewId } from '../index.js';
import { CONTRACT_BAR } from './bar.js';
import { CONTRACT_LINE } from './line.js';
import { CONTRACT_MATRIX3D } from './matrix3d.js';
import { CONTRACT_BULLET } from './bullet.js';
import { CONTRACT_REPORT } from './report.js';
import { CONTRACT_SCATTER } from './scatter.js';
import { CONTRACT_PIE } from './pie.js';
import { CONTRACT_PIE3D } from './pie3d.js';
import { CONTRACT_FUNNEL } from './funnel.js';
import { CONTRACT_RADAR } from './radar.js';
import { CONTRACT_TREEMAP } from './treemap.js';
import { CONTRACT_GANTT } from './gantt.js';
import { CONTRACT_SCATTER3D } from './scatter3d.js';
import { CONTRACT_LINE3D } from './line3d.js';
import { CONTRACT_FISHBONE } from './fishbone.js';
import { CONTRACT_HEATMAP } from './heatmap.js';
import { CONTRACT_SANKEY } from './sankey.js';
import { CONTRACT_BOXPLOT } from './boxplot.js';
import { CONTRACT_SUNBURST } from './sunburst.js';
import { CONTRACT_GRID } from './grid.js';
import { CONTRACT_COHORT } from './cohort.js';
import { CONTRACT_COMBO } from './combo.js';
import { CONTRACT_COMPARE } from './compare.js';
import { CONTRACT_HISTOGRAM } from './histogram.js';
import { CONTRACT_KPI } from './kpi.js';
import { CONTRACT_RANK } from './rank.js';
import { CONTRACT_TREE } from './tree.js';
import { CONTRACT_NETWORK } from './network.js';
import { CONTRACT_CONTROL } from './control.js';
import { CONTRACT_PARALLEL } from './parallel.js';
import { CONTRACT_ER } from './er.js';
import { CONTRACT_FLOWCHART } from './flowchart.js';
import { CONTRACT_SEQUENCE } from './sequence.js';
import { CONTRACT_BURNDOWN } from './burndown.js';
import { CONTRACT_FORMULA } from './formula.js';

export const CONTRACTS: Readonly<Partial<Record<ViewId, ChartContract>>> = Object.freeze({
  bar: CONTRACT_BAR,
  line: CONTRACT_LINE,
  matrix3d: CONTRACT_MATRIX3D,
  bullet: CONTRACT_BULLET,
  report: CONTRACT_REPORT,
  scatter: CONTRACT_SCATTER,
  pie: CONTRACT_PIE,
  pie3d: CONTRACT_PIE3D,
  funnel: CONTRACT_FUNNEL,
  radar: CONTRACT_RADAR,
  treemap: CONTRACT_TREEMAP,
  gantt: CONTRACT_GANTT,
  scatter3d: CONTRACT_SCATTER3D,
  line3d: CONTRACT_LINE3D,
  fishbone: CONTRACT_FISHBONE,
  heatmap: CONTRACT_HEATMAP,
  sankey: CONTRACT_SANKEY,
  boxplot: CONTRACT_BOXPLOT,
  sunburst: CONTRACT_SUNBURST,
  grid: CONTRACT_GRID,
  combo: CONTRACT_COMBO,
  rank: CONTRACT_RANK,
  histogram: CONTRACT_HISTOGRAM,
  kpi: CONTRACT_KPI,
  compare: CONTRACT_COMPARE,
  cohort: CONTRACT_COHORT,
  tree: CONTRACT_TREE,
  network: CONTRACT_NETWORK,
  control: CONTRACT_CONTROL,
  parallel: CONTRACT_PARALLEL,
  er: CONTRACT_ER,
  flowchart: CONTRACT_FLOWCHART,
  sequence: CONTRACT_SEQUENCE,
  burndown: CONTRACT_BURNDOWN,
  formula: CONTRACT_FORMULA,
});

export function getContract(view: ViewId): ChartContract | undefined {
  return CONTRACTS[view];
}
