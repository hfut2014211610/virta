// 视觉 QA 矩阵（§M8）：全部图族 × 双主题 × signal/patina/mono 配色 → out/qa/<view>/<theme>-<pal>.png + index.html。
// 供人工/Agent 逐张检查标签碰撞、溢出与对比度；不提交产物（out/ 已在 .gitignore）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEW_IDS } from '@virta/contracts';
import type { PaletteId, Theme, ViewId, ViewSpec } from '@virta/contracts';
import { rawToTable, type Table } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { renderChart } from '../../packages/cli/src/render.js';
import { familyExamples, loadPacks } from '../../packages/cli/src/gallery.js';

const OUT = process.argv[2] ?? 'out/qa';
const THEMES: Theme[] = ['light', 'dark'];
const PALETTES: PaletteId[] = ['signal', 'patina', 'mono'];

const packs = loadPacks();
const examples = await familyExamples(packs);
const results: { view: string; theme: Theme; pal: PaletteId; file?: string; err?: string }[] = [];

for (const v of VIEW_IDS) {
  const it = examples.get(v as string);
  if (!it) { for (const th of THEMES) for (const p of PALETTES) results.push({ view: v, theme: th, pal: p, err: '无示例' }); continue; }
  const fpath = join(it.dir, it.file);
  const l = await readInput(fpath);
  const isDoc = l.docText !== undefined;
  const table: Table = l.result ? rawToTable(l.result.raw as never, l.source) : { columns: [], rows: [], source: { name: it.file, format: 'md', rows: 0 } };
  const dir = join(OUT, v);
  mkdirSync(dir, { recursive: true });
  for (const th of THEMES) {
    for (const p of PALETTES) {
      const spec: ViewSpec = { version: 1, theme: th, palette: p, ...(it.spec ?? {}), view: v as ViewId };
      try {
        const r = await renderChart({
          table, spec, formats: ['png'], doc: isDoc ? l.docText : undefined,
          out: dir, stem: `${th}-${p}`, width: 1200, height: 675, scale: 1, frame: 'card', fontFiles: [],
        });
        results.push({ view: v, theme: th, pal: p, file: r.files[0]?.path });
      } catch (e) {
        results.push({ view: v, theme: th, pal: p, err: (e as Error).message });
      }
    }
  }
  console.log(`${v} 完成`);
}

// 汇总页：按图族分组，6 张并排
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const groups = VIEW_IDS.map((v) => {
  const cells = results.filter((r) => r.view === v).map((r) =>
    r.err ? `<div class="cell err"><b>${r.theme}/${r.pal}</b><br>${esc(r.err)}</div>`
      : `<div class="cell"><img src="${v}/${r.theme}-${r.pal}-${v}-${r.theme}.png" loading="lazy"><span>${r.theme}/${r.pal}</span></div>`
  ).join('');
  return `<h2>${v}</h2><div class="row">${cells}</div>`;
}).join('\n');
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Virta QA 矩阵</title><style>
body{font-family:system-ui,sans-serif;background:#222;color:#ddd;padding:24px}h1{font-size:22px}h2{margin:28px 0 8px;font-size:16px}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cell{position:relative}.cell img{width:100%;display:block;border:1px solid #444}
.cell span{position:absolute;left:6px;top:6px;font-size:11px;background:#000a;padding:2px 6px;border-radius:4px}
.err{border:1px solid #a33;color:#f88;padding:18px;font-size:12px}
</style></head><body><h1>视觉 QA 矩阵 · ${VIEW_IDS.length} 图族 × 2 主题 × 3 配色</h1>${groups}</body></html>`, 'utf8');

const fails = results.filter((r) => r.err);
console.log(`QA 矩阵 → ${OUT}/index.html · ${results.length - fails.length}/${results.length} 成功${fails.length ? `，失败：${fails.map((f) => `${f.view}(${f.theme}/${f.pal})`).join(', ')}` : ''}`);
