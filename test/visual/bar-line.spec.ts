// M3 视觉测试：bar/line 首屏断言 + snapshots/compare 新旧并排。
// 前置：virta render 产 HTML（beforeAll 生成）；legacy 用 python vizscape.py render。
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const OUT = 'out/visual';
const CMP = 'snapshots/compare';
const VIRT = (args: string, stdin?: string) =>
  execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args.split(' ')], { encoding: 'utf8', input: stdin, shell: true });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(CMP, { recursive: true });
  VIRT('render examples/basic/sample-multi.csv --view bar --set variant=stacked --palette patina --title 多系列堆叠 --export html --out ' + OUT);
  VIRT('render examples/basic/sample.json --format json --view line --export html --out ' + OUT);
  // legacy 对照（Python 渲染同一份数据）
  try {
    execSync(`python archive/legacy-vizscape/vizscape.py render examples/basic/sample-multi.csv --view bar --out ${OUT}/legacy-bar.html`, { stdio: 'pipe' });
    execSync(`python archive/legacy-vizscape/vizscape.py render examples/basic/sample.json --view line --out ${OUT}/legacy-line.html`, { stdio: 'pipe' });
  } catch { /* legacy 渲染失败不阻塞新版基线 */ }
});

test('bar 首屏：图表底边 ≤800px@1280×800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + `/${OUT}/sample-multi-bar-stacked-light.html`);
  const box = page.locator('#chart-box svg');
  await expect(box).toBeVisible();
  const bb = await box.boundingBox();
  expect(bb).not.toBeNull();
  expect(bb!.y + bb!.height).toBeLessThanOrEqual(800);
  await expect(page).toHaveScreenshot('bar-stacked.png', { fullPage: false });
});

test('line 首屏断言 + 截图', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + `/${OUT}/sample-line-light.html`);
  const box = page.locator('#chart-box svg');
  await expect(box).toBeVisible();
  const bb = await box.boundingBox();
  expect(bb!.y + bb!.height).toBeLessThanOrEqual(800);
  await expect(page).toHaveScreenshot('line.png', { fullPage: false });
});

test('新旧并排对照 → snapshots/compare/', async ({ page }) => {
  const pairs: [string, string][] = [
    [`${OUT}/legacy-bar.html`, `${OUT}/sample-multi-bar-stacked-light.html`],
    [`${OUT}/legacy-line.html`, `${OUT}/sample-line-light.html`],
  ];
  for (const [oldF, newF] of pairs) {
    const name = oldF.includes('bar') ? 'bar' : 'line';
    for (const [side, file] of [['legacy', oldF], ['new', newF]] as const) {
      if (!existsSync(file)) continue;
      await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + '/' + file);
      await page.screenshot({ path: `${CMP}/${name}-${side}.png`, fullPage: false });
    }
  }
  expect(readFileSync(`${CMP}/bar-new.png`).length).toBeGreaterThan(1000);
});
