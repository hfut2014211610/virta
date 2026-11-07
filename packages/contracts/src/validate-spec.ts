// ADR-0014 严格 spec 校验（C7）：--spec / --set / 专用参数 / compose 面板 / pack.json 统一执行。
// 任何不合法项 → INVALID_SPEC 或 INVALID_OPTION（退出码 2），hint 给最近邻合法写法。
import type { ChartContract } from './contract.js';
import type { ViewSpec, PaletteId } from './spec.js';
import { THEME_IDS, PALETTE_IDS } from './spec.js';
import type { VizError } from './quality.js';
import { VIEW_IDS, VIEW_ALIASES, type ViewId } from './views.js';

/** ViewSpec 顶层键白名单——必须与 spec-schema.ts 的 VIEW_SPEC_SCHEMA.properties 保持一致（测试锁定）。 */
export const VIEW_SPEC_KEYS = [
  'version', 'view', 'variant', 'mode', 'mapping', 'theme', 'palette', 'options',
  'state', 'text', 'annotations', 'format', 'facet', 'layout', 'size', 'time', 'derive', 'page',
] as const;

const STATE_KEYS = ['sort', 'sortBy', 'hiddenSeries', 'filter', 'range', 'focus', 'azimuth', 'tilt', 'zoom', 'explode', 'time', 'query'] as const;
const TEXT_KEYS = ['title', 'subtitle', 'note', 'source', 'unit'] as const;
const TIME_KEYS = ['asOf', 'tz', 'weekStart', 'workdays', 'holidays', 'extraWorkdays'] as const;
const PAGE_KEYS = ['height', 'break'] as const;
const FACET_KEYS = ['column', 'columns', 'sharedScale'] as const;
const FORMAT_KEYS = ['style', 'currency', 'decimals'] as const;
const SIZE_KEYS = ['width', 'height'] as const;

export type ValidateResult = { ok: true; spec: ViewSpec } | { ok: false; error: VizError };

const err = (code: 'INVALID_SPEC' | 'INVALID_OPTION', message: string, hint?: string): ValidateResult =>
  ({ ok: false, error: { code, message, hint, recoverable: true } });

/** 编辑距离（小写归一）；用于 hint 的最近邻建议。 */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[n]!;
}
const nearest = (bad: string, cands: readonly string[]): string | undefined => {
  let best: string | undefined, bd = Infinity;
  for (const c of cands) { const d = lev(bad.toLowerCase(), c.toLowerCase()); if (d < bd) { bd = d; best = c; } }
  return bd <= Math.max(2, Math.floor(bad.length / 2)) ? best : cands[0];
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkKeys(obj: Record<string, unknown>, keys: readonly string[], path: string): string | undefined {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) return `${path}${k}`;
  return undefined;
}

