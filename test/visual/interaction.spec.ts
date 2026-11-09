// M2d.0 交互行为锚点（PHASE_2D.md §4.4，D1/D2/D10）。
// D1（单图页 #tooltip 被 innerHTML 清掉、永不显示）与 D2（组合页未注册 mousemove）
// 修复前，悬停相关用例以 test.fail 锚定；M2d.1 修复落地后移除 .fail 标记并保持转绿。
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { virt as VIRT } from './virt.js';

const OUT = 'out/visual/interaction';
const BASIC = 'examples/basic';
const GAL = 'examples/gallery';
const CWD = () => process.cwd().replace(/\\/g, '/');
const stemOf = (f: string) => f.replace(/\.[^.]+$/, '');

// 全部 SVG 视图的主样例（flow 视图 grid/report 为 DOM 渲染，不在悬停范围内）
const CASES: [string, string, string][] = [
  ['bar', 'sample.csv', BASIC],
  ['line', 'sample-multi.csv', BASIC],
  ['matrix3d', 'sample-line3d.csv', BASIC],
  ['scatter', 'sample-scatter.csv', BASIC],
  ['pie', 'sample.csv', BASIC],
  ['bullet', 'sample-bullet.csv', BASIC],
  ['funnel', 'sample-funnel.csv', BASIC],
  ['heatmap', 'sample-heatmap.csv', BASIC],
  ['treemap', 'sample-treemap.csv', BASIC],
  ['sunburst', 'sample-sunburst.csv', BASIC],
  ['sankey', 'sample-sankey.csv', BASIC],
  ['boxplot', 'sample-boxplot.csv', BASIC],
  ['radar', 'sample-radar.csv', BASIC],
  ['gantt', 'sample-gantt.csv', BASIC],
  ['fishbone', 'sample-fishbone.csv', BASIC],
  ['pie3d', 'sample-pie3d.csv', BASIC],
  ['line3d', 'sample-line3d.csv', BASIC],
  ['scatter3d', 'sample-scatter3d.csv', BASIC],
  ['combo', 'sample-combo.csv', BASIC],
  ['rank', 'sample-rank.csv', BASIC],
  ['histogram', 'sample-histogram.csv', BASIC],
  ['kpi', 'sample-kpi.csv', BASIC],
  ['compare', 'sample-compare.csv', BASIC],
  ['cohort', 'sample-cohort.csv', BASIC],
  ['tree', 'sample-tree.csv', BASIC],
  ['network', 'sample-network.csv', BASIC],
  ['control', 'sample-control.csv', BASIC],
  ['parallel', 'sample-parallel.csv', BASIC],
  ['er', 'er-schema.csv', GAL],
  ['flowchart', 'flowchart-approve.csv', GAL],
  ['sequence', 'sequence-order.csv', GAL],
  ['burndown', 'burndown-sprint.csv', GAL],
  ['formula', 'formula-math.csv', GAL],
];

const htmlOf = (view: string, file: string) => `${CWD()}/${OUT}/${stemOf(file)}-${view}-light.html`;

/** 在容器内按 12×8 网格扫描，返回第一个让 #tooltip 可见且非空的视口坐标。 */
async function sweepForTooltip(page: Page, boxSel: string): Promise<{ x: number; y: number } | null> {
  // 用 evaluate 直调 scrollIntoView：scrollIntoViewIfNeeded 会持续等元素 stable，
  // 组合页重绘期间等不到 → 超时；滚动后短等让布局/字体落定
  await page.locator(boxSel).evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
  await page.waitForTimeout(200);
  const bb = await page.locator(boxSel).boundingBox();
  if (!bb) return null;
  const tip = page.locator('#tooltip');
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 12; gx++) {
      const x = bb.x + (bb.width * (gx + 0.5)) / 12;
      const y = bb.y + (bb.height * (gy + 0.5)) / 8;
      await page.mouse.move(x, y);
      await page.waitForTimeout(18);
      if (await tip.isVisible().catch(() => false)) {
        const text = (await tip.textContent())?.trim();
        if (text) return { x, y };
      }
    }
  }
  return null;
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  for (const [view, file, dir] of CASES) {
    VIRT(['render', `${dir}/${file}`, '--view', view, '--export', 'html', '--out', OUT]);
  }
  VIRT(['compose', 'examples/packs/retail/compose.json', '--export', 'html', '--out', OUT]);
});

