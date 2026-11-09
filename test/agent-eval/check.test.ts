// scripts/agent-eval/check.ts 自测（PHASE_2D §4.6 / §5）：两组人工构造回执——
// 全通过组（每任务一条满足验收条件的 render/compose 回执）与全失败组
// （每任务一条视图/参数不满足条件的回执），验证判定逻辑本身正确。
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evalCheck, evalTask, loadTasks, summarize,
  type EvalTask, type ReceiptEnvelope, type ReceiptEntry,
} from '../../scripts/agent-eval/check.js';

const REPO = resolve(__dirname, '../..');
const tasks = loadTasks();
const byId = new Map(tasks.map((t) => [t.id, t]));

// —— 人工构造回执 ——
function renderEnv(view: string, over: {
  variant?: string; files?: { format: string; path: string }[];
  title?: string | null; asOf?: string; facetColumn?: string;
} = {}): ReceiptEnvelope {
  const files = over.files ?? [{ format: 'png', path: 'out/x.png' }];
  return {
    ok: true, command: 'render', version: 'test',
    data: {
      view,
      variant: over.variant,
      files: files.map((f) => ({ ...f, bytes: 1 })),
      spec: {
        text: over.title === null ? {} : { title: over.title ?? '测试图' },
        time: { asOf: over.asOf ?? '2026-11-05T09:00:00+08:00' },
        ...(over.facetColumn ? { facet: { column: over.facetColumn } } : {}),
      },
    },
    warnings: [],
  };
}

/** 全通过组：每个任务一条满足全部验收条件的回执。 */
function passEnv(t: EvalTask): ReceiptEnvelope {
  switch (t.id) {
    case 'A01': return renderEnv('line');
    case 'A02': return renderEnv('sunburst', { files: [{ format: 'html', path: 'a.html' }, { format: 'png', path: 'a.png' }] });
    case 'A03': return renderEnv('funnel', { variant: 'multi' });
    case 'A04': return renderEnv('sankey');
    case 'A05': return renderEnv('bar', { variant: 'waterfall' });
    case 'A06': return renderEnv('heatmap');
    case 'A07': return renderEnv('cohort');
    case 'A08': return renderEnv('control');
    case 'A09': return renderEnv('gantt');
    case 'A10': return renderEnv('bullet');
    case 'A11': return { ok: true, command: 'compose', version: 'test', data: { panels: 3, files: [{ format: 'html', path: 'd.html', bytes: 1 }] }, warnings: [] };
    case 'A12': return renderEnv('bar');
    default: throw new Error(`未覆盖任务 ${t.id}`);
  }
}

/** 全失败组：每个任务一条「看起来正常但不满足验收条件」的回执。 */
function failEnv(t: EvalTask): ReceiptEnvelope {
  switch (t.id) {
    case 'A11': return { ok: true, command: 'compose', version: 'test', data: { panels: 2, files: [{ format: 'html', path: 'd.html', bytes: 1 }] }, warnings: [] };
    default: return renderEnv('pie', { title: null, files: [{ format: 'svg', path: 'x.svg' }] });
  }
}

const entry = (name: string, env: ReceiptEnvelope | null): ReceiptEntry => ({ name, env });

