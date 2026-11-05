// edge-cases 鲁棒性（§8.3）：读取不抛非预期异常、适配器给出质量提示或兜底结果。
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInput } from '../src/node/index.js';
import { rawToTable, profileTable, recommend, ADAPTERS } from '../src/index.js';
import type { Raw } from '../src/families/barline.js';
import { parseNumber, parseGanttDate } from '../src/legacy-core.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples/edge-cases');
const load = (f: string) => readInput(path.join(DIR, f));

describe('edge-cases 读取', () => {
  it('gbk.csv → GB18030 回退 + encoding 标记', async () => {
    const r = await load('gbk.csv');
    expect(r.source.encoding).toBe('gb18030');
    const t = rawToTable(r.result!.raw, r.source);
    expect(t.columns).toContain('分类');
    expect(t.rows.length).toBe(3);
  });
  it('empty.csv → 空行不抛', async () => {
    const r = await load('empty.csv');
    expect((r.result!.raw as unknown[]).length).toBe(0);
  });
  it('header-only.csv → 0 行', async () => {
    const r = await load('header-only.csv');
    expect((r.result!.raw as unknown[]).length).toBe(0);
  });
  it('long-labels.csv → 60+ 字标签正常进入模型', async () => {
    const r = await load('long-labels.csv');
    const m = ADAPTERS.bar!.adaptRaw(r.result!.raw as Raw) as { labels: string[] };
    expect(m.labels[0].length).toBeGreaterThan(50);
  });
  it('duplicate-keys.csv → 重复键聚合并告警', async () => {
    const r = await load('duplicate-keys.csv');
    const m = ADAPTERS.bar!.adaptRaw(r.result!.raw as Raw) as { labels: string[]; quality: { warnings: string[] } };
    expect(m.labels).toEqual(['A', 'B']);
    expect(m.quality.warnings.length).toBeGreaterThan(0);
  });
  it('missing-columns.csv → 推荐仍给出兜底', async () => {
    const r = await load('missing-columns.csv');
    const t = rawToTable(r.result!.raw, r.source);
    const rec = recommend(profileTable(t), t);
    expect(rec.length).toBeGreaterThan(0);
  });
  it('mixed-dates.csv → 混合日期部分解析', () => {
    const cases = ['2025-01-05', '2025/02/12', '2025.3.18', '2025年4月2日', '5月6日', 'bad-date'];
    const kinds = cases.map((c) => parseGanttDate(c)[2]);
    expect(kinds.filter((k) => k === 'date').length).toBeGreaterThanOrEqual(4);
  });
  it('gantt-dirty-dates.csv → 脏日期进质量警告', async () => {
    const r = await load('gantt-dirty-dates.csv');
    const m = ADAPTERS.gantt!.adaptRaw(r.result!.raw as Raw) as { quality: { warnings: string[] } };
    expect(m.quality.warnings.length).toBeGreaterThan(0);
  });
  it('scatter-missing.csv → 缺值点按 legacy 语义处理并告警', async () => {
    const r = await load('scatter-missing.csv');
    const m = ADAPTERS.scatter!.adaptRaw(r.result!.raw as Raw) as { points: { x: number; y: number }[]; quality: { warnings: string[] } };
    // legacy：缺值按 0 入点（x/y missing 计数在 quality.stats2）
    expect(m.points.length).toBe(6);
    expect(m.points.some((pt) => pt.x === 0 || pt.y === 0)).toBe(true);
  });
  it('sankey-cyclic.csv → 环被剔除并告警', async () => {
    const r = await load('sankey-cyclic.csv');
    const m = ADAPTERS.sankey!.adaptRaw(r.result!.raw as Raw) as { quality: { warnings: string[] } };
    expect(m.quality.warnings.some((w) => w.includes('循环'))).toBe(true);
  });
  it('waterfall-unknown-marker.csv → 未知行类型告警', async () => {
    const r = await load('waterfall-unknown-marker.csv');
    const m = ADAPTERS.bar!.adaptRaw(r.result!.raw as Raw) as { quality: { warnings: string[] } };
    expect(m.quality.warnings.length).toBeGreaterThan(0);
  });
  it('xss-label.csv → 标签保留原文（转义在渲染层）', async () => {
    const r = await load('xss-label.csv');
    const m = ADAPTERS.bar!.adaptRaw(r.result!.raw as Raw) as { labels: string[] };
    expect(m.labels[0]).toContain('<script>');
  });
  it('excel-serials.csv → 数字序列正常入表', async () => {
    const r = await load('excel-serials.csv');
    const t = rawToTable(r.result!.raw, r.source);
    expect(t.rows[0]['日期序列']).toBe('45678');
  });
});

describe('parseNumber 分支覆盖', () => {
  it.each([
    ['1,234.5', 1234.5, 'ok'],
    ['￥1,200', 1200, 'ok'],
    ['(450)', -450, 'ok'],
    ['10%', 10, 'percent'],
    ['1，234', 1234, 'ok'],
    ['１２３', 0, 'invalid'],
    ['-', 0, 'missing'],
    ['', 0, 'missing'],
    ['abc', 0, 'invalid'],
  ] as const)('%s → %o %s', (s, v, st) => {
    const [num, status] = parseNumber(s);
    expect(num).toBe(v);
    expect(status).toBe(st);
  });
});
