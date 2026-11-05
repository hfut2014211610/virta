// gantt.to_gantt 移植：task+start 必需，end/duration 二选一；日期归一为相对天。
import {
  firstKey, LABEL_ALIASES, normKey, parseGanttDate, parseNumber, TYPE_ALIAS,
} from '../legacy-core.js';
import {
  GANTT_DEPS_ALIAS, GANTT_DUR_ALIAS, GANTT_END_ALIAS, GANTT_GROUP_ALIAS,
  GANTT_MILESTONE_TOKENS, GANTT_OWNER_ALIAS, GANTT_PROGRESS_ALIAS, GANTT_START_ALIAS,
  GANTT_STATUS_ALIAS, GANTT_STATUS_MAP, GANTT_TASK_ALIAS,
} from '../aliases.js';
import type { Raw } from './barline.js';


const todayOrdinal = () => Math.floor(Date.now() / 86400000) + 719163;
const isoOf = (od: number) => new Date((od - 719163) * 86400000).toISOString().slice(0, 10);
const cell = (v: unknown) => (v !== null && v !== undefined && v !== '' ? String(v).trim() : '');

interface GItem {
  label: string; group: string; s: number; s_date: boolean;
  e: number | null; e_date: boolean; dur: number | null;
  milestone: boolean; progress: number | null; status: string | null;
  owner: string; deps_raw: string; deps?: number[];
}
export interface GanttModel {
  tasks: { i: number; label: string; group: string; s: number; e: number; dur: number;
           progress: number | null; status: string | null; milestone: boolean; owner: string; deps: number[] }[];
  groups: string[]; base: string | null; baseOrd: number | null; span: number; today: number | null;
  counts: { milestones: number; delayed: number; avg_progress: number | null; deps: number };
  quality: { rows: number; kept: number; warnings: string[]; confidence: string; mapping: Record<string, string> };
}

