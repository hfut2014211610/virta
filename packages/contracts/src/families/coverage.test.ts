import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACTS } from './index.js';
import { VIEW_IDS } from '../views.js';

// M1 DoD：每个 contract 的 options 数量 ≥ 对应 legacy 模板中非主题按钮组的组数
// （组 = template.html 里的 <span class="label">，themeSeg 在 header 不计入）。

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const TPL = path.join(REPO, 'legacy-vizscape', 'templates');

/** 模板目录名 → view id（特例：bar-matrix→matrix3d；其余去 -basic 后缀） */
function templateToView(dir: string): string {
  if (dir === 'bar-matrix') return 'matrix3d';
  return dir.replace(/-basic$/, '');
}

function labelGroupCount(file: string): number {
  return (fs.readFileSync(file, 'utf8').match(/class="label"/g) ?? []).length;
}

const dirs = fs.readdirSync(TPL, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(TPL, d.name, 'template.html')))
  .map((d) => d.name);

describe('contract 覆盖 legacy 模板', () => {
  it('每个 legacy 模板目录都有对应 contract', () => {
    for (const dir of dirs) {
      const view = templateToView(dir);
      expect(VIEW_IDS, `${dir} → ${view}`).toContain(view);
      const c = CONTRACTS[view as keyof typeof CONTRACTS];
      expect(c, `${dir} → ${view}`).toBeTruthy();
      expect(c!.legacyTemplate).toBe(dir);
    }
  });

  for (const dir of dirs) {
    const view = templateToView(dir);
    it(`${view}: options ≥ ${dir} 非主题按钮组数`, () => {
      const groups = labelGroupCount(path.join(TPL, dir, 'template.html'));
      const c = CONTRACTS[view as keyof typeof CONTRACTS]!;
      expect(c.options.length, `options ${c.options.length} < groups ${groups}`).toBeGreaterThanOrEqual(groups);
    });
  }

  it('contract 结构完整：required roles、枚举 default 合法、view 一致', () => {
    for (const [view, c] of Object.entries(CONTRACTS)) {
      expect(c!.view).toBe(view);
      expect(c!.version).toBe(1);
      // grid 的 dims/values 二选一、tree 的 id+parent / level 二选一，可无必选 role；其余图族须至少一个 required
      if (view !== 'grid' && view !== 'tree') expect(c!.roles.some((r) => r.required), view).toBe(true);
      expect(c!.roles.length, view).toBeGreaterThan(0);
      for (const o of c!.options) {
        if (o.type === 'enum') {
          expect(o.values?.map((v) => v.value), `${view}.${o.key}`).toContain(String(o.default));
        }
      }
      for (const v of c!.variants ?? []) {
        expect(v.id, `${view}.variants`).toBeTruthy();
      }
    }
  });
});
