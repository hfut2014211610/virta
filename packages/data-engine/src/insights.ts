// 洞察（§5.1）：中文文案模板，importance 降序；阅读态前 3、回执最多 8。
// spec.format 影响数字格式化（本期简化为千分位/百分比）。
import type { Insight, ViewId, ViewSpec } from '@virta/contracts';
import type { BarlineModel } from './families/barline.js';
import type { BulletModel } from './families/bullet.js';
import type { FunnelModel } from './families/funnel.js';
import type { PieModel } from './families/pie.js';
import type { RadarModel } from './families/radar.js';
import type { SankeyModel } from './families/sankey.js';
import type { ScatterModel } from './families/scatter.js';
import type { TreemapModel } from './families/treemap.js';
import type { SunburstModel } from './families/sunburst.js';
import type { BoxplotModel } from './families/boxplot.js';
import type { HeatmapModel } from './families/heatmap.js';
import type { GanttModel } from './families/gantt.js';
import type { FishboneModel } from './families/fishbone.js';
import type { GridModel } from './families/grid.js';
import type { Pie3dModel } from './families/pie3d.js';
import type { Line3dModel } from './families/line3d.js';
import type { DocModel } from './families/docmd.js';
import type { CohortModel, CompareModel, HistogramModel, KpiModel, RankModel } from './families/t1.js';

const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Math.abs(r) >= 1000 ? Math.round(r).toLocaleString('en-US') : String(r);
};
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const ins = (kind: Insight['kind'], text: string, importance: number, extra?: Partial<Insight>): Insight =>
  ({ kind, text, importance, ...extra });

function barlineInsights(m: BarlineModel): Insight[] {
  const { labels, series } = m;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  const order = totals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const out: Insight[] = [];
  if (order.length) {
    const [v1, i1] = order[0];
    out.push(ins('peak', `「${labels[i1]}」最高，合计 ${fmt(v1)}，占总量 ${pct(grand ? v1 / grand : 0)}`, 0.9, { value: v1, ref: { label: labels[i1] } }));
    if (order.length > 1) {
      const [v2, i2] = order[1];
      out.push(ins('gap', `第 1 名领先第 2 名 ${fmt(v1 - v2)}（${labels[i1]} vs ${labels[i2]}）`, 0.75));
    }
    const top3 = order.slice(0, 3).reduce((a, [v]) => a + v, 0);
    out.push(ins('concentration', `前 ${Math.min(3, order.length)} 类集中度 ${pct(grand ? top3 / grand : 0)}`, 0.7));
    const neg = totals.filter((v) => v < 0).length;
    if (neg) out.push(ins('outlier', `${neg} 个分类为负值`, 0.65));
  }
  // 系列首末变化率（line 语义）
  for (const s of series.slice(0, 2)) {
    const f = s.values[0], l = s.values[s.values.length - 1];
    if (f !== 0) out.push(ins('change', `「${s.name}」首末变化 ${pct((l - f) / Math.abs(f))}（${labels[0]}→${labels[labels.length - 1]}）`, 0.6, { ref: { series: s.name } }));
  }
  return out;
}

function lineInsights(m: BarlineModel): Insight[] {
  const out = barlineInsights(m);
  const s0 = m.series[0];
  if (s0 && s0.values.length >= 4) {
    // 相对 3 点滚动均值 |z|>2.5 的异常点
    const vs = s0.values;
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const sd = Math.sqrt(vs.reduce((a, v) => a + (v - mean) ** 2, 0) / vs.length) || 1;
    for (let i = 3; i < vs.length; i++) {
      const roll = (vs[i - 1] + vs[i - 2] + vs[i - 3]) / 3;
      const z = Math.abs(vs[i] - roll) / sd;
      if (z > 2.5) {
        out.push(ins('outlier', `「${s0.name}」在 ${m.labels[i]} 异常（${fmt(vs[i])}，偏离 3 点滚动均值 ${fmt(roll)}）`, 0.8, { ref: { label: m.labels[i], series: s0.name } }));
        break;
      }
    }
    // 最大环比
    let mi = -1, mr = 0;
    for (let i = 1; i < vs.length; i++) {
      const r = vs[i - 1] !== 0 ? (vs[i] - vs[i - 1]) / Math.abs(vs[i - 1]) : 0;
      if (Math.abs(r) > Math.abs(mr)) { mr = r; mi = i; }
    }
    if (mi > 0) out.push(ins('change', `「${s0.name}」最大环比变化 ${pct(mr)}（${m.labels[mi - 1]}→${m.labels[mi]}）`, 0.72, { ref: { label: m.labels[mi], series: s0.name } }));
  }
  return out;
}

