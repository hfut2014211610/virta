// 浏览器 bundle 依赖聚合（避免在 runtime.ts 里散落导入，便于 esbuild tree-shake）。
export { getContract } from '@virta/contracts';
export { THEMES, PALETTE_IDS, paletteColors } from '@virta/design-system';
