// 版面检查器（H6）：对已成形 Scene 做四类静态检查——
// ① 文字互相重叠（相交面积 > 较小者的 15%）error
// ② 文字超出画布（超过 2px）error
// ③ 文字对比度不足（<3:1，WCAG 相对亮度）warn
// ④ 非有限坐标（NaN/Infinity）error
// 阈值写成常量并配有正/反例单测；调阈值需写 ADR。
import type { Node, Scene } from './scene.js';
import type { MetricFontRole } from './measure.js';

export type MeasureFn = (text: string, font: MetricFontRole, size: number) => number;

export type LintKind = 'text-overlap' | 'text-clipped' | 'low-contrast' | 'non-finite';
export interface LayoutIssue {
  kind: LintKind;
  severity: 'error' | 'warn';
  /** 涉及的文字（overlap 为一对） */
  texts: string[];
  detail: string;
}

export const LINT_OVERLAP_RATIO = 0.15;
export const LINT_CLIP_TOLERANCE = 2;
export const LINT_MIN_CONTRAST = 3;

type TextNode = Extract<Node, { type: 'text' }>;
type Box = [number, number, number, number];

const walk = (root: Node[], out: Node[] = []): Node[] => {
  for (const n of root) { out.push(n); if (n.type === 'group') walk(n.children, out); }
  return out;
};

/** 文本包围盒（未旋转）；行高近似 1.2em，alphabetic 基线按 0.8/0.2 分配。 */
function textBox(n: TextNode, measure: MeasureFn): Box {
  const w = measure(n.text, n.font, n.size), h = n.size * 1.2;
  const x0 = n.anchor === 'middle' ? n.x - w / 2 : n.anchor === 'end' ? n.x - w : n.x;
  const y0 = n.baseline === 'top' ? n.y : n.baseline === 'middle' ? n.y - h / 2
    : n.baseline === 'bottom' ? n.y - h : n.y - h * 0.8;
  return [x0, y0, x0 + w, y0 + h];
}

/** 旋转后的轴对齐包围盒：绕锚点 (n.x,n.y) 旋转 bbox 四角取极值。 */
function rotatedBox(n: TextNode, b: Box): Box {
  const a = (n.rotate ?? 0) * Math.PI / 180;
  if (!a) return b;
  const c = Math.cos(a), s = Math.sin(a);
  const pts = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([px, py]) => {
    const dx = px! - n.x, dy = py! - n.y;
    return [n.x + dx * c - dy * s, n.y + dx * s + dy * c];
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const intersectArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const boxCenter = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// —— 颜色 → [r,g,b] 0..1（仅 #hex 与 rgb()/rgba()；其余返回 null 跳过）——
function parseColor(c: unknown): [number, number, number] | null {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((x) => x + x).join('');
    else h = h.slice(0, 6);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  return null;
}
const blend = (fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] =>
  [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
const lum = (rgb: [number, number, number]) => {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** 检查 node 的全部数值字段与 path d 是否为有限值。 */
function nonFinite(n: Node): boolean {
  const rec = n as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'datum' || k === 'children') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) return true;
    if (k === 'd' && typeof v === 'string' && /NaN|Infinity/.test(v)) return true;
    if (k === 'transform' && Array.isArray(v) && v.some((x) => !Number.isFinite(x))) return true;
    if ((k === 'x' || k === 'y' || k === 'w' || k === 'h' || k === 'cx' || k === 'cy' || k === 'r' ||
      k === 'x1' || k === 'x2' || k === 'y1' || k === 'y2' || k === 'size' || k === 'opacity') &&
      typeof v === 'number' && !Number.isFinite(v)) return true;
  }
  if (n.type === 'group') return n.children.some(nonFinite);
  return false;
}

export function lintScene(scene: Scene, measure: MeasureFn, opts?: { paper?: string; bounds?: [number, number, number, number] }): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const nodes = walk(scene.root.children);
  const paper = parseColor(opts?.paper ?? scene.background ?? '#ffffff') ?? [1, 1, 1];
  // 组合页面板：节点为全画布绝对坐标，越界判定应基于面板内框而非 0 基宽高
  const [bx0, by0, bx1, by1] = opts?.bounds ?? [0, 0, scene.width, scene.height];
  const texts: { n: TextNode; box: Box }[] = [];

  // ④ 非有限坐标
  for (const n of nodes) {
    if (nonFinite(n)) issues.push({ kind: 'non-finite', severity: 'error', texts: [n.type], detail: `${n.type} 节点含 NaN/Infinity 坐标` });
  }

  // 文本包围盒 + ② 超出画布
  for (const n of nodes) {
    if (n.type !== 'text') continue;
    const box = rotatedBox(n, textBox(n, measure));
    texts.push({ n, box });
    const T = LINT_CLIP_TOLERANCE;
    if (box[0] < bx0 - T || box[1] < by0 - T || box[2] > bx1 + T || box[3] > by1 + T) {
      issues.push({ kind: 'text-clipped', severity: 'error', texts: [n.text],
        detail: `「${n.text.slice(0, 24)}」超出画布（[${box.map((v) => Math.round(v)).join(',')}] vs ${Math.round(bx1 - bx0)}×${Math.round(by1 - by0)}@${Math.round(bx0)},${Math.round(by0)}）` });
    }
  }

  // ① 文字互相重叠：相交面积 > 较小者的 15%
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!, b = texts[j]!;
      const ov = intersectArea(a.box, b.box);
      if (ov <= 0) continue;
      const smaller = Math.min(area(a.box), area(b.box));
      if (smaller > 0 && ov / smaller > LINT_OVERLAP_RATIO) {
        issues.push({ kind: 'text-overlap', severity: 'error', texts: [a.n.text, b.n.text],
          detail: `「${a.n.text.slice(0, 18)}」×「${b.n.text.slice(0, 18)}」重叠 ${(ov / smaller * 100).toFixed(0)}%` });
      }
    }
  }

  // ③ 对比度：文字色 vs 包含其中心点的最上层 rect 填充色（无则 paper）
  const rects = nodes.filter((n): n is Extract<Node, { type: 'rect' }> => n.type === 'rect');
  for (const { n, box } of texts) {
    const fg = parseColor(n.fill);
    if (!fg) continue;
    const [cx, cy] = boxCenter(box);
    let bg: [number, number, number] | null = null;
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]!;
      const rf = parseColor(r.fill);
      if (!rf) continue;
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        bg = r.opacity !== undefined && r.opacity < 1 ? blend(rf, paper, Math.max(0, Math.min(1, r.opacity))) : rf;
        break;
      }
    }
    const base = bg ?? paper;
    const fgc = n.opacity !== undefined && n.opacity < 1 ? blend(fg, base, Math.max(0, Math.min(1, n.opacity))) : fg;
    const ratio = contrast(fgc, base);
    if (ratio < LINT_MIN_CONTRAST) {
      issues.push({ kind: 'low-contrast', severity: 'warn', texts: [n.text],
        detail: `「${n.text.slice(0, 24)}」对比度 ${ratio.toFixed(2)}:1 < ${LINT_MIN_CONTRAST}:1` });
    }
  }

  return issues;
}
