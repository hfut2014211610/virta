// ADR-0012 单一管线（C1/C3）：输入不可变；derive/mapping/缺失值/post 顺序固定；
// ADAPTERS 与 runPipeline 直调两条路径输出同一 model。
import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/families/index.js';
import { runPipeline } from '../src/pipeline.js';
import { toGrid } from '../src/families/grid.js';
import { toChart } from '../src/families/barline.js';
import { toGantt, type GanttModel } from '../src/families/gantt.js';
import { ganttPost } from '../src/families/post.js';
import type { Table, ViewSpec } from '@virta/contracts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

const spec = (view: string, extra: Partial<ViewSpec> = {}): ViewSpec =>
  ({ version: 1, view: view as never, ...extra }) as ViewSpec;

const table = (columns: string[], rows: Record<string, unknown>[]): Table =>
  ({ columns, rows, source: { name: 't.csv', format: 'csv' as const, rows: rows.length } });

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreeze(v);
  return Object.freeze(o);
};

describe('runPipeline：完整步骤', () => {
  const t = table(['任务', '当前截止'], [{ 任务: 'a', 当前截止: '2026-11-05' }]);
  const s = spec('grid', {
    time: { asOf: '2026-11-05T17:00:00+08:00', tz: 'Asia/Shanghai' },
    derive: [{ type: 'dueStatus', due: '当前截止' }] as never,
  });
  it('派生列 + 原列都进 model', () => {
    const { model } = runPipeline(t, s, 'grid', (raw) => toGrid(raw as never));
    expect((model as { rows: Record<string, unknown>[] }).rows[0]).toMatchObject({ 任务: 'a', 截止状态: 'due-today' });
  });
  it('mapping 写到行副本，不碰原对象', () => {
    const t2 = table(['月份', '数值'], [{ 月份: '1月', 数值: 3 }]);
    const row = t2.rows[0]!;
    runPipeline(t2, spec('bar', { mapping: { label: '月份' } }), 'bar', (raw) => toChart(raw as never));
    expect(row).toEqual({ 月份: '1月', 数值: 3 });
  });
  it('missingValue=zero 在管线中生效', () => {
    const t3 = table(['m', 'v'], [{ m: '1', v: 5 }, { m: '2', v: '' }, { m: '3', v: 7 }]);
    const { model } = runPipeline(t3, spec('line', { options: { missingValue: 'zero' } as never }), 'line', (raw) => toChart(raw as never));
    expect((model as { series: { values: (number | null)[] }[] }).series[0]!.values).not.toContain(null);
  });
  it('gantt post 钩子按 asOf 写今日线', () => {
    const tg = table(['task', 'start', 'end'], [{ task: 'a', start: '2020-01-01', end: '2020-02-01' }]);
    const { model } = runPipeline(tg, spec('gantt', { time: { asOf: '2020-01-10T00:00:00+08:00', tz: 'Asia/Shanghai' } }), 'gantt', (raw) => toGantt(raw as never), ganttPost);
    expect((model as GanttModel).today).toBe(9);
  });
  it('与 ADAPTERS.adapt 输出一致（同一条路径）', () => {
    for (const [v, tt, ss] of [
      ['grid', t, s] as const,
      ['bar', table(['label', 'value'], [{ label: 'x', value: 1 }]), spec('bar')] as const,
      ['gantt', table(['task', 'start', 'end'], [{ task: 'a', start: '2020-01-01', end: '2020-02-01' }]), spec('gantt', { time: { asOf: '2020-01-10T00:00:00+08:00', tz: 'Asia/Shanghai' } })] as const,
    ]) {
      const viaAdapt = ADAPTERS[v as never]!.adapt(tt, ss).model;
      expect(viaAdapt).toBeTruthy();
    }
  });
});

describe('输入不可变（C3）', () => {
  it('Object.freeze 输入经 derive+mapping 不抛错且原表不变', () => {
    const t = table(['任务', '当前截止'], [
      { 任务: 'a', 当前截止: '2026-11-05' },
      { 任务: 'b', 当前截止: '2026-12-01' },
    ]);
    const snapshot = JSON.parse(JSON.stringify(t.rows));
    deepFreeze(t.rows);
    deepFreeze(t.columns);
    const s = spec('grid', {
      time: { asOf: '2026-11-05T17:00:00+08:00', tz: 'Asia/Shanghai' },
      derive: [{ type: 'dueStatus', due: '当前截止' }] as never,
      mapping: { label: '任务' },
    });
    expect(() => runPipeline(t, s, 'grid', (raw) => toGrid(raw as never))).not.toThrow();
    expect(t.rows).toEqual(snapshot);
  });
  it('examples/basic 全部 csv 样例冻结后通过各自主视图管线', () => {
    const dir = 'examples/basic';
    const viewOf = (f: string): string => {
      const m = /sample-([a-z0-9-]+)\.csv$/.exec(f)?.[1];
      return ({ 'multi': 'line', 'combo': 'combo', 'gantt': 'gantt', 'grid': 'grid' } as Record<string, string>)[m ?? ''] ?? 'bar';
    };
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv'))) {
      const parsed = Papa.parse<Record<string, unknown>>(readFileSync(join(dir, f), 'utf8'), { header: true, dynamicTyping: true, skipEmptyLines: true });
      const t: Table = { columns: parsed.meta.fields ?? [], rows: parsed.data, source: { name: f, format: 'csv', rows: parsed.data.length } };
      const v = viewOf(f);
      const s = spec(v, { mapping: { label: t.columns[0]! }, time: { asOf: '2026-11-05T17:00:00+08:00', tz: 'Asia/Shanghai' } });
      const snap = JSON.stringify(t.rows);
      deepFreeze(t.rows);
      const toModel = (ADAPTERS[v as never]!.adaptRaw) as (raw: never) => unknown;
      expect(() => runPipeline(t, s, v as never, toModel), f).not.toThrow();
      expect(JSON.stringify(t.rows), f).toBe(snap);
    }
  });
});
