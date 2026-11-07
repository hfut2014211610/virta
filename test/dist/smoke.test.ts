// T1 dist 冒烟（PHASE_2C §5）：npm pack → 仓库外临时目录 npm install →
// 通过 npm 生成的 .bin 启动脚本跑全部命令（Windows 走 virta.cmd）。
// 前置：npm run build。R1–R6 锚点已在 M2c.1 转普通断言；doctor/skill/gallery 三个待 M2c.2。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEW_IDS } from '@virta/contracts';

const REPO = resolve(__dirname, '../..');
const CLI_PKG = join(REPO, 'packages', 'cli');
const DIST_CLI = join(CLI_PKG, 'dist', 'cli.js');
const TMP = mkdtempSync(join(tmpdir(), 'virta-dist-'));

interface RunOut { code: number; stdout: string; stderr: string }

function sh(cmd: string, args: string[], cwd: string, input?: string): RunOut {
  try {
    const stdout = execFileSync(cmd, args, { cwd, input, encoding: 'utf8', shell: true, timeout: 240_000 });
    return { code: 0, stdout: stdout ?? '', stderr: '' };
  } catch (e) {
    const er = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      code: typeof er.status === 'number' ? er.status : 1,
      stdout: er.stdout?.toString() ?? '',
      stderr: er.stderr?.toString() ?? '',
    };
  }
}

// —— 打包：memoized ——
let tgzP: Promise<string> | undefined;
function pack(): Promise<string> {
  return (tgzP ??= (async () => {
    if (!existsSync(DIST_CLI)) throw new Error('缺少 packages/cli/dist/cli.js，先运行 npm run build');
    const r = sh('npm', ['pack', '--pack-destination', TMP], CLI_PKG);
    if (r.code !== 0) throw new Error(`npm pack 失败：${r.stderr || r.stdout}`.slice(0, 600));
    const name = r.stdout.trim().split('\n').pop()!.trim();
    const tgz = join(TMP, basename(name));
    if (!existsSync(tgz)) throw new Error(`npm pack 未产出 tarball：${r.stdout}`);
    return tgz;
  })());
}

/** npm pack --dry-run --json 的文件清单（不产出 tarball）。
 *  prepack 的构建日志混在 stdout 里，取最后一组 JSON 数组。 */
function packManifest(): { path: string; size: number }[] {
  const r = sh('npm', ['pack', '--dry-run', '--json'], CLI_PKG);
  if (r.code !== 0) throw new Error(`npm pack --dry-run 失败：${r.stderr || r.stdout}`.slice(0, 600));
  const i = r.stdout.indexOf('\n[');
  const start = i >= 0 ? i + 1 : r.stdout.indexOf('[');
  return (JSON.parse(r.stdout.slice(start)) as { files: { path: string; size: number }[] }[])[0]!.files;
}

// —— 安装到仓库外临时目录：memoized ——
interface Env { dir: string; bin: string }
let envP: Promise<Env> | undefined;
function installed(): Promise<Env> {
  return (envP ??= (async () => {
    const tgz = await pack();
    const dir = join(TMP, 'proj');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}\n', 'utf8');
    const r = sh('npm', ['install', tgz, '--no-audit', '--no-fund'], dir);
    if (r.code !== 0) throw new Error(`npm install <tgz> 失败：${(r.stderr || r.stdout).slice(0, 600)}`);
    const bin = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'virta.cmd' : 'virta');
    if (!existsSync(bin)) throw new Error(`安装后缺少启动脚本 ${bin}`);
    return { dir, bin };
  })());
}

/** 通过 .bin 启动脚本执行，cwd 为仓库外临时目录。 */
function cli(env: Env, args: string[], input?: string): RunOut {
  try {
    const stdout = execFileSync(env.bin, args, {
      cwd: env.dir, input, encoding: 'utf8', timeout: 240_000,
      shell: process.platform === 'win32',
    });
    return { code: 0, stdout: stdout ?? '', stderr: '' };
  } catch (e) {
    const er = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      code: typeof er.status === 'number' ? er.status : 1,
      stdout: er.stdout?.toString() ?? '',
      stderr: er.stderr?.toString() ?? '',
    };
  }
}

