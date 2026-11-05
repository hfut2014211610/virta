// M5 e2e：模拟 Agent 全流程 inspect → 取第一候选 → validate → render --json。
// 断言：ok、summaryMd 非空、insights 非空。覆盖全部 basic 表格样例。
// Agent 标准动作：把候选的 mapping 经 --set 传给 validate/render；第一名失败则按序尝试后续候选并记 rank。
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cli(args: string[]): { ok: boolean; data?: any; error?: any } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true });
    return JSON.parse(stdout);
  } catch (e) {
    return JSON.parse((e as { stdout: string }).stdout);
  }
}
const FILES = readdirSync('examples/basic').filter((f) => /\.(csv|json|xlsx)$/i.test(f));

/** 候选对象 → spec 文件路径（数组 mapping 走 --set 会被 shell 吃掉引号，改用 --spec）。 */
function specPath(c: { view: string; variant?: string; mode?: string; mapping?: Record<string, string | string[]> }, i: number): string {
  const p = `out/e2e-spec-${i}.json`;
  writeFileSync(p, JSON.stringify({ version: 1, view: c.view, variant: c.variant, mode: c.mode, mapping: c.mapping }));
  return p;
}

describe('agent 标准流程（全部 basic 样例）', () => {
  for (const f of FILES) {
    it(`${f} → inspect/validate/render 全通`, () => {
      const insp = cli(['inspect', `examples/basic/${f}`, '--json']);
      expect(insp.ok, `${f} inspect 失败`).toBe(true);
      const cands = insp.data.candidates as { view: string; variant?: string; mode?: string; mapping?: Record<string, string | string[]> }[];
      expect(cands.length, `${f} 无推荐候选`).toBeGreaterThan(0);
      let done = false, rank = -1, lastErr = '';
      for (const [i, c] of cands.entries()) {
        const spec = specPath(c, i);
        const val = cli(['validate', `examples/basic/${f}`, '--view', c.view, '--spec', spec, '--json']);
        if (!val.ok || val.data?.valid === false) { lastErr = `validate ${c.view} invalid`; continue; }
        const r = cli(['render', `examples/basic/${f}`, '--spec', spec, '--export', 'svg', '--out', 'out/e2e', '--json']);
        if (!r.ok) { lastErr = `render ${c.view}: ${r.error?.code} ${r.error?.message}`; continue; }
        expect(r.data.summaryMd?.length, `${f} summaryMd 为空`).toBeGreaterThan(0);
        expect(r.data.insights?.length, `${f} insights 为空`).toBeGreaterThan(0);
        done = true; rank = i; break;
      }
      expect(done, `${f} 全部候选失败：${lastErr}`).toBe(true);
      expect(rank, `${f} 第一名候选不可用（第 ${rank} 名才成功）：${lastErr}`).toBe(0);
    });
  }
});
