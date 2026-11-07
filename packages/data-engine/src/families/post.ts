// ADR-0012 视图后处理钩子（C2）：以 view 为键注册；per-view bundle 只导入本视图的钩子。
import type { PostHook } from '../pipeline.js';
import { ordinalOf } from '../time/zoned.js';
import { toLine3d, toLine3dCurve } from './line3d.js';
import type { Raw } from './barline.js';
import type { ViewSpec } from '@virta/contracts';
import type { GanttModel } from './gantt.js';

/** gantt 今日线：按 spec.time 的 asOf+tz 计算（ADR-0010/F3；运行期不取当前时刻）。 */
export const ganttPost: PostHook<GanttModel> = (m, { resolved }) => {
  const rel = ordinalOf(resolved.asOfMs, resolved.tz) - (m.baseOrd ?? 0);
  m.today = m.baseOrd !== null && rel >= 0 && rel <= m.span ? Math.floor(rel) : null;
  return m;
};

/** line3d curve 变体：x/y/z 数值列 → 三维空间轨迹模型（其余变体走 toLine3d）。 */
export const line3dToModel = (raw: Raw, spec?: ViewSpec) =>
  spec?.variant === 'curve' ? toLine3dCurve(raw) : toLine3d(raw);

export const POST_HOOKS = { gantt: ganttPost } as const;
