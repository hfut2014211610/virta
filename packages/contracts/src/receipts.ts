// contracts v1 · §4.6 CLI 回执
import type { ViewId } from './views.js';
import type { ViewSpec } from './spec.js';
import type { TableProfile } from './data.js';
import type { QualityIssue, QualityReport, Insight, VizError } from './quality.js';

/** 带 --json 的命令 stdout 只输出一个 JSON 对象；日志与进度写 stderr */
export type Envelope<T> =
  | { ok: true; command: string; version: string; data: T; warnings: QualityIssue[] }
  | { ok: false; command: string; version: string; error: VizError };

export interface RenderReceipt {
  view: ViewId;
  variant?: string;
  mode?: string;
  /** 'explicit' 或推荐理由 */
  reason: string;
  files: { format: 'html' | 'svg' | 'png'; path: string; bytes: number; width?: number; height?: number }[];
  /** 取代 legacy 的 SUMMARY_KEYS */
  counts: Record<string, number>;
  quality: Pick<QualityReport, 'confidence' | 'issues' | 'mapping'>;
  insights: Insight[];
  /** 解析补全后的完整 spec，可原样复用 */
  spec: ViewSpec;
  /** 1–3 行 Markdown 摘要，供 Agent 直接引用 */
  summaryMd: string;
}

export interface InspectReceipt {
  input: string;
  format: import('./data.js').SourceFormat;
  rows: number;
  profile: TableProfile;
  /** 前 5 名 */
  candidates: {
    view: ViewId;
    variant?: string;
    mode?: string;
    score: number;
    reason: string;
    mapping: Record<string, string | string[]>;
    missingRoles: string[];
  }[];
  doc?: { sections: number; headings: number; tables: number; metrics: number; confidence: string };
}

export interface ValidateReceipt {
  view: ViewId;
  valid: boolean;
  mode?: string;
  mapping: Record<string, string | string[]>;
  missingRoles: string[];
  ambiguous: { role: string; columns: string[] }[];
  issues: QualityIssue[];
  /** 可执行的修复建议，如 "把列「金额」映射为 value：--set mapping.value=金额" */
  suggestions: string[];
}
