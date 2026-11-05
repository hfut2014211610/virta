// golden 对拍：cases.json 每条 = legacy to_*(read_raw) 导出 vs TS adapter 输出，深比较。
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInput } from '../src/node/index.js';
import { ADAPTERS, DOC_ADAPTER } from '../src/families/index.js';
import type { Raw } from '../src/families/barline.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LEGACY = path.join(REPO, 'legacy-vizscape');
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
      expect(JSON.parse(JSON.stringify(model))).toEqual(golden.model);
    });
  }
});
