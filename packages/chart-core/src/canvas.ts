// drawCanvas(ctx, scene, dpr)：交互渲染。浏览器专用（Canvas2D API）。
import { FONTS } from '@virta/design-system';
import type { LinearGradientDef, Node, Paint, PatternDef, RadialGradientDef, Scene } from './scene.js';

type Ctx = CanvasRenderingContext2D;
const pathCache = new WeakMap<Node, Path2D>();

function toPaint(ctx: Ctx, p: Paint | undefined, defs: Scene['defs']): string | CanvasGradient | CanvasPattern | undefined {
  if (p === undefined) return undefined;
  if (typeof p === 'string') return p;
  const gd = defs.gradients.find((d) => d.id === p.ref);
  if (gd) {
    const g = ctx.createLinearGradient(gd.x1, gd.y1, gd.x2, gd.y2);
    for (const s of gd.stops) g.addColorStop(s.offset, s.color);
    return g;
  }
  const rd = defs.radials.find((d) => d.id === p.ref);
  if (rd) {
    const g = ctx.createRadialGradient(rd.cx, rd.cy, 0, rd.cx, rd.cy, rd.r);
    for (const s of rd.stops) g.addColorStop(s.offset, s.color);
    return g;
  }
  return '#000';
}

function paintPath(ctx: Ctx, n: Node, p2d: Path2D, defs: Scene['defs']) {
  const fill = toPaint(ctx, n.fill, defs);
  const stroke = toPaint(ctx, n.stroke, defs);
  if (n.opacity !== undefined) ctx.globalAlpha *= n.opacity;
  if (n.shadow) { ctx.shadowOffsetX = n.shadow.dx; ctx.shadowOffsetY = n.shadow.dy; ctx.shadowBlur = n.shadow.blur; ctx.shadowColor = n.shadow.color; }
  if (fill !== undefined && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(p2d); }
  if (stroke !== undefined && stroke !== 'none') {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = n.strokeWidth ?? 1;
    if (n.dash) ctx.setLineDash(n.dash);
    ctx.stroke(p2d);
  }
  ctx.setLineDash([]);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

function clipFor(ctx: Ctx, clipId: string | undefined, defs: Scene['defs']) {
  if (!clipId) return;
  const c = defs.clips.find((d) => d.id === clipId);
  if (!c) return;
  const p = new Path2D();
  for (const n of c.nodes) p.addPath(pathOf(n));
  ctx.clip(p);
}

function pathOf(n: Node): Path2D {
  const cached = pathCache.get(n);
  if (cached) return cached;
  const p = new Path2D();
  if (n.type === 'rect') {
    const r = n.r === undefined ? 0 : Array.isArray(n.r) ? n.r[0] : n.r;
    if (r > 0 && 'roundRect' in p) p.roundRect(n.x, n.y, n.w, n.h, r);
    else p.rect(n.x, n.y, n.w, n.h);
  } else if (n.type === 'path') {
    const pp = new Path2D(n.d); pathCache.set(n, pp); return pp;
  } else if (n.type === 'line') {
    p.moveTo(n.x1, n.y1); p.lineTo(n.x2, n.y2);
  } else if (n.type === 'circle') {
    p.arc(n.cx, n.cy, n.r, 0, Math.PI * 2);
  }
  pathCache.set(n, p);
  return p;
}

function draw(ctx: Ctx, n: Node, defs: Scene['defs']) {
  ctx.save();
  if (n.type === 'group') {
    if (n.transform) ctx.transform(...n.transform);
    clipFor(ctx, n.clip, defs);
    for (const c of n.children) draw(ctx, c, defs);
  } else if (n.type === 'text') {
    clipFor(ctx, n.clip, defs);
    if (n.rotate) { ctx.translate(n.x, n.y); ctx.rotate((n.rotate * Math.PI) / 180); ctx.translate(-n.x, -n.y); }
    ctx.font = `${n.weight ?? 400} ${n.size}px ${FONTS[n.font]}`;
    ctx.textAlign = n.anchor === 'middle' ? 'center' : n.anchor === 'end' ? 'right' : 'left';
    ctx.textBaseline = n.baseline === 'top' ? 'top' : n.baseline === 'middle' ? 'middle' : n.baseline === 'bottom' ? 'bottom' : 'alphabetic';
    if (n.opacity !== undefined) ctx.globalAlpha *= n.opacity;
    const fill = toPaint(ctx, n.fill, defs) ?? '#000';
    ctx.fillStyle = fill;
    ctx.fillText(n.text, n.x, n.y);
    const stroke = toPaint(ctx, n.stroke, defs);
    if (stroke !== undefined && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = n.strokeWidth ?? 1; ctx.strokeText(n.text, n.x, n.y); }
  } else {
    clipFor(ctx, n.clip, defs);
    paintPath(ctx, n, pathOf(n), defs);
  }
  ctx.restore();
}

export function drawCanvas(ctx: Ctx, sc: Scene, dpr = 1) {
  ctx.save();
  ctx.scale(dpr, dpr);
  if (sc.background) { ctx.fillStyle = sc.background; ctx.fillRect(0, 0, sc.width, sc.height); }
  draw(ctx, sc.root, sc.defs);
  ctx.restore();
}

export { pathOf };