/** stdout 恰好一条 JSON envelope 且 ok:true。 */
function envelope(r: RunOut, label: string): { ok: boolean; command: string; data: any; error?: any } {
  expect(r.code, `${label} 退出码 ${r.code}：${(r.stderr || r.stdout).slice(0, 400)}`).toBe(0);
  const lines = r.stdout.trim().split('\n');
  expect(lines.length, `${label} stdout 应为单条 JSON，实际 ${lines.length} 行`).toBe(1);
  const env = JSON.parse(lines[0]!);
  expect(env.ok, `${label} ok=false：${JSON.stringify(env.error)}`).toBe(true);
  return env;
}

/** 回执列出的文件都存在，bytes 等于实际大小。 */
function filesOk(env: Env, files: { path: string; bytes: number }[]): void {
  for (const f of files) {
    const p = isAbsolute(f.path) ? f.path : join(env.dir, f.path);
    expect(existsSync(p), `回执文件不存在 ${p}`).toBe(true);
    expect(statSync(p).size, `${p} bytes 不一致`).toBe(f.bytes);
  }
}

const pkgJson = () => JSON.parse(readFileSync(join(CLI_PKG, 'package.json'), 'utf8'));

describe('T1·打包自包含', () => {
  it('前置：packages/cli/dist/cli.js 已构建', () => {
    expect(existsSync(DIST_CLI), '先运行 npm run build').toBe(true);
  });

  it('R5/E6·tarball 清单：只含 E6 布局，无 .ts/.d.ts/.map', () => {
    const files = packManifest().map((f) => f.path);
    const leaked = files.filter((f) => /\.(ts|tsx|cts|mts|d\.ts|map)$/.test(f) || /(^|\/)src\//.test(f));
    expect(leaked, `tarball 混入源码/映射：\n${leaked.join('\n')}`).toEqual([]);
    // 注意：dry-run JSON 的路径相对包根，无 tar 条目的 package/ 前缀
    for (const req of [
      'dist/cli.js', 'dist/runtime/compose.js',
      'dist/fonts/', 'dist/skill/SKILL.md',
      'dist/packs/', 'dist/samples/',
      'README.md', 'LICENSE', 'CHANGELOG.md', 'package.json',
    ]) {
      expect(files.some((f) => f === req || f.startsWith(req)), `tarball 缺少 ${req}`).toBe(true);
    }
  });

  it('R5/E1·dependencies 只有 3 个运行依赖（@virta/* 全进 bundle）', async () => {
    await pack();
    const deps = Object.keys(pkgJson().dependencies ?? {}).sort();
    expect(deps).toEqual(['@resvg/resvg-js', 'papaparse', 'read-excel-file']);
    expect(Object.keys(pkgJson())).not.toContain('private');
  });

  it('E9·tarball ≤3MB、解压 ≤8MB', async () => {
    const tgz = await pack();
    expect(statSync(tgz).size, 'tarball 体积').toBeLessThanOrEqual(3 * 1024 * 1024);
    const unpacked = packManifest().reduce((n, f) => n + f.size, 0);
    expect(unpacked, '解压体积').toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('R1·dist/cli.js 单 shebang 可直接执行', () => {
    if (!existsSync(DIST_CLI)) throw new Error('先运行 npm run build');
    const head = readFileSync(DIST_CLI, 'utf8').slice(0, 200);
    expect(head.match(/^#!/gm)?.length ?? 0, 'dist/cli.js shebang 行数 ≠ 1').toBe(1);
    const r = sh('node', [DIST_CLI, '--version'], TMP);
    expect(r.code, `node dist/cli.js --version：${r.stderr.slice(0, 300)}`).toBe(0);
  });

  it('R5·仓库外临时目录 npm install <tgz> 成功', async () => {
    await installed();
  });
});

describe('T1·安装后命令（cwd=仓库外临时目录）', () => {
  it('R6·--version 输出 virta <package.json version>', async () => {
    const env = await installed();
    const r = cli(env, ['--version']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`virta ${pkgJson().version}`);
  });

  it('--version --json 输出 envelope{version,node,platform,mode}', async () => {
    const env = await installed();
    const e = envelope(cli(env, ['--version', '--json']), '--version --json');
    expect(e.data.version).toBe(pkgJson().version);
    expect(e.data.mode).toBe('dist');
  });

  it.fails('G6·doctor --json 各项检查 envelope', async () => {
    const env = await installed();
    const e = envelope(cli(env, ['doctor', '--json']), 'doctor --json');
    expect(e.data.mode).toBe('dist');
    const checks = e.data.checks as { id: string; status: string }[];
    for (const id of ['node', 'resvg', 'runtime', 'fonts', 'tmpWrite']) {
      expect(checks.some((c) => c.id === id), `doctor 缺少检查项 ${id}`).toBe(true);
    }
    for (const c of checks) expect(c.status, `doctor ${c.id}`).not.toBe('error');
  });

  it('guide / guide --agent 在仓库外可用（R2）', async () => {
    const env = await installed();
    const g = cli(env, ['guide']);
    expect(g.code, g.stderr).toBe(0);
    expect(g.stdout.length).toBeGreaterThan(0);
    const a = cli(env, ['guide', '--agent']);
    expect(a.code, a.stderr).toBe(0);
    expect(a.stdout).toContain('virta');
    const e = envelope(cli(env, ['guide', '--json']), 'guide --json');
    expect(e.data.mode).toBe('dist');
    expect(e.data.version).toBe(pkgJson().version);
  });

  it('list --json 全量视图 + version', async () => {
    const env = await installed();
    const e = envelope(cli(env, ['list', '--json']), 'list --json');
    expect((e.data as { id: string }[]).map((d) => d.id).sort()).toEqual([...VIEW_IDS].sort());
    expect(e.command).toBe('list');
  });

  it('R2/R3·inspect + render @samples 仓库外可用', async () => {
    const env = await installed();
    const ins = envelope(cli(env, ['inspect', '@samples/sample-multi.csv', '--json']), 'inspect');
    expect(ins.data.input).toBe('@samples/sample-multi.csv');
    const r = envelope(cli(env, ['render', '@samples/sample-multi.csv', '--export', 'html,svg,png', '--json']), 'render');
    filesOk(env, r.data.files);
    // 产物 HTML：CSP + 不泄漏开发路径
    const html = r.data.files.find((f: { format: string }) => f.format === 'html');
    const text = readFileSync(join(env.dir, html.path), 'utf8');
    expect(text).toContain('Content-Security-Policy');
    expect(text).not.toContain('packages/');
    expect(text).not.toContain(REPO);
    expect(text).not.toContain(REPO.replace(/\\/g, '/'));
  });

  it('stdin 输入 render', async () => {
    const env = await installed();
    const e = envelope(cli(env, ['render', '-', '--format', 'csv', '--export', 'svg', '--json'], '月份,数值\n1月,3\n2月,5\n3月,4'), 'render -');
    filesOk(env, e.data.files);
  });

  it('G7·demo retail 读内置场景包（cwd 无关）', async () => {
    const env = await installed();
    const e = envelope(cli(env, ['demo', 'retail', '--json']), 'demo retail');
    for (const f of e.data.files as string[]) {
      const p = isAbsolute(f) ? f : join(env.dir, f);
      expect(existsSync(p), `demo 产物不存在 ${p}`).toBe(true);
    }
    expect(e.data.packs).toContain('retail');
  });

  it('compose 用临时目录中的 compose.json+数据渲染', async () => {
    const env = await installed();
    cpSync(join(REPO, 'examples', 'packs', 'retail'), join(env.dir, 'retail'), { recursive: true });
    const e = envelope(cli(env, ['compose', 'retail/compose.json', '--export', 'html', '--json']), 'compose');
    filesOk(env, e.data.files);
  });

  it.fails('G5·skill path 输出绝对路径；skill install 写入 front matter；重复安装报 INVALID_OPTION', async () => {
    const env = await installed();
    const p = cli(env, ['skill', 'path']);
    expect(p.code, p.stderr).toBe(0);
    const skillPath = p.stdout.trim();
    expect(isAbsolute(skillPath), `skill path 非绝对路径：${skillPath}`).toBe(true);
    const e = envelope(cli(env, ['skill', 'install', '--dir', 'skills', '--json']), 'skill install');
    expect(e.data.bytes).toBe(statSync(join(env.dir, 'skills', 'virta', 'SKILL.md')).size);
    const written = readFileSync(join(env.dir, 'skills', 'virta', 'SKILL.md'), 'utf8');
    expect(written.startsWith('---\n'), '缺少 YAML front matter').toBe(true);
    expect(written).toMatch(/name:\s*virta/);
    const dup = cli(env, ['skill', 'install', '--dir', 'skills', '--json']);
    expect(dup.code).toBe(2);
    expect(JSON.parse(dup.stdout).error.code).toBe('INVALID_OPTION');
  });

  it('E12·gallery 在 dist 模式报 INPUT_NOT_FOUND（退出码 3）', async () => {
    const env = await installed();
    const r = cli(env, ['gallery', '--json']);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).error.code).toBe('INPUT_NOT_FOUND');
  });
});
