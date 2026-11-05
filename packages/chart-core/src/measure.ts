// 文字度量（§5.3 D9）：CJK/全角 1.0em、mono 0.6em、display/body 拉丁查 metrics.json；
// body 拉丁近似 0.55em（窄 il.,:;'| 0.3em、宽 mwMW@ 0.85em）。Node/浏览器同一函数。
import { loadMetrics, type MetricsTable } from '@virta/design-system';

let _metrics: MetricsTable | null = null;
export function setMetrics(m: MetricsTable) { _metrics = m; }
function metrics(): MetricsTable | null {
  if (!_metrics) { try { _metrics = loadMetrics(); } catch { /* 浏览器内嵌场景 */ } }
  return _metrics;
}

const isWide = (cp: number) =>
  cp >= 0x1100 && (cp <= 0x115f || cp === 0x2e80 || cp === 0x2f3c ||
    (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6));

const NARROW = new Set('il.,:;\'|!jft()[]I '.split('').map((c) => c.codePointAt(0)!));
const WIDE_LAT = new Set('mwMW@%&'.split('').map((c) => c.codePointAt(0)!));

export type MetricFontRole = 'display' | 'body' | 'mono';

export function measureText(text: string, font: MetricFontRole, size: number): number {
  if (font === 'mono') return text.length * 0.6 * size;
  const m = metrics();
  const key = font === 'display' ? 'display-medium' : null;
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isWide(cp)) { w += size; continue; }
    if (key && m?.[key]?.widths?.[ch] !== undefined) { w += m[key].widths[ch] * size; continue; }
    // body / 未收录 display 字符近似
    w += (NARROW.has(cp) ? 0.3 : WIDE_LAT.has(cp) ? 0.85 : 0.55) * size;
  }
  return w;
}

/** 截断到 maxW，加省略号。 */
export function ellipsize(text: string, font: MetricFontRole, size: number, maxW: number): string {
  if (measureText(text, font, size) <= maxW) return text;
  let t = text;
  while (t.length && measureText(t + '…', font, size) > maxW) t = t.slice(0, -1);
  return t ? t + '…' : '…';
}
