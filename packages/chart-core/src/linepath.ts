// ADR-0011/A9 统一折线路径：null 表示未观测点，按缺口切段；step 用 step-middle
//（相邻点中点跳变，首尾补半格）；connectGaps 开时缺口用虚线桥接（由调用方按 gap 标记区分）。
export interface PathPoint { x: number; y: number }
export interface PathSeg { d: string; /** 缺口桥接段（connectGaps 时产生，调用方画虚线） */ gap?: boolean }

const P = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;

function segPath(pts: PathPoint[], style: 'smooth' | 'straight' | 'step'): string {
  if (pts.length === 1) return ''; // 单点不画线，只保留标记
  if (style === 'step') {
    // step-middle：从首点出发，在每两相邻点中点跳变，最后水平延伸到末点
    let d = `M${P(pts[0]!.x, pts[0]!.y)}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1]!.x + pts[i]!.x) / 2;
      d += ` H${mx.toFixed(2)} V${pts[i]!.y.toFixed(2)}`;
    }
    return d + ` H${pts[pts.length - 1]!.x.toFixed(2)}`;
  }
  if (style === 'smooth' && pts.length > 2) {
    let d = `M${P(pts[0]!.x, pts[0]!.y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1]! : pts[i]!;
      const p1 = pts[i]!, p2 = pts[i + 1]!;
      const p3 = i + 2 < pts.length ? pts[i + 2]! : p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${P(c1.x, c1.y)} ${P(c2.x, c2.y)} ${P(p2.x, p2.y)}`;
    }
    return d;
  }
  return pts.map((p, i) => `${i ? 'L' : 'M'}${P(p.x, p.y)}`).join(' ');
}

/**
 * linePath(points, style, opts) → 子路径数组。
 * null 点为未观测：按缺口切段；connectGaps 时相邻实段之间补一段直线（gap:true，画虚线）。
 */
export function linePath(
  points: (PathPoint | null)[],
  style: 'smooth' | 'straight' | 'step',
  opts?: { connectGaps?: boolean },
): PathSeg[] {
  const segs: PathSeg[] = [];
  let cur: PathPoint[] = [];
  let lastEnd: PathPoint | null = null;
  const flush = () => {
    if (cur.length > 1) segs.push({ d: segPath(cur, style) });
    if (cur.length) lastEnd = cur[cur.length - 1]!;
    cur = [];
  };
  for (const p of points) {
    if (p === null) {
      flush();
      if (!opts?.connectGaps) lastEnd = null;
      continue;
    }
    const le = lastEnd as PathPoint | null;
    if (!cur.length && opts?.connectGaps && le && le !== p) {
      segs.push({ d: `M${P(le.x, le.y)} L${P(p.x, p.y)}`, gap: true });
      lastEnd = null;
    }
    cur.push(p);
  }
  flush();
  return segs;
}