function pieInsights(m: PieModel): Insight[] {
  const out: Insight[] = [];
  if (m.top) out.push(ins('share', `「${m.top.label}」占比最高 ${pct(m.top.share)}（${fmt(m.top.value)}）`, 0.9, { ref: { label: m.top.label } }));
  const tail = m.slices.filter((s) => s.share < 0.05).length;
  if (tail) out.push(ins('concentration', `${tail} 个分类占比 <5%（长尾 ${tail} 项）`, 0.6));
  return out;
}

function funnelInsights(m: FunnelModel): Insight[] {
  const out: Insight[] = [ins('retention', `总转化率 ${pct(m.overall)}（${m.stages[0]?.label}→${m.stages[m.stages.length - 1]?.label}）`, 0.9)];
  if (m.worst) out.push(ins('bottleneck', `流失最大环节：「${m.worst.label}」流失 ${fmt(m.worst.drop)}（${pct(m.worst.drop_rate)}）`, 0.85, { ref: { label: m.worst.label } }));
  return out;
}

function bulletInsights(m: BulletModel): Insight[] {
  const out: Insight[] = [ins('target', `达标 ${m.hits}/${m.rows} 项，平均达成率 ${pct(m.avg_ratio)}`, 0.9)];
  const worst = [...m.items].sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9))[0];
  if (worst && worst.ratio !== null && worst.ratio !== undefined) {
    out.push(ins('gap', `差距最大：「${worst.label}」达成率仅 ${pct(worst.ratio)}（缺口 ${fmt(worst.gap ?? 0)}）`, 0.85, { ref: { label: worst.label } }));
  }
  return out;
}

function scatterInsights(m: ScatterModel): Insight[] {
  const r = m.fit?.r ?? null;
  const desc = r === null ? '—' : r >= 0.7 ? '强正相关' : r >= 0.4 ? '中度正相关' : r <= -0.7 ? '强负相关' : r <= -0.4 ? '中度负相关' : '弱相关';
  const out: Insight[] = [];
  if (r !== null) out.push(ins('correlation', `x/y 相关系数 r=${r.toFixed(3)}（${desc}）`, 0.9, { value: r }));
  // 离群点：|z|>2
  const zs = (arr: number[]) => {
    const mu = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, v) => a + (v - mu) ** 2, 0) / arr.length) || 1;
    return arr.map((v) => (v - mu) / sd);
  };
  if (m.points.length >= 8) {
    const zx = zs(m.points.map((p) => p.x)), zy = zs(m.points.map((p) => p.y));
    const n = m.points.filter((_, i) => Math.abs(zx[i]) > 2 || Math.abs(zy[i]) > 2).length;
    if (n) out.push(ins('outlier', `${n} 个离群点（|z|>2）`, 0.7));
  }
  return out;
}

function radarInsights(m: RadarModel): Insight[] {
  const out: Insight[] = [];
  for (const it of m.items.slice(0, 3)) {
    out.push(ins('peak', `「${it.name}」最强轴 ${m.axes[it.max_i].label}，最弱轴 ${m.axes[it.min_i].label}`, 0.8 - out.length * 0.05, { ref: { series: it.name } }));
  }
  if (m.items.length) out.push(ins('share', `覆盖面积最大：「${m.leader}」`, 0.85));
  return out;
}

function sankeyInsights(m: SankeyModel): Insight[] {
  const out: Insight[] = [];
  const links = [...m.links].sort((a, b) => b.v - a.v);
  if (links.length) {
    const l = links[0];
    out.push(ins('peak', `最大流量：${m.nodes[l.s].name} → ${m.nodes[l.t].name}（${fmt(l.v)}）`, 0.9));
  }
  const inV = new Map<number, number>(), outV = new Map<number, number>();
  for (const l of m.links) { outV.set(l.s, (outV.get(l.s) ?? 0) + l.v); inV.set(l.t, (inV.get(l.t) ?? 0) + l.v); }
  let sink = -1, sinkV = 0;
  m.nodes.forEach((n, i) => { const d = (inV.get(i) ?? 0) - (outV.get(i) ?? 0); if (d > sinkV) { sinkV = d; sink = i; } });
  if (sink >= 0) out.push(ins('share', `最大汇点：「${m.nodes[sink].name}」净流入 ${fmt(sinkV)}`, 0.8));
  return out;
}

