// 10 套分类配色（原样迁移 legacy bar-basic 的 PALETTES）+ 各套 --acc 覆盖 + OKLCH 色阶。
// ADR-0008：minimal/sketch/pastel/tech 四套主题的分类色由 light/dark 基色派生（见 derivePalette）。
import { lerpOklch, oklabToOklch, oklchToOklab, rgbToOklab, oklabToRgb, hexToRgb, rgbToHex } from './oklch.js';
import { THEMES, type ThemeId } from './tokens.js';

export type PaletteId =
  | 'signal' | 'cinnabar' | 'patina' | 'blueprint' | 'inkwash'
  | 'mono' | 'sundown' | 'dunhuang' | 'aurora' | 'morandi';

export const PALETTE_IDS: readonly PaletteId[] = [
  'signal', 'cinnabar', 'patina', 'blueprint', 'inkwash',
  'mono', 'sundown', 'dunhuang', 'aurora', 'morandi',
];

/** 基色：10 套 × light/dark（legacy 原样）。新主题在此基础上派生，保证同数据可比。 */
const BASE: Record<PaletteId, { light: readonly string[]; dark: readonly string[] }> = {
  signal: {
    light: ['#0f766e', '#e85d3f', '#d99a06', '#2563eb', '#7c3aed', '#059669', '#db2777', '#0891b2'],
    dark: ['#c6f13f', '#ff6b4a', '#ffb224', '#4de3c2', '#7dd3fc', '#f472b6', '#a78bfa', '#facc15'],
  },
  cinnabar: {
    light: ['#b5412f', '#d36a2e', '#8a3324', '#c08a2d', '#6b4f2c', '#a16207', '#0f766e', '#3f3f46'],
    dark: ['#ff8a5c', '#ffd166', '#ef4444', '#fbbf24', '#f97316', '#fef08a', '#5eead4', '#fda4af'],
  },
  patina: {
    light: ['#2f7f78', '#386641', '#588157', '#a3b18a', '#c69a4a', '#344e41', '#7f5539', '#40916c'],
    dark: ['#67a58d', '#a7c957', '#d2b46a', '#8ecae6', '#c9f2c7', '#ffd166', '#bde0fe', '#80ed99'],
  },
  blueprint: {
    light: ['#2f5fd0', '#0b3b75', '#3b82f6', '#60a5fa', '#1d4ed8', '#0f766e', '#475569', '#93c5fd'],
    dark: ['#7dd3fc', '#38bdf8', '#93c5fd', '#a5f3fc', '#60a5fa', '#22d3ee', '#e0f2fe', '#67e8f9'],
  },
  inkwash: {
    light: ['#171a1e', '#3f4650', '#69707d', '#9299a5', '#6b7280', '#a3a3a3', '#525252', '#d4d4d4'],
    dark: ['#ede9dc', '#d6d3c8', '#b8b4a8', '#8f8b80', '#6e6a61', '#4b4841', '#a8a29e', '#f5f5f4'],
  },
  mono: {
    light: ['#171a1e', '#2f343c', '#555d68', '#7a828d', '#a0a6af', '#c5c8cd', '#3f4650', '#6b6f6a'],
    dark: ['#ede9dc', '#c9c6ba', '#a5a296', '#817e73', '#5e5b52', '#f5f5f4', '#b9b5a8', '#8f8b80'],
  },
  sundown: {
    light: ['#c2410c', '#ea580c', '#f59e0b', '#b91c1c', '#db2777', '#7c2d12', '#f97316', '#a16207'],
    dark: ['#fb923c', '#fbbf24', '#f87171', '#f472b6', '#fdba74', '#fde047', '#fca5a5', '#e879f9'],
  },
  dunhuang: {
    light: ['#35618e', '#4d8a6a', '#b34a38', '#c89b3c', '#7a5c3e', '#2f4f4f', '#8e5a2b', '#5b7a8c'],
    dark: ['#7fb3d5', '#7fc7a3', '#e07a5f', '#e5c07b', '#b0927a', '#81b29a', '#d4a373', '#a8c3cf'],
  },
  aurora: {
    light: ['#0d9488', '#0891b2', '#7c3aed', '#db2777', '#059669', '#2563eb', '#c026d3', '#0f766e'],
    dark: ['#5eead4', '#67e8f9', '#a78bfa', '#f0abfc', '#6ee7b7', '#93c5fd', '#e879f9', '#4ade80'],
  },
  morandi: {
    light: ['#8b9dad', '#c9a7a0', '#a8b5a0', '#b8b0a4', '#9d8fa8', '#c4b198', '#8fa39e', '#ad9b8f'],
    dark: ['#b8c7d4', '#dbc4be', '#c3cfc0', '#d0c9be', '#c0b5c9', '#d9cbb8', '#b5c4bf', '#c9bcb0'],
  },
};

