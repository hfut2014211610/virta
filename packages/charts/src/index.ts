// @virta/charts · 图族渲染注册表
export * from './types.js';
import type { ViewId } from '@virta/contracts';
import type { FamilyRenderer } from './types.js';
import { barRenderer } from './bar.js';
import { lineRenderer } from './line.js';

const RENDERERS: Partial<Record<ViewId, FamilyRenderer<never>>> = {
  bar: barRenderer as never,
  line: lineRenderer as never,
};

export function getRenderer(view: ViewId): FamilyRenderer<never> | undefined {
  return RENDERERS[view];
}
export const RENDERED_VIEWS = Object.keys(RENDERERS) as ViewId[];
