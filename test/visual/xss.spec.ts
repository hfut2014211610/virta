// M2b.0 XSS 端到端（B1）：全视图 + 组合页，数据驱动文本必须转义；
// 同时验证 CSP 拦截内联事件处理器（纵深防御，非唯一防线）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { virt as VIRT } from './virt.js';

const OUT = 'out/visual/xss';
const EDGE = 'examples/edge-cases';
const CWD = () => process.cwd().replace(/\\/g, '/');

const PAYLOADS = ['<img src=x onerror=window.__xss=1>', '><svg onload=window.__xss=2>'];

/** 向 csv 追加两行：第一个非数值列分别注入两种载荷；其余单元格复制首行。 */
function injectCsv(csv: string): string {
  const lines = csv.replace(/\r\n/g, '\n').trim().split('\n');
  const head = lines[0]!.split(',');
  const row0 = (lines[1] ?? '').split(',');
  const isNum = (s: string | undefined) => s !== undefined && s !== '' && !Number.isNaN(Number(s));
  const idx = head.findIndex((_, i) => !isNum(row0[i]));
  const col = idx >= 0 ? idx : 0;
  const mk = (p: string) => { const r = [...row0]; r[col] = p; return r.join(','); };
  return [...lines, ...PAYLOADS.map(mk)].join('\n') + '\n';
}

// view → [输入文件, 所在目录, 额外 CLI 参数]
const CASES: [string, string, string, string][] = [
  ['bar', 'sample.csv', 'examples/basic', ''],
  ['line', 'sample-multi.csv', 'examples/basic', ''],
  ['matrix3d', 'sample-line3d.csv', 'examples/basic', ''],
  ['scatter', 'sample-scatter.csv', 'examples/basic', ''],
  ['pie', 'sample.csv', 'examples/basic', ''],
  ['bullet', 'sample-bullet.csv', 'examples/basic', ''],
  ['funnel', 'sample-funnel.csv', 'examples/basic', ''],
  ['heatmap', 'sample-heatmap.csv', 'examples/basic', ''],
  ['treemap', 'sample-treemap.csv', 'examples/basic', ''],
  ['sunburst', 'sample-sunburst.csv', 'examples/basic', ''],
  ['sankey', 'sample-sankey.csv', 'examples/basic', ''],
  ['boxplot', 'sample-boxplot.csv', 'examples/basic', ''],
  ['radar', 'sample-radar.csv', 'examples/basic', ''],
  ['gantt', 'sample-gantt.csv', 'examples/basic', ''],
  ['fishbone', 'sample-fishbone.csv', 'examples/basic', ''],
  ['pie3d', 'sample-pie3d.csv', 'examples/basic', ''],
  ['line3d', 'sample-line3d.csv', 'examples/basic', ''],
  ['scatter3d', 'sample-scatter3d.csv', 'examples/basic', ''],
  ['combo', 'sample-combo.csv', 'examples/basic', ''],
  ['rank', 'sample-rank.csv', 'examples/basic', ''],
  ['histogram', 'sample-histogram.csv', 'examples/basic', ''],
  ['kpi', 'sample-kpi.csv', 'examples/basic', ''],
  ['compare', 'sample-compare.csv', 'examples/basic', ''],
  ['cohort', 'sample-cohort.csv', 'examples/basic', ''],
  ['tree', 'sample-tree.csv', 'examples/basic', ''],
  ['network', 'sample-network.csv', 'examples/basic', ''],
  ['control', 'sample-control.csv', 'examples/basic', ''],
  ['parallel', 'sample-parallel.csv', 'examples/basic', ''],
  ['er', 'er-schema.csv', 'examples/gallery', ''],
  ['flowchart', 'flowchart-approve.csv', 'examples/gallery', ''],
  ['sequence', 'sequence-order.csv', 'examples/gallery', ''],
  ['burndown', 'burndown-sprint.csv', 'examples/gallery', ''],
  ['formula', 'formula-math.csv', 'examples/gallery', ''],
  // 专用语料：标签/系列名/列名/数值单元格/链接
  ['bar', 'xss-label.csv', EDGE, ''],
  ['line', 'xss-series.csv', EDGE, ''],
  ['grid', 'xss-column.csv', EDGE, ''],
  ['grid', 'xss-value.csv', EDGE, '--variant detail'],
  ['grid', 'xss-link.csv', EDGE, '--variant detail --set mapping.label=名称 --set mapping.link=链接'],
  ['report', 'xss-doc.md', EDGE, ''],
];

