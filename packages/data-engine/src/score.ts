// 推荐引擎（§5.1 打分表）：score ∈ [0,1]，全图族评分取前 5。
// 同分按 SCORERS 表序稳定决胜；3D 图族低分（D14）。
import type { ColumnProfile, Table, TableProfile, ViewId } from '@virta/contracts';
import type { ScoreResult } from './families/types.js';
import { parseNumber } from './legacy-core.js';
import {
  normKey,
  LABEL_ALIASES, VALUE_ALIAS, SERIES_ALIAS, TYPE_ALIAS, ABS_TOKENS, DELTA_TOKENS,
  ACTUAL_ALIAS, TARGET_ALIAS, SIZE_ALIAS,
  SANKEY_SOURCE_ALIAS, SANKEY_TARGET_ALIAS,
  BOX_Q1_ALIAS, BOX_MED_ALIAS, BOX_Q3_ALIAS, BOX_MIN_ALIAS, BOX_MAX_ALIAS,
  GANTT_TASK_ALIAS, GANTT_START_ALIAS, GANTT_END_ALIAS, GANTT_DUR_ALIAS,
  FISH_CAT_ALIAS, FISH_CAUSE_ALIAS,
  HEAT_X_ALIAS, HEAT_Y_ALIAS, HEAT_DATE_ALIAS,
  CONTROL_N_ALIAS, CONTROL_UCL_ALIAS, CONTROL_LCL_ALIAS,
} from './aliases.js';
import { toSankey } from './families/sankey.js';
import type { Raw } from './families/barline.js';

const no = (): ScoreResult => ({ score: 0, reason: '', mapping: {}, missingRoles: [] });
const hit = (p: TableProfile, aliases: readonly string[]) =>
  p.columns.find((c) => aliases.includes(normKey(c.name))) ?? null;
const hits = (p: TableProfile, aliases: readonly string[]) =>
  p.columns.filter((c) => aliases.includes(normKey(c.name)));
const dimCols = (p: TableProfile) => p.columns.filter((c) => p.dims.includes(c.name));
const measureCols = (p: TableProfile) => p.columns.filter((c) => p.measures.includes(c.name));
const labelCol = (p: TableProfile) => hit(p, LABEL_ALIASES) ?? dimCols(p)[0] ?? null;
const valueCol = (p: TableProfile) => hit(p, VALUE_ALIAS) ?? measureCols(p)[0] ?? null;
const cellStr = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const distinctOf = (t: Table, c: string) => new Set(t.rows.map((r) => cellStr(r[c]))).size;
// 预算/计划 语义上是 target（仅推荐层放宽，adapter 仍忠于 legacy 别名）
const SCORE_TARGET_ALIAS = [...TARGET_ALIAS, normKey('预算'), normKey('计划')];

function baseMapping(p: TableProfile): Record<string, string | string[]> {
  const m: Record<string, string | string[]> = {};
  const l = labelCol(p), v = valueCol(p), s = hit(p, SERIES_ALIAS);
  if (l) m['label'] = l.name;
  if (s) m['series'] = s.name;
  if (v) m['value'] = v.name;
  return m;
}

type Scorer = (p: TableProfile, t: Table) => ScoreResult;

const sReport: Scorer = (_p, t) =>
  t.source.format === 'md' || t.source.format === 'txt'
    ? { score: 1, reason: '输入为 .md/.txt 文档', mapping: {}, missingRoles: [] } : no();

const sTree: Scorer = (p) => {
  const id = p.columns.find((c) => ['id', '编号', 'code'].includes(normKey(c.name)));
  const parent = p.columns.find((c) => ['parent', 'pid', '父', '父级', '上级', 'parentid'].includes(normKey(c.name)));
  return id && parent
    ? { score: 0.95, reason: '检测到 id + parent 列', mapping: { id: id.name, parent: parent.name }, missingRoles: [] } : no();
};

