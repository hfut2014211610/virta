// gallery 命令：全部场景包图表 + 全部图族 → 640×360 真图缩略图 + 交互版 HTML + 双标签页画廊。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEW_IDS, getContract, type Theme, type PaletteId, type ViewId, type ViewSpec } from '@virta/contracts';
import { rawToTable, profileTable, recommend, ADAPTERS } from '@virta/data-engine';
import type { Table } from '@virta/contracts';
import { readInput } from '@virta/data-engine/node';
import { renderChart, fail } from './render.js';
import { listPacks } from './demo.js';

const PACKS_DIR = join('examples', 'packs');
const BASIC_DIR = join('examples', 'basic');

interface PackChart { id: string; file: string; question?: string; spec?: ViewSpec }
interface PackJson { id: string; title?: string; charts: PackChart[] }

export interface GalleryItem {
  key: string; title: string; sub: string; view: string;
  file: string; dir: string; spec?: ViewSpec; doc?: boolean;
}

export interface GalleryJob { out: string; scale: number; fontFiles: string[]; theme?: Theme; palette?: PaletteId }

export function loadPacks(): PackJson[] {
  return listPacks().map((id) => JSON.parse(readFileSync(join(PACKS_DIR, id, 'pack.json'), 'utf8')) as PackJson);
}

/** 每个图族的示例来源：优先 pack 图表，其次 basic 样例（recommend top-1 命中），report 找 md/txt。 */
export async function familyExamples(packs: PackJson[]): Promise<Map<string, GalleryItem>> {
  const out = new Map<string, GalleryItem>();
  const take = (v: string, it: GalleryItem) => { if (!out.has(v)) out.set(v, it); };
  for (const p of packs) {
    for (const c of p.charts) {
      const v = c.spec?.view;
      if (!v) continue;
      take(v, { key: `v-${v}`, title: c.question ?? c.id, sub: `${p.title ?? p.id}`, view: v, file: c.file, dir: join(PACKS_DIR, p.id), spec: c.spec });
    }
  }
  // report：md/txt 文档示例
  for (const p of packs) {
    const d = join(PACKS_DIR, p.id);
    for (const f of readdirSync(d)) {
      if (/\.(md|txt)$/.test(f)) { take('report', { key: 'v-report', title: f, sub: p.title ?? p.id, view: 'report', file: f, dir: d, doc: true }); break; }
    }
  }
  // basic 样例兜底：recommend top-1
  if (existsSync(BASIC_DIR)) {
    const basicFiles = readdirSync(BASIC_DIR).filter((f) => /\.(csv|json|xlsx)$/i.test(f)).sort();
    const tables: { f: string; table: Table }[] = [];
    for (const f of basicFiles) {
      const l = await readInput(join(BASIC_DIR, f));
      if (!l.result) continue;
      const table = rawToTable(l.result.raw as never, l.source);
      tables.push({ f, table });
      const top = recommend(profileTable(table), table)[0];
      if (!top || out.has(top.view)) continue;
      take(top.view, {
        key: `v-${top.view}`, title: f, sub: 'examples/basic', view: top.view, file: f, dir: BASIC_DIR,
        spec: { version: 1, view: top.view as ViewId, mapping: top.mapping, variant: top.variant },
      });
    }
    // 仍未覆盖的视图（3d/kpi 等不会赢 top-1）：逐文件试 adapt，首个成功者为示例
    for (const v of VIEW_IDS) {
      if (out.has(v as string) || v === 'report') continue;
      const adapter = ADAPTERS[v];
      if (!adapter) continue;
      for (const { f, table } of tables) {
        try {
          adapter.adapt(table, { version: 1, view: v } as ViewSpec);
          take(v as string, { key: `v-${v}`, title: f, sub: 'examples/basic', view: v as string, file: f, dir: BASIC_DIR, spec: { version: 1, view: v } });
          break;
        } catch { /* 不适配，下一个 */ }
      }
    }
  }
  return out;
}

async function renderItem(it: GalleryItem, job: GalleryJob): Promise<{ png?: string; html?: string; view: string }> {
  const fpath = join(it.dir, it.file);
  if (!existsSync(fpath)) return { view: it.view };
  const l = await readInput(fpath);
  const isDoc = l.docText !== undefined;
  const table: Table = l.result ? rawToTable(l.result.raw as never, l.source) : { columns: [], rows: [], source: { name: it.file, format: 'md' as const, rows: 0 } };
  const spec: ViewSpec = { version: 1, theme: job.theme ?? 'light', palette: job.palette ?? 'signal', ...(it.spec ?? {}), view: it.view as ViewId };
  const mk = (formats: ('png' | 'html')[], out: string, w: number, h: number, scale: number) => renderChart({
    table, spec, formats, doc: isDoc ? l.docText : undefined,
    out, stem: it.key, width: w, height: h, scale, frame: 'card', fontFiles: job.fontFiles,
  });
  const pngDir = join(job.out, 'png'), htmlDir = join(job.out, 'html');
  const png = await mk(['png'], pngDir, 640, 360, 1);
  const html = await mk(['html'], htmlDir, 1200, 675, job.scale);
  return { png: png.files[0]?.path, html: html.files[0]?.path, view: it.view };
}

