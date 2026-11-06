// Scene 图元（§5.3）：layout 阶段解析成具体色值，渲染器不识 CSS 变量。
export interface LinearGradientDef { id: string; x1: number; y1: number; x2: number; y2: number; stops: { offset: number; color: string; opacity?: number }[] }
export interface RadialGradientDef { id: string; cx: number; cy: number; r: number; stops: { offset: number; color: string; opacity?: number }[] }
export interface PatternDef { id: string; width: number; height: number; nodes: Node[] }
export interface ClipDef { id: string; nodes: Node[] }
export interface Defs { gradients: LinearGradientDef[]; radials: RadialGradientDef[]; patterns: PatternDef[]; clips: ClipDef[] }

export type Paint = string | { ref: string };
export interface Shadow { dx: number; dy: number; blur: number; color: string }
export interface TooltipContent { title: string; rows: { swatch?: string; name: string; value: string; share?: string }[]; footer?: string }
export interface DatumRef { kind: string; index: number; series?: string; label?: string; value?: number; tooltip: TooltipContent }

interface Base {
  id?: string; fill?: Paint; stroke?: Paint; strokeWidth?: number;
  opacity?: number; dash?: number[]; clip?: string; shadow?: Shadow; datum?: DatumRef;
  /** ADR-0008：描边端点形状（dot 网格等需要 round cap） */
  linecap?: 'butt' | 'round' | 'square';
  /** ADR-0009：SVG 输出时包一层 <a href>（仅 http(s)/mailto 应到达这里） */
  link?: string;
}
export type Node =
  | (Base & { type: 'group'; children: Node[]; transform?: [number, number, number, number, number, number] })
  | (Base & { type: 'rect'; x: number; y: number; w: number; h: number; r?: number | [number, number, number, number] })
  | (Base & { type: 'path'; d: string })
  | (Base & { type: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (Base & { type: 'circle'; cx: number; cy: number; r: number })
  | (Base & { type: 'text'; x: number; y: number; text: string; font: 'display' | 'body' | 'mono'; size: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom'; rotate?: number });

export interface HitRegion { shape: Node; datum: DatumRef }
export interface Scene { width: number; height: number; background?: string; defs: Defs; root: GroupNode; hits: HitRegion[] }
export type GroupNode = Extract<Node, { type: 'group' }>;

export const emptyDefs = (): Defs => ({ gradients: [], radials: [], patterns: [], clips: [] });
export const scene = (width: number, height: number, children: Node[] = [], background?: string): Scene => ({
  width, height, background, defs: emptyDefs(), root: { type: 'group', children }, hits: [],
});
export const g = (children: Node[], extra?: Partial<GroupNode>): GroupNode => ({ type: 'group', children, ...extra });