/** 校验单个 spec 对象。contract 为对应视图契约（view 未知时传 undefined，只查结构）。 */
export function validateSpec(spec: unknown, contract: ChartContract | undefined): ValidateResult {
  if (!isObj(spec)) return err('INVALID_SPEC', 'spec 必须是对象', 'virta schema --spec-schema 查看结构');
  const s = spec as Record<string, unknown>;
  const bad = checkKeys(s, VIEW_SPEC_KEYS, 'spec.');
  if (bad) {
    const k = bad.slice(5);
    return err('INVALID_SPEC', `spec 含未知键 ${bad}`, `合法键：${VIEW_SPEC_KEYS.join(' | ')}${nearest(k, VIEW_SPEC_KEYS) ? `；是否想写 ${nearest(k, VIEW_SPEC_KEYS)}` : ''}`);
  }
  if (s['version'] !== undefined && s['version'] !== 1) return err('INVALID_SPEC', `version 必须为 1（收到 ${JSON.stringify(s['version'])}）`);

  // view：resolveView 已由调用方解析为规范 id + variant；这里复核
  const view = s['view'] as string | undefined;
  if (view !== undefined && view !== 'auto' && !VIEW_IDS.includes(view as ViewId)) {
    const alias = VIEW_ALIASES[view];
    return err('INVALID_OPTION', `未知视图 ${view}`, alias ? `别名应解析为 ${alias}（检查调用链）` : `支持：${VIEW_IDS.join(' | ')}；最近：${nearest(view, [...VIEW_IDS]) ?? ''}`);
  }

  // theme / palette / variant / mode
  if (s['theme'] !== undefined && !THEME_IDS.includes(s['theme'] as never))
    return err('INVALID_OPTION', `未知主题 ${JSON.stringify(s['theme'])}`, `支持：${THEME_IDS.join(' | ')}`);
  if (s['palette'] !== undefined && !PALETTE_IDS.includes(s['palette'] as PaletteId))
    return err('INVALID_OPTION', `未知配色 ${JSON.stringify(s['palette'])}`, `支持：${PALETTE_IDS.join(' | ')}；最近：${nearest(String(s['palette']), PALETTE_IDS) ?? ''}`);
  if (contract) {
    if (s['variant'] !== undefined && !contract.variants.some((v) => v.id === s['variant']))
      return err('INVALID_OPTION', `视图 ${contract.view} 无变体 ${JSON.stringify(s['variant'])}`, `支持：${contract.variants.map((v) => v.id).join(' | ')}`);
    if (s['mode'] !== undefined && contract.modes && !contract.modes.some((m) => m.id === s['mode']))
      return err('INVALID_OPTION', `视图 ${contract.view} 无模式 ${JSON.stringify(s['mode'])}`, `支持：${contract.modes.map((m) => m.id).join(' | ')}`);
  }

  // options.*
  if (s['options'] !== undefined) {
    if (!isObj(s['options'])) return err('INVALID_SPEC', 'options 必须是对象');
    for (const [k, v] of Object.entries(s['options'])) {
      const opt = contract?.options.find((o) => o.key === k);
      if (contract && !opt) {
        const near = nearest(k, contract.options.map((o) => o.key));
        return err('INVALID_OPTION', `视图 ${contract.view} 无选项 options.${k}`,
          `支持：${contract.options.map((o) => o.key).join(' | ') || '（无）'}${near ? `；是否想写 --set options.${near}=<值>` : ''}`);
      }
      if (opt) {
        if (opt.type === 'enum' && !opt.values?.some((x) => x.value === v))
          return err('INVALID_OPTION', `options.${k} 非法值 ${JSON.stringify(v)}`,
            `--set options.${k}=${nearest(String(v), (opt.values ?? []).map((x) => x.value)) ?? opt.values?.[0]?.value}（可选 ${(opt.values ?? []).map((x) => x.value).join('|')}）`);
        if (opt.type === 'boolean' && typeof v !== 'boolean')
          return err('INVALID_OPTION', `options.${k} 需 boolean（收到 ${JSON.stringify(v)}）`, `--set options.${k}=${opt.default === true ? 'false' : 'true'}`);
        if (opt.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || (opt.min !== undefined && v < opt.min) || (opt.max !== undefined && v > opt.max)))
          return err('INVALID_OPTION', `options.${k} 需 ${opt.min ?? '-∞'}~${opt.max ?? '+∞'} 数值（收到 ${JSON.stringify(v)}）`, `--set options.${k}=${opt.default}`);
        if (opt.type === 'string' && typeof v !== 'string')
          return err('INVALID_OPTION', `options.${k} 需 string`, `--set options.${k}="${opt.default}"`);
      }
    }
  }

  // 子键白名单
  const subs: [string, readonly string[]][] = [
    ['state', STATE_KEYS], ['text', TEXT_KEYS], ['time', TIME_KEYS],
    ['page', PAGE_KEYS], ['facet', FACET_KEYS], ['format', FORMAT_KEYS], ['size', SIZE_KEYS],
  ];
  for (const [key, keys] of subs) {
    const v = s[key];
    if (v === undefined) continue;
    if (!isObj(v)) return err('INVALID_SPEC', `${key} 必须是对象`);
    const badSub = checkKeys(v, keys, `${key}.`);
    if (badSub) return err('INVALID_SPEC', `未知键 spec.${badSub}`, `合法键：${keys.map((x) => `${key}.${x}`).join(' | ')}`);
  }
  if (s['mapping'] !== undefined && !isObj(s['mapping'])) return err('INVALID_SPEC', 'mapping 必须是对象');
  if (s['annotations'] !== undefined && !Array.isArray(s['annotations'])) return err('INVALID_SPEC', 'annotations 必须是数组');
  if (s['derive'] !== undefined && !Array.isArray(s['derive'])) return err('INVALID_SPEC', 'derive 必须是数组（--set 传 JSON 时注意 shell 引号）');
  return { ok: true, spec: spec as unknown as ViewSpec };
}