const sGantt: Scorer = (p) => {
  const task = hit(p, GANTT_TASK_ALIAS) ?? hit(p, LABEL_ALIASES);
  const start = hit(p, GANTT_START_ALIAS) ?? p.columns.find((c) => c.type === 'date');
  const end = hit(p, GANTT_END_ALIAS), dur = hit(p, GANTT_DUR_ALIAS);
  if (!task || !start) return no();
  return {
    score: 0.95, reason: '任务列 + 开始日期（+ 结束/工期）',
    mapping: { task: task.name, start: start.name, ...(end ? { end: end.name } : {}), ...(dur ? { duration: dur.name } : {}) },
    missingRoles: end || dur ? [] : ['end|duration'],
  };
};

const sBoxplot: Scorer = (p) => {
  const q1 = hit(p, BOX_Q1_ALIAS), med = hit(p, BOX_MED_ALIAS), q3 = hit(p, BOX_Q3_ALIAS);
  const mn = hit(p, BOX_MIN_ALIAS), mx = hit(p, BOX_MAX_ALIAS);
  if (q1 && med && q3) {
    const g = dimCols(p)[0];
    return {
      score: 0.95, reason: 'min/q1/median/q3/max 汇总列齐备', mode: 'summary',
      mapping: { group: g?.name ?? p.columns[0].name, q1: q1.name, median: med.name, q3: q3.name, ...(mn ? { min: mn.name } : {}), ...(mx ? { max: mx.name } : {}) },
      missingRoles: [],
    };
  }
  // 单维度分组观测才是箱线场景；多维度事实表 / 日历矩阵留给 grid/heatmap
  const ds = dimCols(p);
  if (ds.length !== 1 || (hit(p, HEAT_X_ALIAS) && hit(p, HEAT_Y_ALIAS))) return no();
  const g = ds[0], v = measureCols(p)[0] ?? hit(p, VALUE_ALIAS);
  // 命中 heatmap 轴别名的是矩阵数据，不是分组观测
  if (hit(p, HEAT_X_ALIAS) || hit(p, HEAT_Y_ALIAS)) return no();
  if (g && v && g.distinct <= 20 && p.rows / Math.max(1, g.distinct) >= 5) {
    return { score: 0.8, reason: `维度 ${g.name} ≤20 组 + 度量，平均每组 ${(p.rows / g.distinct).toFixed(0)} 条观测`, mode: 'observations', mapping: { group: g.name, value: v.name }, missingRoles: [] };
  }
  return no();
};

const sBarWaterfall: Scorer = (p, t) => {
  const type = hit(p, TYPE_ALIAS);
  if (!type) return no();
  const hasMarker = t.rows.some((r) => {
    const v = cellStr(r[type.name]).toLowerCase();
    return ABS_TOKENS.has(v) || DELTA_TOKENS.has(v);
  });
  if (!hasMarker) return no();
  const l = labelCol(p), v = valueCol(p);
  return {
    score: 0.9, reason: 'type 列含 absolute/delta 行类型标记', variant: 'waterfall',
    mapping: { label: l?.name ?? '', value: v?.name ?? '', type: type.name }, missingRoles: l && v ? [] : ['label/value'],
  };
};

const sBullet: Scorer = (p) => {
  // sankey 形（source+target+value）也是 actual/target 字面命中——让流向数据归 sankey
  if (hit(p, SANKEY_SOURCE_ALIAS) && hit(p, SANKEY_TARGET_ALIAS)) return no();
  // 推荐层放宽：列名包含别名即算（「实际良率」含「实际」）；adapter 仍严格全等
  const loose = (aliases: readonly string[]) =>
    p.columns.find((c) => aliases.some((a) => a.length >= 2 && normKey(c.name).includes(a))) ?? null;
  const a = hit(p, ACTUAL_ALIAS) ?? loose(ACTUAL_ALIAS);
  const tg = hit(p, SCORE_TARGET_ALIAS);
  if (!a || !tg) return no();
  return { score: 0.9, reason: 'actual + target 别名列齐备', mapping: { label: labelCol(p)?.name ?? '', actual: a.name, target: tg.name }, missingRoles: [] };
};

