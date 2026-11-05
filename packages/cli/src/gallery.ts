// gallery 命令：全部场景包图表 + 全部图族 → 640×360 真图缩略图 + 浅/深双主题交互页 + 分组画廊。
// 页面布局沿用 legacy preview：hero 花体标题 + sticky 分组导航 + group-section + 浮窗预览。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEW_IDS, getContract, type Theme, type PaletteId, type ViewId, type ViewSpec } from '@virta/contracts';
import { rawToTable, profileTable, recommend, ADAPTERS } from '@virta/data-engine';
import { buildCss } from '@virta/design-system';
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
interface Rendered { png?: string; light?: string; dark?: string }
interface Group { id: string; eyebrow: string; title: string; desc: string; items: (GalleryItem & Rendered)[] }

export interface GalleryJob { out: string; scale: number; fontFiles: string[]; theme?: Theme; palette?: PaletteId }

export function loadPacks(): PackJson[] {
  return listPacks().map((id) => JSON.parse(readFileSync(join(PACKS_DIR, id, 'pack.json'), 'utf8')) as PackJson);
}

// —— 分组排序：由简入繁，文档垫底；3D 不开新组，并入基类 ——
const FAMILY_ORDER: ViewId[] = [
  'bar', 'line', 'pie', 'combo', 'compare', 'rank', 'bullet', 'kpi',
  'histogram', 'boxplot', 'scatter', 'funnel', 'heatmap', 'sunburst', 'treemap',
  'sankey', 'network', 'tree', 'fishbone', 'gantt', 'cohort', 'radar', 'parallel', 'control', 'grid',
  'report',
];
const MERGE_3D: Partial<Record<ViewId, ViewId>> = { matrix3d: 'bar', line3d: 'line', scatter3d: 'scatter', pie3d: 'pie' };

// 风格展示卡：同一份数据不同皮肤（变体 / options / 配色差异），每族最多 2 张
const STYLE_CARDS: Partial<Record<ViewId, { tag: string; file?: string; variant?: string; options?: Record<string, string | number | boolean>; palette?: PaletteId }[]>> = {
  bar: [
    // 风格演示用普通分组数据——瀑布语义色会盖掉 finish/colorBy
    { tag: '描边', file: 'sample-multi.csv', variant: 'grouped', options: { finish: 'outline', shape: 'rect' }, palette: 'blueprint' },
    { tag: '斜纹', file: 'sample-multi.csv', variant: 'grouped', options: { finish: 'hatch' }, palette: 'patina' },
    { tag: '色阶', file: 'sample-multi.csv', variant: 'grouped', options: { colorBy: 'value' }, palette: 'sundown' },
  ],
  line: [
    { tag: '面积填充·实线', options: { fill: 'area', lineStyle: 'straight' }, palette: 'morandi' },
    { tag: '纹理线', options: { hatch: true }, palette: 'inkwash' },
  ],
  pie: [{ tag: '环内标注', options: { labelMode: 'inside', ringRatio: '0.45' }, palette: 'sundown' }],
  scatter: [
    { tag: '菱点·均值线', options: { marker: 'diamond', meanLines: true, trendline: false }, palette: 'patina' },
    { tag: '方块·标签', options: { marker: 'square', labelMode: 'all' }, palette: 'mono' },
  ],
  histogram: [{ tag: '累计曲线', variant: 'cumulative', palette: 'inkwash' }],
  funnel: [
    { tag: '扁平·左对齐', options: { finish: 'flat', align: 'left' }, palette: 'cinnabar' },
    { tag: '分色', options: { colorMode: 'cat' }, palette: 'aurora' },
  ],
  treemap: [{ tag: '无框紧凑', options: { groupBg: false }, palette: 'aurora' }],
  sankey: [{ tag: '单色流', options: { flowGradient: false }, palette: 'inkwash' }],
  sunburst: [{ tag: '等角', options: { equalAngle: true, arcLabels: false }, palette: 'morandi' }],
  radar: [{ tag: '线框·顶点值', options: { fillPoly: false, vertexLabels: true, ringLabels: true }, palette: 'blueprint' }],
  heatmap: [{ tag: '发散色带·标注', options: { scale: 'diverging', valueLabels: true }, palette: 'sundown' }],
  boxplot: [{ tag: '散点叠加', options: { rawPoints: true }, palette: 'patina' }],
  network: [{ tag: '环形布局', variant: 'circular', palette: 'aurora' }],
  gantt: [{ tag: '状态着色·紧凑', options: { colorBy: 'status', density: 'compact' }, palette: 'signal' }],
  grid: [
    { tag: '紧凑', options: { density: 'compact' }, palette: 'mono' },
    { tag: '斑马纹', options: { zebra: true }, palette: 'blueprint' },
  ],
  fishbone: [{ tag: '右向·无图例', options: { direction: 'right', legend: false }, palette: 'patina' }],
  parallel: [{ tag: '低透明', options: { opacity: 0.35 }, palette: 'aurora' }],
  rank: [{ tag: '单色·数值', options: { valueLabels: true }, palette: 'mono' }],
  bullet: [{ tag: '刻度·差距', options: { scale: true, gapLabels: true }, palette: 'patina' }],
  compare: [{ tag: '哑铃·单色', variant: 'dumbbell', palette: 'mono' }],
  report: [{ tag: '宽版大字', options: { wide: true, fontSize: 16 }, palette: 'inkwash' }],
  kpi: [{ tag: '琥珀', palette: 'dunhuang' }],
};

