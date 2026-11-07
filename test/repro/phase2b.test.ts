// M2b.0 复现锚点：PHASE_2B.md §1 的 B1–B13，每个 it 对应当前缺陷。
// 各里程碑完成后把对应 it 改为 it 并保持转绿（同 phase2a 的锚点机制）。
// B1（XSS）由 test/security/no-raw-innerhtml.test.ts 与 test/visual/xss.spec.ts 锚定。
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as contracts from '@virta/contracts';
import { ADAPTERS, adaptInput } from '@virta/data-engine';
import type { Table, ViewSpec } from '@virta/contracts';
import { viewEntrySource } from '../../scripts/build.mjs';

function cli(args: string[], input?: string): { code: number; stdout: string; parsed?: any } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true, input });
    return { code: 0, stdout, parsed: stdout.trim() ? JSON.parse(stdout) : undefined };
  } catch (e) {
    const ee = e as { status?: number; stdout?: string };
    let parsed: any;
    try { parsed = ee.stdout ? JSON.parse(ee.stdout) : undefined; } catch { /* 非 JSON 输出 */ }
    return { code: ee.status ?? 1, stdout: ee.stdout ?? '', parsed };
  }
}

const table = (columns: string[], rows: Record<string, unknown>[]): Table =>
  ({ columns, rows, source: { name: 'repro.csv', format: 'csv' as const, rows: rows.length } });

const spec = (view: string, extra: Partial<ViewSpec> = {}): ViewSpec =>
  ({ version: 1, view: view as never, ...extra }) as ViewSpec;

describe('B2 浏览器端 adapt 跳过派生列/missingValue/gantt asOf（M2b.1）', () => {
  it('per-view 入口必须调用统一管线 runPipeline', () => {
    expect(viewEntrySource('grid')).toContain('runPipeline');
    expect(viewEntrySource('gantt')).toContain('runPipeline');
  });
  it('浏览器管线输出应与 adaptInput 一致：grid 的派生列不消失', async () => {
    // 管线函数落地前 runPipeline 不存在 → it；落地后比较两条路径
    const { runPipeline } = await import('@virta/data-engine') as never as { runPipeline: Function };
    const t = table(['任务', '当前截止'], [{ 任务: 'a', 当前截止: '2026-11-05' }]);
    const s = spec('grid', {
      time: { asOf: '2026-11-05T17:00:00+08:00', tz: 'Asia/Shanghai' },
      derive: [{ type: 'dueStatus', due: '当前截止' }] as never,
    });
    const viaAdapter = (ADAPTERS['grid' as never]!.adapt(t, s) as { model: { rows: Record<string, unknown>[] } }).model;
    const viaPipeline = runPipeline(t, s, 'grid', (raw: unknown) => (ADAPTERS['grid' as never]!.adaptRaw as Function)(raw)) as { model: { rows: Record<string, unknown>[] } };
    expect(viaPipeline.model.rows[0]).toHaveProperty('截止状态');
    expect(viaPipeline.model.rows[0]).toEqual(viaAdapter.rows[0]);
  });
});

describe('B3 适配不得原地修改输入行（M2b.1）', () => {
  it('mapping 写入不修改冻结的原行对象', () => {
    const t = table(['label', '月份', '数值'], [{ 月份: '1月', 数值: 3 }]);
    Object.freeze(t.rows[0]);
    const s = spec('bar', { mapping: { label: '月份' } });
    // 冻结对象被写入 role 键 → strict 模式 TypeError（现状）；修复后正常返回且不破坏输入
    const out = ADAPTERS['bar' as never]!.adapt(t, s);
    expect(out.model).toBeTruthy();
    expect(t.rows[0]).toEqual({ 月份: '1月', 数值: 3 });
  });
});

describe('B4 --data 坏输入要有 JSON 回执（M2b.2）', () => {
  it('--data {bad → PARSE_ERROR 退出码 3', () => {
    const r = cli(['render', '--data', '{bad', '--format', 'json', '--view', 'bar', '--json']);
    expect(r.code).toBe(3);
    expect(r.parsed?.error?.code).toBe('PARSE_ERROR');
  }, 30_000);
});

describe('B5 --set 严格校验（M2b.2）', () => {
  it('validateSpec 存在并拒绝非法枚举与未知键', async () => {
    const vs = (contracts as never as { validateSpec?: Function }).validateSpec;
    expect(typeof vs).toBe('function');
    const c = contracts.getContract('line');
    const bad1 = vs!({ version: 1, view: 'line', options: { lineStyle: 'zap' } }, c) as { ok: boolean };
    expect(bad1.ok).toBe(false);
    const bad2 = vs!({ version: 1, view: 'line', bogus: { deep: 1 } }, c) as { ok: boolean };
    expect(bad2.ok).toBe(false);
  });
  it('CLI --set options.lineStyle=zap → 退出码 2', () => {
    const r = cli(['render', 'examples/basic/sample-multi.csv', '--view', 'line', '--set', 'options.lineStyle=zap', '--json']);
    expect(r.code).toBe(2);
    expect(r.parsed?.error?.code).toBe('INVALID_OPTION');
    expect(r.parsed?.error?.hint ?? '').toMatch(/smooth|straight|step/);
  }, 30_000);
});

