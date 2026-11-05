// counts(model)：回执用的计数（替代 legacy SUMMARY_KEYS/SUMMARY_FMT）。
import type { ViewId } from '@virta/contracts';

type Any = Record<string, unknown>;
const arr = (v: unknown) => (Array.isArray(v) ? v.length : 0);

const COUNTERS: Record<string, (m: Any) => Record<string, number>> = {
  barline: (m) => ({ labels: arr(m['labels']), series: arr(m['series']) }),
  bullet: (m) => ({ items: arr(m['items']), hits: m['hits'] as number ?? 0 }),
  boxplot: (m) => ({ groups: arr(m['groups']), outliers: (m['counts'] as Any)?.['outliers'] as number ?? 0 }),
  fishbone: (m) => ({ cats: (m['counts'] as Any)?.['cats'] as number ?? arr(m['cats']), causes: (m['counts'] as Any)?.['causes'] as number ?? 0 }),
  funnel: (m) => ({ stages: arr(m['stages']) }),
  gantt: (m) => ({ tasks: arr(m['tasks']), groups: arr(m['groups']), milestones: (m['counts'] as Any)?.['milestones'] as number ?? 0 }),
  grid: (m) => ({ rows: m['n_rows'] as number ?? arr(m['rows']), columns: arr(m['columns']) }),
  heatmap: (m) => (m['counts'] as Record<string, number>) ?? {},
  line3d: (m) => ({ labels: arr(m['labels']), series: arr(m['series']) }),
  pie: (m) => ({ slices: arr(m['slices']) }),
  pie3d: (m) => ({ rings: m['n_layers'] as number ?? arr(m['layers']), categories: m['n_categories'] as number ?? 0 }),
  radar: (m) => ({ axes: m['nax'] as number ?? arr(m['axes']), items: arr(m['items']) }),
  sankey: (m) => ({ links: arr(m['links']), nodes: arr(m['nodes']) }),
  scatter: (m) => ({ points: arr(m['points']), groups: arr(m['groups']) }),
  sunburst: (m) => ({ levels: (m['counts'] as Any)?.['levels'] as number ?? 0, leaves: (m['counts'] as Any)?.['leaves'] as number ?? 0 }),
  treemap: (m) => ({ leaf: m['n_leaf'] as number ?? 0, groups: (m['n_groups'] as number) ?? 0 }),
  report: (m) => ({ sections: (m['stats'] as Any)?.['sections'] as number ?? 0, metrics: arr(m['metrics']) }),
  rank: (m) => ({ items: arr(m['items']), frames: arr(m['frames']) }),
  histogram: (m) => ({ bins: arr(m['bins']), groups: arr(m['groups']), n: m['n'] as number ?? 0 }),
  kpi: (m) => ({ items: arr(m['items']), hits: m['hits'] as number ?? 0 }),
  compare: (m) => ({ items: arr(m['items']), reversed: m['reversed'] as number ?? 0 }),
  cohort: (m) => ({ cohorts: arr(m['rows']), periods: arr(m['periods']) }),
  tree: (m) => ({ nodes: arr(m['nodes']), roots: arr(m['roots']) }),
  network: (m) => ({ nodes: arr(m['nodes']), links: arr(m['links']) }),
  control: (m) => ({ lines: arr(m['lines']), outOfControl: (m['lines'] as Any[] ?? []).reduce((a, l) => a + ((l['points'] as Any[] ?? []).filter((p) => p['flag'] === 'r1').length), 0) }),
  parallel: (m) => ({ axes: arr(m['axes']), rows: arr(m['rows']) }),
};

const BARLINE_VIEWS = new Set(['bar', 'line', 'matrix3d', 'combo']);
const VIEW_COUNTER: Partial<Record<ViewId, string>> = {
  bullet: 'bullet', boxplot: 'boxplot', fishbone: 'fishbone', funnel: 'funnel',
  gantt: 'gantt', grid: 'grid', heatmap: 'heatmap', line3d: 'line3d', pie: 'pie',
  pie3d: 'pie3d', radar: 'radar', sankey: 'sankey', scatter: 'scatter',
  scatter3d: 'scatter', sunburst: 'sunburst', treemap: 'treemap', report: 'report',
  rank: 'rank', histogram: 'histogram', kpi: 'kpi', compare: 'compare', cohort: 'cohort',
  tree: 'tree', network: 'network', control: 'control', parallel: 'parallel',
};

export function counts(view: ViewId, model: unknown): Record<string, number> {
  const key = BARLINE_VIEWS.has(view) ? 'barline' : VIEW_COUNTER[view];
  const fn = key ? COUNTERS[key] : null;
  return fn ? fn(model as Any) : {};
}