export function toGantt(raw: Raw): GanttModel {
  if (!Array.isArray(raw)) throw new Error('甘特图需要 task/start/end 形式的行数据，暂不支持 ECharts JSON');
  if (!raw.length) throw new Error('数据为空');
  const sample = raw[0];
  const taskKey = firstKey(sample, GANTT_TASK_ALIAS) ?? firstKey(sample, LABEL_ALIASES);
  const startKey = firstKey(sample, GANTT_START_ALIAS);
  const endKey = firstKey(sample, GANTT_END_ALIAS);
  const durKey = firstKey(sample, GANTT_DUR_ALIAS);
  let groupKey = firstKey(sample, GANTT_GROUP_ALIAS);
  const progKey = firstKey(sample, GANTT_PROGRESS_ALIAS);
  const statusKey = firstKey(sample, GANTT_STATUS_ALIAS);
  const ownerKey = firstKey(sample, GANTT_OWNER_ALIAS);
  const depsKey = firstKey(sample, GANTT_DEPS_ALIAS);
  const typeKey = firstKey(sample, TYPE_ALIAS);
  if (groupKey && groupKey === taskKey) groupKey = null;
  if (!startKey) throw new Error('未找到开始时间列（start / 开始 / 开始日期）；甘特图至少需要 任务 + 开始（+ 结束或工期）');

  const items: GItem[] = [];
  let badDate = 0, unknownStatus = 0, clampedProg = 0, msByType = 0;
  raw.forEach((row, idx) => {
    const label = taskKey && cell(row[taskKey]) ? cell(row[taskKey]) : `任务${idx + 1}`;
    let [sOrd, sOff, sSt] = parseGanttDate(row[startKey]);
    if (sSt === 'missing' || sSt === 'invalid') { badDate += 1; return; }
    let eOrd: number | null = null, eOff: number | null = null, eSt = 'missing';
    if (endKey) {
      [eOrd, eOff, eSt] = parseGanttDate(row[endKey]);
      if (eSt === 'invalid') { badDate += 1; eSt = 'missing'; }
    }
    let durV: number | null = null;
    if (durKey) {
      const [dv, dst] = parseNumber(row[durKey]);
      if ((dst === 'ok' || dst === 'percent') && dv >= 0) durV = dv;
    }
    let milestone = false;
    if (typeKey && GANTT_MILESTONE_TOKENS.has(normKey(row[typeKey]))) { milestone = true; msByType += 1; }
    let prog: number | null = null;
    if (progKey) {
      const [pv, pst] = parseNumber(row[progKey]);
      if (pst === 'ok' || pst === 'percent') {
        prog = pv > 1 ? pv / 100 : pv;
        if (prog < 0 || prog > 1) { prog = Math.min(1, Math.max(0, prog)); clampedProg += 1; }
      }
    }
    let status: string | null = null;
    if (statusKey) {
      const sraw = normKey(row[statusKey]);
      if (sraw) {
        status = GANTT_STATUS_MAP[sraw] ?? null;
        if (status === null) unknownStatus += 1;
      }
    }
    if (status === 'done' && prog === null) prog = 1;
    items.push({
      label,
      group: groupKey && cell(row[groupKey]) ? cell(row[groupKey]) : '未分组',
      s: sSt === 'date' ? sOrd! : sOff!, s_date: sSt === 'date',
      e: eSt === 'date' ? eOrd : eSt === 'offset' ? eOff : null, e_date: eSt === 'date',
      dur: durV, milestone, progress: prog, status,
      owner: ownerKey ? cell(row[ownerKey]) : '',
      deps_raw: depsKey ? cell(row[depsKey]) : '',
    });
  });
  if (!items.length) throw new Error('没有可解析的任务行（开始时间支持 YYYY-MM-DD / YYYY/M/D / YYYY年M月D日 / YYYYMMDD / 相对天数）');

  const warnings: string[] = [];
  const hasReal = items.some((x) => x.s_date || x.e_date);
  let base0: number | null = null;
  if (hasReal) {
    const anchors = [
      ...items.filter((x) => x.s_date).map((x) => x.s),
      ...items.filter((x) => x.e_date && x.e !== null).map((x) => x.e!),
    ];
    base0 = Math.min(...anchors);
    let mixed = 0;
    for (const x of items) {
      if (!x.s_date) {
        x.e = x.e !== null ? base0 + x.e : null;
        x.s = base0 + x.s;
        mixed += 1;
      } else if (x.e !== null && !x.e_date) {
        x.e = base0 + x.e;
        mixed += 1;
      }
    }
    if (mixed) warnings.push(`${mixed} 处使用相对天数，已按「最早日期 + N 天」对齐`);
  }
  let noEnd = 0, swapped = 0;
  for (const x of items) {
    if (x.e === null) {
      if (x.dur !== null && !x.milestone) x.e = x.s + x.dur;
      else { x.e = x.s; x.milestone = true; noEnd += 1; }
    }
    if (x.e < x.s) { [x.s, x.e] = [x.e, x.s]; swapped += 1; }
    if (x.e === x.s) x.milestone = true;
  }
  const minS = Math.min(...items.map((x) => x.s));
  for (const x of items) { x.s -= minS; x.e! -= minS; }
  const span = Math.max(...items.map((x) => x.e!)) + 1;
  const baseOrd = hasReal ? Math.floor(minS) : null;
  const baseIso = hasReal ? isoOf(baseOrd!) : null;
  let today: number | null = null;
  if (hasReal) {
    const t = todayOrdinal() - baseOrd!;
    if (t >= 0 && t <= span) today = Math.floor(t);
  }
  const labelToIdx = new Map<string, number>();
  let dup = 0;
  items.forEach((x, i) => {
    if (labelToIdx.has(x.label)) dup += 1;
    else labelToIdx.set(x.label, i);
  });
  let depDrop = 0;
  items.forEach((x, i) => {
    const deps: number[] = [];
    if (x.deps_raw) {
      for (let tok of x.deps_raw.split(/[;,，、|/]+/)) {
        tok = tok.trim();
        if (!tok) continue;
        let j = labelToIdx.get(tok);
        if (j === undefined && /^\d+$/.test(tok)) {
          const k = parseInt(tok, 10) - 1;
          j = k >= 0 && k < items.length ? k : undefined;
        }
        if (j === undefined || j === i) depDrop += 1;
        else deps.push(j);
      }
    }
    x.deps = deps;
  });
  const groups: string[] = [];
  for (const x of items) if (!groups.includes(x.group)) groups.push(x.group);
  if (badDate) warnings.push(`${badDate} 处日期无法解析，已跳过（支持 YYYY-MM-DD / YYYY/M/D / YYYY年M月D日 / YYYYMMDD / 相对天数）`);
  if (swapped) warnings.push(`${swapped} 行结束早于开始，已自动对调`);
  if (noEnd) warnings.push(`${noEnd} 行只有开始时间（无结束/工期），按里程碑 ◆ 处理`);
  if (unknownStatus) warnings.push(`${unknownStatus} 行状态无法识别（支持 完成/进行中/延期/未开始），已按普通任务显示`);
  if (clampedProg) warnings.push(`${clampedProg} 行进度越界，已钳制到 0~100%`);
  if (depDrop) warnings.push(`${depDrop} 个依赖指向不存在的任务或自引用，已忽略`);
  if (dup) warnings.push(`任务名重复 ${dup} 次，依赖连线按首个同名任务处理`);
  const progs = items.filter((x) => x.progress !== null).map((x) => x.progress!);
  const avgProg = progs.length ? progs.reduce((a, b) => a + b, 0) / progs.length : null;
  return {
    tasks: items.map((x, i) => ({
      i, label: x.label, group: x.group, s: x.s, e: x.e!, dur: x.e! - x.s,
      progress: x.progress, status: x.status, milestone: x.milestone,
      owner: x.owner, deps: x.deps!,
    })),
    groups, base: baseIso, baseOrd, span: Math.floor(span), today,
    counts: {
      milestones: items.filter((x) => x.milestone).length,
      delayed: items.filter((x) => x.status === 'delayed').length,
      avg_progress: avgProg,
      deps: items.reduce((a, x) => a + x.deps!.length, 0),
    },
    quality: {
      rows: raw.length, kept: items.length, warnings: warnings.slice(0, 6),
      confidence: !warnings.length ? 'high' : badDate ? 'low' : 'medium',
      mapping: {
        task: taskKey ?? '?', start: startKey,
        end: endKey ?? (durKey ? `${durKey}（工期）` : '—（里程碑）'),
        group: groupKey ?? '—', progress: progKey ?? '—',
        status: statusKey ?? '—', deps: depsKey ?? '—',
      },
    },
  };
}
