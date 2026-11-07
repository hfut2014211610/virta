// ADR-0010 工作日计算：workdays(默认周一~五) + holidays(排除) + extraWorkdays(调休补班)。
export interface WorkCal { weekStart?: 1 | 7; workdays?: number[]; holidays?: string[]; extraWorkdays?: string[] }

const ORD_EPOCH = 719163;
const isoOf = (ord: number) => new Date((ord - ORD_EPOCH) * 86400000).toISOString().slice(0, 10);
// 1970-01-01 是周四（getUTCDay=4）；ISO dow：1=Mon..7=Sun
const isoDow = (ord: number) => (((ord - ORD_EPOCH + 3) % 7 + 7) % 7) + 1;

export function isWorkday(ord: number, cal: WorkCal = {}): boolean {
  const iso = isoOf(ord);
  if (cal.extraWorkdays?.includes(iso)) return true;
  if (cal.holidays?.includes(iso)) return false;
  return (cal.workdays ?? [1, 2, 3, 4, 5]).includes(isoDow(ord));
}

/** (fromOrd, toOrd] 内的工作日数；toOrd < fromOrd 时返回负值（ADR-0010 带符号）。 */
export function workdaysBetween(fromOrd: number, toOrd: number, cal: WorkCal = {}): number {
  if (toOrd < fromOrd) return -workdaysBetween(toOrd, fromOrd, cal);
  let n = 0;
  for (let o = fromOrd + 1; o <= toOrd; o++) if (isWorkday(o, cal)) n++;
  return n;
}
