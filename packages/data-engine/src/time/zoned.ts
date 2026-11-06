// ADR-0010 时区换算：全部用 tz 的墙上时间，不依赖进程 TZ 环境变量。
// 基于 Intl.DateTimeFormat.formatToParts + 迭代修正偏移（覆盖 DST 跳变/重叠）。
export interface ZonedParts { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

const ORD_EPOCH = 719163; // Python toordinal 纪元：1970-01-01
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

/** 墙上日期（'YYYY-MM-DD' 或含时间）→ tz 下的时刻；dateOnly 时按 start=00:00 / end=23:59:59.999 落点。 */
export function instantOf(v: unknown, kind: 'start' | 'end', tz: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s); // epoch ms
  const withZone = parseInstant(s);
  if (withZone !== null) return withZone;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(s);
  if (!m) return null;
  const hasTime = m[4] !== undefined;
  return fromZoned({
    y: +m[1], mo: +m[2], d: +m[3],
    h: hasTime ? +m[4] : kind === 'end' ? 23 : 0,
    mi: hasTime ? +m[5] : kind === 'end' ? 59 : 0,
    s: hasTime ? +(m[6] ?? 0) : kind === 'end' ? 59 : 0,
    ms: hasTime ? 0 : kind === 'end' ? 999 : 0,
  }, tz);
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