describe('B6 --palette 非法值（M2b.2）', () => {
  it('--palette nonsense → INVALID_OPTION 退出码 2', () => {
    const r = cli(['render', 'examples/basic/sample-multi.csv', '--palette', 'nonsense', '--json']);
    expect(r.code).toBe(2);
    expect(r.parsed?.error?.code).toBe('INVALID_OPTION');
  }, 30_000);
});

describe('B7 视图别名（M2b.2）', () => {
  it('resolveView 解析全部别名', () => {
    const rv = (contracts as never as { resolveView?: Function }).resolveView;
    expect(typeof rv).toBe('function');
    expect(rv!('heat')).toEqual({ view: 'heatmap' });
    expect(rv!('pivot')).toEqual({ view: 'grid', variant: 'pivot' });
    expect(rv!('spc')).toEqual({ view: 'control' });
  });
  it('CLI --view pivot → grid 透视变体', () => {
    const r = cli(['render', 'examples/basic/sample-grid.csv', '--view', 'pivot', '--export', 'svg', '--out', 'out/repro', '--json']);
    expect(r.code).toBe(0);
    expect(r.parsed?.data?.spec?.view).toBe('grid');
    expect(r.parsed?.data?.spec?.variant ?? r.parsed?.data?.variant).toBe('pivot');
  }, 30_000);
});

describe('B8 非流式视图 --height auto（M2b.2）', () => {
  it('bar + --height auto → 回退 675 且 SVG 无 NaN', () => {
    const r = cli(['render', 'examples/basic/sample-multi.csv', '--view', 'bar', '--height', 'auto', '--export', 'svg', '--out', 'out/repro', '--json']);
    expect(r.code).toBe(0);
    const f = r.parsed?.data?.files?.[0];
    expect(Number.isFinite(f?.height)).toBe(true);
    expect(f.height).toBe(675);
    expect(r.stdout).not.toContain('NaN');
  }, 30_000);
});

describe('B9 派生列日期多格式（M2b.3）', () => {
  const t = table(['任务', '当前截止'], [
    { 任务: 'a1', 当前截止: '2026/11/05' },
    { 任务: 'a2', 当前截止: '20261105' },
    { 任务: 'a3', 当前截止: '2026年11月5日' },
    { 任务: 'a4', 当前截止: 46331 },
    { 任务: 'a5', 当前截止: '2026-11-05' },
    { 任务: 'a6', 当前截止: 45966 },
  ]);
  const s = spec('grid', {
    time: { asOf: '2026-11-05T17:00:00+08:00', tz: 'Asia/Shanghai' },
    derive: [{ type: 'dueStatus', due: '当前截止' }] as never,
  });
  it('5 种日期写法全部判为 due-today（45966=去年同日 → overdue）', () => {
    const m = adaptInput({ table: t }, 'grid', s).model as { rows: Record<string, unknown>[] };
    const got = m.rows.map((r) => r['截止状态']);
    expect(got).toEqual(['due-today', 'due-today', 'due-today', 'due-today', 'due-today', 'overdue']);
  });
});

describe('B10 workdaysBetween 反向区间（M2b.3）', () => {
  it('to < from 返回负值', async () => {
    const { workdaysBetween } = await import('../../packages/data-engine/src/time/workday.js');
    // 2026-11-10 → 2026-11-06 应为 −(11-06→11-10 的工作日数)
    const fwd = workdaysBetween(739400, 739404);
    const rev = workdaysBetween(739404, 739400);
    expect(rev).toBe(-fwd);
    expect(fwd).not.toBe(0);
  });
});

describe('B11 grid invalid 只统计数值列（M2b.3）', () => {
  it('干净台账的 invalid = 0', async () => {
    const { toGrid } = await import('../../packages/data-engine/src/families/grid.js');
    const rows = [
      { 日期: '2026-11-01', 科目: '差旅', 金额: 1200, 备注: '高铁' },
      { 日期: '2026-11-02', 科目: '餐饮', 金额: 86.5, 备注: '客户餐' },
    ];
    const m = toGrid(rows as never);
    expect(m.quality.invalid).toBe(0);
    expect(m.quality.confidence).not.toBe('low');
  });
});

describe('B12 flow-table 按原始值排序（M2b.3）', () => {
  it('导出按原始排序键的比较函数；万/千分位文本不进入比较', async () => {
    const ft = await import('../../packages/viewer/src/flow-table.js') as never as { compareKeys?: Function };
    expect(typeof ft.compareKeys).toBe('function');
    // null 恒排最后；number 按数值；string 按 zh locale
    expect(ft.compareKeys!(1.1e4, 15e4)).toBeLessThan(0);
    expect(ft.compareKeys!(null, 1)).toBeGreaterThan(0);
    expect(ft.compareKeys!(1, null)).toBeLessThan(0);
  });
});

describe('B13 compose 回执 bytes（M2b.1）', () => {
  it('html 文件 bytes 等于实际大小', async () => {
    const { runCompose } = await import('../../packages/cli/src/compose.js');
    const r = await runCompose({ file: 'examples/packs/retail/compose.json', formats: ['html'], out: 'out/repro', scale: 1, fontFiles: [] });
    const f = r.files[0]!;
    expect(f.bytes).toBe(statSync(f.path).size);
    expect(f.bytes).toBeGreaterThan(0);
  }, 60_000);
});
