// golden 对拍：cases.json 每条 = legacy to_*(read_raw) 导出 vs TS adapter 输出，深比较。
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInput } from '../src/node/index.js';
import { ADAPTERS, DOC_ADAPTER } from '../src/families/index.js';
import type { Raw } from '../src/families/barline.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LEGACY = path.join(REPO, 'archive/legacy-vizscape');
const CASES = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/golden/cases.json'), 'utf8')).cases as {
  id: string; file: string; view: string; fn: string;
}[];
const GOLDEN_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/golden';

describe('golden 对拍', () => {
  for (const c of CASES) {
    it(c.id, async () => {
      const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${c.id}.json`), 'utf8'));
      const loaded = await readInput(path.join(LEGACY, c.file));
      let model: unknown;
      if (c.fn === 'docmd.build_doc') {
        expect(loaded.docText, 'doc 用例应产生 docText').toBeTruthy();
        model = DOC_ADAPTER.buildDoc(loaded.docText!, path.basename(c.file, path.extname(c.file)));
      } else {
        const adapter = ADAPTERS[c.view as keyof typeof ADAPTERS];
        expect(adapter, `view ${c.view} 无适配器`).toBeTruthy();
        model = adapter!.adaptRaw(loaded.result!.raw as Raw);
      }
      // ADR-0011：model 默认 gap（null=未观测），golden 锁 legacy 补 0 行为——比较前归一化；
      // gap/zero 语义本身由 test/repro/phase2a.test.ts 的 F4 用例覆盖。
      const mv = model as { series?: { values: (number | null)[] }[] };
      mv.series?.forEach((s) => { s.values = s.values.map((v) => v ?? 0); });
      // A8（M2a.5）：gantt 新增 baseline/actual/slipDays/lateDays/hasBaseline/hasActual——
      // golden 锁 legacy 形状，比较前剥掉；A8 语义由 F6 用例覆盖。
      const gm = model as { tasks?: Record<string, unknown>[]; hasBaseline?: boolean; hasActual?: boolean; quality?: { mapping?: Record<string, string> } };
      if (gm.tasks?.length && 'baseline' in gm.tasks[0]!) {
        delete gm.hasBaseline; delete gm.hasActual;
        delete gm.quality?.mapping?.['baseline']; delete gm.quality?.mapping?.['actual'];
        gm.tasks.forEach((t) => { delete t['baseline']; delete t['actual']; delete t['slipDays']; delete t['lateDays']; });
      }
      expect(JSON.parse(JSON.stringify(model))).toEqual(golden.model);
    });
  }
});
