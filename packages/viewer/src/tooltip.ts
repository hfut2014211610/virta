// 共享 tooltip（H2）：单图页与组合页同一实现。
// 定位坐标系由 container 的 bounding rect 决定：单图页传 #chart-box（tip 为盒内 absolute 子元素），
// 组合页传 document.documentElement（tip 为 position:fixed，viewport 坐标）。
// 每次 mousemove 调用方现取 #tooltip 元素——渲染器清空内容时浮层节点可能被整体替换，不得缓存。
import type { DatumRef } from '@virta/chart-core';
import { html, raw, safeColor } from './safe-html.js';

/** 显示数据点浮层；datum.tooltip 为空时等价于 hideTooltip。 */
export function showTooltip(tip: HTMLElement, datum: DatumRef, clientX: number, clientY: number, container: HTMLElement): void {
  const t = datum.tooltip;
  if (!t) { hideTooltip(tip); return; }
  tip.innerHTML = html`<b>${t.title ?? ''}</b>${(t.rows ?? []).map((r) =>
    raw(html`<div><i style="background:${safeColor(r.swatch)}"></i>${r.name} <b>${r.value}</b></div>`),
  )}`;
  tip.style.display = 'block';
  // 先渲染再量尺寸：靠近容器右/下边界时翻到光标另一侧
  const rect = container.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = clientX - rect.left + 14;
  let y = clientY - rect.top + 10;
  if (x + tw > rect.width - 4) x = clientX - rect.left - tw - 10;
  if (y + th > rect.height - 4) y = clientY - rect.top - th - 6;
  tip.style.left = `${Math.max(0, Math.round(x))}px`;
  tip.style.top = `${Math.max(0, Math.round(y))}px`;
}

export function hideTooltip(tip: HTMLElement): void {
  tip.style.display = 'none';
}
