// C11 语料驱动推荐回归：首选准确率 ≥0.9；相对 baseline 无回退；新增正确判断提示更新。
import { describe, expect, it, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { profileTable, rawToTable, recommend } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import type { Table, ViewId } from '@virta/contracts';

interface CorpusEntry { file: string; expect?: { view: string; variant?: string }; acceptable?: ViewId[]; note?: string }
const corpus = JSON.parse(readFileSync('test/recommend/corpus.json', 'utf8')) as CorpusEntry[];
// pack.json expectTop 并入语料（单源，不复制）
interface PackChart { file: string; expectTop?: ViewId }
for (const pk of readdirSync('examples/packs')) {
  const pj = join('examples/packs', pk, 'pack.json');
  if (!existsSync(pj)) continue;
  for (const ch of (JSON.parse(readFileSync(pj, 'utf8')) as { charts?: PackChart[] }).charts ?? []) {
    if (ch.expectTop && ch.file) corpus.push({ file: `examples/packs/${pk}/${ch.file}`, expect: { view: ch.expectTop } });
  }
}
const baseline = existsSync('test/recommend/baseline.json')
  ? (JSON.parse(readFileSync('test/recommend/baseline.json', 'utf8')) as Record<string, { top1: ViewId | null; top3: ViewId[] }>)
  : {};

const ok = (e: CorpusEntry, top: { view: ViewId; variant?: string } | undefined): boolean => {
  if (!top) return false;
  if (e.expect && top.view === e.expect.view && (!e.expect.variant || top.variant === e.expect.variant)) return true;
  return e.acceptable?.includes(top.view) ?? false;
};

const results: { e: CorpusEntry; top: { view: ViewId; variant?: string } | undefined; correct: boolean }[] = [];
const top3Map: Record<string, ViewId[]> = {};

beforeAll(async () => {
  for (const e of corpus) {
    const f = e.file;
    if (!existsSync(f)) { results.push({ e, top: undefined, correct: false }); continue; }
    const loaded = await readInput(f);
    if (loaded.docText !== undefined || !loaded.result) { results.push({ e, top: undefined, correct: true }); continue; }
    const table = rawToTable(loaded.result.raw as never, loaded.source) as Table;
    const cands = recommend(profileTable(table), table, 3);
    top3Map[f] = cands.map((c) => c.view);
    results.push({ e, top: cands[0], correct: ok(e, cands[0]) });
  }
});

describe('C11 推荐语料', () => {
  it('首选准确率 ≥0.9（expect 或 acceptable 命中即算对）', () => {
    const n = results.length, good = results.filter((r) => r.correct).length;
    const misses = results.filter((r) => !r.correct).map((r) => `${r.e.file} → ${r.top?.view ?? '（空）'}（期望 ${r.e.expect?.view ?? r.e.acceptable?.join('/')}）`);
    if (misses.length) console.warn(`失误 ${misses.length}/${n}：\n${misses.join('\n')}`);
    expect(good / n).toBeGreaterThanOrEqual(0.9);
  });
  it('相对 baseline 无回退（曾判对的不得变错）', () => {
    const regressions: string[] = [];
    for (const e of corpus) {
      const f = e.file;
      const b = baseline[f];
      if (!b?.top1) continue;
      const wasCorrect = e.expect ? b.top1 === e.expect.view : (e.acceptable?.includes(b.top1) ?? false);
      const nowCorrect = results.find((r) => r.e === e)?.correct ?? false;
      if (wasCorrect && !nowCorrect) regressions.push(`${f}: 曾 ${b.top1} → 现 ${results.find((r) => r.e === e)?.top?.view ?? '（空）'}`);
    }
    expect(regressions, regressions.join('\n')).toHaveLength(0);
  });
  it('D14：3D 图族从不作首选', () => {
    const d3 = new Set(['pie3d', 'line3d', 'scatter3d', 'matrix3d']);
    for (const f of Object.keys(top3Map)) expect(d3.has(top3Map[f]![0]!), f).toBe(false);
  });
  it('新增正确判断时提示更新 baseline', () => {
    const news: string[] = [];
    for (const e of corpus) {
      const f = e.file;
      const b = baseline[f];
      const r = results.find((x) => x.e === e);
      if (r?.correct && (!b || !b.top1 || b.top1 !== r.top?.view)) news.push(`${f} → ${r.top?.view}`);
    }
    if (news.length) console.warn(`以下文件首选变化/新增正确，运行 npm run recommend:baseline 更新基线：\n${news.join('\n')}`);
  });
});
