// M2b.1 运行期一致性（C4）：浏览器 window.__VIRTA__.modelHash 必须等于
// Node 端 adaptInput + modelHash 的计算结果（静态导出与交互页同一条适配管线）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { adaptInput } from '@virta/data-engine';
import { rawToTable } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { modelHash } from '@virta/chart-core';
import type { Table, ViewSpec } from '@virta/contracts';

const OUT = 'out/visual/parity';
const CWD = () => process.cwd().replace(/\\/g, '/');
const VIRT = (args: string[]) =>
  execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { encoding: 'utf8', shell: true });

const spec = (view: string, extra: Partial<ViewSpec> = {}): ViewSpec =>
  ({ version: 1, view: view as never, ...extra }) as ViewSpec;

async function nodeHash(file: string, view: string, s: ViewSpec): Promise<string> {
  const loaded = await readInput(file);
  const t = rawToTable(loaded.result!.raw as never, loaded.source) as Table;
  return modelHash(adaptInput({ table: t }, view as never, s).model);
}

// [name, 输入, view, CLI 参数, Node 端 spec]
const CASES: [string, string, string, string[], ViewSpec][] = [
  ['bar', 'examples/basic/sample.csv', 'bar', [], spec('bar')],
  ['grid-derive', 'examples/packs/delivery/deadline.csv', 'grid',
    ['--spec', `${OUT}/grid-derive.spec.json`, '--variant', 'detail'],
    spec('grid', { variant: 'detail', time: { asOf: '2025-10-20T17:00:00+08:00', tz: 'Asia/Shanghai' }, derive: [{ type: 'dueStatus', due: '结束', done: '实际完成' }] as never })],
  ['line-gap', `${OUT}/gap.csv`, 'line',
    ['--set', 'options.missingValue=zero'], spec('line', { options: { missingValue: 'zero' } as never })],
  ['gantt-asof', 'examples/basic/sample-gantt.csv', 'gantt',
    ['--as-of', '2025-10-20T17:00:00+08:00', '--tz', 'Asia/Shanghai'],
    spec('gantt', { time: { asOf: '2025-10-20T17:00:00+08:00', tz: 'Asia/Shanghai' } })],
  ['bar-mapping', 'examples/basic/sample-multi.csv', 'bar',
    ['--set', 'mapping.label=series'], spec('bar', { mapping: { label: 'series' } })],
  ['compose-mapping', 'examples/packs/retail/compose.json', 'compose', [], spec('bar')],
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/gap.csv`, '月份,数值\n1月,10\n2月,\n3月,30\n', 'utf8');
  writeFileSync(`${OUT}/grid-derive.spec.json`, JSON.stringify({
    version: 1, view: 'grid', variant: 'detail',
    time: { asOf: '2025-10-20T17:00:00+08:00', tz: 'Asia/Shanghai' },
    derive: [{ type: 'dueStatus', due: '结束', done: '实际完成' }],
  }), 'utf8');
  for (const [, file, view, args] of CASES) {
    if (view === 'compose') VIRT(['compose', file, '--export', 'html', '--out', OUT]);
    else VIRT(['render', file, '--view', view, ...args, '--export', 'html', '--out', OUT]);
  }
});

for (const [name, file, view, , s] of CASES) {
  test(`parity ${name}：浏览器 modelHash === Node adaptInput`, async ({ page }) => {
    const isCompose = view === 'compose';
    const stem = file.replace(/\.[^.]+$/, '').split('/').pop();
    const html = isCompose
      ? `${OUT}/compose-grid-light.html`
      : `${OUT}/${stem}-${view}${s.variant ? `-${s.variant}` : ''}-light.html`;
    await page.goto('file://' + `${CWD()}/${html}`);
    await page.waitForSelector('#virta-app');
    await page.waitForFunction(() => (window as never as { __VIRTA__?: { modelHash?: string; panels?: { modelHash?: string }[] } }).__VIRTA__);
    if (isCompose) {
      await page.waitForFunction(() => {
        const p = (window as never as { __VIRTA__: { panels: { modelHash?: string }[] } }).__VIRTA__;
        return p.panels.every((x) => typeof x.modelHash === 'string');
      });
      const hashes = await page.evaluate(() => (window as never as { __VIRTA__: { panels: { modelHash: string; spec: ViewSpec; table: Table }[] } }).__VIRTA__.panels.map((x) => x.modelHash));
      // compose 面板 model 与 payload.table+spec 端侧 adapt 一致（含 mapping/derive/time 继承）
      const payload = await page.evaluate(() => (window as never as { __VIRTA__: { panels: { view: string; spec: ViewSpec; table: Table; doc?: string }[] } }).__VIRTA__.panels);
      for (let i = 0; i < payload.length; i++) {
        const p = payload[i]!;
        const m = adaptInput({ table: p.doc === undefined ? p.table : undefined, doc: p.doc, name: 'x' }, p.view as never, p.spec).model;
        expect(hashes[i], `panel ${i} ${p.view}`).toBe(modelHash(m));
      }
    } else {
      await page.waitForFunction(() => typeof (window as never as { __VIRTA__?: { modelHash?: string } }).__VIRTA__?.modelHash === 'string');
      const got = await page.evaluate(() => (window as never as { __VIRTA__: { modelHash: string } }).__VIRTA__.modelHash);
      // Node 端需与 CLI 相同的 time 写回：spec 缺省时 CLI 已写入 asOf/tz
      const payloadSpec = await page.evaluate(() => (window as never as { __VIRTA__: { spec: ViewSpec } }).__VIRTA__.spec);
      expect(got).toBe(await nodeHash(file, view, { ...s, time: payloadSpec.time }));
    }
  });
}