const sFishbone: Scorer = (p) => {
  const cat = hit(p, FISH_CAT_ALIAS), cause = hit(p, FISH_CAUSE_ALIAS);
  if (cat && cause && cat !== cause && !measureCols(p).length) {
    return { score: 0.9, reason: 'category + cause 文本列、无数值列', mapping: { category: cat.name, cause: cause.name }, missingRoles: [] };
  }
  return no();
};

const sCohort: Scorer = (p) => {
  const coh = p.columns.find((c) => c.type === 'date' || c.type === 'temporal-label' || ['cohort', '批次'].includes(normKey(c.name)));
  const period = p.columns.find((c) => c.type === 'number' && ['period', '期', '第几期', '期数', 'week'].includes(normKey(c.name)));
  const v = measureCols(p).find((c) => c !== period);
  return coh && period && v
    ? { score: 0.9, reason: 'cohort 列 + period 整数列 + 度量', mapping: { cohort: coh.name, period: period.name, value: v.name }, missingRoles: [] } : no();
};

const isDag = (t: Table): boolean => {
  try {
    const model = toSankey(t.rows as unknown as Raw);
    return !(model.quality.warnings ?? []).some((w) => w.includes('循环依赖'));
  } catch { return false; }
};

const sSankey: Scorer = (p, t) => {
  const s = hit(p, SANKEY_SOURCE_ALIAS), tg = hit(p, SANKEY_TARGET_ALIAS);
  const v = hit(p, VALUE_ALIAS) ?? measureCols(p).find((c) => c !== s && c !== tg);
  if (!s || !tg || !v) return no();
  const dag = isDag(t);
  return {
    score: dag ? 0.9 : 0.55,
    reason: dag ? 'source+target+value，可分层 DAG' : 'source+target+value，含环（边会被剔除，network 更优）',
    mapping: { source: s.name, target: tg.name, value: v.name }, missingRoles: [],
  };
};
const sNetwork: Scorer = (p, t) => {
  const s = hit(p, SANKEY_SOURCE_ALIAS), tg = hit(p, SANKEY_TARGET_ALIAS);
  const v = hit(p, VALUE_ALIAS) ?? measureCols(p).find((c) => c !== s && c !== tg);
  if (!s || !tg || !v) return no();
  const dag = isDag(t);
  return {
    score: dag ? 0.6 : 0.85,
    reason: dag ? 'source+target+value（可分层时 sankey 更优）' : '流网络有环/无层次 → network',
    mapping: { source: s.name, target: tg.name, value: v.name }, missingRoles: [],
  };
};

const sControl: Scorer = (p) => {
  const date = p.columns.find((c) => c.type === 'date');
  const v = measureCols(p)[0];
  if (!date || !v) return no();
  const nCol = hit(p, CONTROL_N_ALIAS);
  const ucl = hit(p, CONTROL_UCL_ALIAS);
  const lcl = hit(p, CONTROL_LCL_ALIAS);
  if (!nCol && !ucl && !lcl) return no();
  const group = dimCols(p).find((c) => c !== date);
  return {
    score: 0.9, reason: '日期 + 测量值 + 控制限/样本量列',
    mapping: {
      date: date.name, value: v.name,
      ...(nCol ? { n: nCol.name } : {}), ...(ucl ? { ucl: ucl.name } : {}), ...(lcl ? { lcl: lcl.name } : {}),
      ...(group ? { group: group.name } : {}),
    },
    missingRoles: [],
  };
};

