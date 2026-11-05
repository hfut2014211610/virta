import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { buildCss } from './css.js';
import { FONT_FILES, fontsDir, fontPath, loadMetrics, measureText, type MetricFont } from './fonts.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = fontsDir();
const KB = 1024;

// 子集规范中字体本身不含的字形（SOURCE.md/subset.py 记录）
const KNOWN_MISSING = new Set([0x201b, 0x2190, 0x2191, 0x2192, 0x2193, 0xffe5]);

const SUBSET_RANGES: [number, number][] = [
  [0x20, 0x7e], [0xa0, 0xff], [0x2013, 0x2014], [0x2018, 0x201d],
  [0x2190, 0x2193],
];
const SUBSET_SINGLES = [0x2022, 0x2026, 0x2030, 0xd7, 0x2212, 0xffe5];

function expectedCodepoints(): number[] {
  const cps = new Set<number>();
  for (const [a, b] of SUBSET_RANGES) for (let c = a; c <= b; c++) cps.add(c);
  for (const c of SUBSET_SINGLES) cps.add(c);
  return [...cps].filter((c) => !KNOWN_MISSING.has(c));
}

describe('字体产物', () => {
  it('3 个子集 TTF 存在且 ≤40KB', () => {
    for (const f of Object.values(FONT_FILES)) {
      const p = path.join(DIR, f);
      expect(fs.existsSync(p), f).toBe(true);
      const size = fs.statSync(p).size;
      expect(size, f).toBeLessThanOrEqual(40 * KB);
    }
  });

  it('2 份 OFL 授权与 SOURCE.md、metrics.json 存在', () => {
    for (const f of ['OFL-Fraunces.txt', 'OFL-JetBrainsMono.txt', 'SOURCE.md', 'metrics.json']) {
      expect(fs.existsSync(path.join(DIR, f)), f).toBe(true);
    }
  });

  it('metrics.json 覆盖子集内全部字符（已知缺字形除外）', () => {
    const metrics = loadMetrics();
    for (const kind of Object.keys(FONT_FILES) as MetricFont[]) {
      const widths = metrics[kind].widths;
      for (const cp of expectedCodepoints()) {
        expect(widths[cp], `${kind} U+${cp.toString(16)}`).toBeTypeOf('number');
      }
      expect(widths[0x20]).toBeGreaterThan(0); // 空格有正字宽
    }
  });

  it('measureText 给出确定性宽度（Fraunces 斜体比例 < 等宽）', () => {
    const m = loadMetrics();
    expect(measureText('iiii', 'display-light', 20, m)).toBeLessThan(measureText('WWWW', 'display-light', 20, m));
    expect(measureText('ABCD', 'mono', 20, m)).toBeCloseTo(measureText('iiii', 'mono', 20, m), 5);
    expect(measureText('中文', 'mono', 20, m)).toBeCloseTo(40, 5); // CJK 按 1em
  });
});

describe('buildCss + 字体', () => {
  it('fonts:true 内联 @font-face 且 font-display:block', () => {
    const css = buildCss({ fonts: true });
    expect(css).toContain('@font-face');
    expect(css).toContain('font-display:block');
    expect(css).toContain('data:font/ttf;base64,');
    expect(css.match(/@font-face/g)).toHaveLength(3);
  });

  it('resvg 加载子集 TTF 后渲染确实用到了该字体', () => {
    const text = 'Hamburgefonstiv 0123456789';
    const svg = (family: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120">` +
      `<rect width="640" height="120" fill="white"/>` +
      `<text x="20" y="70" font-family="${family}" font-size="40" fill="black">${text}</text></svg>`;

    // resvg 2.6.2 类型未声明 fontBuffers（README 有、2.5.0 起可用）；测试走已声明的 fontFiles
    const files = [fontPath('display-light'), fontPath('display-medium')];
    const withFont = new Resvg(svg('VirDisplay'), {
      font: { fontFiles: files, loadSystemFonts: false },
    }).render().asPng();
    const withoutFont = new Resvg(svg('NonexistentFamily123'), {
      font: { loadSystemFonts: false },
    }).render().asPng();
    expect(withFont.equals(withoutFont)).toBe(false);
  });
});