function treemapInsights(m: TreemapModel): Insight[] {
  const out: Insight[] = [];
  if (m.top.label) out.push(ins('share', `最大块：「${m.top.label}」占 ${pct(m.top.share)}`, 0.9, { ref: { label: m.top.label } }));
  const items = m.groups ? m.groups.flatMap((g) => g.children) : m.flat ?? [];
  const tail = items.filter((c) => c.share < 0.05).length;
  if (tail) out.push(ins('concentration', `${tail} 个区块占比 <5%`, 0.6));
  return out;
}

function sunburstInsights(m: SunburstModel): Insight[] {
  const out: Insight[] = [];
  const top = [...m.tree.children].sort((a, b) => b.value - a.value)[0];
  if (top) out.push(ins('share', `最大分支：「${top.name}」占 ${pct(top.value / (m.tree.value || 1))}`, 0.9, { ref: { label: top.name } }));
  out.push(ins('distribution', `${m.counts.levels} 层 ${m.counts.leaves} 个叶子，总量 ${fmt(m.counts.total)}`, 0.5));
  return out;
}

function boxplotInsights(m: BoxplotModel): Insight[] {
  const out: Insight[] = [];
  const byMed = [...m.groups].sort((a, b) => b.med - a.med)[0];
  if (byMed) out.push(ins('peak', `中位数最高：「${byMed.name}」=${fmt(byMed.med)}`, 0.85, { ref: { label: byMed.name } }));
  const byIqr = [...m.groups].sort((a, b) => (b.q3 - b.q1) - (a.q3 - a.q1))[0];
  if (byIqr) out.push(ins('distribution', `离散度最大：「${byIqr.name}」IQR=${fmt(byIqr.q3 - byIqr.q1)}`, 0.75));
  if (m.counts.outliers) out.push(ins('outlier', `离群点共 ${m.counts.outliers} 个`, 0.7));
  return out;
}

function heatmapInsights(m: HeatmapModel): Insight[] {
  const out: Insight[] = [];
  if (m.mode === 'calendar' && m.years) {
    const peak = m.counts['peak'], peakv = m.counts['peakv'];
    out.push(ins('peak', `最热日：${peak}（${fmt(Number(peakv))}）`, 0.9));
  } else if (m.cells && m.xs && m.ys) {
    const hot = [...m.cells].sort((a, b) => b.v - a.v)[0];
    if (hot) out.push(ins('peak', `最热格：${m.xs[hot.x]} × ${m.ys[hot.y]}（${fmt(hot.v)}）`, 0.9));
  }
  return out;
}

function ganttInsights(m: GanttModel): Insight[] {
  const out: Insight[] = [];
  const end = Math.max(...m.tasks.map((t) => t.e));
  const lastTask = m.tasks.find((t) => t.e === end);
  out.push(ins('critical-path', `最晚结束：「${lastTask?.label}」（第 ${end} 天${m.base ? '，' + m.base : ''}）`, 0.85));
  if (m.counts.delayed) out.push(ins('outlier', `延期任务 ${m.counts.delayed} 项`, 0.8));
  if (m.counts.avg_progress !== null) out.push(ins('trend', `整体完成度 ${pct(m.counts.avg_progress)}`, 0.7));
  return out;
}

function fishboneInsights(m: FishboneModel): Insight[] {
  const out: Insight[] = [ins('distribution', `${m.counts.cats} 类 ${m.counts.causes} 条原因，最深 ${m.counts.depth} 层`, 0.7)];
  out.push(ins('peak', `原因最多类目：「${m.counts.maxCat}」（${m.counts.maxK} 条）`, 0.85));
  return out;
}

function gridInsights(m: GridModel): Insight[] {
  return [ins('distribution', `${m.n_rows} 行 × ${m.columns.length} 列（${m.dims.length} 维度 ${m.measures.length} 度量，${m.mode} 模式）`, 0.6)];
}

function pie3dInsights(m: Pie3dModel): Insight[] {
  const out: Insight[] = [];
  if (m.peak.label !== '—') out.push(ins('share', `最大扇区：「${m.peak.label}」（${m.peak.layer ?? '全部'} 层内占 ${pct(m.peak.share)}）`, 0.85));
  out.push(ins('distribution', `${m.n_layers} 层 × ${m.n_categories} 类，总量 ${fmt(m.grand)}`, 0.5));
  return out;
}

function line3dInsights(m: Line3dModel): Insight[] {
  const out = barlineInsights(m);
  out.unshift(ins('distribution', `${m.n_labels} 分类 × ${m.n_series} 系列，值域 ${fmt(m.value_range[0])}~${fmt(m.value_range[1])}`, 0.55));
  return out;
}

