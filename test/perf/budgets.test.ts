// 性能预算（§9）：10k 散点 HTML <3s；100k 明细 grid HTML <8s；per-view bundle ≤150KB。
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawToTable, profileTable } from '@virta/data-engine';
import { parseCsvText } from '@virta/data-engine';
import { renderChart } from '../../packages/cli/src/render.js';
import { VIEW_IDS } from '@virta/contracts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(REPO, 'test/perf/.out');

const mulberry32 = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function makeCsv(cols: string[], n: number, gen: (i: number) => (string | number)[]): string {
  const rnd = mulberry32(7);
  const rows = [cols.join(',')];
  for (let i = 0; i < n; i++) rows.push(gen(i).join(','));
  void rnd;
  return rows.join('\n');
}

async function renderCsv(csv: string, spec: Record<string, unknown>, formats: ('html' | 'png')[]) {
  const raw = parseCsvText(csv);
  const table = rawToTable(raw as never, { name: 'perf.csv', format: 'csv', rows: raw.length });
  profileTable(table);
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = performance.now();
  const res = await renderChart({
    table, spec: { version: 1, ...spec } as never, formats,
    out: OUT, stem: 'perf', width: 1200, height: 675, scale: 1, frame: 'card', fontFiles: [],
  });
  return { ms: performance.now() - t0, res };
}

describe('性能预算', () => {
  it('10k 点散点图生成 HTML < 3s', async () => {
    const csv = makeCsv(['x', 'y', '组'], 10_000, () => {
      const x = Math.random() * 100;
      return [x.toFixed(2), (x * 0.7 + Math.random() * 20).toFixed(2), 'A'];
    });
    const { ms, res } = await renderCsv(csv, { view: 'scatter' }, ['html']);
    expect(res.files.length).toBe(1);
    expect(ms, `${ms.toFixed(0)}ms`).toBeLessThan(3000);
  });

  it('100k 行明细 grid 生成 HTML < 8s', async () => {
    const csv = makeCsv(['id', '类目', '区域', '金额', '数量'], 100_000, (i) => [
      i, `C${i % 12}`, `R${i % 5}`, (Math.random() * 1000).toFixed(2), (Math.random() * 50).toFixed(0),
    ]);
    const { ms, res } = await renderCsv(csv, { view: 'grid' }, ['html']);
    expect(res.files.length).toBe(1);
    expect(ms, `${ms.toFixed(0)}ms`).toBeLessThan(8000);
  });

  it('per-view bundle ≤ 150KB（需先 npm run build）', () => {
    const dist = path.join(REPO, 'packages/viewer/dist');
    if (!fs.existsSync(dist)) return; // dist 未构建时跳过（build 命令单独把关）
    const files = fs.readdirSync(dist).filter((f) => f.endsWith('.js') && f !== 'cli.js' && VIEW_IDS.includes(f.replace(/\.js$/, '') as never));
    expect(files.length).toBeGreaterThanOrEqual(VIEW_IDS.length - 2);
    for (const f of files) {
      const kb = fs.statSync(path.join(dist, f)).size / 1024;
      expect(kb, `${f} = ${kb.toFixed(0)}KB`).toBeLessThanOrEqual(150);
    }
  });

  it('runtime/compose.js ≤ 300KB（E9，需先 npm run build）', () => {
    const p = path.join(REPO, 'packages/cli/dist/runtime/compose.js');
    if (!fs.existsSync(p)) return; // 未构建跳过
    const kb = fs.statSync(p).size / 1024;
    expect(kb, `compose.js = ${kb.toFixed(0)}KB`).toBeLessThanOrEqual(300);
  });
});