const FUNNEL_STAGE_NAMES = ['stage', 'funnel', 'phase', 'step', '环节', '阶段', '步骤', '漏斗', '流程', 'level'];
const sFunnel: Scorer = (p, t) => {
  const l = labelCol(p), v = valueCol(p);
  if (!l || !v) return no();
  // 标签列名要像"阶段"（stage/funnel/环节/步骤），仅命中通用 label 别名不算
  if (!FUNNEL_STAGE_NAMES.includes(normKey(l.name))) return no();
  const series = hit(p, SERIES_ALIAS);
  const seriesVals = series ? [...new Set(t.rows.map((r) => cellStr(r[series.name])))] : [null];
  const stageN = distinctOf(t, l.name);
  if (stageN < 3 || stageN > 8) return no();
  let monoGroups = 0;
  for (const sv of seriesVals) {
    const rows = sv === null ? t.rows : t.rows.filter((r) => cellStr(r[series!.name]) === sv);
    const seen = new Map<string, number>();
    for (const r of rows) {
      const lab = cellStr(r[l.name]);
      if (!seen.has(lab)) seen.set(lab, parseNumber(r[v.name])[0]);
    }
    const vals = [...seen.values()].filter((x) => x > 0);
    if (vals.length >= 2 && vals.filter((x, i) => i === 0 || x <= vals[i - 1]).length / vals.length >= 0.8) monoGroups += 1;
  }
  return monoGroups === seriesVals.length && monoGroups > 0
    ? { score: 0.85, reason: `${stageN} 阶段、≥80% 单调递减`, mapping: { label: l.name, value: v.name, ...(series ? { series: series.name } : {}) }, missingRoles: [] } : no();
};

const sHeatmap: Scorer = (p, t) => {
  const date = hit(p, HEAT_DATE_ALIAS) ?? p.columns.find((c) => c.type === 'date');
  const cv = valueCol(p);
  if (date && cv && distinctOf(t, date.name) >= 60) {
    return { score: 0.85, reason: '日期列 ≥60 个不同日 + 度量 → 日历', mode: 'calendar', mapping: { date: date.name, value: cv.name }, missingRoles: [] };
  }
  // y 走 HEAT_Y 别名（hour/小时 等）；x 优先别名，缺失回退首个维度列；
  // 度量排除 x/y 自身（小时这类数字轴会被画成 measure）
  const y = hit(p, HEAT_Y_ALIAS);
  const x = hit(p, HEAT_X_ALIAS) ?? (y ? dimCols(p)[0] : null);
  const v = measureCols(p).find((c) => c !== x && c !== y) ?? null;
  if (x && y && v && x.name !== y.name) {
    const xs = distinctOf(t, x.name), ys = distinctOf(t, y.name);
    if (xs >= 3 && xs <= 40 && ys >= 3 && ys <= 40) {
      const cells = new Set(t.rows.map((r) => `${cellStr(r[x.name])}${cellStr(r[y.name])}`)).size;
      if (cells / (xs * ys) >= 0.5) {
        return { score: 0.75, reason: `x(${xs})×y(${ys}) 网格覆盖 ≥50%`, mode: 'matrix', mapping: { x: x.name, y: y.name, value: v.name }, missingRoles: [] };
      }
    }
  }
  return no();
};

const sLine: Scorer = (p) => {
  const l = labelCol(p);
  if (!l || (l.type !== 'temporal-label' && l.type !== 'date') || !measureCols(p).length) return no();
  // 标签近似主键（每点一行），或"标签×系列"两维长表才算时序；更多维度 → 事实表归 grid
  const series = hit(p, SERIES_ALIAS);
  if (!series && l.distinct / Math.max(1, p.rows) < 0.8) return no();
  if (series && dimCols(p).length > 2) return no();
  const bonus = l.distinct >= 12 ? 0.05 : 0;
  return { score: 0.8 + bonus, reason: `时间类目列 ${l.name}（${l.distinct} 点）+ 度量`, mapping: { label: l.name, value: measureCols(p).map((c) => c.name) }, missingRoles: [] };
};

const sHistogram: Scorer = (p) => {
  const ms = measureCols(p);
  return ms.length === 1 && p.rows >= 30
    ? { score: 0.8, reason: '单一度量列、≥30 行', mapping: { value: ms[0].name }, missingRoles: [] } : no();
};

const sCompare: Scorer = (p) => {
  const l = labelCol(p);
  const ms = measureCols(p);
  if (!l || ms.length !== 2) return no();
  const cmp = /(20\d{2}|上|下|前|后|旧|新|计划|实际|预算|去年|今年|同期|本期|上期|下半年|上半年|Q[1-4])/;
  return ms.every((m) => cmp.test(m.name))
    ? { score: 0.8, reason: '标签 + 恰好 2 个对比期度量列', mapping: { label: l.name, from: ms[0].name, to: ms[1].name }, missingRoles: [] } : no();
};