const stemOf = (f: string) => f.replace(/\.[^.]+$/, '');
const htmlOf = (view: string, file: string, extra: string) =>
  `${CWD()}/${OUT}/${stemOf(file)}-${view}${extra.includes('--variant') ? `-${extra.split('--variant ')[1]!.split(' ')[0]}` : ''}-light.html`;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  for (const [view, file, dir, extra] of CASES) {
    let input = join(dir, file);
    if (file.endsWith('.csv') && !file.startsWith('xss-')) {
      const injected = join(OUT, file);
      writeFileSync(injected, injectCsv(readFileSync(input, 'utf8')), 'utf8');
      input = injected;
    }
    VIRT(['render', input, '--view', view, ...extra.split(' ').filter(Boolean), '--export', 'html', '--out', OUT]);
  }
  VIRT(['compose', `${EDGE}/xss-compose.json`, '--export', 'html', '--out', OUT]);
});

for (const [view, file, , extra] of CASES) {
  const name = `${view}-${stemOf(file)}`;
  test(`${name}：数据载荷不执行`, async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await page.goto('file://' + htmlOf(view, file, extra));
    await page.waitForSelector('#chart-box');
    // 运行期确实执行了（CSP 哈希匹配 + boot 完成）：数据表/流式 DOM 已生成（details 内为 hidden，按 attached 等）
    await page.waitForSelector('#datatable table, .flow-table, .flow-doc', { state: 'attached', timeout: 10000 });
    // 悬停命中区触发 tooltip（多点扫一遍）
    const bb = await page.locator('#chart-box').boundingBox();
    if (bb) for (const [fx, fy] of [[0.3, 0.4], [0.5, 0.5], [0.7, 0.6]]) {
      await page.mouse.move(bb.x + bb.width * fx, bb.y + bb.height * fy);
      await page.waitForTimeout(60);
    }
    // 点击图例开关（如有）
    const chip = page.locator('.lg-chip').first();
    if (await chip.count()) await chip.click();
    await page.waitForTimeout(150);
    // 展开数据表（列名/单元格载荷在此 sink）
    await page.locator('details.fold summary').first().click().catch(() => {});
    await page.waitForTimeout(100);
    expect(dialogs, '捕获 dialog').toEqual([]);
    expect(await page.evaluate(() => (window as never as { __xss?: unknown }).__xss)).toBeUndefined();
    expect(await page.locator('#virta-app img').count(), '载荷 <img> 不应成为 DOM 节点').toBe(0);
    expect(await page.locator('[onerror],[onload],[onclick]').count(), '不应存在内联事件属性').toBe(0);
  });
}

test('compose 联动 chip：分类载荷点击后不执行', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await page.goto(`file:///${CWD()}/${OUT}/compose-grid-light.html`);
  await page.waitForSelector('#virta-app');
  await page.waitForFunction(() => document.querySelectorAll('.pbox svg').length >= 1);
  const box = page.locator('#pbox-0');
  const bb = await box.boundingBox();
  expect(bb).toBeTruthy();
  let chips = 0;
  outer: for (const xf of [0.2, 0.4, 0.6, 0.8]) {
    for (const yf of [0.3, 0.5, 0.7]) {
      await page.mouse.click(bb!.x + bb!.width * xf, bb!.y + bb!.height * yf);
      await page.waitForTimeout(150);
      chips = await page.locator('.fchip').count();
      if (chips > 0) break outer;
    }
  }
  expect(chips, '点击图元未触发联动筛选').toBeGreaterThan(0);
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => (window as never as { __xss?: unknown }).__xss)).toBeUndefined();
  expect(await page.locator('#flinks img, #flinks [onerror]').count()).toBe(0);
});

test('CSP 生效：页面注入的 onerror 被拦截并产生违规日志', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|inline event handler|violates/i.test(m.text())) violations.push(m.text()); });
  await page.goto('file://' + htmlOf('bar', 'sample.csv', ''));
  await page.waitForSelector('#chart-box svg');
  await page.evaluate(() => {
    const i = document.createElement('img');
    i.setAttribute('src', 'x');
    i.setAttribute('onerror', 'window.__xss=1');
    document.body.appendChild(i);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as never as { __xss?: unknown }).__xss)).toBeUndefined();
  expect(violations.length, '应出现 CSP 违规日志').toBeGreaterThan(0);
});
