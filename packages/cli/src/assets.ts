// 内置资源定位唯一入口（E5）。
// 两种运行模式（E4，优先用构建期注入的 __VIRTA_DIST__ 判断，不靠文件后缀）：
// - dist：import.meta.url 在 cli bundle 内（<pkg>/dist/cli.js），资源全部读 <pkg>/dist/；
// - source：tsx 跑源码（<repo>/packages/cli/src/*.ts），按 import.meta.url 定位仓库根，
//   不依赖 cwd；运行期脚本经 esbuild 现场编译（esbuild 只在本分支动态加载）。
// 用户传入的路径（输入文件、--out、--spec、compose 面板数据）仍按 cwd 解析，规则不变。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContract, type ViewId } from '@virta/contracts';
import { fail } from './errors.js';
import { composeEntrySource, RUNTIME_BUILD_OPTIONS, viewEntrySource, type ViewMap } from './runtime-entries.js';

declare const __VIRTA_DIST__: boolean | undefined;
declare const __VIRTA_VERSION__: string | undefined;

export const mode: 'dist' | 'source' =
  typeof __VIRTA_DIST__ !== 'undefined' && __VIRTA_DIST__ ? 'dist' : 'source';

const here = dirname(fileURLToPath(import.meta.url));
// dist：here = <pkg>/dist；source：here = <repo>/packages/cli/src → repo = 仓库根
const repo = resolve(here, mode === 'dist' ? '..' : '../../..');

/** 版本号单一来源：packages/cli/package.json 的 version（E7）。
 *  dist 构建期经 __VIRTA_VERSION__ 注入；source/兜底读 package.json
 *  （dist 下 ../package.json 即包根，两种模式同一路径规则）。 */
export const VERSION: string =
  typeof __VIRTA_VERSION__ === 'string' ? __VIRTA_VERSION__
    : (JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string }).version;

export interface Assets {
  /** 内置字体目录（3 个 ttf + metrics.json + OFL） */
  fontsDir: string;
  /** 内置 Agent 技能文件 */
  skillFile: string;
  /** 场景包目录（virta demo 数据源） */
  packsDir: string;
  /** 内置样例目录（@samples/ 前缀解析目标） */
  samplesDir: string;
  /** dist：预构建运行期脚本目录 */
  runtimeDir?: string;
  /** source：viewer 视图映射表 */
  viewMapFile?: string;
  /** source：仓库开发期目录（gallery 用） */
  galleryDir?: string;
  edgeCasesDir?: string;
}

export const assets: Assets = mode === 'dist'
  ? {
      fontsDir: join(here, 'fonts'),
      skillFile: join(here, 'skill', 'SKILL.md'),
      packsDir: join(here, 'packs'),
      samplesDir: join(here, 'samples'),
      runtimeDir: join(here, 'runtime'),
    }
  : {
      fontsDir: join(repo, 'packages', 'design-system', 'fonts'),
      skillFile: join(repo, 'docs', 'agent', 'SKILL.md'),
      packsDir: join(repo, 'examples', 'packs'),
      samplesDir: join(repo, 'examples', 'basic'),
      viewMapFile: join(repo, 'packages', 'viewer', 'view-map.json'),
      galleryDir: join(repo, 'examples', 'gallery'),
      edgeCasesDir: join(repo, 'examples', 'edge-cases'),
    };

/** 输入路径 @samples/ 前缀展开（E10/§3）：回执 input 字段保留用户写的原值。 */
export function expandSamples(p: string): string {
  return p.startsWith('@samples/') ? join(assets.samplesDir, p.slice('@samples/'.length)) : p;
}

export const flowOf = (view: string): boolean => getContract(view as ViewId)?.flow === true;

let vmCache: ViewMap | undefined;
export function viewMap(): ViewMap {
  if (!vmCache) {
    if (!assets.viewMapFile) {
      fail('INTERNAL', 'dist 模式不编译运行期脚本', '安装包不完整，重新安装或运行 virta doctor 检查');
    }
    vmCache = JSON.parse(readFileSync(assets.viewMapFile!, 'utf8')) as ViewMap;
  }
  return vmCache;
}

const runtimeCache = new Map<string, string>();

/**
 * 运行期脚本：key 为视图 id 或 'compose'。
 * dist 模式读 dist/runtime/<key>.js（compose 恒为全视图包）；
 * source 模式现场 esbuild 编译（compose 按实际用到的 views，缓存按视图集合区分）。
 */
export async function runtimeScript(key: string, views?: string[]): Promise<string> {
  const cacheKey = mode === 'source' && key === 'compose'
    ? `compose|${[...(views ?? [])].sort().join(',')}`
    : key;
  const hit = runtimeCache.get(cacheKey);
  if (hit) return hit;
  let js: string;
  if (mode === 'dist') {
    const p = join(assets.runtimeDir!, `${key}.js`);
    if (!existsSync(p)) {
      fail('INTERNAL', `安装包不完整：缺少运行期脚本 runtime/${key}.js`, '重新安装或运行 virta doctor 检查');
    }
    js = readFileSync(p, 'utf8');
  } else {
    const { build } = await import('esbuild');
    const vm = viewMap();
    const contents = key === 'compose'
      ? composeEntrySource(views ?? Object.keys(vm), vm, flowOf)
      : viewEntrySource(key, vm);
    const res = await build({ stdin: { contents, resolveDir: repo, loader: 'ts' }, ...RUNTIME_BUILD_OPTIONS });
    js = res.outputFiles[0].text;
  }
  runtimeCache.set(cacheKey, js);
  return js;
}
