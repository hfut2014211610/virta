// 比例尺（§5.3）：linear(nice ticks)/log/sqrt/band/point + ordinal color。
export interface LinearScale { (v: number): number; domain: [number, number]; ticks: number[]; fmt: (v: number) => string }

/** nice ticks：步长取 1/2/2.5/5×10^k，0 在域内时对齐 0。 */
export function niceTicks(min: number, max: number, target = 6): { domain: [number, number]; ticks: number[]; step: number } {
  if (min > max) [min, max] = [max, min];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => span / s <= target + 0.5) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return { domain: [lo, hi], ticks, step };
}

export function scaleLinear(domain: [number, number], range: [number, number], targetTicks = 6): LinearScale {
  const { domain: d, ticks } = niceTicks(domain[0], domain[1], targetTicks);
  const span = d[1] - d[0] || 1;
  const f = (v: number) => range[0] + ((v - d[0]) / span) * (range[1] - range[0]);
  return Object.assign(f, {
    domain: d as [number, number], ticks,
    fmt: (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100)),
  });
}

export function scaleLog(domain: [number, number], range: [number, number]) {
  const d: [number, number] = [Math.max(1e-9, domain[0]), Math.max(1e-9, domain[1])];
  const l0 = Math.log10(d[0]), l1 = Math.log10(d[1]);
  const f = (v: number) => range[0] + ((Math.log10(Math.max(1e-9, v)) - l0) / (l1 - l0 || 1)) * (range[1] - range[0]);
  const ticks: number[] = [];
  for (let e = Math.ceil(l0); e <= Math.floor(l1) + 1e-9; e++) ticks.push(10 ** e);
  return Object.assign(f, { domain: d, ticks, fmt: (v: number) => String(v) });
}

export function scaleSqrt(domain: [number, number], range: [number, number]) {
  const s0 = Math.sqrt(Math.max(0, domain[0])), s1 = Math.sqrt(Math.max(0, domain[1]));
  const f = (v: number) => range[0] + ((Math.sqrt(Math.max(0, v)) - s0) / (s1 - s0 || 1)) * (range[1] - range[0]);
  return Object.assign(f, { domain, ticks: niceTicks(domain[0], domain[1]).ticks });
}

export interface BandScale { (v: string): number; bandwidth: number; domain: string[]; step: number }
export function scaleBand(domain: string[], range: [number, number], padding = 0.18): BandScale {
  const n = Math.max(1, domain.length);
  const step = (range[1] - range[0]) / Math.max(1, n + padding - padding / Math.max(1, n));
  const s = (range[1] - range[0]) / Math.max(1, n + (n > 1 ? padding : 0));
  const bandwidth = s * (1 - (n > 1 ? padding : 0));
  const f = (v: string) => range[0] + domain.indexOf(v) * s;
  return Object.assign(f, { bandwidth, domain, step: s });
}

export function scalePoint(domain: string[], range: [number, number]): (v: string) => number {
  const n = domain.length;
  const step = n > 1 ? (range[1] - range[0]) / (n - 1) : 0;
  return (v) => (n > 1 ? range[0] + domain.indexOf(v) * step : (range[0] + range[1]) / 2);
}

/** 序数色：循环取 palette。 */
export const scaleOrdinal = (colors: readonly string[]) => {
  const map = new Map<string, string>();
  return (key: string) => {
    if (!map.has(key)) map.set(key, colors[map.size % colors.length]);
    return map.get(key)!;
  };
};

/** 时间刻度：按跨度选 日/周/月/季/年（输入为 ISO 日期串域）。 */
export function timeTicks(dates: string[], maxTicks = 8): string[] {
  if (dates.length <= maxTicks) return dates;
  const step = Math.ceil(dates.length / maxTicks);
  const out: string[] = [];
  for (let i = 0; i < dates.length; i += step) out.push(dates[i]);
  return out;
}
