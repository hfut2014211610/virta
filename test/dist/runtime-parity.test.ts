// T2 运行期一致（E3/E4 防漂移）：dist/runtime/<key>.js 必须与 source 模式
// 内存中编译的结果逐字节相同——入口源码与 esbuild 选项各只有一份（runtime-entries.ts）。
// 前置：npm run build。
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { getContract, type ViewId } from '@virta/contracts';
import { composeEntrySource, RUNTIME_BUILD_OPTIONS, viewEntrySource, type ViewMap } from '../../packages/cli/src/runtime-entries.js';

const REPO = resolve(__dirname, '../..');
const RUNTIME = join(REPO, 'packages', 'cli', 'dist', 'runtime');
const VIEW_MAP = JSON.parse(readFileSync(join(REPO, 'packages', 'viewer', 'view-map.json'), 'utf8')) as ViewMap;
const flowOf = (v: string) => getContract(v as ViewId)?.flow === true;

async function compile(contents: string): Promise<string> {
  const res = await build({ stdin: { contents, resolveDir: REPO, loader: 'ts' }, ...RUNTIME_BUILD_OPTIONS });
  return res.outputFiles[0].text;
}

describe('T2·dist 与 source 运行期脚本逐字节一致', () => {
  for (const view of ['bar', 'grid', 'gantt']) {
    it(`runtime/${view}.js`, async () => {
      const expected = await compile(viewEntrySource(view, VIEW_MAP));
      const actual = readFileSync(join(RUNTIME, `${view}.js`), 'utf8');
      expect(actual).toBe(expected);
    });
  }

  it('runtime/compose.js（全视图）', async () => {
    const expected = await compile(composeEntrySource(Object.keys(VIEW_MAP), VIEW_MAP, flowOf));
    const actual = readFileSync(join(RUNTIME, 'compose.js'), 'utf8');
    expect(actual).toBe(expected);
  });
});
