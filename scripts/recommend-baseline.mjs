// 重新生成 test/recommend/baseline.json：corpus+pack expectTop 文件的 top1/top3。
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { profileTable, rawToTable, recommend } from '../packages/data-engine/src/index.ts';
import { readInput } from '../packages/data-engine/src/node/index.ts';

const corpus = JSON.parse(readFileSync('test/recommend/corpus.json', 'utf8'));
const files = corpus.map((c) => c.file);
// pack.json expectTop 同样纳入语料范围
for (const pk of readdirSync('examples/packs')) {
  const pj = join('examples/packs', pk, 'pack.json');
  if (!existsSync(pj)) continue;
  for (const ch of JSON.parse(readFileSync(pj, 'utf8')).charts ?? []) {
    if (ch.expectTop && ch.file) files.push(join('examples/packs', pk, ch.file));
  }
}
const out = {};
for (const f of [...new Set(files)]) {
  const loaded = await readInput(f);
  if (loaded.docText !== undefined || !loaded.result) continue;
  const table = rawToTable(loaded.result.raw, loaded.source);
  const top3 = recommend(profileTable(table), table, 3).map((c) => c.view);
  out[f] = { top1: top3[0] ?? null, top3 };
}
writeFileSync('test/recommend/baseline.json', JSON.stringify(out, null, 1));
console.log(`baseline 更新：${Object.keys(out).length} 个文件`);
