// 简体中文 UI 文案（R6）：单文件页/组合页的壳层文案集中于此。
export const ZH = {
  eyebrow: 'VIRTA',
  themeLight: '☀ 浅色',
  themeDark: '☾ 深色',
  /** ADR-0008 主题中文名（theme id → seg 按钮文案） */
  themeNames: {
    light: '浅色', dark: '深色', minimal: '极简', sketch: '手绘', pastel: '柔彩', tech: '深色科技',
  } as Record<string, string>,
  variant: '变体',
  palette: '配色',
  export: '导出',
  settings: '⚙ 选项',
  fullscreen: '⛶ 全屏',
  dataTable: '数据表',
  qualityReport: '数据识别报告',
  mapping: '映射',
  noIssues: '· 无质量问题',
  confidence: { high: '● 可信度 高', medium: '● 可信度 中', low: '● 可信度 低' } as Record<string, string>,
  copySpec: '复制 spec',
  copied: '已复制',
  reset: '重置',
  drawerGroups: { view: '视图', style: '外观', display: '展示', data: '数据', interaction: '交互' } as Record<string, string>,
  /** 调色板中文名（id → 展示名） */
  paletteNames: {
    signal: 'Signal', cinnabar: '朱砂', patina: '铜绿', blueprint: '蓝图', inkwash: '水墨',
    mono: '单色', sundown: '落霞', dunhuang: '敦煌', aurora: '极光', morandi: '莫兰迪',
  } as Record<string, string>,
};
