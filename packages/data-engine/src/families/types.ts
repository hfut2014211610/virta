// 图族适配器接口（§5.1）。adaptRaw 输出与 legacy to_* 同形（golden 对拍基准）。
import type {
  Insight, QualityReport, Table, TableProfile, ViewId, ViewSpec,
} from '@virta/contracts';
import type { Raw } from './barline.js';

export interface ScoreResult {
  score: number;
  reason: string;
  mapping: Record<string, string | string[]>;
  variant?: string;
  mode?: string;
  missingRoles: string[];
}

export interface FamilyAdapter<M = unknown> {
  view: ViewId;
  /** legacy to_*(raw) 同形输出；失败抛 Error（消息与 legacy 一致） */
  adaptRaw(raw: Raw): M;
  /** Table + spec → model + 契约化质量报告 */
  adapt(table: Table, spec: ViewSpec): { model: M; quality: QualityReport };
  /** 推荐引擎打分（§5.1 打分表） */
  score(profile: TableProfile, table: Table): ScoreResult;
  /** 洞察（中文文案；importance 降序） */
  insights(model: M, spec: ViewSpec): Insight[];
  /** 计数（行/系列/扇区等） */
  counts(model: M): Record<string, number>;
}