function docInsights(m: DocModel): Insight[] {
  const out: Insight[] = [ins('distribution', `${m.stats.sections} 节 / ${m.stats.tables} 表 / ${m.metrics.length} 指标`, 0.6)];
  const inferred = m.metrics.filter((x) => x.method === 'inferred').length;
  if (inferred) out.push(ins('outlier', `${inferred} 个指标为推断识别，请复核来源句`, 0.75));
  return out;
}

// ── T1 新视图洞察（M6）──
function rankInsights(m: RankModel): Insight[] {
  const top = m.items[0];
  const out: Insight[] = [];
  if (top) out.push(ins('peak', `榜首 ${top.label}（${fmt(top.value)}），领先次名 ${fmt(top.value - (m.items[1]?.value ?? 0))}`, 0.9));
  const top3 = m.items.slice(0, 3).reduce((a, b) => a + b.value, 0);
  const tot = m.items.reduce((a, b) => a + b.value, 0);
  if (tot > 0) out.push(ins('concentration', `前 3 名占总量 ${pct(top3 / tot)}`, 0.7));
  if (m.mode === 'race' && m.frames && m.frames.length > 1) {
    const first = m.frames[0], last = m.frames[m.frames.length - 1];
    const riser = last.items.slice(0, 5)
      .map((it) => ({ it, was: first.items.findIndex((a) => a.label === it.label) }))
      .filter((x) => x.was > 0)
      .sort((a, b) => a.was - b.was)[0];
    if (riser) out.push(ins('trend', `${riser.it.label} 从第 ${riser.was + 1} 升至第 ${last.items.indexOf(riser.it) + 1}`, 0.8));
    out.push(ins('distribution', `${m.frames.length} 个时间帧（${first.time} → ${last.time}）`, 0.5));
  }
  return out;
}

function histogramInsights(m: HistogramModel): Insight[] {
  const peak = m.bins.reduce((a, b) => (b.count > a.count ? b : a), m.bins[0]);
  const out: Insight[] = [
    ins('peak', `最密集区间 ${peak.x0.toFixed(1)}–${peak.x1.toFixed(1)}，含 ${peak.count} 个样本（${pct(peak.count / m.n)}）`, 0.9),
    ins('distribution', `n=${m.n}，${m.bins.length} 个分箱（FD 规则），范围 ${m.min.toFixed(1)}–${m.max.toFixed(1)}`, 0.6),
  ];
  const medBin = m.bins.findIndex((b) => b.cum >= m.n / 2);
  if (medBin > 0) out.push(ins('distribution', `中位数落在第 ${medBin + 1} 箱（${m.bins[medBin].x0.toFixed(1)}–${m.bins[medBin].x1.toFixed(1)}）`, 0.7));
  if (m.groups.length > 1) {
    const gmax = m.groups.reduce((a, b2) => (b2.n > a.n ? b2 : a));
    out.push(ins('share', `最大分组 ${gmax.name}（${gmax.n}，${pct(gmax.n / m.n)}）`, 0.65));
  }
  return out;
}

function kpiInsights(m: KpiModel): Insight[] {
  const out: Insight[] = [];
  const withT = m.items.filter((i) => i.target !== undefined && i.target !== 0);
  if (withT.length) {
    out.push(ins('target', `达标 ${withT.filter((i) => i.value / i.target! >= 1).length}/${withT.length} 项指标`, 0.9));
    const worst = withT.reduce((a, b) => (a.value / a.target! < b.value / b.target! ? a : b));
    if (worst.value / worst.target! < 1) out.push(ins('bottleneck', `${worst.label} 达成率最低（${pct(worst.value / worst.target!)}）`, 0.85));
  }
  const withP = m.items.filter((i) => i.previous !== undefined && i.previous !== 0);
  if (withP.length) {
    const best = withP.reduce((a, b) => ((b.value - b.previous!) / Math.abs(b.previous!) > (a.value - a.previous!) / Math.abs(a.previous!) ? b : a));
    out.push(ins('trend', `环比改善最大：${best.label}（${pct((best.value - best.previous!) / Math.abs(best.previous!))}）`, 0.75));
  }
  return out;
}

function compareInsights(m: CompareModel): Insight[] {
  const out: Insight[] = [
    ins('change', `上升 ${m.up} 项、下降 ${m.down} 项${m.reversed ? `，${m.reversed} 项方向反转` : ''}`, 0.9),
  ];
  const big = m.items.reduce((a, b) => (Math.abs(b.dpct) > Math.abs(a.dpct) ? b : a));
  out.push(ins('outlier', `变化最大：${big.label}（${big.delta > 0 ? '+' : ''}${pct(big.dpct)}）`, 0.8));
  const rev = m.items.filter((i) => (m.up >= m.down ? i.delta < 0 : i.delta > 0));
  if (rev.length) out.push(ins('bottleneck', `逆势项：${rev.map((i) => i.label).join('、')}`, 0.85));
  return out;
}

