// 子集字体与字宽表。浏览器侧只用纯函数；文件读取经 process.getBuiltinModule 惰性取 fs，
// 仅在 Node（CLI/构建期生成 HTML）调用，产物 HTML 内联 base64，运行期不依赖本模块。
import { FONT_UNICODE_RANGE } from './tokens.js';

export interface FontData {
  /** base64 TTF */
  displayLight: string;
  displayMedium: string;
  mono: string;
}

export interface FontMetrics {
  file: string;
  unitsPerEm: number;
  widths: Record<string, number>; // codepoint → advance（font units）
}
export type MetricsTable = Record<'display-light' | 'display-medium' | 'mono', FontMetrics>;

export const FONT_FILES = {
  'display-light': 'fraunces-light.ttf',
  'display-medium': 'fraunces-medium.ttf',
  mono: 'jetbrains-mono-regular.ttf',
} as const;

const fontsDirUrl = () => new URL('../fonts/', import.meta.url);

function nodeFs(): typeof import('node:fs') {
  const p = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown } }).process;
  const fs = p?.getBuiltinModule?.('node:fs');
  if (!fs) throw new Error('字体文件读取需要 Node 运行时（fonts:true 仅在 CLI/构建期使用）');
  return fs as typeof import('node:fs');
}

export function fontsDir(): string {
  return decodeURIComponent(fontsDirUrl().pathname).replace(/^\/([A-Za-z]:)/, '$1');
}

export function fontPath(kind: keyof typeof FONT_FILES): string {
  return `${fontsDir()}${FONT_FILES[kind]}`;
}

export function loadFontBuffers(): Record<keyof typeof FONT_FILES, Uint8Array> {
  const fs = nodeFs();
  return {
    'display-light': fs.readFileSync(fontPath('display-light')),
    'display-medium': fs.readFileSync(fontPath('display-medium')),
    mono: fs.readFileSync(fontPath('mono')),
  };
}

export function loadFontData(): FontData {
  const b = loadFontBuffers();
  const enc = (u: Uint8Array) => Buffer.from(u).toString('base64');
  return { displayLight: enc(b['display-light']), displayMedium: enc(b['display-medium']), mono: enc(b.mono) };
}

export function loadMetrics(): MetricsTable {
  const fs = nodeFs();
  return JSON.parse(fs.readFileSync(`${fontsDir()}metrics.json`, 'utf8')) as MetricsTable;
}

/** 三段 @font-face（font-display:block + unicode-range 拉丁子集），供内联进页面 <style>。 */
export function fontFaceCss(data: FontData): string {
  const face = (family: string, weight: number, b64: string) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
    `font-display:block;src:url(data:font/ttf;base64,${b64}) format("truetype");` +
    `unicode-range:${FONT_UNICODE_RANGE}}`;
  return [
    face('VirDisplay', 300, data.displayLight),
    face('VirDisplay', 500, data.displayMedium),
    face('VirMono', 400, data.mono),
  ].join('\n');
}

export type MetricFont = keyof MetricsTable;

let cachedMetrics: MetricsTable | undefined;

/**
 * 确定性文字度量（D9）：用字宽表估算文本宽度，Node/浏览器一致。
 * 不在字宽表内的字符：CJK/全角按 1em、其余按 0.5em。
 */
export function measureText(text: string, font: MetricFont, size: number, metrics?: MetricsTable): number {
  const m = metrics ?? (cachedMetrics ??= loadMetrics());
  const widths = m[font].widths;
  const upm = m[font].unitsPerEm;
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const w = widths[cp];
    units += w ?? (cp >= 0x2e80 || (cp >= 0xff00 && cp <= 0xffef) ? upm : upm / 2);
  }
  return (units / upm) * size;
}
