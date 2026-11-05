// 场景包验收（§8.1/§9）：pack.json 里声明 expectTop 的条目推荐第一名必须一致；
// expectInsight 的条目洞察必须含该 kind。
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViewId, ViewSpec } from '@virta/contracts';
import { readInput } from '../src/node/index.js';
import { rawToTable, profileTable, recommend, ADAPTERS, DOC_ADAPTER, insights } from '../src/index.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKS_DIR = path.join(REPO, 'examples/packs');

interface PackChart { id: string; file: string; spec: ViewSpec; expectTop?: string; expectInsight?: string }
interface Pack { id: string; charts: PackChart[] }

const packs = fs.readdirSync(PACKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => JSON.parse(fs.readFileSync(path.join(PACKS_DIR, d.name, 'pack.json'), 'utf8')) as Pack);

describe('场景包 expectTop / expectInsight', () => {
  it('pack 数量 = 5', () => expect(packs.length).toBe(5));
  for (const pack of packs) {
    for (const c of pack.charts) {
      const f = path.join(PACKS_DIR, pack.id, c.file);
      if (c.file.endsWith('.md') || c.file.endsWith('.txt')) {
        it(`${pack.id}/${c.file} → report`, async () => {
          const loaded = await readInput(f);
          expect(loaded.docText).toBeTruthy();
          const doc = DOC_ADAPTER.buildDoc(loaded.docText!, c.id);
          expect((doc as { metrics: unknown[] }).metrics.length).toBeGreaterThan(0);
        });
        continue;
      }
      it(`${pack.id}/${c.file} → ${c.expectTop ?? '（无断言）'}`, async () => {
        const loaded = await readInput(f);
        const table = rawToTable(loaded.result!.raw, loaded.source);
        const rec = recommend(profileTable(table), table);
        expect(rec.length).toBeGreaterThan(0);
        if (c.expectTop) expect(rec[0].view).toBe(c.expectTop);
        if (c.expectInsight) {
          const adapter = ADAPTERS[c.spec.view as ViewId];
          expect(adapter, `${c.spec.view} 适配器`).toBeTruthy();
          const { model } = adapter!.adapt(table, c.spec);
          const kinds = insights(c.spec.view as ViewId, model, c.spec).map((i) => i.kind);
          expect(kinds).toContain(c.expectInsight);
        }
      });
    }
  }
});
