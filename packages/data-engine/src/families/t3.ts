// T3 简版图族适配：er / flowchart / sequence / burndown / formula。
import { firstKey, normKey, parseNumber } from '../legacy-core.js';
import type { Raw } from './barline.js';

type Row = Record<string, unknown>;
const cell = (v: unknown) => (v !== null && v !== undefined && v !== '' ? String(v).trim() : '');
const qual = (raw: Raw, kept: number, mapping: Record<string, string | null>, warnings: string[] = []) =>
  ({ rows: Array.isArray(raw) ? raw.length : 0, kept, warnings, confidence: warnings.length ? 'medium' : 'high', mapping });
const rows = (raw: Raw): Row[] => (Array.isArray(raw) ? raw as Row[] : (() => { throw new Error('该视图需要行数据'); })());

const AL_ENTITY = ['entity', 'table', '实体', '表', '表名', '对象'];
const AL_FIELD = ['field', 'column', 'attr', '字段', '列', '属性'];
const AL_TYPE = ['type', 'datatype', '类型', '数据类型', '节点类型'];
const AL_REF = ['ref', 'references', 'fk', '引用', '引用表', '外键', '关联表'];
const AL_FROM = ['from', 'source', 'src', 'caller', '从', '发起', '发起方', '调用方', '节点', '源', '步骤', '当前'];
const AL_TO = ['to', 'target', 'dst', 'next', 'callee', '到', '接收', '接收方', '被调方', '目标', '下一个', '下一步'];
const AL_LABEL = ['label', 'condition', '标签', '条件', '分支'];
const AL_MSG = ['msg', 'message', 'label', '消息', '动作', '说明', '事件'];
const AL_DAY = ['day', 'date', 'sprint', 'iteration', '天', '日期', '迭代日', '第几天'];
const AL_REM = ['remaining', 'left', 'points', '剩余', '剩余工时', '剩余点数', '未完成'];
const AL_FORMULA = ['formula', 'eq', 'expression', 'math', '公式', '表达式', '算式'];
const AL_NAME = ['name', 'label', 'title', '名称', '说明', '备注', '字段', '列', '属性', '节点', '步骤'];

export interface ErModel {
  entities: { name: string; fields: { name: string; type: string }[] }[];
  edges: { from: number; to: number; label: string }[];
  quality: unknown;
}
export function toEr(raw: Raw): ErModel {
  const rs = rows(raw);
  const ek = firstKey(rs[0], AL_ENTITY), fk = firstKey(rs[0], AL_FIELD);
  if (!ek || !fk) throw new Error('ER 图需要 实体 + 字段 列（如 表,字段,类型,引用）');
  const tk = firstKey(rs[0], AL_TYPE), rk = firstKey(rs[0], AL_REF);
  const order = new Map<string, number>();
  const fields = new Map<string, { name: string; type: string }[]>();
  const refs: { e: string; ref: string; label: string }[] = [];
  for (const r of rs) {
    const e = cell(r[ek]), f = cell(r[fk]);
    if (!e) continue;
    if (!order.has(e)) { order.set(e, order.size); fields.set(e, []); }
    if (f) fields.get(e)!.push({ name: f, type: tk ? cell(r[tk]) : '' });
    const ref = rk ? cell(r[rk]) : '';
    if (ref && ref !== e) refs.push({ e, ref, label: f });
  }
  const entities = [...order.keys()].map((name) => ({ name, fields: fields.get(name)! }));
  // 引用指向未声明实体 → 自动补空实体框
  for (const { ref } of refs) if (!order.has(ref)) { order.set(ref, order.size); entities.push({ name: ref, fields: [] }); }
  const idx = new Map(entities.map((e, i) => [e.name, i]));
  const edges = refs.filter((x) => idx.has(x.ref)).map((x) => ({ from: idx.get(x.e)!, to: idx.get(x.ref)!, label: x.label }));
  return { entities, edges, quality: qual(raw, rs.length, { entity: ek, field: fk, ref: rk }) };
}

