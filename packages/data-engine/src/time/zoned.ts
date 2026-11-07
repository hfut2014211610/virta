// ADR-0010 时区换算：全部用 tz 的墙上时间，不依赖进程 TZ 环境变量。
// 基于 Intl.DateTimeFormat.formatToParts + 迭代修正偏移（覆盖 DST 跳变/重叠）。
export interface ZonedParts { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

const ORD_EPOCH = 719163; // Python toordinal 纪元：1970-01-01
import { parseGanttDate } from '../legacy-core.js';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const dtf = (tz: string): Intl.DateTimeFormat => {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', fractionalSecondDigits: 3,
    });
    fmtCache.set(tz, f);
  }
  return f;
};

export function tzValid(tz: string): boolean {
  try { dtf(tz); return true; } catch { return false; }
}

export function zonedParts(instant: number, tz: string): ZonedParts {
  const parts = dtf(tz).formatToParts(new Date(instant));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second'), ms: get('fractionalSecond') };
}

/** tz 墙上时间 → epoch ms。迭代修正偏移（DST 边界两轮收敛）。 */
export function fromZoned(p: Omit<ZonedParts, 'ms'> & { ms?: number }, tz: string): number {
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s, p.ms ?? 0);
  let inst = wall;
  for (let i = 0; i < 3; i++) {
    const zp = zonedParts(inst, tz);
    const back = Date.UTC(zp.y, zp.mo - 1, zp.d, zp.h, zp.mi, zp.s, zp.ms);
    inst = wall - (back - inst);
  }
  return inst;
}

/** ISO 8601 且必须带偏移或 Z（ADR-0010：无时区的字符串不算时刻）。 */
export function parseInstant(s: string): number | null {
  if (!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s.trim())) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// C9 纯数字规则：8 位合法 YMD → 紧凑日期；[20000,80000] → Excel 1900 序列号；
// ≥1e11 → epoch 毫秒；其余一律 null（日期判错比报错危险）。
const EXCEL_ORD_EPOCH = ORD_EPOCH + Math.floor(Date.UTC(1899, 11, 30) / 86400000);
const numToOrd = (n: number): number | null => {
  if (Number.isInteger(n) && n >= 19000101 && n <= 20991231) {
    const y = Math.floor(n / 10000), mo = Math.floor(n / 100) % 100, d = n % 100;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d)
      return ORD_EPOCH + Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
    return null;
  }
  if (n >= 20000 && n <= 80000) return EXCEL_ORD_EPOCH + Math.floor(n);
  return null;
};

/** toordinal → 墙上日期 → tz 时刻（dateOnly 时 start=00:00 / end=23:59:59.999）。 */
const ordToInstant = (ord: number, kind: 'start' | 'end', tz: string, t?: { h: number; mi: number; s: number }): number => {
  const d = new Date((ord - ORD_EPOCH) * 86400000);
  return fromZoned({
    y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: t ? t.h : kind === 'end' ? 23 : 0,
    mi: t ? t.mi : kind === 'end' ? 59 : 0,
    s: t ? t.s : kind === 'end' ? 59 : 0,
    ms: t ? 0 : kind === 'end' ? 999 : 0,
  }, tz);
};

/** 日期值 → tz 下的时刻。识别：带偏移 ISO、`-`/`/`/`.`/中文年月日、紧凑 8 位、
 *  Excel 序列号（含字符串形式）、epoch 毫秒；dateOnly 按 start/end 落点（ADR-0010/C9）。 */
export function instantOf(v: unknown, kind: 'start' | 'end', tz: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const num = typeof v === 'number' ? v
    : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null;
  if (num !== null && Number.isFinite(num)) {
    const ord = numToOrd(num);
    if (ord === null) return num >= 1e11 ? num : null;
    return ordToInstant(ord, kind, tz);
  }
  const s = String(v).trim();
  const withZone = parseInstant(s);
  if (withZone !== null) return withZone;
  // 日期(+时间)：剥离时间成分后交 parseGanttDate 识别日期部分
  const tm = /[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(s);
  const datePart = tm ? s.slice(0, s.indexOf(tm[0])).trim() : s;
  const [ord] = parseGanttDate(datePart);
  if (ord === null) return null;
  return ordToInstant(ord, kind, tz, tm ? { h: +tm[1], mi: +tm[2], s: +(tm[3] ?? 0) } : undefined);
}

/** instant → tz 墙上日期的 toordinal。 */
export function ordinalOf(instant: number, tz: string): number {
  const zp = zonedParts(instant, tz);
  return ORD_EPOCH + Date.UTC(zp.y, zp.mo - 1, zp.d) / 86400000;
}

/** 日期值（无时刻语义，按墙上日期）→ toordinal。 */
export function dateOrdinal(v: unknown, tz: string): number | null {
  const ms = instantOf(v, 'start', tz);
  return ms === null ? null : ordinalOf(ms, tz);
}
