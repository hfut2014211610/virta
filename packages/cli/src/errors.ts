// CliError/fail：CLI 错误的唯一来源（render/compose/assets/skill 等共用）。
// 从 render.ts 拆出以避免 assets.ts ↔ render.ts 循环依赖。
import type { VizError } from '@virta/contracts';

export class CliError extends Error {
  constructor(public viz: VizError) { super(viz.message); }
}
export const fail = (code: VizError['code'], message: string, hint?: string, details?: VizError['details']): never => {
  throw new CliError({ code, message, hint, recoverable: code !== 'INTERNAL', details });
};
