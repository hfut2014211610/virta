// contracts v1 · §4.5 质量、洞察与错误
export type QualityCode =
  | 'MISSING_VALUES' | 'INVALID_NUMBERS' | 'PERCENT_SCALE' | 'NEGATIVE_VALUES' | 'DUPLICATE_KEYS'
  | 'UNKNOWN_TYPE_MARKER' | 'KIND_CONFLICT' | 'SPARSE_GRID' | 'CYCLE_REMOVED' | 'UNPARSABLE_DATES'
  | 'ROWS_SKIPPED' | 'TRUNCATED' | 'VARIANT_DISABLED' | 'FONT_FALLBACK' | 'LOW_CONFIDENCE_MAPPING'
  | 'TZ_ASSUMED' | 'ASOF_ASSUMED' | 'GAP_VALUES' | 'LINK_UNSAFE';

export interface QualityIssue {
  code: QualityCode;
  level: 'info' | 'warn' | 'error';
  /** 纯文本；HTML 转义只在渲染层做 */
  message: string;
  column?: string;
  count?: number;
  examples?: string[];
}

export interface QualityReport {
  rows: number;
  kept: number;
  mode?: string;
  mapping: Record<string, string | string[]>;
  confidence: 'high' | 'medium' | 'low';
  issues: QualityIssue[];
  /** 识别报告里的芯片 */
  stats: Record<string, string | number>;
}

export type InsightKind =
  | 'peak' | 'trough' | 'trend' | 'change' | 'share' | 'concentration' | 'outlier'
  | 'gap' | 'correlation' | 'bottleneck' | 'critical-path' | 'target' | 'retention' | 'distribution';
export interface Insight {
  kind: InsightKind;
  text: string;
  value?: number;
  ref?: { label?: string; series?: string; column?: string };
  importance: number;
}

export type ErrorCode =
  | 'INPUT_NOT_FOUND' | 'UNSUPPORTED_FORMAT' | 'PARSE_ERROR' | 'EMPTY_DATA'
  | 'MISSING_COLUMN' | 'AMBIGUOUS_MAPPING' | 'UNKNOWN_VIEW' | 'INVALID_SPEC' | 'INVALID_OPTION'
  | 'UNSUPPORTED_EXPORT' | 'RENDER_FAILED' | 'EXPORT_FAILED' | 'INTERNAL' | 'INVALID_TIME';

export interface VizError {
  code: ErrorCode;
  message: string;
  hint?: string;
  recoverable: boolean;
  details?: {
    missingRoles?: string[];
    ambiguous?: { role: string; columns: string[] }[];
    column?: string;
    candidates?: string[];
  };
}

export const EXIT_CODES = { OK: 0, INTERNAL: 1, USAGE: 2, INPUT: 3, DATA: 4, RENDER: 5 } as const;
export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];

/** 错误码 → 退出码映射（§4.5） */
export const ERROR_TO_EXIT: Record<ErrorCode, ExitCode> = {
  UNKNOWN_VIEW: EXIT_CODES.USAGE,
  INVALID_SPEC: EXIT_CODES.USAGE,
  INVALID_OPTION: EXIT_CODES.USAGE,
  INPUT_NOT_FOUND: EXIT_CODES.INPUT,
  UNSUPPORTED_FORMAT: EXIT_CODES.INPUT,
  PARSE_ERROR: EXIT_CODES.INPUT,
  EMPTY_DATA: EXIT_CODES.INPUT,
  MISSING_COLUMN: EXIT_CODES.DATA,
  AMBIGUOUS_MAPPING: EXIT_CODES.DATA,
  UNSUPPORTED_EXPORT: EXIT_CODES.RENDER,
  RENDER_FAILED: EXIT_CODES.RENDER,
  EXPORT_FAILED: EXIT_CODES.RENDER,
  INTERNAL: EXIT_CODES.INTERNAL,
  INVALID_TIME: EXIT_CODES.USAGE,
};
