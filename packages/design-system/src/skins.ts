// ADR-0008：统一主题配置。ChartTheme = 语义色 token（ThemeTokens）+ 皮肤参数（ThemeSkin）。
// 皮肤参数覆盖：字号缩放、网格/坐标轴、图例色块、标记描边与圆角、手绘抖动、发光、卡片圆角。
// 渲染侧消费方式：chart-skin 函数读 t.skin；几何类效果由 applySkin（chart-skin/skin.ts）后处理。
import { THEMES, type ThemeId, type ThemeTokens } from './tokens.js';

export interface ThemeSkin {
  /** 全局字号倍率：applySkin 统一乘到场景内全部 text.size */
  typeScale: number;
  /** y 轴网格线风格（chart-skin/axis 消费） */
  grid: 'solid' | 'dash' | 'dot' | 'none';
  /** 零基线：颜色 token 键 + 宽度（0 = 不画） */
  baseline: { color: 'ink' | 'muted' | 'faint' | 'line2'; width: number };
  /** 静态图例色块圆角 */
  legendRadius: number;
  /** 数据标记（带 datum 的填充图形）细描边；undefined = 不加 */
  markStroke?: { color: string; width: number };
  /** rect 圆角倍率（applySkin），1 = 不变 */
  markRadiusScale: number;
  /** 手绘抖动幅度 px（0 = 关闭）；applySkin 按坐标空间哈希确定性抖动 */
  rough: number;
  /** 描边型图元（线/轮廓）同色发光（tech 主题） */
  glow: boolean;
  /** HTML 卡片壳圆角 → CSS 变量 --r-card/--r-panel/--r-table/--r-tip */
  cardRadius: number; panelRadius: number; tableRadius: number; tipRadius: number;
  /** 页面背景网格纹：尺寸与不透明度 → CSS 变量 --grid-size/--grid-opacity */
  bgGridSize: number; bgGridOpacity: number;
  /** color-scheme 提示（tech/dark 为 dark） */
  colorScheme: 'light' | 'dark';
}

/** 解析后的完整主题：语义色 + 皮肤。 */
export interface ChartTheme extends ThemeTokens {
  skin: ThemeSkin;
}

const BASE_SKIN: ThemeSkin = {
  typeScale: 1, grid: 'solid', baseline: { color: 'ink', width: 1.5 },
  legendRadius: 2, markRadiusScale: 1, rough: 0, glow: false,
  cardRadius: 20, panelRadius: 16, tableRadius: 14, tipRadius: 10,
  bgGridSize: 56, bgGridOpacity: 0.6, colorScheme: 'light',
};

export const SKINS: Record<ThemeId, ThemeSkin> = {
  // light/dark 与改造前渲染逐像素一致：所有字段取现状默认值。
  light: { ...BASE_SKIN },
  dark: { ...BASE_SKIN, colorScheme: 'dark' },
  /** 极简卡片：弱化网格与坐标轴、更大留白感、细描边定义色块 */
  minimal: {
    ...BASE_SKIN,
    typeScale: 1.02, grid: 'solid',
    baseline: { color: 'line2', width: 1 },
    legendRadius: 3,
    markStroke: { color: 'rgba(15,23,42,.10)', width: 0.8 },
    markRadiusScale: 1.3,
    cardRadius: 12, panelRadius: 10, tableRadius: 10, tipRadius: 8,
    bgGridOpacity: 0.3,
  },
  /** 手绘草图：暖纸、抖动轮廓、蜡笔描边、略大字号保证读数 */
  sketch: {
    ...BASE_SKIN,
    typeScale: 1.06, grid: 'solid',
    baseline: { color: 'ink', width: 1.5 },
    legendRadius: 1,
    markStroke: { color: 'rgba(70,58,40,.55)', width: 1.1 },
    markRadiusScale: 0.6,
    rough: 1.7, glow: false,
    cardRadius: 14, panelRadius: 12, tableRadius: 12, tipRadius: 10,
    bgGridSize: 28, bgGridOpacity: 0.5,
    colorScheme: 'light',
  },
  /** 现代柔彩：低饱和大圆角、细墨线界定色块、点状网格 */
  pastel: {
    ...BASE_SKIN,
    typeScale: 1, grid: 'dot',
    baseline: { color: 'muted', width: 1 },
    legendRadius: 5,
    markStroke: { color: 'rgba(47,58,85,.26)', width: 0.8 },
    markRadiusScale: 1.5,
    cardRadius: 20, panelRadius: 18, tableRadius: 16, tipRadius: 12,
    bgGridOpacity: 0.45,
  },
  /** 深色科技：紧凑字号、发丝网格、描边线条微光 */
  tech: {
    ...BASE_SKIN,
    typeScale: 0.94, grid: 'solid',
    baseline: { color: 'muted', width: 1 },
    legendRadius: 2,
    markRadiusScale: 0.8,
    glow: true,
    cardRadius: 12, panelRadius: 10, tableRadius: 10, tipRadius: 8,
    bgGridOpacity: 0.35, colorScheme: 'dark',
  },
};

/** ThemeId → 完整 ChartTheme（色 token + skin）。 */
export function resolveTheme(id: ThemeId): ChartTheme {
  return { ...THEMES[id], skin: SKINS[id] };
}
