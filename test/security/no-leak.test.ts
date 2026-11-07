// §0.4 入库通用检查（信息安全）：
// 1. 全部已跟踪文本文件不得出现本机绝对路径（盘符路径、/Users/<name>、/home/<name>）。
// 2. 不得出现 noreply 以外的邮箱地址（example.com 等保留域名除外）。
// 3. git log 全部提交的作者/提交者邮箱必须是 noreply。
// 具体内部敏感词的扫描在维护者本机 pre-push hook（不入库），本文件只做通用检查。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../..');
const git = (args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

const PATH_RES: [RegExp, string][] = [
  [/[A-Za-z]:\\[^\s\\/:*?"<>|]/, '盘符绝对路径'],
  [/\/Users\/[A-Za-z0-9._-]+/, 'macOS /Users/<name> 路径'],
  [/\/home\/[A-Za-z0-9._-]+/, 'Linux /home/<name> 路径'],
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_OK = (mail: string) =>
  /noreply/i.test(mail) || /@(example\.(com|org|net)|example|localhost|invalid|test)$/i.test(mail);

/** 含 NUL 字节视为二进制，跳过。 */
function isText(file: string): boolean {
  const buf = readFileSync(file);
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

const tracked = git(['ls-files']).split('\n').filter(Boolean);

describe('§0.4 入库信息安全检查', () => {
  it('已跟踪文本文件无本机绝对路径', () => {
    const bad: string[] = [];
    for (const rel of tracked) {
      const p = join(REPO, rel);
      if (!isText(p)) continue;
      const src = readFileSync(p, 'utf8');
      for (const [re, label] of PATH_RES) {
        for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
          bad.push(`${rel} 命中 ${label}：${m[0].slice(0, 60)}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('已跟踪文本文件无非 noreply 邮箱', () => {
    const bad: string[] = [];
    for (const rel of tracked) {
      const p = join(REPO, rel);
      if (!isText(p)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(EMAIL_RE)) {
        if (!EMAIL_OK(m[0])) bad.push(`${rel} 邮箱 ${m[0]}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('git log 全部作者/提交者邮箱均为 noreply', () => {
    const mails = new Set(git(['log', '--format=%ae%n%ce']).split('\n').filter(Boolean));
    for (const m of mails) expect(m, `提交邮箱 ${m} 非 noreply`).toMatch(/noreply/);
    expect(mails.size).toBeGreaterThan(0);
  });
});
