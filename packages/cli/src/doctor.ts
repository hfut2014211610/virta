// doctor 命令（E10/§3）：环境自检。任一 error → 退出码 1；只有 warn → 0。
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fontPath, FONT_FILES } from '@virta/design-system';
import { VIEW_IDS } from '@virta/contracts';
import { fontFallbackOk } from './render.js';
import { assets, mode, VERSION } from './assets.js';

export interface DoctorCheck {
  id: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  hint?: string;
}

const ok = (id: string, message: string): DoctorCheck => ({ id, status: 'ok', message });
const warn = (id: string, message: string, hint?: string): DoctorCheck => ({ id, status: 'warn', message, hint });
const bad = (id: string, message: string, hint?: string): DoctorCheck => ({ id, status: 'error', message, hint });

export interface DoctorResult {
  mode: 'dist' | 'source';
  version: string;
  checks: DoctorCheck[];
}

export async function runDoctor(): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  const major = Number(process.versions.node.split('.')[0]);
  checks.push(
    major >= 22
      ? ok('node', `Node ${process.versions.node}`)
      : bad('node', `Node ${process.versions.node} 低于要求`, 'virta 需要 Node >= 22'),
  );

  try {
    const { Resvg } = await import('@resvg/resvg-js');
    new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').render().asPng();
    checks.push(ok('resvg', '@resvg/resvg-js 可加载并渲染'));
  } catch (e) {
    checks.push(bad('resvg', `@resvg/resvg-js 不可用：${(e as Error).message}`, '重新安装 virta，或换 npm 镜像（resvg 原生模块按平台分发）'));
  }

  if (mode === 'dist') {
    const need = [...VIEW_IDS, 'compose'].map((k) => `${k}.js`);
    const missing = need.filter((f) => !existsSync(join(assets.runtimeDir!, f)));
    checks.push(
      missing.length === 0
        ? ok('runtime', `dist/runtime ${need.length} 个运行期脚本齐全`)
        : bad('runtime', `缺少运行期脚本：${missing.join('、')}`, '安装包不完整，重新安装 virta'),
    );
  } else {
    try {
      await import('esbuild');
      checks.push(ok('runtime', 'esbuild 可加载（source 模式现场编译）'));
    } catch {
      checks.push(bad('runtime', 'esbuild 不可加载', '仓库根目录 npm install'));
    }
  }

  const missingFonts = [
    ...Object.values(FONT_FILES),
    'metrics.json',
  ].filter((f) => !existsSync(join(assets.fontsDir, f)));
  checks.push(
    missingFonts.length === 0
      ? ok('fonts', `内置字体 ${Object.keys(FONT_FILES).length} 个 + metrics.json`)
      : bad('fonts', `缺少内置字体文件：${missingFonts.join('、')}`, '安装包不完整，重新安装 virta'),
  );

  const builtin = [fontPath('display-light'), fontPath('display-medium'), fontPath('mono')];
  checks.push(
    fontFallbackOk(builtin)
      ? ok('cjk', '中文字形探测通过')
      : warn('cjk', '中文字形缺失（PNG 导出会缺字）', 'Linux 安装 fonts-noto-cjk，或用 --font-file 指定覆盖中文的字体'),
  );

  try {
    const f = join(tmpdir(), `virta-doctor-${process.pid}.tmp`);
    writeFileSync(f, 'ok');
    rmSync(f, { force: true });
    checks.push(ok('tmpWrite', '临时目录可写'));
  } catch (e) {
    checks.push(bad('tmpWrite', `临时目录不可写：${(e as Error).message}`, '检查 TMPDIR/权限'));
  }

  return { mode, version: VERSION, checks };
}

export function doctorExitCode(r: DoctorResult): number {
  return r.checks.some((c) => c.status === 'error') ? 1 : 0;
}

export function doctorLines(r: DoctorResult): string[] {
  const mark = { ok: '✓', warn: '!', error: '✗' } as const;
  return r.checks.map((c) => `${mark[c.status]} ${c.id.padEnd(9)} ${c.message}${c.hint ? `（${c.hint}）` : ''}`);
}
