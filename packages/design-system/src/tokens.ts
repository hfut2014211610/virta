// design-system token 唯一来源（§5.2）。色值取自 legacy 主题变量与 _shared.css。
export type ThemeId = 'light' | 'dark';

/** 语义色板。`panel`/`pos`/`warn` 为 legacy 未单列项，取值见 IMPLEMENTATION_NOTES。 */
export interface ThemeTokens {
  bg: string; paper: string; panel: string;
  ink: string; muted: string; faint: string;
  line: string; line2: string; grid: string;
  acc: string; neg: string; pos: string; warn: string;
  tip: string; tipInk: string; shadow: string;
}

export const SHADOWS: Record<ThemeId, { sm: string; md: string; lg: string }> = {
  light: {
    sm: '0 2px 8px rgba(23,26,30,.06)',
    md: '0 10px 36px rgba(23,26,30,.08)',
    lg: '0 16px 48px rgba(23,26,30,.12)',
  },
  dark: {
    sm: '0 2px 8px rgba(0,0,0,.30)',
    md: '0 10px 36px rgba(0,0,0,.40)',
    lg: '0 16px 48px rgba(0,0,0,.50)',
  },
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  /** Meridian · 暖纸色 + 墨色 + 铜绿强调 */
  light: {
    bg: '#f6f3ec', paper: '#fffdf7', panel: '#fffdf7',
    ink: '#171a1e', muted: '#6b6f6a', faint: '#8e928a',
    line: '#e2ded2', line2: '#d1ccc0', grid: 'rgba(23,26,30,.06)',
    acc: '#0f766e', neg: '#b5412f', pos: '#0f766e', warn: '#c69a4a',
    tip: '#171a1e', tipInk: '#fffdf7', shadow: SHADOWS.light.md,
  },
  /** Pulse · 炭黑底 + 荧光绿强调 */
  dark: {
    bg: '#0d0e0a', paper: '#131410', panel: '#131410',
    ink: '#ede9dc', muted: '#9aa08a', faint: '#5e6450',
    line: '#23261d', line2: '#2e3323', grid: 'rgba(237,233,220,.05)',
    acc: '#c6f13f', neg: '#ff6b4a', pos: '#c6f13f', warn: '#ffb224',
    tip: '#ede9dc', tipInk: '#0d0e0a', shadow: SHADOWS.dark.md,
  },
};

export const SPACING = [4, 8, 12, 16, 24, 32, 48] as const;
export const RADII = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;
export const MOTION = {
  fast: 160, base: 320, enter: 600,
  ease: 'cubic-bezier(.2,.7,.2,1)',
} as const;

const CN_STACK = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC"';

/** 字体角色：display=Fraunces(仅拉丁子集)，body=中文系统栈，mono=JetBrains Mono。 */
export const FONTS = {
  // 浏览器 @font-face 用别名（VirDisplay/VirMono）；栈内同时保留 TTF 内部族名（Fraunces/JetBrains Mono）供 resvg fontdb 匹配
  display: `"VirDisplay",Fraunces,Georgia,${CN_STACK},serif`,
  body: `${CN_STACK},sans-serif`,
  mono: `"VirMono","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,${CN_STACK},monospace`,
} as const;

/** 子集字体的 unicode-range（与 scripts/fonts/subset.py 一致）。 */
export const FONT_UNICODE_RANGE =
  'U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2030,U+2190-2193,U+00D7,U+2212,U+FFE5';