const sRank: Scorer = (p) => {
  const l = labelCol(p);
  const ms = measureCols(p);
  const ds = dimCols(p);
  if (!l || ms.length !== 1 || p.rows < 12) return no();
  const temporalDim = ds.find((c) => c.type === 'temporal-label' || c.type === 'date');
  // race：类目维 + 时间维 + 单度量；类目 3–30、时间帧 ≥6 才有动态意义 → 压过 line 多系列
  if (ds.length === 2 && temporalDim) {
    const cat = ds.find((d) => d !== temporalDim);
    if (cat && cat.distinct >= 3 && cat.distinct <= 30 && temporalDim.distinct >= 6) {
      return { score: 0.9, reason: `类目 ${cat.name}（${cat.distinct} 项）× 时间 → race`, variant: 'race', mapping: { label: cat.name, value: ms[0].name, time: temporalDim.name }, missingRoles: [] };
    }
    return no();
  }
  // 静态：标签命中系列别名会让位多系列图，不抢
  return ds.length === 1 && !hit(p, SERIES_ALIAS)
    ? { score: 0.65, reason: '标签 + 单度量 ≥12 行', mapping: { label: l.name, value: ms[0].name }, missingRoles: [] } : no();
};

function hierScore(p: TableProfile): { t: number; s: number; reason: string; levels: string[]; value: string } | null {
  const ms = measureCols(p);
  // treemap/sunburst 是单度量图；且维度需沿列序 distinct 递增（树形），
  // 交叉/长表（label×series、id×group、source×target）distinct 不递增 → 排除
  if (ms.length !== 1) return null;
  // 时间维一般是矩阵/长表的轴而非树层级（季度×品类 → 饼/柱）
  const ds = dimCols(p).filter((c) => !TYPE_ALIAS.includes(normKey(c.name)) && c.type !== 'temporal-label' && c.type !== 'date');
  if (ds.length < 2) return null;
  if (!ds.slice(1).every((c, i) => c.distinct > ds[i].distinct)) return null;
  const v = ms[0];
  const depth = Math.min(ds.length, 4);
  const leafN = ds[ds.length - 1].distinct;
  const levels = ds.slice(0, 4).map((c) => c.name);
  if (depth >= 3) return { t: 0.7, s: 0.75, levels, value: v.name, reason: `层级深度 ${depth} → sunburst 优先` };
  if (depth === 2 && leafN > 20) return { t: 0.75, s: 0.7, levels, value: v.name, reason: '层级深度 2 且叶子 >20 → treemap 优先' };
  return { t: 0.7, s: 0.7, levels, value: v.name, reason: '层级 + 度量' };
}
// 推荐 mapping 必须与 contract roles 同名（validate 按契约角色检查）
const sTreemap: Scorer = (p) => {
  const r = hierScore(p);
  if (!r) return no();
  const mapping: Record<string, string | string[]> = { label: r.levels[r.levels.length - 1], value: r.value };
  if (r.levels.length > 1) mapping['group'] = r.levels[0];
  return { score: r.t, reason: r.reason, mapping, missingRoles: [] };
};
const sSunburst: Scorer = (p) => {
  const r = hierScore(p);
  return r ? { score: r.s, reason: r.reason, mapping: { level: r.levels, value: r.value }, missingRoles: [] } : no();
};

const sScatter: Scorer = (p) => {
  const ms = measureCols(p);
  // 有 label 主键/时间列时类目轴更自然，散点不抢
  if (ms.length < 2 || p.rows < 8 || p.temporal.length || hit(p, LABEL_ALIASES)) return no();
  const size = hits(p, SIZE_ALIAS)[0];
  return {
    score: 0.7, reason: `≥2 个度量、${p.rows} 行${size ? '、有 size 列（气泡）' : ''}`,
    mapping: { x: ms[0].name, y: ms[1].name, ...(size ? { size: size.name } : {}) }, missingRoles: [],
  };
};

