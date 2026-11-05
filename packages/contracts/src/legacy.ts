// contracts v0 兼容类型 · 保留为 bar/line model 的子集（ADR-0004）。
// 新代码不要使用这里的 ViewSpec/ViewState/VizError——v1 形状见 spec.ts / quality.ts。
export type Series = { name: string; values: number[] };
export type ChartData = { labels: string[]; series: Series[] };
