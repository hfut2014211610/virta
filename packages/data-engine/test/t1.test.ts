// T1 视图适配器 + 洞察 + 计数（M6）
import { describe, expect, it } from 'vitest';
import { parseCsvText } from '../src/read.js';
import { rawToTable } from '../src/index.js';
import { toCohort, toCompare, toHistogram, toKpi, toRank } from '../src/families/t1.js';
import { insights } from '../src/insights.js';
import { counts } from '../src/counts.js';
import type { SourceMeta } from '@virta/contracts';

const src = { name: 't.csv', format: 'csv' } as SourceMeta;
const rows = (csv: string) => parseCsvText(csv) as Record<string, unknown>[];
const table = (csv: string) => rawToTable(parseCsvText(csv), src);

const RANK_RACE = `月份,城市,销售额
2025-01,上海,300
2025-01,北京,280
2025-02,上海,340
2025-02,北京,290
2025-03,上海,390
2025-03,北京,300`;

describe('T1 适配器', () => {
  it('rank：static 聚合 + 降序', () => {
    const m = toRank(rows('城市,销售额\n上海,300\n北京,280\n上海,50'));
    expect(m.mode).toBe('static');
    expect(m.items[0]).toEqual({ label: '上海', value: 350 });
    expect(m.quality.mapping).toMatchObject({ label: '城市', value: '销售额' });
  });
  it('rank：time 列 → race 分帧', () => {
    const m = toRank(rows(RANK_RACE));
    expect(m.mode).toBe('race');
    expect(m.frames!.map((f) => f.time)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(m.frames![2].items[0].label).toBe('上海');
  });
  it('histogram：FD 分箱 + 累计', () => {
    const csv = `评分\n${Array.from({ length: 60 }, (_, i) => 40 + (i % 20) * 3).join('\n')}`;
    const m = toHistogram(rows(csv));
    expect(m.bins.length).toBeGreaterThan(3);
    expect(m.bins.reduce((a, b) => a + b.count, 0)).toBe(60);
    expect(m.bins[m.bins.length - 1].cum).toBe(60);
  });
  it('histogram：group 叠加', () => {
    const csv = `组别,耗时\n${Array.from({ length: 40 }, (_, i) => `A,${30 + i}`).join('\n')}\n${Array.from({ length: 40 }, (_, i) => `B,${60 + i}`).join('\n')}`;
    const m = toHistogram(rows(csv));
    expect(m.groups.length).toBe(2);
  });
  it('kpi：target/previous → pct', () => {
    const m = toKpi(rows('指标,实际,目标,上期\nGMV增速,18,25,12\nNPS,52,50,55'));
    expect(m.items.length).toBe(2);
    expect(m.items[0].pct).toBeCloseTo(0.72);
    expect(m.items[0].previous).toBe(12);
    expect(m.hits).toBe(1);
  });
  it('compare：from/to + delta + 反转计数', () => {
    const m = toCompare(rows('渠道,上半年,下半年\n线上,5000,6000\n线下,4000,3600'));
    expect(m.items[0].delta).toBe(1000);
    expect(m.up).toBe(1);
    expect(m.down).toBe(1);
    expect(m.reversed).toBe(1);
    expect(m.from_key).toBe('上半年');
    expect(m.to_key).toBe('下半年');
  });
  it('compare：年份列名兜底', () => {
    const m = toCompare(rows('渠道,2024,2025\n线上,5000,6000'));
    expect(m.from_key).toBe('2024');
    expect(m.to_key).toBe('2025');
  });
  it('cohort：三角 + 第 0 期归一', () => {
    const m = toCohort(rows('cohort,period,users\n2025-01,0,1000\n2025-01,1,600\n2025-02,0,800'));
    expect(m.rows.length).toBe(2);
    expect(m.rows[0].cells[0]).toBe(1000);
    expect(m.rows[0].cells[1]).toBe(600);
    expect(m.rows[1].cells[1]).toBeNull();
    expect(m.maxPeriod).toBe(1);
  });
});

describe('T1 洞察/计数', () => {
  it('rank insights：peak 榜首', () => {
    const m = toRank(rows(RANK_RACE));
    const kinds = insights('rank', m).map((i) => i.kind);
    expect(kinds).toContain('peak');
    expect(counts('rank', m)['frames']).toBe(3);
  });
  it('histogram insights：peak/distribution', () => {
    const m = toHistogram(rows(`评分\n${Array.from({ length: 60 }, (_, i) => 40 + i).join('\n')}`));
    const kinds = insights('histogram', m).map((i) => i.kind);
    expect(kinds).toContain('peak');
    expect(counts('histogram', m)['n']).toBe(60);
  });
  it('kpi insights：target/bottleneck', () => {
    const m = toKpi(rows('指标,实际,目标,上期\nA,18,25,12\nB,52,50,55'));
    const kinds = insights('kpi', m).map((i) => i.kind);
    expect(kinds).toContain('target');
  });
  it('compare insights：change/outlier', () => {
    const m = toCompare(rows('渠道,上半年,下半年\n线上,5000,6000\n线下,4000,3600'));
    const kinds = insights('compare', m).map((i) => i.kind);
    expect(kinds).toContain('change');
    expect(counts('compare', m)['reversed']).toBe(1);
  });
  it('cohort insights：retention', () => {
    const m = toCohort(rows('cohort,period,users\n2025-01,0,1000\n2025-01,1,600\n2025-02,0,800\n2025-02,1,500'));
    const kinds = insights('cohort', m).map((i) => i.kind);
    expect(kinds).toContain('retention');
    expect(counts('cohort', m)['cohorts']).toBe(2);
  });
  it('adapter 注册：T1 六视图 ADAPTERS 可用', async () => {
    const { ADAPTERS } = await import('../src/families/index.js');
    const csv: Record<string, string> = {
      combo: '月份,营收,毛利率\n1月,400,32', rank: '城市,销售额\n上海,300\n北京,280',
      histogram: `评分\n${Array.from({ length: 30 }, (_, i) => i).join('\n')}`,
      kpi: '指标,实际,目标\nA,18,25', compare: '渠道,上半年,下半年\n线上,5000,6000',
      cohort: 'cohort,period,users\n2025-01,0,100\n2025-01,1,60',
    };
    for (const v of Object.keys(csv)) {
      const a = (ADAPTERS as Record<string, { adapt: (t: unknown, s: unknown) => { model: unknown } }>)[v];
      expect(a, v).toBeTruthy();
      const { model } = a.adapt(table(csv[v]), { version: 1, view: v } as never);
      expect(model).toBeTruthy();
    }
  });
});
