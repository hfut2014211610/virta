// ADR-0014 严格 spec 校验（C7/C8）：仓库内全部 spec 必须过 validateSpec；
// 顶层键白名单测试锁定与 ViewSpec/Schema 一致。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getContract, resolveView, validateSpec, VIEW_SPEC_KEYS, VIEW_SPEC_SCHEMA } from '@virta/contracts';
import { adaptInput } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { rawToTable } from '@virta/data-engine';
import type { ViewSpec, ViewId } from '@virta/contracts';

const EXAMPLES = 'examples';

const walkJson = (dir: string, match: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkJson(join(dir, e.name), match) : match.test(e.name) ? [join(dir, e.name)] : []);

const check = (spec: unknown, label: string) => {
  const view = (spec as ViewSpec).view;
  const rv = view && view !== 'auto' ? resolveView(view as string) : undefined;
  const vr = validateSpec(spec, rv ? getContract(rv.view) : undefined);
  expect(vr, label).toMatchObject({ ok: true });
};

describe('仓库内 spec 全部通过 validateSpec', () => {
  const packs = walkJson(EXAMPLES, /pack\.json$/);
  const composes = walkJson(EXAMPLES, /compose[^/\\]*\.json$/);
  it(`pack.json（${packs.length} 个）`, () => {
    for (const f of packs) {
      const pack = JSON.parse(readFileSync(f, 'utf8')) as { charts?: { id: string; spec: { text?: { title?: string } } } };
      for (const c of pack.charts ?? []) {
        check(c.spec, `${f} → ${c.id}`);
        // H4/D3：场景包每张图必须有中文标题（标题兜底链第一档）
        expect(typeof c.spec.text?.title === 'string' && c.spec.text.title.length > 0, `${f} → ${c.id} 缺 spec.text.title`).toBe(true);
      }
    }
  });
  it(`compose json（${composes.length} 个）`, () => {
    for (const f of composes) {
      const cf = JSON.parse(readFileSync(f, 'utf8')) as { panels?: { id?: string; file?: string; spec: unknown }[] };
      for (const [i, p] of (cf.panels ?? []).entries()) {
        check({ ...((p as { spec?: object }).spec ?? {}), version: 1 }, `${f} → panel ${p.id ?? p.file ?? i}`);
      }
    }
  });
});

describe('顶层键与 Schema/ViewSpec 一致（C7 测试锁定）', () => {
  it('VIEW_SPEC_KEYS === schema.properties', () => {
    expect([...VIEW_SPEC_KEYS].sort()).toEqual(Object.keys(VIEW_SPEC_SCHEMA.properties).sort());
  });
});

describe('validateSpec 错误路径', () => {
  const c = getContract('line')!;
  const bad = (spec: unknown, contract = c) => (validateSpec(spec, contract) as { ok: false; error: { code: string; message: string; hint?: string } }).error;
  it('未知顶层键 → INVALID_SPEC', () => {
    expect(bad({ version: 1, view: 'line', bogud: 1 }).code).toBe('INVALID_SPEC');
  });
  it('非法枚举值 → INVALID_OPTION + 最近值 hint', () => {
    const e = bad({ version: 1, view: 'line', options: { missingValue: 'bogus' } });
    expect(e.code).toBe('INVALID_OPTION');
    expect(e.hint).toContain('gap');
  });
  it('未声明选项键 → INVALID_OPTION + 最近键 hint', () => {
    const e = bad({ version: 1, view: 'line', options: { missingValu: 'gap' } });
    expect(e.code).toBe('INVALID_OPTION');
    expect(e.hint).toContain('missingValue');
  });
  it('未知 theme/palette/variant → INVALID_OPTION', () => {
    expect(bad({ version: 1, view: 'line', theme: 'neon' }).code).toBe('INVALID_OPTION');
    expect(bad({ version: 1, view: 'line', palette: 'neon' }).code).toBe('INVALID_OPTION');
    expect(bad({ version: 1, view: 'line', variant: 'neon' }).code).toBe('INVALID_OPTION');
  });
  it('number 越界 / 类型错 → INVALID_OPTION', () => {
    const opt = c.options.find((o) => o.type === 'number' && o.min !== undefined);
    if (opt) expect(bad({ version: 1, view: 'line', options: { [opt.key]: (opt.max ?? 1e9) + 1 } }).code).toBe('INVALID_OPTION');
    expect(bad({ version: 1, view: 'line', options: { connectGaps: 'x' } }).code).toBe('INVALID_OPTION');
  });
  it('derive 非数组（shell 引号被吃）→ INVALID_SPEC', () => {
    expect(bad({ version: 1, view: 'grid', derive: '[{type:dueStatus}]' }, getContract('grid')).code).toBe('INVALID_SPEC');
  });
  it('未知视图 → INVALID_OPTION', () => {
    expect(bad({ version: 1, view: 'pizza' }, undefined).code).toBe('INVALID_OPTION');
  });
});

describe('洞察 importance ∈ [0,1]（契约测试，B17）', () => {
  it('代表性输入各视图 insights 取值在区间内', async () => {
    const CASES: [string, string, ViewSpec?][] = [
      ['examples/basic/sample.csv', 'bar'],
      ['examples/basic/sample-multi.csv', 'line'],
      ['examples/basic/sample-gantt.csv', 'gantt', { version: 1, view: 'gantt', time: { asOf: '2025-10-20T09:00:00+08:00', tz: 'Asia/Shanghai' } } as ViewSpec],
      ['examples/basic/sample-grid.csv', 'grid'],
      ['examples/packs/delivery/deadline.brief.md', 'report'],
      ['examples/basic/sample-funnel.csv', 'funnel'],
      ['examples/basic/sample-radar.csv', 'radar'],
    ];
    let n = 0;
    for (const [f, view, s] of CASES) {
      if (!existsSync(f)) continue;
      const loaded = await readInput(f);
      const t = loaded.docText !== undefined ? undefined : rawToTable(loaded.result!.raw as never, loaded.source);
      const out = adaptInput({ table: t, doc: loaded.docText, name: f }, view as ViewId, s ?? ({ version: 1, view } as ViewSpec));
      for (const i of out.insights) {
        expect(i.importance, `${f}(${view}): ${i.text.slice(0, 20)}`).toBeGreaterThanOrEqual(0);
        expect(i.importance, `${f}(${view}): ${i.text.slice(0, 20)}`).toBeLessThanOrEqual(1);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('resolveView（C8 别名统一入口）', () => {
  it('pivot → grid + variant pivot', () => {
    expect(resolveView('pivot')).toEqual({ view: 'grid', variant: 'pivot' });
  });
  it('heat/fish/spc → 规范 id；未知 → undefined', () => {
    expect(resolveView('heat')?.view).toBe('heatmap');
    expect(resolveView('spc')?.view).toBe('control');
    expect(resolveView('pizza')).toBeUndefined();
  });
  it('规范 id 原样返回', () => {
    expect(resolveView('bar')).toEqual({ view: 'bar' });
  });
});
