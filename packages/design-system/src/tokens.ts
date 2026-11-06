// design-system token 唯一来源（§5.2）。色值取自 legacy 主题变量与 _shared.css。
// ADR-0008：light/dark 之外新增 minimal/sketch/pastel/tech 四套图表主题。
export const THEME_IDS = ['light', 'dark', 'minimal', 'sketch', 'pastel', 'tech'] as const;
export type ThemeId = typeof THEME_IDS[number];

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
  minimal: {
    sm: '0 1px 2px rgba(15,23,42,.05)',
    md: '0 4px 16px rgba(15,23,42,.06)',
    lg: '0 12px 32px rgba(15,23,42,.10)',
  },
  sketch: {
    sm: '0 2px 8px rgba(64,57,44,.07)',
    md: '0 8px 28px rgba(64,57,44,.09)',
    lg: '0 14px 40px rgba(64,57,44,.13)',
  },
  pastel: {
    sm: '0 2px 10px rgba(47,58,85,.05)',
    md: '0 10px 34px rgba(47,58,85,.08)',
    lg: '0 18px 50px rgba(47,58,85,.12)',
  },
  tech: {
    sm: '0 2px 8px rgba(0,0,0,.35)',
    md: '0 10px 36px rgba(0,0,0,.45)',
    lg: '0 16px 48px rgba(0,0,0,.55)',
  },
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  /** Meridian · 暖纸色 + 墨色 + 铜绿强调 */
  light: {
    bg: '#f6f3ec', paper: '#fffdf7', panel: '#fffdf7',
    ink: '#171a1e', muted: '#6b6f6a', faint: '#72766f',
    line: '#e2ded2', line2: '#d1ccc0', grid: 'rgba(23,26,30,.06)',
    acc: '#0f766e', neg: '#b5412f', pos: '#0f766e', warn: '#c69a4a',
    tip: '#171a1e', tipInk: '#fffdf7', shadow: SHADOWS.light.md,
  },
  /** Pulse · 炭黑底 + 荧光绿强调 */
  dark: {
    bg: '#0d0e0a', paper: '#131410', panel: '#131410',
    ink: '#ede9dc', muted: '#9aa08a', faint: '#7c8170',
    line: '#23261d', line2: '#2e3323', grid: 'rgba(237,233,220,.05)',
    acc: '#c6f13f', neg: '#ff6b4a', pos: '#c6f13f', warn: '#ffb224',
    tip: '#ede9dc', tipInk: '#0d0e0a', shadow: SHADOWS.dark.md,
  },
  /** Minimal · 极简卡片：冷灰白底 + 细边框 + 蓝 accent（参考 shadcn new-york） */
  minimal: {
    bg: '#f8fafc', paper: '#ffffff', panel: '#ffffff',
    ink: '#0f172a', muted: '#475569', faint: '#6a7689',
    line: '#e2e8f0', line2: '#cbd5e1', grid: 'rgba(15,23,42,.05)',
    acc: '#2563eb', neg: '#dc2626', pos: '#16a34a', warn: '#d97706',
    tip: '#0f172a', tipInk: '#ffffff', shadow: SHADOWS.minimal.md,
  },
  /** Sketch · 手绘草图：暖纸底 + 蜡笔色 + 墨线（参考 roughviz） */
  sketch: {
    bg: '#f6efdd', paper: '#fdf8ec', panel: '#fdf8ec',
    ink: '#40392c', muted: '#6e6353', faint: '#7a705b',
    line: '#ddd0b4', line2: '#cbbd97', grid: 'rgba(96,82,55,.09)',
    acc: '#c05f3c', neg: '#b5433a', pos: '#56805a', warn: '#b98d2f',
    tip: '#40392c', tipInk: '#fdf8ec', shadow: SHADOWS.sketch.md,
  },
  /** Pastel · 现代柔彩：浅蓝白底 + 低饱和柔和色块（参考 nivo） */
  pastel: {
    bg: '#f4f5fa', paper: '#ffffff', panel: '#ffffff',
    ink: '#2f3a55', muted: '#5a6a8c', faint: '#6b768c',
    line: '#e3e6f0', line2: '#cfd4e6', grid: 'rgba(47,58,85,.05)',
    acc: '#7a6fd0', neg: '#d96a7f', pos: '#5aa98c', warn: '#d9a05b',
    tip: '#2f3a55', tipInk: '#ffffff', shadow: SHADOWS.pastel.md,
  },
  /** Tech · 深色科技：深蓝灰底 + 适度明亮数据色（参考 Highcharts dark stock） */
  tech: {
    bg: '#0a1120', paper: '#101a30', panel: '#101a30',
    ink: '#dbe6f7', muted: '#8fa1c4', faint: '#7583a0',
    line: '#1d2c4d', line2: '#2a3d68', grid: 'rgba(110,150,230,.09)',
    acc: '#56c8f5', neg: '#ff7a7a', pos: '#4ade80', warn: '#fbbf24',
    tip: '#1b2a4a', tipInk: '#dbe6f7', shadow: SHADOWS.tech.md,
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