// —— ADR-0008 派生规则（OKLCH 空间，确定性）——
// pastel：向白混合降饱和；sketch：色相微旋 + 彩度收敛的蜡笔色；
// minimal/tech 直接复用 light/dark 基色（主题差异由皮肤层承担）。
function pastelize(hex: string): string {
  return lerpOklch(hex, '#ffffff', 0.32);
}
function crayonize(hex: string, i: number): string {
  const c = oklabToOklch(rgbToOklab(hexToRgb(hex)));
  const h = (c.h + ((i * 37) % 11) - 5 + 360) % 360;
  return rgbToHex(oklabToRgb(oklchToOklab({ l: Math.min(0.82, c.l * 0.98 + 0.02), c: c.c * 0.9, h })));
}

export const PALETTES: Record<PaletteId, Record<ThemeId, readonly string[]>> = Object.fromEntries(
  PALETTE_IDS.map((id): [PaletteId, Record<ThemeId, readonly string[]>] => [id, {
    light: BASE[id].light,
    dark: BASE[id].dark,
    minimal: BASE[id].light,
    pastel: BASE[id].light.map(pastelize),
    sketch: BASE[id].light.map(crayonize),
    tech: BASE[id].dark,
  }]),
) as unknown as Record<PaletteId, Record<ThemeId, readonly string[]>>;

/** 各套配色对 --acc 的覆盖（迁移 _shared.css；未列出的主题沿用主题默认 acc）。 */
export const PALETTE_ACC: Partial<Record<PaletteId, Partial<Record<ThemeId, string>>>> = {
  cinnabar: { light: '#b5412f' },
  patina: { light: '#2f7f78' },
  blueprint: { light: '#2f5fd0' },
  inkwash: { light: '#4b5563' },
  mono: { light: '#171a1e', dark: '#ede9dc' },
  sundown: { light: '#c2410c', dark: '#fb923c' },
  dunhuang: { light: '#b34a38', dark: '#e07a5f' },
  aurora: { light: '#0d9488', dark: '#5eead4' },
  morandi: { light: '#8b9dad', dark: '#b8c7d4' },
};

/** 新主题的配色族：minimal/sketch/pastel 取 light 基色族，tech 取 dark 基色族。 */
const THEME_FAMILY: Record<ThemeId, 'light' | 'dark'> = {
  light: 'light', dark: 'dark', minimal: 'light', sketch: 'light', pastel: 'light', tech: 'dark',
};

export function accentFor(palette: PaletteId, theme: ThemeId): string {
  const acc = PALETTE_ACC[palette];
  // light/dark 保持 legacy 回退链（dark 缺省回退 light acc），新主题按族回退。
  if (theme === 'light' || theme === 'dark') return acc?.[theme] ?? acc?.light ?? THEMES[theme].acc;
  return acc?.[theme] ?? acc?.[THEME_FAMILY[theme]] ?? THEMES[theme].acc;
}

export function paletteColors(palette: PaletteId, theme: ThemeId): readonly string[] {
  return PALETTES[palette][theme];
}

/** 顺序色阶：paper → acc，OKLCH 7 级。 */
export function rampSequential(palette: PaletteId, theme: ThemeId): string[] {
  const t = THEMES[theme];
  const acc = accentFor(palette, theme);
  return Array.from({ length: 7 }, (_, i) => lerpOklch(t.paper, acc, i / 6));
}

/** 发散色阶：neg → paper → acc，OKLCH 9 级。 */
export function rampDiverging(palette: PaletteId, theme: ThemeId): string[] {
  const t = THEMES[theme];
  const acc = accentFor(palette, theme);
  return Array.from({ length: 9 }, (_, i) =>
    i <= 4 ? lerpOklch(t.neg, t.paper, i / 4) : lerpOklch(t.paper, acc, (i - 4) / 4));
}
