// legacy 质量 dict → 契约 QualityReport：warnings 文本 → 结构化 issues。
// code 由模板关键词推断（warning 模板全部出自本仓库移植代码，匹配确定）。
import type { QualityCode, QualityIssue, QualityReport } from '@virta/contracts';
import type { LegacyQuality } from './legacy-core.js';

const WARN_CODE: [RegExp, QualityCode][] = [
  [/无法解析|非法/, 'INVALID_NUMBERS'],
  [/百分号/, 'PERCENT_SCALE'],
  [/负值/, 'NEGATIVE_VALUES'],
  [/重复/, 'DUPLICATE_KEYS'],
  [/未知标记|行类型|多种行类型/, 'UNKNOWN_TYPE_MARKER'],
  [/稀疏|覆盖率/, 'SPARSE_GRID'],
  [/自环|成环|环/, 'CYCLE_REMOVED'],
  [/日期|时间/, 'UNPARSABLE_DATES'],
  [/截断|超出上限/, 'TRUNCATED'],
  [/剔除|跳过|丢弃/, 'ROWS_SKIPPED'],
  [/空值|缺失/, 'MISSING_VALUES'],
];

export function warningCode(w: string): QualityCode {
  for (const [re, code] of WARN_CODE) if (re.test(w)) return code;
  return 'MISSING_VALUES';
}

export function toQualityReport(
  q: LegacyQuality,
  extra?: { kept?: number; stats?: Record<string, string | number> },
): QualityReport {
  const issues: QualityIssue[] = q.warnings.map((w) => ({
    code: warningCode(w),
    level: q.confidence === 'low' ? 'warn' : 'info',
    message: w,
  }));
  const stats: Record<string, string | number> = {
    mode: q.mode, type_column: q.type_column, anchors: q.anchors,
    missing: q.missing, invalid: q.invalid, percent: q.percent, negative: q.negative,
    duplicate_pairs: q.duplicate_pairs,
    ...extra?.stats,
  };
  return {
    rows: q.rows,
    kept: extra?.kept ?? q.rows,
    mode: q.mode,
    mapping: q.mapping,
    confidence: q.confidence,
    issues,
    stats,
  };
}