for (const [view, file] of CASES) {
  test(`${view}：悬停提示框可见且完整位于视口内`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('file://' + htmlOf(view, file));
    await page.waitForSelector('#chart-box svg', { timeout: 10000 });
    const hit = await sweepForTooltip(page, '#chart-box');
    expect(hit, '12×8 网格内无任何点触发悬停提示').not.toBeNull();
    const tb = await page.locator('#tooltip').boundingBox();
    expect(tb, '提示框存在').not.toBeNull();
    expect(tb!.x).toBeGreaterThanOrEqual(0);
    expect(tb!.y).toBeGreaterThanOrEqual(0);
    expect(tb!.x + tb!.width).toBeLessThanOrEqual(1280);
    expect(tb!.y + tb!.height).toBeLessThanOrEqual(800);
  });
}

test('移出隐藏：提示框出现后鼠标移出 #chart-box → 隐藏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + htmlOf('bar', 'sample.csv'));
  await page.waitForSelector('#chart-box svg');
  const hit = await sweepForTooltip(page, '#chart-box');
  expect(hit, '未能触发提示框').not.toBeNull();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(120);
  await expect(page.locator('#tooltip')).toBeHidden();
});

test('图例切换：隐藏系列 → chip 置灰 + modelHash 不变 + SVG 变化；再点恢复', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + htmlOf('line', 'sample-multi.csv'));
  await page.waitForSelector('#chart-box svg');
  const chips = page.locator('.lg-chip');
  expect(await chips.count(), '样例应有图例').toBeGreaterThan(0);
  const hash0 = await page.evaluate(() => (window as never as { __VIRTA__: { modelHash?: string } }).__VIRTA__.modelHash);
  const svg0 = await page.locator('#chart-box svg').evaluate((el) => el.outerHTML);
  await chips.first().click();
  await page.waitForTimeout(200);
  expect(await page.locator('.lg-chip.off').count(), '被点图例项应带 off 隐藏态').toBeGreaterThan(0);
  const hash1 = await page.evaluate(() => (window as never as { __VIRTA__: { modelHash?: string } }).__VIRTA__.modelHash);
  const svg1 = await page.locator('#chart-box svg').evaluate((el) => el.outerHTML);
  expect(hash1, '图例开关不应改变数据模型').toBe(hash0);
  expect(svg1, '隐藏系列后 SVG 应变化').not.toBe(svg0);
  await page.locator('.lg-chip').first().click();
  await page.waitForTimeout(200);
  const svg2 = await page.locator('#chart-box svg').evaluate((el) => el.outerHTML);
  expect(await page.locator('.lg-chip.off').count()).toBe(0);
  expect(svg2).toBe(svg0);
});

test('状态恢复：变体+排序切换后 URL 新开页保持一致', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + htmlOf('compare', 'sample-compare.csv'));
  await page.waitForSelector('#chart-box svg');
  // 变体：slope → dumbbell（此时才出现 sortByDelta 开关）
  await page.locator('#variant-seg button[data-v="dumbbell"]').click();
  await page.waitForTimeout(250);
  await page.locator('#opt-row [data-b="sortByDelta"]').click();
  await page.waitForTimeout(250);
  const url = page.url();
  expect(url).toContain('#s=');
  const svg1 = await page.locator('#chart-box svg').evaluate((el) => el.outerHTML);
  // 复制 URL 新开页面：选中态与 SVG 应与切换后一致
  const page2 = await browser.newPage();
  await page2.setViewportSize({ width: 1280, height: 800 });
  await page2.goto(url);
  await page2.waitForSelector('#chart-box svg');
  await page2.waitForTimeout(250);
  await expect(page2.locator('#variant-seg button[data-v="dumbbell"]')).toHaveClass(/on/);
  await expect(page2.locator('#opt-row [data-b="sortByDelta"]')).toHaveClass(/on/);
  const svg2 = await page2.locator('#chart-box svg').evaluate((el) => el.outerHTML);
  expect(svg2).toBe(svg1);
  await page2.close();
});