export interface FlowchartModel {
  nodes: { name: string; type: string | null }[];
  edges: { from: number; to: number; label: string }[];
  quality: unknown;
}
export function toFlowchart(raw: Raw): FlowchartModel {
  const rs = rows(raw);
  const fk = firstKey(rs[0], AL_FROM), tk = firstKey(rs[0], AL_TO);
  if (!fk || !tk) throw new Error('流程图需要 源 + 目标 列（如 步骤,下一个）');
  const lk = firstKey(rs[0], AL_LABEL), yk = firstKey(rs[0], AL_TYPE);
  const order = new Map<string, number>(), types = new Map<string, string>();
  const edges: { from: number; to: number; label: string }[] = [];
  const id = (n: string) => { if (!order.has(n)) order.set(n, order.size); return order.get(n)!; };
  for (const r of rs) {
    const a = cell(r[fk]), b = cell(r[tk]);
    if (!a) continue;
    const ty = yk ? normKey(r[yk]) : '';
    if (ty) types.set(a, types.has(a) ? types.get(a)! + ',' + ty : ty);
    if (b) edges.push({ from: id(a), to: id(b), label: lk ? cell(r[lk]) : '' });
    else id(a);
  }
  const nodes = [...order.keys()].map((name) => ({ name, type: types.get(name) ?? null }));
  return { nodes, edges, quality: qual(raw, rs.length, { from: fk, to: tk }) };
}

export interface SequenceModel {
  actors: string[];
  msgs: { from: number; to: number; label: string }[];
  quality: unknown;
}
export function toSequence(raw: Raw): SequenceModel {
  const rs = rows(raw);
  const fk = firstKey(rs[0], AL_FROM), tk = firstKey(rs[0], AL_TO);
  if (!fk || !tk) throw new Error('时序图需要 从 + 到 列（如 从,到,消息）');
  const mk = firstKey(rs[0], AL_MSG);
  const order = new Map<string, number>();
  const id = (n: string) => { if (!order.has(n)) order.set(n, order.size); return order.get(n)!; };
  const msgs = rs.map((r) => {
    const a = cell(r[fk]), b = cell(r[tk]);
    return a && b ? { from: id(a), to: id(b), label: mk ? cell(r[mk]) : '' } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  if (!msgs.length) throw new Error('没有可解析的消息行');
  return { actors: [...order.keys()], msgs, quality: qual(raw, msgs.length, { from: fk, to: tk }) };
}

export interface BurndownModel {
  points: { day: string; v: number }[];
  total: number;
  quality: unknown;
}
export function toBurndown(raw: Raw): BurndownModel {
  const rs = rows(raw);
  const dk = firstKey(rs[0], AL_DAY), rk = firstKey(rs[0], AL_REM);
  if (!dk || !rk) throw new Error('燃尽图需要 天/日期 + 剩余 列');
  const pts: { day: string; v: number; ord: number }[] = [];
  for (const r of rs) {
    const d = cell(r[dk]); const [v, st] = parseNumber(r[rk]);
    if (!d || (st !== 'ok' && st !== 'percent')) continue;
    const [dn, dst] = parseNumber(d);
    pts.push({ day: d, v, ord: dst === 'ok' ? dn : pts.length });
  }
  if (pts.length < 2) throw new Error('燃尽图至少需要 2 个有效点');
  pts.sort((a, b) => a.ord - b.ord);
  return { points: pts.map((p) => ({ day: p.day, v: p.v })), total: Math.max(...pts.map((p) => p.v)), quality: qual(raw, pts.length, { day: dk, remaining: rk }) };
}

export interface FormulaModel {
  items: { name: string; formula: string }[];
  quality: unknown;
}
export function toFormula(raw: Raw): FormulaModel {
  const rs = rows(raw);
  const fk = firstKey(rs[0], AL_FORMULA) ?? Object.keys(rs[0])[0];
  if (!fk) throw new Error('公式视图需要 公式 列');
  const nk = firstKey(rs[0], AL_NAME);
  const items = rs.map((r) => ({ formula: cell(r[fk]), name: nk ? cell(r[nk]) : '' })).filter((x) => x.formula);
  if (!items.length) throw new Error('公式列为空');
  return { items, quality: qual(raw, items.length, { formula: fk, name: nk }) };
}
