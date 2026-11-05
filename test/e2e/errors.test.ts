// M5 错误文案评审：每个 ErrorCode 至少一个用例，断言 code 正确、hint 非空且可执行。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cliErr(args: string[], input?: string): { ok: boolean; data?: any; error?: any } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true, input });
    return JSON.parse(stdout);
  } catch (e) {
    return JSON.parse((e as { stdout: string }).stdout);
  }
}
const F = 'examples/basic/sample.csv';

const CASES: [string, string, string[], string?][] = [
  ['INVALID_SPEC', '--spec 非法', ['render', F, '--spec', '{oops', '--json']],
  ['INVALID_OPTION', '--set 无等号', ['render', F, '--set', 'badtoken', '--json']],
  ['INPUT_NOT_FOUND', '文件不存在', ['render', 'nope.csv', '--json']],
  ['UNSUPPORTED_FORMAT', '文档走非 report', ['render', 'examples/basic/sample-report.md', '--view', 'bar', '--json']],
  ['PARSE_ERROR', 'JSON 解析失败', ['render', '-', '--format', 'json', '--json'], '[{bad'],
  ['EMPTY_DATA', '空 JSON 数组', ['render', '-', '--format', 'json', '--json'], '[]'],
  ['MISSING_COLUMN', 'mapping 指向不存在列', ['render', F, '--view', 'bar', '--set', 'mapping.label=不存在列', '--json']],
  ['AMBIGUOUS_MAPPING', '必需角色多列歧义', ['render', '-', '--format', 'csv', '--view', 'sankey', '--json'], '来源,起点,数值\nA,B,1\nA,B,2'],
  ['UNKNOWN_VIEW', '未知视图', ['render', F, '--view', 'nope', '--json']],
  ['UNSUPPORTED_EXPORT', '未知导出格式', ['render', F, '--view', 'bar', '--export', 'pdf', '--json']],
  ['RENDER_FAILED', '必需角色缺失', ['render', F, '--view', 'sankey', '--export', 'svg', '--out', 'out/e2e', '--json']],
];

describe('错误码覆盖（hint 非空可执行）', () => {
  for (const [code, name, args, input] of CASES) {
    it(`${code} · ${name}`, async () => {
      const r = cliErr(args, input);
      expect(r.ok, `期望 ok:false 实际 ${JSON.stringify(r).slice(0, 200)}`).toBe(false);
      expect(r.error.code).toBe(code);
      expect((r.error.message ?? '').length, 'message 为空').toBeGreaterThan(0);
      // hint 非空且含可执行动作（命令/参数/路径提示）
      if (r.error.recoverable !== false) {
        expect((r.error.hint ?? '').length, `${code} hint 为空`).toBeGreaterThan(0);
        expect(/virta|--|文件|路径|支持|如|：|列/.test(r.error.hint), `${code} hint 不可执行: ${r.error.hint}`).toBe(true);
      }
    });
  }

  it('EXPORT_FAILED · --scale 0 触发 resvg 失败', () => {
    const r = cliErr(['render', F, '--view', 'bar', '--export', 'png', '--out', 'out/e2e', '--scale', '0', '--json']);
    expect(r.ok).toBe(false);
    expect(['EXPORT_FAILED', 'RENDER_FAILED']).toContain(r.error.code);
    expect((r.error.hint ?? '').length).toBeGreaterThan(0);
  });

  it('INTERNAL · gallery 未落地前的占位', () => {
    const r = cliErr(['gallery', '--json']);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('INTERNAL');
  });

  it('validate 歧义角色写入 ambiguous 字段', () => {
    writeFileSync('out/e2e-ambig.csv', '来源,起点,数值\nA,B,1\nA,B,2');
    const r = cliErr(['validate', 'out/e2e-ambig.csv', '--view', 'sankey', '--json']);
    expect(r.ok).toBe(true);
    expect(r.data.valid).toBe(false);
    expect(r.data.ambiguous.length).toBeGreaterThan(0);
    expect(r.data.suggestions.some((s: string) => s.includes('--set mapping.'))).toBe(true);
  });
});
