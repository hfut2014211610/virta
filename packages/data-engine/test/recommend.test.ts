// 推荐验收（§8.2）：examples/basic 每个样例的 top1 必须与预期一致；
// doc 输入 → report；同时断言 validate() 给出可执行建议。
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInput } from '../src/node/index.js';
import { rawToTable, profileTable, recommend, validate } from '../src/index.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(REPO, 'examples/basic');

const EXPECT: Record<string, { view: string; variant?: string; mode?: string }> = {
  'sample.csv': { view: 'pie' },
  'sample.json': { view: 'pie' },
  'sample.xlsx': { view: 'pie' },
  'sample-wide.csv': { view: 'bar' },
  'sample-multi.csv': { view: 'bar' },
  'sample-mixed.csv': { view: 'bar' },
  'sample-negative.csv': { view: 'bar' },
  'sample-waterfall.csv': { view: 'bar', variant: 'waterfall' },
  'sample-line.csv': { view: 'line' },
  'sample-line3d.csv': { view: 'line' },
  'sample-boxplot.csv': { view: 'boxplot', mode: 'raw' },
  'sample-boxplot-summary.csv': { view: 'boxplot', mode: 'summary' },
  'sample-bullet.csv': { view: 'bullet' },
  'sample-fishbone.csv': { view: 'fishbone' },
  'sample-funnel.csv': { view: 'funnel' },
  'sample-gantt.csv': { view: 'gantt' },
  'sample-grid.csv': { view: 'grid', variant: 'pivot' },
  'sample-heatmap.csv': { view: 'heatmap', mode: 'matrix' },
  'sample-heatmap-year.csv': { view: 'heatmap', mode: 'calendar' },
  'sample-pie3d.csv': { view: 'pie' },
  'sample-pie3d-1d.csv': { view: 'pie' },
  'sample-radar.csv': { view: 'radar' },
  'sample-sankey.csv': { view: 'sankey' },
  'sample-scatter.csv': { view: 'scatter' },
  'sample-scatter3d.csv': { view: 'scatter' },
  'sample-sunburst.csv': { view: 'sunburst' },
  'sample-treemap.csv': { view: 'treemap' },
  'sample-treemap-1d.csv': { view: 'pie' },
};

const DOC_FILES = new Set(['sample-report.md', 'sample-note.txt']);

async function load(f: string) {
  const loaded = await readInput(path.join(DIR, f));
  if (loaded.docText !== undefined) return { doc: true as const, loaded };
  const table = rawToTable(loaded.result!.raw, loaded.source);
  return { doc: false as const, loaded, table };
}

describe('recommend：examples/basic top1', () => {
  const files = fs.readdirSync(DIR).sort();
  it('样例集合与期望表同步', () => {
    for (const f of files) {
      expect(EXPECT[f] || DOC_FILES.has(f), `缺少 ${f} 的 expectTop`).toBeTruthy();
    }
  });
  for (const f of files) {
    if (DOC_FILES.has(f)) {
      it(`${f} → doc 管线`, async () => {
        const r = await load(f);
        expect(r.doc).toBe(true);
      });
      continue;
    }
    it(`${f} → ${EXPECT[f].view}`, async () => {
      const { table } = await load(f);
      const rec = recommend(profileTable(table!), table!);
      expect(rec.length).toBeGreaterThan(0);
      expect(rec.length).toBeLessThanOrEqual(5);
      const top = rec[0];
      expect(top.view).toBe(EXPECT[f].view);
      if (EXPECT[f].variant) expect(top.variant).toBe(EXPECT[f].variant);
      if (EXPECT[f].mode) expect(top.mode).toBe(EXPECT[f].mode);
      expect(top.score).toBeGreaterThan(0);
      expect(top.score).toBeLessThanOrEqual(1);
    });
  }
});

describe('validate', () => {
  it('合法 spec → valid + adapter 质量', async () => {
    const { table } = await load('sample.csv');
    const r = validate(table!, { version: 1, view: 'pie' });
    expect(r.view).toBe('pie');
    expect(r.missingRoles).toEqual([]);
    expect(r.valid).toBe(true);
  });
  it('mapping 指向不存在的列 → missing + 建议可执行', async () => {
    const { table } = await load('sample.csv');
    const r = validate(table!, { version: 1, view: 'bar', mapping: { value: '金额' } });
    expect(r.valid).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
    const joined = r.suggestions.join(' ');
    expect(/--set|--unset|mapping\./.test(joined)).toBe(true);
  });
  it('非法枚举选项 → error + 合法值建议', async () => {
    const { table } = await load('sample.csv');
    const r = validate(table!, { version: 1, view: 'bar', options: { shape: 'bogus' } });
    expect(r.valid).toBe(false);
    expect(r.suggestions.join(' ')).toMatch(/options\.shape=/);
  });
});