/** 每个图族的示例来源：优先 pack 图表，其次 basic 样例（recommend top-1 命中），report 找 md/txt。 */
export async function familyExamples(packs: PackJson[]): Promise<Map<string, GalleryItem>> {
  const out = new Map<string, GalleryItem>();
  const take = (v: string, it: GalleryItem) => { if (!out.has(v)) out.set(v, it); };
  // report：优先富排版示例 showcase-report.md（先于 pack 图表占坑，保证文档组呈现富排版）
  if (existsSync(join(BASIC_DIR, 'showcase-report.md'))) {
    take('report', { key: 'v-report', title: 'showcase-report.md', sub: 'examples/basic', view: 'report', file: 'showcase-report.md', dir: BASIC_DIR, doc: true });
  }
  for (const p of packs) {
    for (const c of p.charts) {
      const v = c.spec?.view;
      if (!v) continue;
      take(v, { key: `v-${v}`, title: c.question ?? c.id, sub: `${p.title ?? p.id}`, view: v, file: c.file, dir: join(PACKS_DIR, p.id), spec: c.spec });
    }
  }
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

/** 渲染一件展品：浅色 PNG 缩略图 + 浅/深双主题交互 HTML（同一份数据三份产物）。 */
async function renderItem(it: GalleryItem, job: GalleryJob): Promise<Rendered> {
  const fpath = join(it.dir, it.file);
  if (!existsSync(fpath)) return {};
  const l = await readInput(fpath);
  const isDoc = l.docText !== undefined;
  const table: Table = l.result ? rawToTable(l.result.raw as never, l.source) : { columns: [], rows: [], source: { name: it.file, format: 'md' as const, rows: 0 } };
  const base: ViewSpec = { version: 1, palette: job.palette ?? 'signal', ...(it.spec ?? {}), view: it.view as ViewId };
  const mk = (formats: ('png' | 'html')[], theme: Theme, out: string, w: number, h: number, scale: number) => renderChart({
    table, spec: { ...base, theme }, formats, doc: isDoc ? l.docText : undefined,
    out, stem: it.key, width: w, height: h, scale, frame: 'card', fontFiles: job.fontFiles,
  });
  const pngDir = join(job.out, 'png'), htmlDir = join(job.out, 'html');
  const png = await mk(['png'], 'light', pngDir, 640, 360, 1);
  const light = await mk(['html'], 'light', htmlDir, 1200, 675, job.scale);
  const dark = await mk(['html'], 'dark', htmlDir, 1200, 675, job.scale);
  return { png: png.files[0]?.path, light: light.files[0]?.path, dark: dark.files[0]?.path };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rel = (p?: string) => (p ? p.split(/[\\/]/).slice(-2).join('/') : '');

/** spec 摘要标签：变体 / 分面 / 排序 / 映射多列。 */
function tagsOf(it: GalleryItem): string[] {
  const tags: string[] = [];
  const c = getContract(it.view as ViewId);
  const vid = it.spec?.variant;
  if (vid) tags.push(c?.variants.find((v) => v.id === vid)?.label ?? vid);
  if (it.spec?.facet?.column) tags.push(`facet:${it.spec.facet.column}`);
  const sort = it.spec?.state?.sort;
  if (sort && sort !== 'none') tags.push(`sort:${sort}`);
  if (it.spec?.annotations?.length) tags.push(`${it.spec.annotations.length} 标注`);
  if (it.spec?.palette && it.spec.palette !== 'signal') tags.push(`palette:${it.spec.palette}`);
  if (it.doc) tags.push('doc');
  return tags;
}

function card(it: GalleryItem & Rendered): string {
  const tags = tagsOf(it).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  return `      <article class="card">
        <div class="thumb real">${it.png ? `<img src="${rel(it.png)}" loading="lazy" alt="${esc(it.title)}">` : ''}</div>
        <h3>${esc(it.title)}</h3>
        <div class="meta">${esc(it.view)} · ${esc(it.sub)}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        <div class="actions">${it.light ? `<button class="btn primary" type="button" data-preview="${rel(it.light)}" data-title="${esc(it.title)} · 浅色">浅色浮窗</button>` : ''}${it.dark ? `<button class="btn ghost" type="button" data-preview="${rel(it.dark)}" data-title="${esc(it.title)} · 深色">深色浮窗</button>` : ''}</div>
      </article>`;
}

function section(g: Group): string {
  return `  <section class="group-section" id="grp-${g.id}" aria-labelledby="grp-${g.id}-t">
    <div class="group-head"><div><p class="eyebrow">${esc(g.eyebrow)}</p><h2 id="grp-${g.id}-t">${esc(g.title)} <span class="count">${g.items.length} 张</span></h2></div><p>${esc(g.desc)}</p></div>
    <div class="grid">
${g.items.map(card).join('\n')}
    </div>
  </section>`;
}

/** 画廊页样式：设计 token + legacy preview 版式（hero/type-nav/group/card/modal）。 */
const PAGE_CSS = `
:root{--acc2:#14b8a6;--gold:#d99a06;--warn:#e85d3f}
body{padding:30px;font-family:var(--sans)}
body.modal-open{overflow:hidden}
.wrap{max-width:1180px;margin:0 auto;position:relative}
.hero{position:relative;text-align:center;border-bottom:1.5px solid var(--ink);padding:40px 0 30px}
h1.fancy{font-family:var(--serif);font-weight:300;font-size:clamp(56px,9vw,106px);line-height:1.15;letter-spacing:-.02em;margin:12px 0 2px}
h1.fancy .script{font-family:"Segoe Script","Brush Script MT","Snell Roundhand",cursive;letter-spacing:0;padding:0 .08em;background:linear-gradient(115deg,var(--acc) 12%,var(--acc2) 58%,#3ec98f);-webkit-background-clip:text;background-clip:text;color:transparent}
h1.fancy .serifit{font-style:italic;color:var(--ink)}
.flourish{display:block;width:min(430px,74%);margin:0 auto}
.sparkle{position:absolute;color:var(--acc2);opacity:.9;pointer-events:none;animation:float 5.2s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-9px) rotate(16deg)}}
.meta-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;justify-content:center}
.meta{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line2);background:rgba(255,253,247,.7);backdrop-filter:blur(6px);padding:7px 11px;border-radius:999px;font-family:var(--mono);font-size:11px;color:var(--muted)}
.meta b{color:var(--ink)}
.tab-seg{display:flex;justify-content:center;margin:22px 0 4px}
.tab{display:none}.tab.on{display:block}
.type-nav{display:flex;gap:8px 10px;flex-wrap:wrap;justify-content:center;margin:18px 0 8px;position:sticky;top:12px;z-index:5;backdrop-filter:blur(10px);padding:8px;background:rgba(246,243,236,.82);border:1px solid var(--line2);border-radius:22px;max-width:100%;box-shadow:0 10px 30px rgba(23,26,30,.08)}
.type-nav a{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink);font-size:13px;font-weight:700;padding:8px 12px;border-radius:999px}
.type-nav a:hover{background:rgba(15,118,110,.08);color:var(--acc)}
.type-nav span{display:grid;place-items:center;min-width:22px;height:22px;border-radius:999px;background:var(--ink);color:var(--paper);font-family:var(--mono);font-size:11px}
.group-section{padding:28px 0 8px;border-top:1px solid var(--line)}
.group-section:first-of-type{border-top:0}
.group-head{display:flex;justify-content:space-between;align-items:end;gap:22px;margin-bottom:18px}
.group-head h2{font-family:var(--serif);font-weight:350;font-size:clamp(30px,4.2vw,48px);letter-spacing:-.04em;margin-top:8px}
.group-head p{color:var(--muted);max-width:62ch;line-height:1.72;font-size:13px}
.count{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line2);border-radius:999px;padding:6px 10px;font-family:var(--mono);font-size:11px;color:var(--muted);margin-left:10px;vertical-align:middle}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.card{background:rgba(255,253,247,.88);border:1px solid var(--line);border-radius:26px;padding:16px;box-shadow:0 10px 30px rgba(23,26,30,.08);display:flex;flex-direction:column;position:relative;overflow:hidden}
.card::before{content:"";position:absolute;inset:0;background:linear-gradient(145deg,rgba(15,118,110,.08),transparent 38%);pointer-events:none}
.thumb{border-radius:18px;border:1px solid var(--line);overflow:hidden;margin-bottom:14px;background:linear-gradient(135deg,#eef5ef 0%,#fffdf7 100%)}
.thumb img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.card h3{font-family:var(--serif);font-size:23px;font-weight:420;margin:2px 0 3px;letter-spacing:-.02em;position:relative}
.card .meta{background:transparent;border:0;padding:0;margin:0;color:var(--faint)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 16px}
.tag{font-family:var(--mono);font-size:10px;border:1px solid var(--line2);border-radius:6px;padding:4px 7px;color:var(--muted);background:rgba(23,26,30,.03)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.btn{appearance:none;border:0;cursor:pointer;background:var(--ink);color:#fffdf7;text-decoration:none;font-size:13px;font-weight:750;padding:10px 14px;border-radius:999px;display:inline-flex;align-items:center;gap:7px}
.btn:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(23,26,30,.18)}
.btn.primary{background:var(--acc);color:#fffdf7}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line2)}
.footer-note{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:28px 0 0;color:var(--muted);font-size:12px;line-height:1.7}
.footer-note code{font-family:var(--mono);color:var(--acc)}
.preview-modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:22px;opacity:0;pointer-events:none;transition:opacity .22s ease}
.preview-modal.open{opacity:1;pointer-events:auto}
.modal-backdrop{position:absolute;inset:0;background:rgba(9,10,8,.62);backdrop-filter:blur(12px)}
.modal-shell{position:relative;width:min(1440px,96vw);height:min(900px,92vh);background:var(--paper);border-radius:28px;box-shadow:0 40px 120px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.7) inset;overflow:hidden;display:grid;grid-template-rows:auto 1fr;transform:translateY(18px) scale(.97);transition:transform .28s cubic-bezier(.2,.8,.2,1)}
.preview-modal.open .modal-shell{transform:translateY(0) scale(1)}
.modal-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,#fffdf7,#f6f3ec)}
.modal-topbar .eyebrow{font-size:10px;margin-bottom:4px}.modal-topbar h2{font-family:var(--serif);font-size:26px;font-weight:420;letter-spacing:-.02em}.modal-path{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:2px;max-width:72ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.modal-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
.open-external{font-family:var(--mono);font-size:11px;color:var(--acc);text-decoration:none;border:1px solid rgba(15,118,110,.3);border-radius:999px;padding:9px 12px}
.close-btn{width:42px;height:42px;border-radius:13px;border:1px solid var(--line2);background:#fff;color:var(--ink);font-size:25px;line-height:1;cursor:pointer}
.frame-wrap{position:relative;background:#10120d}
#previewFrame{width:100%;height:100%;border:0;background:#f6f3ec}
.modal-loading{position:absolute;inset:0;display:grid;place-items:center;background:rgba(16,18,13,.35);color:#fffdf7;font-family:var(--mono);letter-spacing:.16em;text-transform:uppercase;font-size:12px;pointer-events:none;transition:opacity .2s}
.modal-loading.hide{opacity:0}
@media(max-width:980px){body{padding:18px}.group-head{display:block}.grid{grid-template-columns:1fr}.type-nav{position:static;width:auto;border-radius:18px}}
@media(max-width:680px){body{padding:12px}.modal-path{display:none}.open-external{display:none}.preview-modal{padding:10px}.modal-shell{width:100%;height:94vh;border-radius:20px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}`;

export async function runGallery(job: GalleryJob): Promise<{ items: number; views: number; packs: number; index: string }> {
  const packs = loadPacks();
  mkdirSync(join(job.out, 'png'), { recursive: true });
  mkdirSync(join(job.out, 'html'), { recursive: true });

  // 渲染缓存：同一文件+视图+spec（含变体/选项/配色）在场景/图族两个标签页共享产物
  const cache = new Map<string, Rendered>();
  const render = async (it: GalleryItem): Promise<Rendered> => {
    const ck = `${it.dir}|${it.file}|${it.view}|${it.spec?.variant ?? ''}|${JSON.stringify(it.spec?.options ?? {})}|${it.spec?.palette ?? ''}`;
    if (!cache.has(ck)) cache.set(ck, await renderItem(it, job));
    return cache.get(ck)!;
  };

  // —— 按图族分组（旧版分组模式）：每组 = 图族，卡 = 场景包图表 ∪ 变体卡 ∪ 风格卡 ∪ 3D 并入 ——
  const fam = await familyExamples(packs);
  const famGroups: Group[] = [];
  const order = [...FAMILY_ORDER, ...VIEW_IDS.filter((v) => !FAMILY_ORDER.includes(v))];
  for (const v of order) {
    const c = getContract(v);
    if (!c || MERGE_3D[v]) continue;
    const items: (GalleryItem & Rendered)[] = [];
    const seen = new Set<string>();
    const seenFiles = new Set<string>();
    const push = async (it: GalleryItem, dk?: string) => {
      const key = dk ?? `${it.dir}/${it.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const r = await render(it);
      if (r.png || r.light) items.push({ ...it, ...r });
      return true;
    };
    // 1) pack 图表：同族内按变体去重——显式变体只留首张，无变体最多 2 张，避免同一形态堆叠
    const variantCount = new Map<string, number>();
    for (const p of packs) {
      for (const ch of p.charts) {
        if (ch.spec?.view !== v) continue;
        const vk = ch.spec.variant ?? '';
        const n = variantCount.get(vk) ?? 0;
        if ((vk ? 1 : 2) <= n) continue;
        variantCount.set(vk, n + 1);
        const fk = `${join(PACKS_DIR, p.id)}/${ch.file}`;
        seenFiles.add(fk);
        await push({ key: `s-${p.id}-${ch.id}`, title: ch.question ?? ch.id, sub: p.title ?? p.id, view: v, file: ch.file, dir: join(PACKS_DIR, p.id), spec: ch.spec }, `${ch.file}|${ch.spec?.variant ?? ''}|${p.id}`);
      }
    }
    // 2) 图族示例：数据文件未出现才补卡（report 组因此同时呈现 pack 周报与 showcase 富文档）
    const ex = fam.get(v as string);
    if (ex && items.length < 9) {
      const fk = `${ex.dir}/${ex.file}`;
      if (!seenFiles.has(fk)) await push({ ...ex, title: ex.doc ? '富文档排版示例' : c.title, sub: ex.sub });
    }
    // 3) 3D 并入：matrix3d→bar / line3d→line / scatter3d→scatter / pie3d→pie（先于变体/风格卡占位）
    for (const [v3, baseV] of Object.entries(MERGE_3D) as [ViewId, ViewId][]) {
      if (baseV !== v || items.length >= 9) continue;
      const c3 = getContract(v3), ex3 = fam.get(v3 as string);
      if (!c3 || !ex3) continue;
      await push({ ...ex3, key: `v-${v3}`, title: `${c3.title}（多维）`, sub: '三维视图', view: v3 }, `3d|${v3}|${ex3.file}|${ex3.dir}`);
    }
    // 4) 变体卡：契约变体逐一同数据试 adapt，成功才上卡
    const base = items[0] ?? ex;
    if (base) {
      const l2 = await readInput(join(base.dir, base.file));
      const t2: Table | null = l2.result ? rawToTable(l2.result.raw as never, l2.source) : null;
      const tryAdapt = (spec: ViewSpec) => { if (!t2) return false; try { ADAPTERS[v]?.adapt(t2, spec); return true; } catch { return false; } };
      const usedVariants = new Set(items.map((it) => it.spec?.variant).filter(Boolean));
      for (const vb of c.variants) {
        if (usedVariants.has(vb.id) || items.length >= 9) break;
        const spec: ViewSpec = { ...(base.spec ?? { version: 1, view: v }), view: v, variant: vb.id };
        if (!tryAdapt(spec)) continue;
        await push({ ...base, key: `st-${v}-${vb.id}`, title: `${c.title} · ${vb.label}`, sub: '变体', spec }, `var|${base.file}|${vb.id}`);
      }
      // 5) 风格卡：同一数据（或指定文件）换 options/配色
      const adaptOn = async (file: string, dir: string, spec: ViewSpec) => {
        const li = await readInput(join(dir, file));
        const ti: Table | null = li.result ? rawToTable(li.result.raw as never, li.source) : null;
        if (!ti) return false;
        try { ADAPTERS[v]?.adapt(ti, spec); return true; } catch { return false; }
      };
      for (const st of STYLE_CARDS[v] ?? []) {
        if (items.length >= 9) break;
        const spec: ViewSpec = { ...(base.spec ?? { version: 1, view: v }), view: v, ...(st.variant ? { variant: st.variant } : {}), options: { ...(base.spec?.options ?? {}), ...(st.options ?? {}) }, palette: st.palette };
        const file = st.file ?? base.file, dir = st.file ? BASIC_DIR : base.dir;
        if (!await adaptOn(file, dir, spec)) continue;
        await push({ ...base, file, dir, key: `st-${v}-${st.tag}`, title: `${c.title} · ${st.tag}`, sub: '风格', spec }, `sty|${file}|${st.tag}`);
      }
    }
    if (!items.length) continue;
    famGroups.push({ id: v, eyebrow: `${v} chart`, title: c.title, desc: c.summary, items });
  }

  // —— 按场景分组 ——
  const sceneGroups: Group[] = [];
  for (const p of packs) {
    const items: (GalleryItem & Rendered)[] = [];
    for (const ch of p.charts) {
      if (!ch.spec?.view) continue;
      const it: GalleryItem = { key: `s-${p.id}-${ch.id}`, title: ch.question ?? ch.id, sub: ch.spec.view as string, view: ch.spec.view as string, file: ch.file, dir: join(PACKS_DIR, p.id), spec: ch.spec };
      items.push({ ...it, ...(await render(it)) });
    }
    sceneGroups.push({ id: p.id, eyebrow: 'scenario pack', title: p.title ?? p.id, desc: `${items.length} 张图表 · examples/packs/${p.id}`, items });
  }

  const totalCards = famGroups.reduce((a, g) => a + g.items.length, 0);
  const sceneCards = sceneGroups.reduce((a, g) => a + g.items.length, 0);
  const navOf = (groups: Group[]) => `<nav class="type-nav" aria-label="分组导航">${groups.map((g) => `<a href="#grp-${g.id}">${esc(g.title)} <span>${g.items.length}</span></a>`).join('')}</nav>`;
  const hero = `<div class="wrap">
  <div class="hero">
    <span class="sparkle" style="left:13%;top:22%;font-size:17px">✦</span>
    <span class="sparkle" style="right:15%;top:30%;font-size:13px;animation-delay:-1.6s;color:var(--gold)">✧</span>
    <span class="sparkle" style="left:23%;bottom:16%;font-size:11px;animation-delay:-2.8s;color:var(--warn)">✦</span>
    <span class="sparkle" style="right:25%;bottom:22%;font-size:15px;animation-delay:-.9s">✧</span>
    <div class="eyebrow">virta · preview gallery</div>
    <h1 class="fancy"><span class="script">Virta</span> <span class="serifit">Gallery</span></h1>
    <svg class="flourish" viewBox="0 0 430 26" aria-hidden="true"><defs><linearGradient id="fg" x1="0" x2="1"><stop offset="0" stop-color="#0f766e"/><stop offset=".55" stop-color="#14b8a6"/><stop offset="1" stop-color="#d99a06"/></linearGradient></defs><path d="M6 15 C 110 4, 205 24, 275 12 S 380 6, 424 14" fill="none" stroke="url(#fg)" stroke-width="2.4" stroke-linecap="round"/><path d="M215 9 l6.5 6.5 -6.5 6.5 -6.5-6.5z" fill="#0f766e"/></svg>
    <div class="meta-row" aria-label="能力速览">
      <span class="meta"><b>${famGroups.length}</b> 图族</span>
      <span class="meta"><b>${packs.length}</b> 场景</span>
      <span class="meta"><b>${totalCards + sceneCards}</b> 图表</span>
      <span class="meta"><b>offline</b> single-file</span>
    </div>
  </div>
  <div class="tab-seg"><div class="seg"><button type="button" class="on" data-t="t-fam">按图族</button><button type="button" data-t="t-scene">按场景</button></div></div>
  <div id="t-fam" class="tab on">${navOf(famGroups)}${famGroups.map(section).join('\n')}</div>
  <div id="t-scene" class="tab">${navOf(sceneGroups)}${sceneGroups.map(section).join('\n')}</div>
  <div class="footer-note"><span>Virta Gallery · 缩略图为真实 PNG 导出，浮窗为单文件交互页</span><code>npm run gallery</code></div>
</div>
<div class="preview-modal" id="previewModal" aria-hidden="true">
  <div class="modal-backdrop" data-close></div>
  <div class="modal-shell" role="dialog" aria-modal="true">
    <div class="modal-topbar">
      <div><div class="eyebrow">interactive preview</div><h2 id="modalTitle">预览</h2><div class="modal-path" id="modalPath"></div></div>
      <div class="modal-actions"><a class="open-external" id="openExternal" href="#" target="_blank" rel="noopener">↗ 新窗口打开</a><button class="close-btn" type="button" data-close aria-label="关闭">×</button></div>
    </div>
    <div class="frame-wrap"><iframe id="previewFrame" title="chart preview"></iframe><div class="modal-loading" id="modalLoading">loading</div></div>
  </div>
</div>
<script>
const modal=document.getElementById('previewModal'),frame=document.getElementById('previewFrame'),loading=document.getElementById('modalLoading');
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>{
  document.getElementById('modalTitle').textContent=b.dataset.title||'预览';
  document.getElementById('modalPath').textContent=b.dataset.preview;
  document.getElementById('openExternal').href=b.dataset.preview;
  loading.classList.remove('hide');frame.src=b.dataset.preview;
  modal.classList.add('open');document.body.classList.add('modal-open');
}));
frame.addEventListener('load',()=>loading.classList.add('hide'));
const close=()=>{modal.classList.remove('open');document.body.classList.remove('modal-open');frame.src='about:blank'};
modal.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',close));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
document.querySelectorAll('.tab-seg button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab-seg button,.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.getElementById(b.dataset.t).classList.add('on')});
</script>`;
  const html = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virta Gallery</title><style>${buildCss({ fonts: true })}${PAGE_CSS}</style></head><body>${hero}</body></html>`;
  const index = join(job.out, 'index.html');
  writeFileSync(index, html, 'utf8');
  return { items: totalCards + sceneCards, views: famGroups.length, packs: packs.length, index };
}
