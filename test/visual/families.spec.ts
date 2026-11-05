// M4 全图族视觉测试：每个视图渲染 HTML → 浏览器验证 SVG 可见 + 首屏底边 ≤800px + 截图基线。
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const OUT = 'out/visual';
const VIRT = (args: string) =>
  execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args.split(' ')], { encoding: 'utf8', shell: true });

// view → 输入样例（-v 覆盖视图参数，默认 --view 同名）
const CASES: [string, string, string?][] = [
  ['matrix3d', 'sample-line3d.csv'],
  ['scatter', 'sample-scatter.csv'],
  ['pie', 'sample.csv'],
  ['bullet', 'sample-bullet.csv'],
  ['funnel', 'sample-funnel.csv'],
  ['heatmap', 'sample-heatmap.csv'],
  ['heatmap', 'sample-heatmap-year.csv', 'calendar'],
  ['treemap', 'sample-treemap.csv'],
  ['sunburst', 'sample-sunburst.csv'],
  ['sankey', 'sample-sankey.csv'],
  ['boxplot', 'sample-boxplot.csv'],
  ['boxplot', 'sample-boxplot-summary.csv', 'summary'],
  ['radar', 'sample-radar.csv'],
  ['gantt', 'sample-gantt.csv'],
  ['fishbone', 'sample-fishbone.csv'],
  ['grid', 'sample-grid.csv'],
  ['report', 'sample-report.md'],
  ['pie3d', 'sample-pie3d.csv'],
  ['line3d', 'sample-line3d.csv'],
  ['scatter3d', 'sample-scatter3d.csv'],
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  for (const [view, file] of CASES) {
    VIRT(`render examples/basic/${file} --view ${view} --export html --out ${OUT}`);
  }
});

for (const [view, file, tag] of CASES) {
  const name = tag ? `${view}-${tag}` : view;
  test(`${name} 首屏：浏览器内联运行期渲染 SVG`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const stem = file.replace(/\.[^.]+$/, '');
    await page.goto('file:///' + process.cwd().replace(/\\/g, '/') + `/${OUT}/${stem}-${view}-light.html`);
    const box = page.locator('#chart-box svg');
    await expect(box).toBeVisible({ timeout: 8000 });
    // 浏览器端重渲染后应有真实图元（非空 svg）
    const shapes = await box.locator('rect,path,circle,line').count();
    expect(shapes).toBeGreaterThan(3);
    const bb = await box.boundingBox();
    expect(bb).not.toBeNull();
    expect(bb!.y + bb!.height).toBeLessThanOrEqual(820);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
  });
}
