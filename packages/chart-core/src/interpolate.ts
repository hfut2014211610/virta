// interpolateScene(a, b, t)：按节点 id 对齐的补间（§5.3）。
// 数字字段线性插值；文本/枚举取 t<1 时的 a 值；缺失节点直接采用另一侧。
import type { GroupNode, Node, Scene } from './scene.js';

const NUM_KEYS = ['x', 'y', 'w', 'h', 'r', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'size', 'strokeWidth', 'opacity', 'rotate'] as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function flatten(n: Node, out: Map<string, Node>) {
  if (n.id) out.set(n.id, n);
  if (n.type === 'group') for (const c of n.children) flatten(c, out);
}

function blendNode(a: Node, b: Node, t: number): Node {
  const merged = { ...(t < 1 ? a : b) } as Record<string, unknown>;
  for (const k of NUM_KEYS) {
    const av = (a as unknown as Record<string, unknown>)[k], bv = (b as unknown as Record<string, unknown>)[k];
    if (typeof av === 'number' && typeof bv === 'number') merged[k] = lerp(av, bv, t);
    else if (av !== undefined) merged[k] = av;
    else if (bv !== undefined) merged[k] = bv;
  }
  if (a.type === 'group' && b.type === 'group') {
    const bById = new Map<string, Node>();
    b.children.forEach((c) => { if (c.id) bById.set(c.id, c); });
    const used = new Set<string>();
    const children = a.children.map((ca) => {
      const cb = ca.id ? bById.get(ca.id) : undefined;
      if (cb) { used.add(ca.id!); return blendNode(ca, cb, t); }
      return ca;
    });
    for (const cb of b.children) if (cb.id && !used.has(cb.id)) children.push(cb);
    (merged as { children?: Node[] }).children = children;
  }
  return merged as unknown as Node;
}

export function interpolateScene(a: Scene, b: Scene, t: number): Scene {
  const bById = new Map<string, Node>();
  flatten(b.root, bById);
  const walk = (n: Node): Node => (n.id && bById.has(n.id) ? blendNode(n, bById.get(n.id)!, t) : n);
  const root: GroupNode = { ...a.root, children: a.root.children.map(walk) };
  return { ...a, root };
}
