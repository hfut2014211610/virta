// contracts v0 · 公共类型契约；契约级变更记录于 docs/adr/
export type Series = { name: string; values: number[] };
export type ChartData = { labels: string[]; series: Series[] };
export type ViewSpec = { view: 'bar' | 'line' | 'matrix3d'; theme: 'light' | 'dark' };
export type ViewState = { azimuth: number; tilt: number; zoom: number; hiddenSeries: number[] };
export type ErrorCode = 'INPUT_NOT_FOUND' | 'UNSUPPORTED_FORMAT' | 'PARSE_ERROR' | 'MISSING_COLUMN';
export type VizError = { code: ErrorCode; message: string; recoverable: boolean };
