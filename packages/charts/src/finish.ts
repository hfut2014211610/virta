// 共性样式助手：纹理（斜纹/点纹/网格）× 配色（多色/单色/渐变）。
// 用法：const defs = emptyDefs(); fill 换 styleFill(defs, ctx, c, i, accent)；sc.defs = defs。
import type { Defs, Paint } from '@virta/chart-core';
import { emptyDefs } from '@virta/chart-core';
import { accentFor, lerpOklch } from '@virta/design-system';
import type { LayoutContext } from './types.js';
export { emptyDefs };

const TEX_OVERLAY = 'rgba(23,26,30,.34)';

/** 注册纹理 pattern，返回 Paint 引用。texture=none 时不注册。 */
function texPaint(defs: Defs, texture: string, base: Paint, i: number): Paint | null {
  const id = `tex-${texture}-${i}`;
  const bg: { type: 'rect'; x: number; y: number; w: number; h: number; fill: Paint } = { type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: base };
  if (texture === 'hatch') {
    defs.patterns.push({ id, width: 7, height: 7, nodes: [{ type: 'rect', x: 0, y: 0, w: 7, h: 7, fill: base }, { type: 'line', x1: -1, y1: 8, x2: 8, y2: -1, stroke: TEX_OVERLAY, strokeWidth: 1.2 }] });
  } else if (texture === 'dots') {
    defs.patterns.push({ id, width: 7, height: 7, nodes: [{ type: 'rect', x: 0, y: 0, w: 7, h: 7, fill: base }, { type: 'circle', cx: 3.5, cy: 3.5, r: 1.1, fill: TEX_OVERLAY }] });
  } else if (texture === 'grid') {
    defs.patterns.push({ id, width: 8, height: 8, nodes: [{ type: 'rect', x: 0, y: 0, w: 8, h: 8, fill: base }, { type: 'line', x1: 0, y1: 8, x2: 8, y2: 8, stroke: TEX_OVERLAY, strokeWidth: 1 }, { type: 'line', x1: 8, y1: 0, x2: 8, y2: 8, stroke: TEX_OVERLAY, strokeWidth: 1 }] });
  } else return null;
  return { ref: id };
}

/**
 * 统一填充：colorMode（multi 调色板 / mono 单色 accent / gradient 纵向渐变）
 * × texture（none/hatch/dots/grid）。mono/gradient 需传 base=强调色。
 */
export function styleFill(defs: Defs, ctx: LayoutContext, color: string, i: number, base?: string): Paint {
  const texture = String(ctx.options?.['texture'] ?? 'none');
  const mode = String(ctx.options?.['colorMode'] ?? 'multi');
  const src = base ?? accentFor(ctx.palette, ctx.theme);
  let paint: Paint = mode === 'mono' ? src : color;
  if (mode === 'gradient') {
    const gid = `gm-${i}`;
    defs.gradients.push({ id: gid, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: lerpOklch(src, '#ffffff', 0.3) }, { offset: 1, color: lerpOklch(src, '#000000', 0.22) }] });
    paint = { ref: gid };
  }
  if (texture !== 'none') {
    const tp = texPaint(defs, texture, paint, i);
    if (tp) paint = tp;
  }
  return paint;
}

/** 契约选项片段：texture + colorMode（style 组），各图族直接展开。 */
export const STYLE_OPTS = [
  { key: 'texture', label: '纹理', type: 'enum', group: 'style', static: true, default: 'none',
    values: [{ value: 'none', label: '无' }, { value: 'hatch', label: '斜纹' }, { value: 'dots', label: '点纹' }, { value: 'grid', label: '网格' }] },
  { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'multi',
    values: [{ value: 'multi', label: '多色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
] as const;
