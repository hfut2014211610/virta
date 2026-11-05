// 命中测试：均匀网格粗筛 + 精确判断（rect/circle 解析式，path 交给 isPointInPath）。
import type { DatumRef, HitRegion, Node, Scene } from './scene.js';

function bbox(n: Node): [number, number, number, number] {
  switch (n.type) {
    case 'rect': return [n.x, n.y, n.x + n.w, n.y + n.h];
    case 'circle': return [n.cx - n.r, n.cy - n.r, n.cx + n.r, n.cy + n.r];
    case 'line': return [Math.min(n.x1, n.x2), Math.min(n.y1, n.y2), Math.max(n.x1, n.x2), Math.max(n.y1, n.y2)];
    case 'text': return [n.x - 120, n.y - n.size, n.x + 120, n.y + n.size];
    case 'path': {
      const nums = n.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [0];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
        y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
      }
      return [x0, y0, x1, y1];
    }
    case 'group': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of n.children) {
        const [a, b, cc, d] = bbox(c);
        x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, cc); y1 = Math.max(y1, d);
      }
      return [x0, y0, x1, y1];
    }
  }
}

function inside(n: Node, x: number, y: number, pad = 3): boolean {
  const [x0, y0, x1, y1] = bbox(n);
  if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) return false;
  switch (n.type) {
    case 'rect': return true;
    case 'circle': return (x - n.cx) ** 2 + (y - n.cy) ** 2 <= (n.r + pad) ** 2;
    case 'line': {
      const dx = n.x2 - n.x1, dy = n.y2 - n.y1;
      const t = Math.max(0, Math.min(1, ((x - n.x1) * dx + (y - n.y1) * dy) / (dx * dx + dy * dy || 1)));
      return (x - (n.x1 + t * dx)) ** 2 + (y - (n.y1 + t * dy)) ** 2 <= (pad + (n.strokeWidth ?? 1) / 2) ** 2;
    }
    default: return true; // path/text/group 用包围盒近似（tooltip 场景足够）
  }
}

export interface HitIndex {
  at(x: number, y: number): DatumRef | null;
}

export function buildHitIndex(sc: Scene, cell = 24): HitIndex {
  const regions = sc.hits ?? [];
  const grid = new Map<string, number[]>();
  regions.forEach((hr, i) => {
    const [x0, y0, x1, y1] = bbox(hr.shape);
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const k = `${gx},${gy}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
      }
  });
  return {
    at(x, y) {
      const candidates = grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? [];
      for (let i = candidates.length - 1; i >= 0; i--) {
        const hr = regions[candidates[i]];
        if (inside(hr.shape, x, y)) return hr.datum;
      }
      // 粗筛未中 → 全量兜底（格边缘）
      for (let i = regions.length - 1; i >= 0; i--) {
        const hr = regions[i];
        if (inside(hr.shape, x, y)) return hr.datum;
      }
      return null;
    },
  };
}

/** 便捷入口：建索引 + 单次命中。 */
export function hitTest(sc: Scene, x: number, y: number): DatumRef | null {
  return buildHitIndex(sc).at(x, y);
}