const sCombo: Scorer = (p) => {
  const ms = measureCols(p);
  // 宽表视图：恰好 1 维 + 2 度量；多维长表不归 combo（让给 control/heatmap 等）
  if (dimCols(p).length !== 1 || ms.length !== 2) return no();
  const [a, b] = ms;
  const scaleA = Math.max(Math.abs(a.min ?? 0), Math.abs(a.max ?? 0));
  const scaleB = Math.max(Math.abs(b.min ?? 0), Math.abs(b.max ?? 0));
  const ratio = Math.max(scaleA, scaleB) / Math.max(1e-9, Math.min(scaleA, scaleB));
  const pctName = (nm: string) => /率|占比|pct|percent|rate|百分比|达成|毛利/.test(normKey(nm) + nm);
  const pct = a.type === 'percent' || b.type === 'percent' || pctName(a.name) || pctName(b.name);
  // 百分比+度量是双轴签名场景：同图单轴会压扁其一 → 应压过单轴 line
  return pct
    ? { score: 0.9, reason: '两度量其一为百分比（双轴）', mapping: { label: dimCols(p)[0].name, value: ms.map((a2) => a2.name) }, missingRoles: [] }
    : ratio > 10
      ? { score: 0.7, reason: '两度量量级相差 >10 倍（双轴）', mapping: { label: dimCols(p)[0].name, value: ms.map((a2) => a2.name) }, missingRoles: [] } : no();
};

const sGrid: Scorer = (p) =>
  p.dims.length >= 3 && p.measures.length >= 1
    ? { score: 0.65, reason: '≥3 维度 + ≥1 度量 → pivot', variant: 'pivot', mode: 'pivot', mapping: { dims: p.dims, values: p.measures }, missingRoles: [] } : no();

const sBar: Scorer = (p, t) => {
  const w = sBarWaterfall(p, t);
  if (w.score) return w;
  const l = labelCol(p);
  if (!l || !measureCols(p).length) return no();
  const multi = hit(p, SERIES_ALIAS) !== null || measureCols(p).length >= 2;
  return { score: multi ? 0.6 : 0.5, reason: multi ? '兜底：多系列' : '兜底：单系列', mapping: baseMapping(p), missingRoles: [] };
};

const sRadar: Scorer = (p) => {
  const l = labelCol(p);
  const ms = measureCols(p);
  if (!l || p.rows < 3 || p.rows > 12 || ms.length < 2 || ms.length > 6) return no();
  // 同量级判据：各度量列"量级"（min/max 的绝对值上界）之比 < 10
  const scaleOf = (m: { min?: number; max?: number }) => Math.max(Math.abs(m.min ?? 0), Math.abs(m.max ?? 0), 1e-9);
  const lo = Math.min(...ms.map(scaleOf)), hi = Math.max(...ms.map(scaleOf));
  if (!(hi / lo < 10)) return no();
  // 首列名像"维度/指标/能力/评价"时雷达略胜柱状（决胜微调，记 IMPLEMENTATION_NOTES）
  const axisLike = ['维度', '指标', '能力', '评价', '维度项', '评分项'].includes(normKey(l.name));
  return { score: 0.6 + (axisLike ? 0.02 : 0), reason: `宽表 ${p.rows} 行 × ${ms.length} 个同量级度量`, mapping: { label: l.name, value: ms.map((m) => m.name) }, missingRoles: [] };
};

const KPI_LABEL_NAMES = ['指标', 'kpi', 'metric', '指标名', '指标名称', '度量', '度量名', '度量值'];
const sKpi: Scorer = (p) => {
  const l = labelCol(p), v = measureCols(p)[0];
  // 仅当标签列名像"指标"（否则小表会抢 pie/bar 的类目数据）
  return l && v && p.rows <= 8 && KPI_LABEL_NAMES.includes(normKey(l.name))
    ? { score: 0.6, reason: '≤8 行指标名 + 值', mapping: { metric: l.name, value: v.name }, missingRoles: [] } : no();
};

