// M5 e2e：compose 命令——retail compose.json → html+svg+png 三格式 + 联动 payload。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cli(args: string[]): { ok: boolean; data?: any; error?: any } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true });
    return JSON.parse(stdout);
  } catch (e) {
    return JSON.parse((e as { stdout: string }).stdout);
  }
}

describe('compose', () => {
  it('retail 组合页：html+svg+png + 联动 payload', () => {
    const r = cli(['compose', 'examples/packs/retail/compose.json', '--export', 'html,svg,png', '--out', 'out/e2e', '--json']);
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data.panels).toBe(7);
    expect(r.data.links).toEqual([{ column: '渠道' }]);
    expect(r.data.summaryMd.length).toBeGreaterThan(0);
    for (const f of r.data.files) expect(existsSync(f.path), f.path).toBe(true);
    // HTML 内含 payload 与运行期
    const html = readFileSync(r.data.files.find((f: { format: string }) => f.format === 'html').path, 'utf8');
    expect(html).toContain('window.__VIRTA__');
    expect(html).toContain('"渠道"');
    expect(html).not.toContain('http://cdn');
    // SVG 为合并场景
    const svg = readFileSync(r.data.files.find((f: { format: string }) => f.format === 'svg').path, 'utf8');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(30);
  });

  it('缺文件 → INPUT_NOT_FOUND', () => {
    const r = cli(['compose', 'examples/packs/nope/compose.json', '--json']);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('INPUT_NOT_FOUND');
  });

  it('未知 chart 引用 → INVALID_SPEC', () => {
    writeFileSync('out/e2e-compose-bad.json', JSON.stringify({ panels: [{ chart: 'nope' }] }));
    const r = cli(['compose', 'out/e2e-compose-bad.json', '--json']);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('INVALID_SPEC');
  });
});
