// OKLCH / CIELAB 颜色换算（自实现，不引依赖）。§5.2：色阶在 OKLCH 插值；ΔE76 用 CIELAB。
export type Rgb = { r: number; g: number; b: number }; // 0..1
export type Lab = { l: number; a: number; b: number };
export type Oklch = { l: number; c: number; h: number }; // h 单位：度

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// ---- OKLab/OKLCH（Björn Ottosson 矩阵） ----
export function rgbToOklab({ r, g, b }: Rgb): Lab {
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ l, a, b }: Lab): Rgb {
  const l3 = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m3 = Math.pow(l - 0.1055613458 * a - 0.0638541729 * b, 3);
  const s3 = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
  return {
    r: fromLinear(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: fromLinear(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: fromLinear(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

export const oklabToOklch = ({ l, a, b }: Lab): Oklch => ({
  l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
});
export const oklchToOklab = ({ l, c, h }: Oklch): Lab => ({
  l, a: c * Math.cos((h * Math.PI) / 180), b: c * Math.sin((h * Math.PI) / 180),
});

/** OKLCH 空间插值（色相走最短路径），返回 hex。 */
export function lerpOklch(hexA: string, hexB: string, t: number): string {
  const A = oklabToOklch(rgbToOklab(hexToRgb(hexA)));
  const B = oklabToOklch(rgbToOklab(hexToRgb(hexB)));
  let dh = B.h - A.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  // 低彩度端不参与色相插值，避免绕灰点旋转
  const h = A.c < 1e-4 ? B.h : B.c < 1e-4 ? A.h : A.h + dh * t;
  return rgbToHex(oklabToRgb(oklchToOklab({ l: A.l + (B.l - A.l) * t, c: A.c + (B.c - A.c) * t, h })));
}

// ---- CIELAB（ΔE76 用） ----
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65.x);
  const fy = f(0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl);
  const fz = f((0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const labOf = (hex: string) => rgbToLab(hexToRgb(hex));

/** CIE76 ΔE（CIELAB 欧氏距离）。 */
export function deltaE76(hexA: string, hexB: string): number {
  const A = labOf(hexA), B = labOf(hexB);
  return Math.hypot(A.l - B.l, A.a - B.a, A.b - B.b);
}

// ---- WCAG 对比度 ----
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [hi, lo] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