const sParallel: Scorer = (p) =>
  measureCols(p).length >= 4 && p.rows >= 20
    ? { score: 0.75, reason: '≥4 个度量、≥20 行', mapping: { values: measureCols(p).map((m) => m.name) }, missingRoles: [] } : no();

const sPie: Scorer = (p, t) => {
  const l = labelCol(p), v = measureCols(p)[0];
  if (!l || !v || l.distinct > 8 || measureCols(p).length > 1 || hit(p, SERIES_ALIAS)) return no();
  const neg = t.rows.some((r) => parseNumber(r[v.name])[0] < 0);
  return neg ? no() : { score: 0.55, reason: `1 个维度（${l.distinct} 值 ≤8）+ 非负度量`, mapping: { label: l.name, value: v.name }, missingRoles: [] };
};

const s3d = (view: 'scatter3d' | 'pie3d' | 'line3d' | 'matrix3d'): Scorer => (p) => {
  const ms = measureCols(p);
  if (view === 'scatter3d') {
    return ms.length >= 3 && p.rows >= 3 ? { score: 0.4, reason: '≥3 数值列可满足 x/y/z', mapping: { x: ms[0].name, y: ms[1].name, z: ms[2].name }, missingRoles: [] } : no();
  }
  if (view === 'pie3d') {
    return p.dims.length >= 1 && ms.length >= 1 ? { score: 0.35, reason: 'label+value（可分层）', mapping: baseMapping(p), missingRoles: [] } : no();
  }
  return labelCol(p) && ms.length >= 1 && p.rows >= 2 ? { score: 0.3, reason: 'label+series 形态（3D 低优先，D14）', mapping: baseMapping(p), missingRoles: [] } : no();
};

// 表序 = 同分决胜序（特例 → 兜底）
const SCORERS: [ViewId, Scorer][] = [
  ['report', sReport],
  ['tree', sTree],
  ['gantt', sGantt],
  ['boxplot', sBoxplot],
  ['bullet', sBullet],
  ['fishbone', sFishbone],
  ['cohort', sCohort],
  ['sankey', sSankey],
  ['control', sControl],
  ['funnel', sFunnel],
  ['heatmap', sHeatmap],
  ['line', sLine],
  ['histogram', sHistogram],
  ['compare', sCompare],
  ['rank', sRank],
  ['treemap', sTreemap],
  ['sunburst', sSunburst],
  ['scatter', sScatter],
  ['combo', sCombo],
  ['grid', sGrid],
  ['network', sNetwork],
  ['bar', sBar],
  ['radar', sRadar],
  ['kpi', sKpi],
  ['parallel', sParallel],
  ['pie', sPie],
  ['scatter3d', s3d('scatter3d')],
  ['line3d', s3d('line3d')],
  ['pie3d', s3d('pie3d')],
  ['matrix3d', s3d('matrix3d')],
];

export interface Candidate extends ScoreResult { view: ViewId }

/** 单视图打分（FamilyAdapter.score 委托到这里）。 */
export function scoreView(view: ViewId, profile: TableProfile, table: Table): ScoreResult {
  const entry = SCORERS.find(([v]) => v === view);
  return entry ? entry[1](profile, table) : no();
}

/** 推荐：全图族打分，分高者前 5；同分保持表序。 */
export function recommend(profile: TableProfile, table: Table, top = 5): Candidate[] {
  const out: Candidate[] = [];
  for (const [view, scorer] of SCORERS) {
    const r = scorer(profile, table);
    if (r.score > 0) out.push({ view, ...r });
  }
  // 整数分排序：避免 0.8+0.05 之类的浮点误差破坏同分表序决胜
  out.sort((a, b) => Math.round(b.score * 1e4) - Math.round(a.score * 1e4));
  // 全文本/空表也能渲染明细：grid 兜底
  if (!out.length && table.rows.length) {
    out.push({ view: 'grid', score: 0.2, reason: '无数值列 → 明细表兜底', mapping: {}, missingRoles: [] });
  }
  return out.slice(0, top);
}