function cohortInsights(m: CohortModel): Insight[] {
  const out: Insight[] = [];
  const p1 = m.rows.filter((r) => r.cells[1] !== null && r.size > 0)
    .map((r) => r.cells[1]! / r.size);
  if (p1.length) {
    const avg = p1.reduce((a, b) => a + b, 0) / p1.length;
    out.push(ins('retention', `第 1 期平均留存 ${pct(avg)}（${p1.length} 个批次）`, 0.9));
    const worstIdx = p1.indexOf(Math.min(...p1));
    const rows1 = m.rows.filter((r) => r.cells[1] !== null && r.size > 0);
    if (rows1[worstIdx]) out.push(ins('bottleneck', `早期留存最低批次：${rows1[worstIdx].name}（${pct(Math.min(...p1))}）`, 0.8));
  }
  const lastP = m.rows.map((r) => {
    let i = r.cells.length - 1;
    while (i >= 0 && r.cells[i] === null) i--;
    return i > 0 && r.size > 0 ? r.cells[i]! / r.size : null;
  }).filter((v): v is number => v !== null);
  if (lastP.length) out.push(ins('retention', `末期留存均值 ${pct(lastP.reduce((a, b) => a + b, 0) / lastP.length)}`, 0.7));
  return out;
}

function comboInsights(m: BarlineModel): Insight[] {
  const out: Insight[] = [];
  if (m.series.length >= 2) {
    const [a, b] = m.series;
    const grow = (s: { values: number[] }) => {
      const v = s.values;
      return v.length > 1 && v[0] !== 0 ? (v[v.length - 1] - v[0]) / Math.abs(v[0]) : 0;
    };
    out.push(ins('trend', `${a.name} ${grow(a) >= 0 ? '增长' : '下降'} ${pct(Math.abs(grow(a)))}，${b.name} ${grow(b) >= 0 ? '增长' : '下降'} ${pct(Math.abs(grow(b)))}`, 0.9));
    const corrOk = a.values.length > 2 && b.values.length > 2;
    if (corrOk) {
      const ma = a.values.reduce((x, y) => x + y) / a.values.length;
      const mb = b.values.reduce((x, y) => x + y) / b.values.length;
      let sxy = 0, sx = 0, sy = 0;
      a.values.forEach((va, i) => { const vb = b.values[i]; sxy += (va - ma) * (vb - mb); sx += (va - ma) ** 2; sy += (vb - mb) ** 2; });
      const r = sxy / (Math.sqrt(sx * sy) || 1);
      if (Math.abs(r) >= 0.7) out.push(ins('correlation', `两指标${r > 0 ? '正' : '负'}相关（r=${r.toFixed(2)}）`, 0.8));
      else if (Math.abs(r) < 0.3) out.push(ins('correlation', `两指标相关性弱（r=${r.toFixed(2)}）`, 0.6));
    }
  }
  return out;
}

const INSIGHTERS: Partial<Record<ViewId, (m: never) => Insight[]>> = {
  bar: barlineInsights as never, matrix3d: barlineInsights as never,
  line: lineInsights as never, line3d: line3dInsights as never,
  pie: pieInsights as never, funnel: funnelInsights as never,
  bullet: bulletInsights as never, scatter: scatterInsights as never,
  scatter3d: scatterInsights as never, radar: radarInsights as never,
  sankey: sankeyInsights as never, treemap: treemapInsights as never,
  sunburst: sunburstInsights as never, boxplot: boxplotInsights as never,
  heatmap: heatmapInsights as never, gantt: ganttInsights as never,
  fishbone: fishboneInsights as never, grid: gridInsights as never,
  pie3d: pie3dInsights as never, report: docInsights as never,
  combo: comboInsights as never, rank: rankInsights as never,
  histogram: histogramInsights as never, kpi: kpiInsights as never,
  compare: compareInsights as never, cohort: cohortInsights as never,
};

export function insights(view: ViewId, model: unknown, _spec?: ViewSpec): Insight[] {
  const fn = INSIGHTERS[view];
  const list = fn ? (fn as (m: unknown) => Insight[])(model) : [];
  return list.sort((a, b) => b.importance - a.importance).slice(0, 8);
}
