// M8 e2e：demo/gallery 命令——场景包故事页+仪表盘+PNG、画廊双标签页与真图缩略图。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cli(args: string[]): { ok: boolean; data?: any; error?: any } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true });
    return JSON.parse(stdout);
  } catch (e) {
    return JSON.parse((e as { stdout: string }).stdout);
  }
}

describe('demo', () => {
  it('quality 包：index.html + dashboard.html + png/ 全产出', () => {
    const r = cli(['demo', 'quality', '--out', 'out/e2e-demo', '--json']);
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    const files: string[] = r.data.files;
    expect(files.some((f) => f.endsWith('index.html'))).toBe(true);
    expect(files.some((f) => f.endsWith('dashboard.html'))).toBe(true);
    const pngs = files.filter((f) => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThanOrEqual(8);
    for (const f of files) expect(existsSync(f), f).toBe(true);
    // dashboard 含联动 payload（quality 包共享维度 产线）
    const dash = readFileSync('out/e2e-demo/quality/dashboard.html', 'utf8');
    expect(dash).toContain('window.__VIRTA__');
  });

  it('缺参数 → INVALID_SPEC；未知包 → INPUT_NOT_FOUND', () => {
    const r1 = cli(['demo', '--json']);
    expect(r1.ok).toBe(false);
    expect(r1.error.code).toBe('INVALID_SPEC');
    const r2 = cli(['demo', 'nope', '--json']);
    expect(r2.ok).toBe(false);
    expect(r2.error.code).toBe('INPUT_NOT_FOUND');
  });
});

describe('gallery', () => {
  it('生成 index.html：双标签页 + 26 图族卡片（3D 并入基类）+ 真图缩略图', { timeout: 240_000 }, () => {
    const r = cli(['gallery', '--out', 'out/e2e-gallery', '--json']);
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data.views).toBe(26); // 30 视图 - 4 个 3D 并入基类组
    expect(r.data.packs).toBe(5);
    const html = readFileSync(r.data.index, 'utf8');
    expect(html).toContain('按场景');
    expect(html).toContain('按图族');
    expect(html).not.toContain('http://cdn');
    // 缩略图为真实 PNG 且对应的交互 HTML 存在
    const imgCount = (html.match(/png\//g) ?? []).length;
    expect(imgCount).toBeGreaterThan(50);
    expect(existsSync('out/e2e-gallery/png/v-network-network-light.png')).toBe(true);
    expect(existsSync('out/e2e-gallery/html/v-network-network-light.html')).toBe(true);
  });
});
