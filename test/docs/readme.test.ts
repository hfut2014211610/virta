// README 契约（PHASE_2C §4.4）：视图 ID 集合 = VIEW_IDS；
// `<!--readme-smoke-->` 标记块内的每条 virta 命令都执行一遍（dist/cli.js，cwd=临时目录）。
// 前置 npm run build；未构建时命令执行项跳过（dist 冒烟在 test:dist 全链路另有覆盖）。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEW_IDS } from '@virta/contracts';

const REPO = resolve(__dirname, '../..');
const README = readFileSync(join(REPO, 'README.md'), 'utf8');
const DIST_CLI = join(REPO, 'packages', 'cli', 'dist', 'cli.js');

describe('README 与 CLI 一致', () => {
  it('README 中出现的视图 ID 集合 = VIEW_IDS', () => {
    const missing = VIEW_IDS.filter((id) => !new RegExp(`\\b${id}\\b`).test(README));
    expect(missing, `README 缺少视图：${missing.join('、')}`).toEqual([]);
  });

  it('readme-smoke 标记块内命令均可执行', { timeout: 180_000 }, () => {
    if (!existsSync(DIST_CLI)) return; // 未构建跳过（npm run build 后再跑）
    const m = README.match(/<!--readme-smoke-->\s*```bash([\s\S]*?)```/);
    expect(m, 'README 缺少 <!--readme-smoke--> bash 代码块').toBeTruthy();
    const cmds = m![1]!.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('virta '));
    expect(cmds.length, '标记块内 virta 命令过少').toBeGreaterThan(3);
    const tmp = mkdtempSync(join(tmpdir(), 'virta-readme-'));
    for (const c of cmds) {
      const args = c.slice('virta '.length).split(/\s+/);
      const stdout = execFileSync(process.execPath, [DIST_CLI, ...args], { cwd: tmp, encoding: 'utf8', timeout: 120_000 });
      expect(stdout.length, `命令无输出：${c}`).toBeGreaterThan(0);
    }
  });
});
