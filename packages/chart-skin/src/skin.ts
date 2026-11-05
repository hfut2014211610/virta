// ADR-0008 皮肤后处理：layout 产出 Scene 后按 ThemeSkin 做确定性改造——
// 文字整倍率、标记细描边、rect 圆角、手绘几何抖动（坐标空间哈希，跨渲染稳定）、描边发光。
// 命中区（sc.hits）与 defs/clips 不动：交互精度与数据语义不受主题影响。
import type { Node, Scene } from '@virta/chart-core';
import type { ThemeSkin } from '@virta/design-system';

const f2 = (v: number) => String(Math.round(v * 100) / 100);

// —— 空间哈希抖动：同一坐标永远得到同一偏移 → 相邻图形共享边不裂开，重复渲染不闪 ——
function hash2(x: number, y: number): number {
  let h = Math.imul(Math.round(x * 8), 374761393) ^ Math.imul(Math.round(y * 8), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function jxy(x: number, y: number, amp: number): [number, number] {
  const a = hash2(x, y);
  const b = hash2(y + 31.7, x - 11.3);
  return [(a - 0.5) * 2 * amp, (b - 0.5) * 2 * amp];
}
const jp = (x: number, y: number, amp: number) => { const [dx, dy] = jxy(x, y, amp); return `${f2(x + dx)} ${f2(y + dy)}`; };

// —— SVG path 解析：归一化为绝对坐标段（H/V→L，S→C，T→Q），供抖动重建 ——
type Seg = { cmd: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z'; n: number[] };
const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function parsePath(d: string): Seg[] | null {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!toks) return null;
  const segs: Seg[] = [];
  let i = 0, cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;         // 现点 / 子路径起点
  let pcx = 0, pcy = 0, pqx = 0, pqy = 0;     // 上一控制点（C/S 与 Q/T 反射用）
  let prevCmd = '';
  const num = () => {
    const t = toks[i++];
    const v = Number(t);
    if (!Number.isFinite(v)) throw new Error('bad num');
    return v;
  };
  try {
    while (i < toks.length) {
      const t = toks[i];
      if (/[a-zA-Z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { segs.push({ cmd: 'Z', n: [] }); cx = sx; cy = sy; prevCmd = cmd; continue; } }
      else if (cmd === 'M' || cmd === 'm') cmd = cmd === 'm' ? 'l' : 'l'; // 隐式后续为 lineto
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const p = PARAMS[C];
      if (p === undefined) return null;
      const raw: number[] = [];
      for (let k = 0; k < p; k++) raw.push(num());
      const ax = (v: number) => (rel ? cx + v : v);
      const ay = (v: number) => (rel ? cy + v : v);
      if (C === 'M') { cx = ax(raw[0]); cy = ay(raw[1]); sx = cx; sy = cy; segs.push({ cmd: 'M', n: [cx, cy] }); }
      else if (C === 'L') { cx = ax(raw[0]); cy = ay(raw[1]); segs.push({ cmd: 'L', n: [cx, cy] }); }
      else if (C === 'H') { cx = ax(raw[0]); segs.push({ cmd: 'L', n: [cx, cy] }); }
      else if (C === 'V') { cy = ay(raw[0]); segs.push({ cmd: 'L', n: [cx, cy] }); }
      else if (C === 'C') {
        const n = [ax(raw[0]), ay(raw[1]), ax(raw[2]), ay(raw[3]), ax(raw[4]), ay(raw[5])];
        pcx = n[2]; pcy = n[3]; cx = n[4]; cy = n[5]; segs.push({ cmd: 'C', n });
      } else if (C === 'S') {
        const x2 = ax(raw[0]), y2 = ay(raw[1]), x = ax(raw[2]), y = ay(raw[3]);
        const x1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cx - pcx : cx;
        const y1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cy - pcy : cy;
        pcx = x2; pcy = y2; cx = x; cy = y;
        segs.push({ cmd: 'C', n: [x1, y1, x2, y2, x, y] });
      } else if (C === 'Q') {
        const n = [ax(raw[0]), ay(raw[1]), ax(raw[2]), ay(raw[3])];
        pqx = n[0]; pqy = n[1]; cx = n[2]; cy = n[3]; segs.push({ cmd: 'Q', n });
      } else if (C === 'T') {
        const x = ax(raw[0]), y = ay(raw[1]);
        const x1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cx - pqx : cx;
        const y1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cy - pqy : cy;
        pqx = x1; pqy = y1; cx = x; cy = y;
        segs.push({ cmd: 'Q', n: [x1, y1, x, y] });
      } else if (C === 'A') {
        const n = [raw[0], raw[1], raw[2], raw[3], raw[4], ax(raw[5]), ay(raw[6])];
        cx = n[5]; cy = n[6]; segs.push({ cmd: 'A', n });
      }
      prevCmd = cmd;
    }
    return segs.length ? segs : null;
  } catch { return null; }
}

/** 抖动 path：坐标对逐点加空间哈希偏移；A 命令只抖终点（半径/旗标保持几何语义）。 */
function roughPath(d: string, amp: number): string | null {
  const segs = parsePath(d);
  if (!segs) return null;
  let out = '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) for (let k = 0; k + 1 < s.n.length; k += 2) {
    minX = Math.min(minX, s.n[k]); maxX = Math.max(maxX, s.n[k]);
    minY = Math.min(minY, s.n[k + 1]); maxY = Math.max(maxY, s.n[k + 1]);
  }
  if (!Number.isFinite(minX)) return null;
  // 小图元减幅，避免抖动吞掉形状
  const a = Math.min(amp, Math.max(0.3, (maxX - minX) * 0.05), Math.max(0.3, (maxY - minY) * 0.05));
  const coord = (x: number, y: number) => jp(x, y, a);
  for (const s of segs) {
    if (s.cmd === 'Z') { out += 'Z'; continue; }
    if (s.cmd === 'A') {
      const [rx, ry, rot, laf, swf, x, y] = s.n;
      out += `A${f2(rx)} ${f2(ry)} ${f2(rot)} ${laf} ${swf} ${coord(x, y)}`;
      continue;
    }
    const pts: string[] = [];
    for (let k = 0; k + 1 < s.n.length; k += 2) pts.push(coord(s.n[k], s.n[k + 1]));
    out += `${s.cmd}${pts.join(' ')} `;
  }
  return out.trim();
}

function hexToRgba(hex: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

/** 递归处理子树；返回可能被替换的新节点（rough 时 rect/circle/line → path）。 */
function restyle(n: Node, skin: ThemeSkin): Node {
  if (n.type === 'group') {
    n.children = n.children.map((c) => restyle(c, skin));
    return n;
  }
  if (n.type === 'text') {
    if (skin.typeScale !== 1) n.size = Math.round(n.size * skin.typeScale * 100) / 100;
    return n;
  }
  let node: Node = n;
  // —— 手绘几何 ——
  if (skin.rough > 0) {
    if (n.type === 'line') {
      const len = Math.hypot(n.x2 - n.x1, n.y2 - n.y1);
      const segs = Math.max(1, Math.min(4, Math.floor(len / 60)));
      const pts: string[] = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        pts.push(jp(n.x1 + (n.x2 - n.x1) * t, n.y1 + (n.y2 - n.y1) * t, skin.rough));
      }
      node = { ...n, type: 'path', d: `M${pts.join('L')}` } as Node;
    } else if (n.type === 'rect') {
      const a = Math.min(skin.rough, n.w * 0.15, n.h * 0.15);
      const c = [
        jp(n.x, n.y, a), jp(n.x + n.w, n.y, a), jp(n.x + n.w, n.y + n.h, a), jp(n.x, n.y + n.h, a),
      ];
      node = { ...n, type: 'path', d: `M${c[0]}L${c[1]}L${c[2]}L${c[3]}Z` } as Node;
    } else if (n.type === 'circle') {
      const a = Math.min(skin.rough, n.r * 0.4);
      const pts: string[] = [];
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * Math.PI * 2;
        pts.push(jp(n.cx + n.r * Math.cos(an), n.cy + n.r * Math.sin(an), a));
      }
      node = { ...n, type: 'path', d: `M${pts.join('L')}Z` } as Node;
    } else if (n.type === 'path') {
      const d = roughPath(n.d, skin.rough);
      if (d) node = { ...n, d };
    }
  }
  // —— rect 圆角倍率 ——
  if (skin.markRadiusScale !== 1 && node.type === 'rect' && node.r !== undefined) {
    const rr = Array.isArray(node.r) ? node.r[0] : node.r;
    node = { ...node, r: Math.max(0, rr * skin.markRadiusScale) };
  }
  // —— 标记细描边（仅带 datum 的数据图元）——
  if (skin.markStroke && node.datum && node.fill !== undefined && node.fill !== 'none' && node.stroke === undefined) {
    node = { ...node, stroke: skin.markStroke.color, strokeWidth: skin.markStroke.width };
  }
  // —— 描边发光（tech：线/轮廓类图元）——
  if (skin.glow && typeof node.stroke === 'string' && (node.fill === undefined || node.fill === 'none')) {
    const c = hexToRgba(node.stroke, 0.4);
    if (c) node = { ...node, shadow: { dx: 0, dy: 0, blur: 10, color: c } };
  }
  return node;
}

/** 对整幅 Scene 应用皮肤。原地修改并返回同一 Scene；hits/defs/clips 不受影响。 */
export function applySkin(sc: Scene, skin: ThemeSkin): Scene {
  if (skin.typeScale === 1 && skin.rough === 0 && !skin.markStroke && !skin.glow && skin.markRadiusScale === 1) return sc;
  sc.root.children = sc.root.children.map((c) => restyle(c, skin));
  return sc;
}
