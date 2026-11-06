// ADR-0010 派生列（A5）：dueStatus / dateDiff。在适配前统一执行，新列进入 Table.columns。
import type { QualityIssue, Table, ViewSpec } from '@virta/contracts';
import { instantOf, ordinalOf, parseInstant, tzValid } from './time/zoned.js';
import { workdaysBetween, type WorkCal } from './time/workday.js';

export type DueStatus = 'done' | 'done-late' | 'overdue' | 'due-today' | 'due-soon' | 'upcoming' | 'unknown';

/** 解析 spec.time：缺省 asOf=当前时刻、tz=系统时区（返回假设标记供 CLI 写回/上报）。 */
export function resolveTime(spec: ViewSpec): { asOfMs: number; tz: string; asOfIso: string; assumed: ('TZ_ASSUMED' | 'ASOF_ASSUMED')[] } {
  const assumed: ('TZ_ASSUMED' | 'ASOF_ASSUMED')[] = [];
  let tz = spec.time?.tz;
  if (!tz || !tzValid(tz)) { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'; assumed.push('TZ_ASSUMED'); }
  let asOfMs = spec.time?.asOf ? parseInstant(spec.time.asOf) : null;
  if (asOfMs === null) { asOfMs = Date.now(); assumed.push('ASOF_ASSUMED'); }
  return { asOfMs, tz, asOfIso: new Date(asOfMs).toISOString(), assumed };
}

/** 派生列求值：返回 {rows（含新列）, newCols, issues}。 */
export function applyDerives(table: Table, spec: ViewSpec, resolved?: { asOfMs: number; tz: string }): { table: Table; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const derives = spec.derive ?? [];
  if (!derives.length) return { table, issues };
  const tz = resolved?.tz ?? resolveTime(spec).tz;
  const asOfMs = resolved?.asOfMs ?? resolveTime(spec).asOfMs;
  const aOrd = ordinalOf(asOfMs, tz);
  const cal: WorkCal = { workdays: spec.time?.workdays, holidays: spec.time?.holidays, extraWorkdays: spec.time?.extraWorkdays };
  const rows = table.rows.map((r) => ({ ...(r as Record<string, unknown>) }));
  const newCols: string[] = [];
  for (const d of derives) {
    if (d.type === 'dueStatus') {
      const name = d.as ?? '截止状态';
      const soon = d.soonWorkdays ?? 3;
      const missing = !table.columns.includes(d.due) ? [d.due] : d.done && !table.columns.includes(d.done) ? [d.done] : [];
      for (const c of missing) issues.push({ code: 'MISSING_COLUMN' as never, level: 'warn', message: `派生列 ${name}：列「${c}」不存在，全部输出 unknown`, column: c });
      for (const r of rows) {
        const dueMs = instantOf(r[d.due], 'end', tz);
        const doneMs = d.done ? instantOf(r[d.done], 'end', tz) : null;
        let v: DueStatus;
        if (dueMs === null || missing.length) v = 'unknown';
        else if (doneMs !== null) v = doneMs <= dueMs ? 'done' : 'done-late';
        else if (asOfMs > dueMs) v = 'overdue';
        else if (ordinalOf(dueMs, tz) === aOrd) v = 'due-today';
        else if (workdaysBetween(aOrd, ordinalOf(dueMs, tz), cal) <= soon) v = 'due-soon';
        else v = 'upcoming';
        r[name] = v;
      }
      if (!newCols.includes(name)) newCols.push(name);
    } else {
      const name = d.as ?? '差值天数';
      for (const r of rows) {
        const fOrd = instantOf(r[d.from], 'start', tz) !== null ? ordinalOf(instantOf(r[d.from], 'start', tz)!, tz) : null;
        const tOrd = instantOf(r[d.to], 'end', tz) !== null ? ordinalOf(instantOf(r[d.to], 'end', tz)!, tz) : null;
        r[name] = fOrd === null || tOrd === null ? null
          : d.unit === 'workday' ? workdaysBetween(fOrd, tOrd, cal) : tOrd - fOrd;
      }
      if (!newCols.includes(name)) newCols.push(name);
    }
  }
  const columns = [...table.columns, ...newCols.filter((c) => !table.columns.includes(c))];
  return { table: { ...table, columns, rows: rows as Table['rows'] }, issues };
}
