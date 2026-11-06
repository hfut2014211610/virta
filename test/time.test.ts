// ADR-0010 时间契约单元测试：zoned/fromZoned（含 DST）、工作日、dueStatus、dateDiff。
import { describe, expect, it } from 'vitest';
import { zonedParts, fromZoned, parseInstant, tzValid, instantOf, ordinalOf, isWorkday, workdaysBetween, applyDerives, resolveTime } from '@virta/data-engine';
import type { Table, ViewSpec } from '@virta/contracts';

const SH = 'Asia/Shanghai';

describe('zoned/fromZoned', () => {
  it('上海无时差往返一致', () => {
    const ms = Date.parse('2026-11-05T17:00:00+08:00');
    const p = zonedParts(ms, SH);
    expect([p.y, p.mo, p.d, p.h]).toEqual([2026, 11, 5, 17]);
    expect(fromZoned(p, SH)).toBe(ms);
  });
  it('UTC ↔ 上海换算', () => {
    const ms = Date.parse('2026-11-05T09:00:00Z');
    expect(zonedParts(ms, SH).h).toBe(17);
  });
  it('DST 跳变（America/New_York 2020-03-08 02:30 不存在 → 收敛到合法时刻）', () => {
    const ms = fromZoned({ y: 2020, mo: 3, d: 8, h: 3, mi: 30, s: 0 }, 'America/New_York');
    expect(zonedParts(ms, 'America/New_York').h).toBe(3);
  });
  it('DST 回退（2020-11-01 01:30 歧义 → 收敛）', () => {
    const ms = fromZoned({ y: 2020, mo: 11, d: 1, h: 1, mi: 30, s: 0 }, 'America/New_York');
    expect(zonedParts(ms, 'America/New_York').mi).toBe(30);
  });
  it('parseInstant 必须带偏移/Z', () => {
    expect(parseInstant('2026-11-05T17:00:00+08:00')).not.toBeNull();
    expect(parseInstant('2026-11-05T09:00:00Z')).not.toBeNull();
    expect(parseInstant('2026-11-05')).toBeNull();
    expect(parseInstant('2026-11-05 17:00')).toBeNull();
    expect(tzValid('Mars/Olympus')).toBe(false);
  });
  it('instantOf 日期角色时刻语义：end=当天 23:59:59.999 / start=00:00（tz 墙上）', () => {
    const e = instantOf('2026-11-05', 'end', SH)!;
    const s = instantOf('2026-11-05', 'start', SH)!;
    const pe = zonedParts(e, SH), ps = zonedParts(s, SH);
    expect([pe.h, pe.mi, pe.s]).toEqual([23, 59, 59]);
    expect([ps.h, ps.mi, ps.s]).toEqual([0, 0, 0]);
  });
});

describe('工作日', () => {
  const ord = (iso: string) => ordinalOf(instantOf(iso, 'start', SH)!, SH);
  it('周末/节假日/调休', () => {
    expect(isWorkday(ord('2026-11-06'))).toBe(true);  // 周五
    expect(isWorkday(ord('2026-11-07'))).toBe(false); // 周六
    expect(isWorkday(ord('2026-11-07'), { extraWorkdays: ['2026-11-07'] })).toBe(true);
    expect(isWorkday(ord('2026-11-06'), { holidays: ['2026-11-06'] })).toBe(false);
  });
  it('workdaysBetween', () => {
    expect(workdaysBetween(ord('2026-11-05'), ord('2026-11-09'))).toBe(2); // 五→一：五不算，六日不算，一算? 五、六、日、一 → (5,9]=6,7,8,9 → 6五 9一 = 2
    expect(workdaysBetween(ord('2026-11-09'), ord('2026-11-05'))).toBe(0);
  });
});

describe('dueStatus / dateDiff', () => {
  const table = (rows: Record<string, unknown>[]): Table =>
    ({ columns: ['due', 'done'], rows, source: { name: 't', format: 'csv' as const, rows: rows.length } });
  const spec = (asOf: string): ViewSpec => ({
    version: 1, view: 'grid', time: { asOf, tz: SH },
    derive: [{ type: 'dueStatus', due: 'due', done: 'done' }],
  });
  const status = (rows: Record<string, unknown>[], asOf: string) =>
    applyDerives(table(rows), spec(asOf)).table.rows.map((r) => r['截止状态']);
  it('七态边界', () => {
    const [v] = status([{ due: '2026-11-05', done: null }], '2026-11-05T17:00:00+08:00');
    expect(v).toBe('due-today');            // 截止日 23:59:59.999 > asOf 17:00
    const [w] = status([{ due: '2026-11-05', done: null }], '2026-11-06T00:00:00+08:00');
    expect(w).toBe('overdue');              // 跨天即超期
    expect(status([{ due: '2026-11-04', done: '2026-11-03' }], '2026-11-05T17:00:00+08:00')[0]).toBe('done');
    expect(status([{ due: '2026-11-04', done: '2026-11-06' }], '2026-11-05T17:00:00+08:00')[0]).toBe('done-late');
    expect(status([{ due: '2026-11-08', done: null }], '2026-11-05T17:00:00+08:00')[0]).toBe('due-soon'); // 六日不计工作日→五+1工=下周一? 5(四)→6五 9一 = 2工 ≤3
    expect(status([{ due: '2026-12-01', done: null }], '2026-11-05T17:00:00+08:00')[0]).toBe('upcoming');
    expect(status([{ due: '', done: null }], '2026-11-05T17:00:00+08:00')[0]).toBe('unknown');
  });
  it('dateDiff：正常差值与空端 null', () => {
    const t = table([{ due: '2026-11-10', done: '2026-11-05' }, { due: '', done: '2026-11-05' }]);
    const s2: ViewSpec = { version: 1, view: 'grid', time: { asOf: '2026-11-05T00:00:00+08:00', tz: SH }, derive: [{ type: 'dateDiff', from: 'done', to: 'due' }] };
    const out = applyDerives(t, s2).table.rows.map((r) => r['差值天数']);
    expect(out[0]).toBe(5);
    expect(out[1]).toBeNull();
  });
  it('resolveTime 缺省解析并标记假设', () => {
    const r = resolveTime({ version: 1, view: 'bar' });
    expect(r.assumed).toContain('TZ_ASSUMED');
    expect(r.assumed).toContain('ASOF_ASSUMED');
    expect(r.tz).toBeTruthy();
  });
});
