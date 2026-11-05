// formatNumber(v, NumberFormat, columnType)（§4.4 auto 规则）。
import type { NumberFormat } from '@virta/contracts';

const trim = (v: number, d: number) => {
  const s = v.toFixed(d);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};
const thou = (v: number, d = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

export function formatNumber(v: number, fmt?: NumberFormat, _columnType?: string): string {
  if (!Number.isFinite(v)) return '—';
  const style = fmt?.style ?? 'auto';
  const d = fmt?.decimals;
  switch (style) {
    case 'raw': return String(v);
    case 'thousands': return thou(v, d ?? (Number.isInteger(v) ? 0 : 2));
    case 'wan':
      return Math.abs(v) >= 10000 ? `${trim(v / 10000, d ?? 1)}万` : thou(v, d ?? 0);
    case 'percent': return `${trim(v * (Math.abs(v) <= 1 ? 100 : 1), d ?? 1)}%`;
    case 'currency': {
      const sym = fmt?.currency === 'USD' ? '$' : fmt?.currency === 'EUR' ? '€' : '¥';
      return `${sym}${thou(v, d ?? 0)}`;
    }
    case 'auto':
    default: {
      const a = Math.abs(v);
      if (a >= 1e8) return `${trim(v / 1e8, d ?? 1)}亿`;
      if (a >= 1e4) return `${trim(v / 1e4, d ?? 1)}万`;
      if (a >= 1000) return thou(v, d ?? 0);
      return trim(v, d ?? 2);
    }
  }
}