test('组合页悬停：每个面板至少一个点能触发提示框', async ({ page }) => {
  // 视口拉高：面板加紧凑图例后整页超过 960px，坐标扫格须全在视口内
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto(`file:///${CWD()}/${OUT}/compose-grid-light.html`);
  await page.waitForSelector('#virta-app');
  await page.waitForFunction(() => document.querySelectorAll('.pbox svg').length >= 7);
  const n = await page.locator('.pbox').count();
  for (let i = 0; i < n; i++) {
    if (!(await page.locator(`#pbox-${i} svg`).count())) continue; // flow 面板跳过
    // 稀疏命中面板允许重扫一轮，兼容平台间布局微差
    let hit = await sweepForTooltip(page, `#pbox-${i}`);
    if (!hit) hit = await sweepForTooltip(page, `#pbox-${i}`);
    expect(hit, `面板 ${i} 无悬停提示`).not.toBeNull();
  }
});

test('组合页联动：点击数据点 → 其他面板 modelHash 变化；清除筛选后恢复', async ({ page }) => {
  // 视口拉高：紧凑图例加高面板后，靠下面板仍在视口内，坐标点击可达
  await page.setViewportSize({ width: 1440, height: 2400 });
  await page.goto(`file:///${CWD()}/${OUT}/compose-grid-light.html`);
  await page.waitForSelector('#virta-app');
  await page.waitForFunction(() => document.querySelectorAll('.pbox svg').length >= 7);
  const hashes0 = await page.evaluate(() =>
    (window as never as { __VIRTA__: { panels: { modelHash?: string }[] } }).__VIRTA__.panels.map((p) => p.modelHash));
  // 多点尝试点击 orderval 面板（含链接列「渠道」），直到联动 chip 出现
  const bb = await page.locator('#pbox-3').boundingBox();
  expect(bb).toBeTruthy();
  let chips = 0;
  outer: for (const xf of [0.2, 0.4, 0.6, 0.8]) {
    for (const yf of [0.3, 0.5, 0.7]) {
      await page.mouse.click(bb!.x + bb!.width * xf, bb!.y + bb!.height * yf);
      await page.waitForTimeout(180);
      chips = await page.locator('.fchip').count();
      if (chips > 0) break outer;
    }
  }
  expect(chips, '点击图元未触发联动筛选').toBeGreaterThan(0);
  const hashes1 = await page.evaluate(() =>
    (window as never as { __VIRTA__: { panels: { modelHash?: string }[] } }).__VIRTA__.panels.map((p) => p.modelHash));
  const changed = hashes1.filter((h, i) => i !== 3 && h !== hashes0[i]).length;
  expect(changed, '至少一个其他面板 modelHash 应变化').toBeGreaterThan(0);
  // 清除筛选 → 恢复
  await page.locator('.fchip', { hasText: '清除全部' }).click().catch(async () => {
    await page.locator('.fchip').first().click();
  });
  await page.waitForTimeout(250);
  const hashes2 = await page.evaluate(() =>
    (window as never as { __VIRTA__: { panels: { modelHash?: string }[] } }).__VIRTA__.panels.map((p) => p.modelHash));
  expect(hashes2).toEqual(hashes0);
});

test('3D 视图：拖拽旋转期间提示框隐藏，结束后悬停可再次触发', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + htmlOf('scatter3d', 'sample-scatter3d.csv'));
  await page.waitForSelector('#chart-box svg');
  const bb = await page.locator('#chart-box').boundingBox();
  expect(bb).toBeTruthy();
  const cx = bb!.x + bb!.width / 2, cy = bb!.y + bb!.height / 2;
  // 拖拽旋转期间 tooltip 应让位隐藏
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(cx + i * 20, cy + i * 10);
  await page.waitForTimeout(80);
  expect(await page.locator('#tooltip').isVisible().catch(() => false), '拖拽期间提示框应隐藏').toBe(false);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const hit = await sweepForTooltip(page, '#chart-box');
  expect(hit, '拖拽结束后悬停应能再次触发提示框').not.toBeNull();
});