export async function runGallery(job: GalleryJob): Promise<{ items: number; views: number; packs: number; index: string }> {
  const packs = loadPacks();
  const theme = job.theme ?? 'light';
  mkdirSync(join(job.out, 'png'), { recursive: true });
  mkdirSync(join(job.out, 'html'), { recursive: true });

  // 按场景：每个 pack 图表一张卡
  const sceneGroups: { pack: string; items: (GalleryItem & { png?: string; html?: string })[] }[] = [];
  for (const p of packs) {
    const items: (GalleryItem & { png?: string; html?: string })[] = [];
    for (const c of p.charts) {
      if (!c.spec?.view) continue;
      const it: GalleryItem = { key: `s-${p.id}-${c.id}`, title: c.question ?? c.id, sub: c.spec.view as string, view: c.spec.view as string, file: c.file, dir: join(PACKS_DIR, p.id), spec: c.spec };
      const r = await renderItem(it, job);
      items.push({ ...it, png: r.png, html: r.html });
    }
    sceneGroups.push({ pack: p.title ?? p.id, items });
  }

  // 按图族
  const fam = await familyExamples(packs);
  const famItems: (GalleryItem & { png?: string; html?: string })[] = [];
  for (const v of VIEW_IDS) {
    const it = fam.get(v as string);
    if (!it) continue;
    const c = getContract(v);
    const r = await renderItem({ ...it, title: c?.title ?? it.title, sub: v }, job);
    famItems.push({ ...it, title: c?.title ?? it.title, sub: v, png: r.png, html: r.html });
  }

  // index.html：hero + 双标签页（统计数字取自 contract 注册表，非手写）
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const card = (it: { title: string; sub: string; png?: string; html?: string }) => `
      <a class="card" ${it.html ? `href="${it.html.split(/[\\/]/).slice(-2).join('/')}"` : ''}>
        ${it.png ? `<img src="${it.png.split(/[\\/]/).slice(-2).join('/')}" loading="lazy" alt="">` : '<div class="thumb"></div>'}
        <div class="ct">${esc(it.title)}</div><div class="cs">${esc(it.sub)}</div>
      </a>`;
  const sceneTab = sceneGroups.map((g) => `
    <div class="grp"><h3>${esc(g.pack)}</h3><div class="grid">${g.items.map(card).join('')}</div></div>`).join('');
  const famTab = `<div class="grid">${famItems.map(card).join('')}</div>`;
  const stats = `${famItems.length} 图族 · ${packs.length} 场景 · ${sceneGroups.reduce((a, g) => a + g.items.length, 0)} 图表`;
  const dark = theme === 'dark';
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virta 画廊</title><style>
:root{${dark ? '--bg:#141711;--ink:#e8e6dd;--mut:#8a9084;--card:#1d211a;--line:#2c3126;--acc:#d2a94e' : '--bg:#f7f5ef;--ink:#1e2420;--mut:#6b7268;--card:#fff;--line:#e3e0d4;--acc:#0f766e'}}
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans CJK SC",system-ui,sans-serif;background:var(--bg);color:var(--ink);
background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:56px 56px}
.hero{padding:72px 7vw 32px;border-bottom:1px solid var(--line)}
.hero h1{font-size:56px;letter-spacing:.05em;margin:0 0 10px}.hero h1 em{font-style:normal;color:var(--acc)}
.hero .sub{color:var(--mut);font-size:14px}
.tabs{display:flex;gap:8px;padding:20px 7vw 0}
.tabs button{font:inherit;font-weight:600;padding:8px 18px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--mut);cursor:pointer}
.tabs button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.tab{display:none;padding:28px 7vw 64px}.tab.on{display:block}
.grp h3{font-size:15px;color:var(--mut);margin:26px 0 14px;letter-spacing:.1em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s}
.card:hover{transform:translateY(-2px)}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border-bottom:1px solid var(--line)}
.thumb{width:100%;aspect-ratio:16/9;background:var(--line)}
.ct{font-weight:600;padding:12px 14px 2px;font-size:14px}.cs{color:var(--mut);font-size:12px;padding:0 14px 12px}
</style></head><body>
<div class="hero"><h1>VIRTA <em>画廊</em></h1><div class="sub">${stats}</div></div>
<div class="tabs"><button class="on" data-t="t-scene">按场景</button><button data-t="t-fam">按图族</button></div>
<div id="t-scene" class="tab on">${sceneTab}</div>
<div id="t-fam" class="tab">${famTab}</div>
<script>document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById(b.dataset.t).classList.add('on')})</script>
</body></html>`;
  const index = join(job.out, 'index.html');
  writeFileSync(index, html, 'utf8');
  return { items: sceneGroups.reduce((a, g) => a + g.items.length, 0) + famItems.length, views: famItems.length, packs: packs.length, index };
}
