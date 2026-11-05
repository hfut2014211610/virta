// toSVG(scene)：确定性输出——坐标 2 位小数、属性顺序固定，便于快照测试（§5.3）。
import { FONTS } from '@virta/design-system';
import type { ClipDef, LinearGradientDef, Node, Paint, PatternDef, RadialGradientDef, Scene } from './scene.js';

const f2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paint = (p: Paint | undefined) => (p === undefined ? undefined : typeof p === 'string' ? p : `url(#${p.ref})`);

function commonAttrs(n: Node): string {
  let s = '';
  const fill = paint(n.fill);
  const stroke = paint(n.stroke);
  if (fill !== undefined) s += ` fill="${esc(fill)}"`;
  if (stroke !== undefined) s += ` stroke="${esc(stroke)}"`;
  if (n.strokeWidth !== undefined) s += ` stroke-width="${f2(n.strokeWidth)}"`;
  if (n.opacity !== undefined) s += ` opacity="${f2(n.opacity)}"`;
  if (n.dash) s += ` stroke-dasharray="${n.dash.map(f2).join(',')}"`;
  if (n.clip) s += ` clip-path="url(#${esc(n.clip)})"`;
  if (n.shadow) s += ` filter="drop-shadow(${f2(n.shadow.dx)}px ${f2(n.shadow.dy)}px ${f2(n.shadow.blur)}px ${esc(n.shadow.color)})"`;
  if (n.id) s += ` id="${esc(n.id)}"`;
  return s;
}

function grad(gd: LinearGradientDef | RadialGradientDef, radial: boolean): string {
  const stops = gd.stops.map((s) =>
    `<stop offset="${f2(s.offset * 100)}%" stop-color="${esc(s.color)}"${s.opacity !== undefined ? ` stop-opacity="${f2(s.opacity)}"` : ''}/>`).join('');
  return radial
    ? `<radialGradient id="${esc(gd.id)}" cx="${f2((gd as RadialGradientDef).cx)}" cy="${f2((gd as RadialGradientDef).cy)}" r="${f2((gd as RadialGradientDef).r)}">${stops}</radialGradient>`
    : `<linearGradient id="${esc(gd.id)}" x1="${f2((gd as LinearGradientDef).x1)}" y1="${f2((gd as LinearGradientDef).y1)}" x2="${f2((gd as LinearGradientDef).x2)}" y2="${f2((gd as LinearGradientDef).y2)}">${stops}</linearGradient>`;
}

function pat(p: PatternDef): string {
  return `<pattern id="${esc(p.id)}" width="${f2(p.width)}" height="${f2(p.height)}" patternUnits="userSpaceOnUse">${p.nodes.map(node).join('')}</pattern>`;
}
function clip(c: ClipDef): string {
  return `<clipPath id="${esc(c.id)}">${c.nodes.map(node).join('')}</clipPath>`;
}

export function node(n: Node): string {
  const a = commonAttrs(n);
  switch (n.type) {
    case 'group': {
      const t = n.transform ? ` transform="matrix(${n.transform.map(f2).join(' ')})"` : '';
      return `<g${t}${a}>${n.children.map(node).join('')}</g>`;
    }
    case 'rect': {
      const r = n.r === undefined ? '' : ` rx="${f2(Array.isArray(n.r) ? n.r[0] : n.r)}"`;
      return `<rect x="${f2(n.x)}" y="${f2(n.y)}" width="${f2(n.w)}" height="${f2(n.y + n.h >= 0 ? n.h : 0)}"${r}${a}/>`;
    }
    case 'path': return `<path d="${n.d}"${a}/>`;
    case 'line': return `<line x1="${f2(n.x1)}" y1="${f2(n.y1)}" x2="${f2(n.x2)}" y2="${f2(n.y2)}"${a}/>`;
    case 'circle': return `<circle cx="${f2(n.cx)}" cy="${f2(n.cy)}" r="${f2(n.r)}"${a}/>`;
    case 'text': {
      const fam = ` font-family='${FONTS[n.font].replace(/"/g, '&quot;')}'`;
      const size = ` font-size="${f2(n.size)}"`;
      const w = n.weight !== undefined ? ` font-weight="${n.weight}"` : '';
      const an = n.anchor && n.anchor !== 'start' ? ` text-anchor="${n.anchor}"` : '';
      const dy = n.baseline === 'top' ? ` dominant-baseline="text-before-edge"`
        : n.baseline === 'middle' ? ` dominant-baseline="central"`
        : n.baseline === 'bottom' ? ` dominant-baseline="text-after-edge"` : '';
      const rot = n.rotate ? ` transform="rotate(${f2(n.rotate)} ${f2(n.x)} ${f2(n.y)})"` : '';
      return `<text x="${f2(n.x)}" y="${f2(n.y)}"${fam}${size}${w}${an}${dy}${rot}${a}>${esc(n.text)}</text>`;
    }
  }
}

export function toSVG(sc: Scene): string {
  const defs: string[] = [];
  for (const gd of sc.defs.gradients) defs.push(grad(gd, false));
  for (const rd of sc.defs.radials) defs.push(grad(rd, true));
  for (const p of sc.defs.patterns) defs.push(pat(p));
  for (const c of sc.defs.clips) defs.push(clip(c));
  const bg = sc.background ? `<rect x="0" y="0" width="${f2(sc.width)}" height="${f2(sc.height)}" fill="${esc(sc.background)}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(sc.width)} ${f2(sc.height)}" width="${f2(sc.width)}" height="${f2(sc.height)}" role="img">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${bg}${node(sc.root)}</svg>`;
}