describe('agent-eval check 自测', () => {
  it('tasks.json 覆盖 A01–A12，数据文件均存在于仓库', () => {
    expect(tasks.map((t) => t.id)).toEqual([
      'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12',
    ]);
    for (const t of tasks) {
      expect(t.task.length, t.id).toBeGreaterThan(0);
      expect(t.acceptance.length, t.id).toBeGreaterThan(0);
      expect(t.checks.length, t.id).toBeGreaterThan(0);
      for (const f of t.files) expect(existsSync(join(REPO, f)), `${t.id}: ${f}`).toBe(true);
    }
  });

  it('全通过组：每任务首条回执即满足全部验收条件', () => {
    for (const t of tasks) {
      const r = evalTask(t, [entry('1.json', passEnv(t))]);
      expect(r.pass, `${t.id} 应通过`).toBe(true);
      expect(r.firstPass, `${t.id} 应首过`).toBe(true);
      expect(r.checks.every((c) => c.pass), `${t.id} 逐条检查`).toBe(true);
      expect(r.retries).toBe(0);
    }
  });

  it('全失败组：每任务回执均不满足验收条件', () => {
    for (const t of tasks) {
      const r = evalTask(t, [entry('1.json', failEnv(t))]);
      expect(r.pass, `${t.id} 应失败`).toBe(false);
      expect(r.firstPass).toBe(false);
      expect(r.checks.some((c) => !c.pass), `${t.id} 应有失败项`).toBe(true);
    }
  });

  it('失败后重试成功：pass=true、firstPass=false、retries=1', () => {
    const t = byId.get('A01')!;
    const r = evalTask(t, [entry('1.json', failEnv(t)), entry('2.json', passEnv(t))]);
    expect(r.pass).toBe(true);
    expect(r.firstPass).toBe(false);
    expect(r.attempts).toBe(2);
    expect(r.retries).toBe(1);
    expect(r.receipt).toBe('2.json'); // any 模式：判定依据取首个通过者
    expect(r.checks.every((c) => c.pass)).toBe(true);
  });

  it('A03 分面替代路径：variant 非 multi 但 facet.column 为月份也通过', () => {
    const t = byId.get('A03')!;
    const byFacet = renderEnv('funnel', { facetColumn: '月份' });
    expect(evalTask(t, [entry('1.json', byFacet)]).pass).toBe(true);
    const byWrongFacet = renderEnv('funnel', { facetColumn: '阶段' });
    expect(evalTask(t, [entry('1.json', byWrongFacet)]).pass).toBe(false);
    const check = t.checks.find((c) => c.kind === 'variant-or-month-facet')!;
    expect(evalCheck(check, byFacet).pass).toBe(true);
    expect(evalCheck(check, byWrongFacet).pass).toBe(false);
  });

  it('A12 mode=last：只看最后一条尝试回执', () => {
    const t = byId.get('A12')!;
    expect(t.mode).toBe('last');
    // 中途失败、最终成功 → 通过（允许 MISSING_COLUMN 等失败回执）
    expect(evalTask(t, [entry('1.json', { ok: false, command: 'render', error: { code: 'MISSING_COLUMN' } }), entry('2.json', passEnv(t))]).pass).toBe(true);
    // 最终失败 → 不通过，即使此前成功过
    expect(evalTask(t, [entry('1.json', passEnv(t)), entry('2.json', failEnv(t))]).pass).toBe(false);
  });

  it('inspect/validate 等探查回执不计入尝试与重试', () => {
    const t = byId.get('A04')!;
    const inspect: ReceiptEnvelope = { ok: true, command: 'inspect', version: 'test', data: {}, warnings: [] };
    const r = evalTask(t, [entry('1.json', inspect), entry('2.json', passEnv(t))]);
    expect(r.pass).toBe(true);
    expect(r.receipts).toBe(2);
    expect(r.attempts).toBe(1);
    expect(r.retries).toBe(0);
  });

  it('坏 JSON 回执计入总数但不算尝试', () => {
    const t = byId.get('A06')!;
    const r = evalTask(t, [entry('1.json', null), entry('2.json', passEnv(t))]);
    expect(r.pass).toBe(true);
    expect(r.receipts).toBe(2);
    expect(r.attempts).toBe(1);
  });

  it('summarize 指标：成功率、平均重试、人工可发出率', () => {
    const results = tasks.map((t, i) => evalTask(t, [entry('1.json', i < 8 ? passEnv(t) : failEnv(t))]));
    const s = summarize(results);
    expect(s.tasks).toBe(12);
    expect(s.passed).toBe(8);
    expect(s.firstPassed).toBe(8);
    expect(s.finalSuccessRate).toBeCloseTo(8 / 12);
    expect(s.firstSuccessRate).toBeCloseTo(8 / 12);
    expect(s.avgRetries).toBe(0);
    expect(s.humanSendableRate).toBeNull();
    // 填写 human 后：7 适合 / 12 已判 → 7/12
    for (const [i, r] of results.entries()) r.human = i < 7 ? '适合' : '不适合';
    const s2 = summarize(results);
    expect(s2.humanJudged).toBe(12);
    expect(s2.humanSendable).toBe(7);
    expect(s2.humanSendableRate).toBeCloseTo(7 / 12);
  });
});
