// §0.4 入库通用检查（信息安全）：
// 1. 全部已跟踪文本文件不得出现本机绝对路径（盘符路径、/Users/<name>、/home/<name>）。
// 2. 不得出现 noreply 以外的邮箱地址（example.com 等保留域名除外）。
// 3. git log 全部提交的作者/提交者邮箱必须是 noreply。
// 具体内部敏感词的扫描在维护者本机 pre-push hook（不入库），本文件只做通用检查。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../..');
const git = (args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

const PATH_RES: [RegExp, string][] = [
  // 盘符后至少 2 个路径字符才命中：真实路径（字母+冒号+反斜杠+多字符）；
  // 单字符正则转义（如 \\s、\\w 写在字母+冒号之后）不误报
  [/[A-Za-z]:\\[^\s\\/:*?"<>|]{2,}/, '盘符绝对路径'],
  [/\/Users\/[A-Za-z0-9._-]+/, 'macOS /Users/<name> 路径'],
  [/\/home\/[A-Za-z0-9._-]+/, 'Linux /home/<name> 路径'],
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_OK = (mail: string) =>
  /noreply/i.test(mail) || /@(example\.(com|org|net)|example|localhost|invalid|test)$/i.test(mail);

/** 含 NUL 字节视为二进制，跳过。返回 utf8 文本或 null；文件只读一次（D13：两次全量读盘冷启动超 5s）。 */
function readText(file: string): string | null {
  const buf = readFileSync(file);
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return null;
  return buf.toString('utf8');
}

const tracked = git(['ls-files']).split('\n').filter(Boolean);

/** 全部已跟踪文本文件内容，惰性计算一次供两个用例共用。 */
let _texts: Map<string, string> | null = null;
const texts = () => {
  if (_texts) return _texts;
  _texts = new Map<string, string>();
  for (const rel of tracked) {
    const p = join(REPO, rel);
    if (!existsSync(p)) continue; // 已删未提交的文件跳过
    const src = readText(p);
    if (src !== null) _texts.set(rel, src);
  }
  return _texts;
};

// D13：冷启动时 git 子进程 + 全量读盘可能超过默认 5s，显式放宽（扫描本身热缓存 ~0.2s）
const T = 60_000;

describe('§0.4 入库信息安全检查', () => {
  it('已跟踪文本文件无本机绝对路径', () => {
    const bad: string[] = [];
    for (const [rel, src] of texts()) {
      for (const [re, label] of PATH_RES) {
        for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
          bad.push(`${rel} 命中 ${label}：${m[0].slice(0, 60)}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, T);

  it('已跟踪文本文件无非 noreply 邮箱', () => {
    const bad: string[] = [];
    for (const [rel, src] of texts()) {
      for (const m of src.matchAll(EMAIL_RE)) {
        if (!EMAIL_OK(m[0])) bad.push(`${rel} 邮箱 ${m[0]}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, T);

  it('git log 全部作者/提交者邮箱均为 noreply', () => {
    const mails = new Set(git(['log', '--format=%ae%n%ce']).split('\n').filter(Boolean));
    for (const m of mails) expect(m, `提交邮箱 ${m} 非 noreply`).toMatch(/noreply/);
    expect(mails.size).toBeGreaterThan(0);
  }, T);
});
