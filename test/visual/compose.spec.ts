// M5 compose 联动测试：retail 仪表盘 HTML → 点击图元 → 联动筛选生效。
import { virt } from './virt.js';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const OUT = 'out/visual';
const F = `${OUT}/compose-grid-light.html`;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  virt(['compose', 'examples/packs/retail/compose.json', '--export', 'html', '--out', OUT]);
});

test('compose 仪表盘：全部面板首屏渲染', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('file:///' + process.cwd().split('\\').join('/') + `/${F}`);
  await page.waitForSelector('#virta-app');
  await page.waitForFunction(() => document.querySelectorAll('.pbox svg').length >= 7);
  const boxes = await page.locator('.pbox svg').count();
  expect(boxes).toBe(7);
});

test('compose 联动：点击图元 → 筛选 chip 出现且其他面板重渲', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('file:///' + process.cwd().split('\\').join('/') + `/${F}`);
  await page.waitForSelector('#virta-app');
  await page.waitForFunction(() => document.querySelectorAll('.pbox svg').length >= 7);
  // orderval 箱线面板（#pbox-3，含"渠道"列）：多点尝试点击箱体，直到联动 chip 出现
  const box = page.locator('#pbox-3');
  const bb = await box.boundingBox();
  expect(bb).toBeTruthy();
  let chips = 0;
  outer: for (const xf of [0.25, 0.45, 0.65]) {
    for (const yf of [0.3, 0.5, 0.7]) {
      await page.mouse.click(bb!.x + bb!.width * xf, bb!.y + bb!.height * yf);
      await page.waitForTimeout(150);
      chips = await page.locator('.fchip').count();
      if (chips > 0) break outer;
    }
  }
  expect(chips, '点击箱体未触发联动筛选').toBeGreaterThan(0);
  const chip = page.locator('.fchip').first();
  await expect(chip).toContainText('渠道');
  // 点击 chip 清除 → 恢复
  await chip.click();
  await page.waitForTimeout(200);
  expect(await page.locator('.fchip').count()).toBe(0);
  await page.screenshot({ path: 'snapshots/compose-dashboard.png' });
});
