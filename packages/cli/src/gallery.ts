// gallery 命令：全部场景包图表 + 全部图族 → 640×360 真图缩略图 + 浅色交互页（主题在页内切换）+ 分组画廊。
// 页面布局沿用 legacy preview：hero 花体标题 + sticky 分组导航 + group-section + 浮窗预览。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { VIEW_IDS, getContract, type Theme, type PaletteId, type ViewId, type ViewSpec } from '@virta/contracts';
import { rawToTable, profileTable, recommend, ADAPTERS } from '@virta/data-engine';
import { buildCss } from '@virta/design-system';
import type { Table } from '@virta/contracts';
import { readInput } from '@virta/data-engine/node';
import { renderChart, fail } from './render.js';
import { listPacks } from './demo.js';

const PACKS_DIR = join('examples', 'packs');
const BASIC_DIR = join('examples', 'basic');
// 缩略图 2x：卡片 ~570px 显示位宽下保证字体/3D 质感清晰
const PNG_SCALE = 2;

interface PackChart { id: string; file: string; question?: string; spec?: ViewSpec }
interface PackJson { id: string; title?: string; charts: PackChart[] }

export interface GalleryItem {
  key: string; title: string; sub: string; view: string;
  file: string; dir: string; spec?: ViewSpec; doc?: boolean;
  /** 合并卡：多组演示数据，卡内点按切换（缩略图/标题/标签/预览随动） */
  ds?: { label: string; title: string; meta: string; tags?: string[]; png?: string; light?: string }[];
}
interface Rendered { png?: string; light?: string; alts?: { label: string; path?: string }[] }
interface ManifestEntry extends Rendered { in: string }
interface Group { id: string; eyebrow: string; title: string; desc: string; items: (GalleryItem & Rendered)[] }

export interface GalleryJob { out: string; scale: number; fontFiles: string[]; theme?: Theme; palette?: PaletteId; only?: string; force?: boolean }

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
const MERGE_3D: Partial<Record<ViewId, ViewId>> = { matrix3d: 'bar', line3d: 'line', scatter3d: 'scatter', pie3d: 'pie', sunburst: 'pie' };

// —— 柱状图合并演示卡：4 组数据形态覆盖全部 5 种变体（负值集上 pct/pareto 自动置灰）——
const GALLERY_DIR = join('examples', 'gallery');
const BAR_DEMOS: { file: string; label: string; title: string; spec: ViewSpec }[] = [
  { file: 'bar-single.csv', label: '单一系列', title: '传统单一柱状图', spec: { version: 1, view: 'bar', options: { valueLabels: true } } },
  { file: 'bar-grouped.csv', label: '二级分组', title: '二级分组柱状图', spec: { version: 1, view: 'bar', variant: 'grouped', mapping: { series: '产品线' } } },
  { file: 'bar-pareto.csv', label: '双因素·Pareto', title: '双因素柱状图', spec: { version: 1, view: 'bar', variant: 'pareto', mapping: { series: '产线' } } },
  { file: 'bar-waterfall.csv', label: '瀑布桥', title: '瀑布桥（含负值）', spec: { version: 1, view: 'bar', variant: 'waterfall', options: { valueLabels: true } } },
  { file: 'bar-matrix3d.csv', label: '多维矩阵', title: '多维矩阵 · 3D', spec: { version: 1, view: 'matrix3d', variant: 'matrix', mapping: { label: '城市', series: '产品线', value: '销售额' } } },
  { file: 'combo-dual.csv', label: '双轴组合', title: '双轴组合 · 柱+线', spec: { version: 1, view: 'combo', variant: 'bar+line' } },
];

// —— 折线图合并演示卡 ——
const LINE_DEMOS: { file: string; label: string; title: string; spec: ViewSpec }[] = [
  { file: 'line-single.csv', label: '单一系列', title: '传统单一折线图', spec: { version: 1, view: 'line' } },
  { file: 'line-multi.csv', label: '多系列', title: '多系列折线图', spec: { version: 1, view: 'line' } },
  { file: 'line-curve3d.csv', label: '三维轨迹', title: '三维轨迹 · 跨维度曲线', spec: { version: 1, view: 'line3d', variant: 'curve' } },
];

// —— 对比图合并演示卡 ——
const COMPARE_DEMOS: { file: string; label: string; title: string; spec: ViewSpec }[] = [
  { file: 'compare-slope.csv', label: '斜率', title: '前后对比 · 斜率', spec: { version: 1, view: 'compare', variant: 'slope' } },
  { file: 'compare-dumbbell.csv', label: '哑铃', title: '前后对比 · 哑铃', spec: { version: 1, view: 'compare', variant: 'dumbbell' } },
];

// —— 饼图合并演示卡 ——
const PIE_DEMOS: { file: string; label: string; title: string; spec: ViewSpec }[] = [
  { file: 'pie-single.csv', label: '环形', title: '占比环形图', spec: { version: 1, view: 'pie', variant: 'donut' } },
  { file: 'pie-single.csv', label: '实心', title: '占比实心饼', spec: { version: 1, view: 'pie', variant: 'pie' } },
  { file: 'pie-layers.csv', label: '立体·多层', title: '立体饼 · 多层阶梯', spec: { version: 1, view: 'pie3d' } },
  { file: 'sunburst.csv', label: '旭日图', title: '层级占比 · 旭日', spec: { version: 1, view: 'sunburst' } },
];

// —— 甘特图合并演示卡：时间轴 / 周历 / 月历 三形态 ——
const GANTT_DEMOS: { file: string; label: string; title: string; spec: ViewSpec }[] = [
  { file: 'gantt-plan.csv', label: '时间轴', title: '甘特 · 时间轴', spec: { version: 1, view: 'gantt', variant: 'timeline' } },
  { file: 'gantt-plan.csv', label: '周历', title: '甘特 · 周历', spec: { version: 1, view: 'gantt', variant: 'calendar', options: { calView: 'week' } } },
  { file: 'gantt-plan.csv', label: '月历', title: '甘特 · 月历', spec: { version: 1, view: 'gantt', variant: 'calendar', options: { calView: 'month' } } },
];

// 表格/文档专属样例（为表格而造：稠密透视、真实长明细、压力测试、长文报告）
type Demo = { file: string; label: string; title: string; spec: ViewSpec; dir?: string };
const EDGE_DIR = join('examples', 'edge-cases');
const GRID_DEMOS: Demo[] = [
  { file: 'grid-pivot.csv', label: '透视', title: '数据表 · 稠密透视（4维×6月全组合）', spec: { version: 1, view: 'grid', variant: 'pivot' } },
  { file: 'grid-detail.csv', label: '长明细', title: '数据表 · 长明细（链接/空值/风险等级）', spec: { version: 1, view: 'grid', variant: 'detail', state: { sort: 'desc' } } },
  { file: 'long-labels.csv', label: '长标签', title: '数据表 · 长中文标签压力测试', dir: EDGE_DIR, spec: { version: 1, view: 'grid', variant: 'detail' } },
  { file: 'xss-label.csv', label: '转义', title: '数据表 · 特殊字符转义', dir: EDGE_DIR, spec: { version: 1, view: 'grid', variant: 'detail' } },
  { file: 'missing-columns.csv', label: '空值', title: '数据表 · 缺列/空值', dir: EDGE_DIR, spec: { version: 1, view: 'grid', variant: 'detail' } },
];
const REPORT_DEMOS: Demo[] = [
  { file: 'report-long.md', label: '长文', title: '文档报告 · 长文多表（60+ 行表）', spec: { version: 1, view: 'report' } },
  { file: 'deadline.brief.md', label: '截止日报', title: '文档报告 · 截止日报（链接/表格）', dir: join(PACKS_DIR, 'delivery'), spec: { version: 1, view: 'report' } },
];

// ADR-0008：风格/样式重复卡（STYLE_CARDS）已移除——主题皮肤由「四套主题」分组统一呈现。

/** 每个图族的示例来源：优先 pack 图表，其次 basic 样例（recommend top-1 命中），report 找 md/txt。 */
export async function familyExamples(packs: PackJson[]): Promise<Map<string, GalleryItem>> {
  const out = new Map<string, GalleryItem>();
  const take = (v: string, it: GalleryItem) => { if (!out.has(v)) out.set(v, it); };
  // 精修样例优先：showcase-* 数据集为该图族定制，代表性高于 pack/basic 兜底
  const EXEMPLARS: Partial<Record<string, { file: string }>> = {
    pie: { file: 'showcase-pie.csv' },
    sankey: { file: 'showcase-sankey.csv' },
    network: { file: 'showcase-network.csv' },
    tree: { file: 'showcase-tree.csv' },
  };
  for (const [v, e] of Object.entries(EXEMPLARS)) {
    if (e && existsSync(join(BASIC_DIR, e.file))) {
      take(v, { key: `v-${v}`, title: e.file, sub: 'examples/basic', view: v, file: e.file, dir: BASIC_DIR, spec: { version: 1, view: v as ViewId } });
    }
  }
  // T3 简版图族画廊示例（examples/gallery 专属，不进 basic 以免影响 recommend 期望表）
  const T3_DEMO: [ViewId, string][] = [
    ['er', 'er-schema.csv'], ['flowchart', 'flowchart-approve.csv'], ['sequence', 'sequence-order.csv'],
    ['burndown', 'burndown-sprint.csv'], ['formula', 'formula-math.csv'],
  ];
  for (const [v, f] of T3_DEMO) {
    if (!out.has(v) && existsSync(join(GALLERY_DIR, f))) {
      take(v, { key: `v-${v}`, title: f, sub: 'examples/gallery', view: v, file: f, dir: GALLERY_DIR, spec: { version: 1, view: v } });
    }
  }
  // report：优先长文示例 report-long.md（多章节/60+ 行表/链接/内嵌 SVG）
  if (existsSync(join(GALLERY_DIR, 'report-long.md'))) {
    take('report', { key: 'v-report', title: 'report-long.md', sub: 'examples/gallery', view: 'report', file: 'report-long.md', dir: GALLERY_DIR, doc: true });
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
    // 产物文件名 ASCII 化（变体/图表 id 曾产出过 CJK 文件名）
    out, stem: it.key.replace(/[^\w-]+/g, '_'), width: w, height: h, scale, frame: 'card', fontFiles: job.fontFiles,
  });
  const pngDir = join(job.out, 'png'), htmlDir = join(job.out, 'html');
  const png = await mk(['png'], 'light', pngDir, 640, 360, PNG_SCALE);
  const light = await mk(['html'], 'light', htmlDir, 1200, 675, job.scale);
  return { png: png.files[0]?.path, light: light.files[0]?.path };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rel = (p?: string) => (p ? p.split(/[\\/]/).slice(-2).join('/') : '');

/** 合并卡 ds 去重：PNG 与交互页字节都相同 = 产物真重复（如未实现差异的两个变体），去掉避免「切了等于没切」。 */
function dedupeDs(ds: NonNullable<GalleryItem['ds']>): void {
  const seen = new Set<string>();
  for (let i = ds.length - 1; i >= 0; i--) {
    const d = ds[i]!;
    const h = (p?: string) => (p && existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : 'x');
    const k = `${h(d.png)}|${h(d.light)}`;
    if (seen.has(k)) ds.splice(i, 1);
    else seen.add(k);
  }
}

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
  const typeTitle = getContract(it.view as ViewId)?.title ?? it.title; // 卡名统一为类型标题（短名）
  // 弹窗/alt 用完整名：类型名 · 演示名（演示名已含类型名前缀时不重复拼接）
  const qualify = (d: string) => (d.includes(typeTitle) || d.includes(typeTitle.slice(0, 2)) ? d : `${typeTitle} · ${d}`);
  const altTitle = it.ds?.length ? qualify(it.ds[0]!.title) : typeTitle;
  const meta = it.ds?.length ? it.ds[0]!.meta : `${it.view} · ${it.sub}`;
  const dsAttr = it.ds?.length
    ? ` data-ds='${esc(JSON.stringify(it.ds.map((d) => ({ l: d.label, t: qualify(d.title), m: d.meta, g: d.tags ?? [], p: rel(d.png), li: rel(d.light) }))))}'`
    : '';
  const dsSeg = it.ds?.length
    ? `        <div class="ds-seg">${it.ds.map((d, i) => `<button type="button" aria-pressed="${i === 0}"${i ? '' : ' class="on"'} data-i="${i}">${esc(d.label)}</button>`).join('')}</div>\n`
    : '';
  return `      <article class="card"${dsAttr}>
        <div class="thumb real">${it.png ? `<img src="${rel(it.png)}" loading="lazy" alt="${esc(altTitle)}">` : ''}</div>
${dsSeg}
        <h3>${esc(typeTitle)}</h3>
        <div class="meta">${esc(meta)}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        <div class="actions">${it.alts?.length
          ? it.alts.map((a) => `<button class="btn primary" type="button" data-preview="${rel(a.path)}" data-title="${esc(typeTitle)} · ${esc(a.label)}">${esc(a.label)}</button>`).join('')
          : `${it.light ? `<button class="btn primary" type="button" data-preview="${rel(it.light)}" data-title="${esc(altTitle)}">交互预览</button>` : ''}`}</div>
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
.tab{display:none}.tab.on{display:block}
.dock{position:sticky;top:10px;z-index:5;display:flex;align-items:center;gap:10px;margin:16px 0 8px;padding:5px 7px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border:1px solid rgba(23,26,30,.08);border-radius:999px;box-shadow:0 1px 2px rgba(23,26,30,.04),0 10px 28px rgba(23,26,30,.08),inset 0 1px 0 rgba(255,255,255,.7)}
.dock .seg{box-shadow:none;border:0;background:rgba(23,26,30,.045);flex-shrink:0}
.dock .seg button{padding:7px 14px;font-size:12.5px;font-weight:650}
.dock-sep{width:1px;height:22px;background:var(--line2);flex-shrink:0}
.nav-wrap{flex:1;min-width:0;position:relative}
.type-nav{display:none;gap:2px;overflow-x:auto;white-space:nowrap;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22px,#000 calc(100% - 30px),transparent);mask-image:linear-gradient(90deg,transparent,#000 22px,#000 calc(100% - 30px),transparent)}
.type-nav.on{display:flex}
.type-nav::-webkit-scrollbar{display:none}
.type-nav a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;color:var(--muted);font-size:12.5px;font-weight:650;padding:7px 13px;border-radius:999px;transition:color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
.type-nav a i{width:7px;height:7px;border-radius:50%;background:var(--gc,#888);flex-shrink:0;transition:transform .16s ease,box-shadow .16s ease}
.type-nav a:hover{background:rgba(255,255,255,.8);color:var(--ink);box-shadow:0 2px 8px rgba(23,26,30,.08)}
.type-nav a:hover i{transform:scale(1.35)}
.type-nav a.cur{background:#fff;color:var(--gc,var(--ink));box-shadow:0 4px 14px rgba(23,26,30,.14),inset 0 0 0 1px rgba(23,26,30,.05);transform:translateY(-0.5px)}
.type-nav a.cur i{transform:scale(1.3);box-shadow:0 0 0 4px color-mix(in srgb,var(--gc,#888) 16%,transparent)}
.type-nav a.cur span{background:color-mix(in srgb,var(--gc,#888) 14%,transparent);color:var(--gc,var(--ink))}
.type-nav span{display:grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:rgba(23,26,30,.08);color:var(--muted);font-family:var(--mono);font-size:10px}
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
.ds-seg{display:flex;gap:5px;flex-wrap:wrap;margin:-4px 0 10px;position:relative}
.ds-seg button{appearance:none;border:1px solid var(--line2);background:transparent;color:var(--muted);font-size:11px;font-weight:650;padding:5px 11px;border-radius:999px;cursor:pointer;transition:all .15s ease}
.ds-seg button:hover{color:var(--acc);border-color:rgba(15,118,110,.4)}
.ds-seg button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
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
@media(max-width:980px){body{padding:18px}.group-head{display:block}.grid{grid-template-columns:1fr}.dock{top:8px;gap:8px;padding:5px 6px}}
@media(max-width:680px){body{padding:12px}.modal-path{display:none}.open-external{display:none}.preview-modal{padding:10px}.modal-shell{width:100%;height:94vh;border-radius:20px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}`;

export async function runGallery(job: GalleryJob): Promise<{ items: number; views: number; packs: number; index: string; reused: number }> {
  const packs = loadPacks();
  mkdirSync(join(job.out, 'png'), { recursive: true });
  mkdirSync(join(job.out, 'html'), { recursive: true });

  // —— 增量清单：输入哈希未变的展品复用上轮产物；--only 时仅重渲命中项，其余沿用旧产物 ——
  const manPath = join(job.out, '.manifest.json');
  const manifest: Record<string, ManifestEntry> = (!job.force && existsSync(manPath))
    ? JSON.parse(readFileSync(manPath, 'utf8')) as Record<string, ManifestEntry> : {};
  const outputsExist = (r: Rendered): boolean =>
    [r.png, r.light, ...(r.alts ?? []).map((a) => a.path)]
      .filter((p): p is string => Boolean(p)).every((p) => existsSync(p));
  const inputHash = (it: GalleryItem, spec: ViewSpec): string => {
    const fpath = join(it.dir, it.file);
    const h = createHash('sha1').update(JSON.stringify(spec)).update(String(job.scale)).update(`png${PNG_SCALE}`);
    if (existsSync(fpath)) h.update(readFileSync(fpath));
    return h.digest('hex');
  };
  const want = (it: GalleryItem): boolean => {
    const o = job.only;
    if (!o) return true;
    return it.view === o || it.key === o || it.file === o || it.spec?.variant === o
      || it.title.includes(o) || it.dir.split(/[\\/]/).includes(o);
  };

  // 渲染缓存：同一文件+视图+spec（含变体/选项/配色）在场景/图族两个标签页共享产物
  const cache = new Map<string, Rendered>();
  let reused = 0;
  const render = async (it: GalleryItem): Promise<Rendered> => {
    const ck = `${it.dir}|${it.file}|${it.view}|${it.spec?.variant ?? ''}|${JSON.stringify(it.spec?.options ?? {})}|${it.spec?.palette ?? ''}`;
    if (!cache.has(ck)) {
      const base: ViewSpec = { version: 1, palette: job.palette ?? 'signal', ...(it.spec ?? {}), view: it.view as ViewId };
      const ih = inputHash(it, base);
      const prev = manifest[ck];
      if (prev && (prev.in === ih || !want(it)) && outputsExist(prev)) { cache.set(ck, prev); reused++; }
      else {
        cache.set(ck, await renderItem(it, job));
        manifest[ck] = { in: ih, ...cache.get(ck)! };
      }
    }
    return cache.get(ck)!;
  };

  // —— 按图族分组（旧版分组模式）：每组 = 图族，卡 = 场景包图表 ∪ 变体卡 ∪ 风格卡 ∪ 3D 并入 ——
  const fam = await familyExamples(packs);
  // 逻辑分组（3D 已并入基础图族；combo 并入 bar 卡）
  const LOGIC_GROUPS: { id: string; eyebrow: string; title: string; color: string; views: ViewId[] }[] = [
    { id: 'trend', eyebrow: 'trend', title: '趋势', color: '#0f766e', views: ['bar', 'line', 'cohort', 'control'] },
    { id: 'compare', eyebrow: 'comparison', title: '对比', color: '#dc2626', views: ['compare', 'radar', 'bullet', 'rank'] },
    { id: 'compose', eyebrow: 'composition', title: '构成', color: '#d99a06', views: ['pie', 'sunburst', 'funnel', 'treemap', 'sankey'] },
    { id: 'stat', eyebrow: 'statistics', title: '统计', color: '#2563eb', views: ['histogram', 'scatter', 'boxplot', 'heatmap', 'parallel'] },
    { id: 'rel', eyebrow: 'relation', title: '关系', color: '#7c3aed', views: ['er', 'network', 'tree', 'fishbone'] },
    { id: 'time', eyebrow: 'time & process', title: '时序', color: '#0891b2', views: ['flowchart', 'gantt', 'sequence', 'burndown'] },
    { id: 'docs', eyebrow: 'docs & metrics', title: '文案', color: '#64748b', views: ['kpi', 'grid', 'formula', 'report'] },
  ];
  const V2G = new Map<ViewId, string>(LOGIC_GROUPS.flatMap((g) => g.views.map((v) => [v, g.id] as [ViewId, string])));
  const famGroups: Group[] = [];
  const byGroup = new Map<string, (GalleryItem & Rendered)[]>();
  const order = [...FAMILY_ORDER, ...VIEW_IDS.filter((v) => !FAMILY_ORDER.includes(v))];
  for (const v of order) {
    if (MERGE_3D[v]) continue;
    const c = getContract(v);
    if (!c || MERGE_3D[v] || v === 'combo') continue; // combo 并入柱状图合并卡（ds「双轴组合」）
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
    const demos: Demo[] | null = v === 'bar' ? BAR_DEMOS : v === 'line' ? LINE_DEMOS : v === 'pie' ? PIE_DEMOS : v === 'compare' ? COMPARE_DEMOS : v === 'gantt' ? GANTT_DEMOS : v === 'grid' ? GRID_DEMOS : v === 'report' ? REPORT_DEMOS : null;
    if (demos) {
      // 合并演示卡：一卡承载全部数据形态，卡内点按切换；变体/样式/配色进交互页切换
      const ds: NonNullable<GalleryItem['ds']> = [];
      let first: (GalleryItem & Rendered) | undefined;
      for (const d of demos) {
        // key 必须含 variant+options：同文件同视图不同选项（如甘特周历/月历）否则同 stem 互相覆盖
        const vh = createHash('sha1').update(JSON.stringify([d.spec.variant ?? '', d.spec.options ?? {}])).digest('hex').slice(0, 6);
        const it: GalleryItem = { key: `demo-${d.file}-${d.spec.view}-${vh}`, title: d.title, sub: d.dir ?? 'examples/gallery', view: String(d.spec.view), file: d.file, dir: d.dir ?? GALLERY_DIR, spec: d.spec };
        const r = await render(it);
        if (!r.png && !r.light) continue;
        first ??= { ...it, ...r };
        const vlab = it.spec?.variant ? (getContract(it.view as ViewId)?.variants.find((x) => x.id === it.spec!.variant)?.label ?? it.spec.variant) : '';
        ds.push({ label: d.label, title: d.title, meta: `${it.view}${vlab ? ` · ${vlab}` : ''} · ${it.sub}`, tags: tagsOf(it), png: r.png, light: r.light });
      }
      dedupeDs(ds);
      if (first) items.push({ ...first, key: 'bar-demo', sub: `${ds.length} 组演示数据 · 点按切换形态`, ds });
    } else {
    // 1) pack 图表：同族内按变体去重——显式变体只留首张，无变体最多 2 张，整族 pack 卡 ≤2 张
    const variantCount = new Map<string, number>();
    for (const p of packs) {
      for (const ch of p.charts) {
        if (ch.spec?.view !== v || items.length >= 2) continue;
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
    if (ex && items.length < 4) {
      const fk = `${ex.dir}/${ex.file}`;
      if (!seenFiles.has(fk)) await push({ ...ex, title: ex.doc ? '富文档排版示例' : c.title, sub: ex.sub });
    }
    }
    // 3) 3D 并入：matrix3d→bar / line3d→line / scatter3d→scatter / pie3d→pie（先于变体/风格卡占位；bar 已并入合并卡跳过）
    for (const [v3, baseV] of Object.entries(MERGE_3D) as [ViewId, ViewId][]) {
      if (demos && MERGE_3D[v3] === v) continue;
      if (baseV !== v || items.length >= 4) continue;
      const c3 = getContract(v3), ex3 = fam.get(v3 as string);
      if (!c3 || !ex3) continue;
      await push({ ...ex3, key: `v-${v3}`, title: `${c3.title}（多维）`, sub: '三维视图', view: v3 }, `3d|${v3}|${ex3.file}|${ex3.dir}`);
    }
    // 4) 变体卡：契约变体逐一同数据试 adapt，成功才上卡（bar/line 已由合并卡覆盖，跳过）
    const base = items[0] ?? fam.get(v as string);
    if (base && !demos) {
      const l2 = await readInput(join(base.dir, base.file));
      const t2: Table | null = l2.result ? rawToTable(l2.result.raw as never, l2.source) : null;
      const tryAdapt = (spec: ViewSpec) => { if (!t2) return false; try { ADAPTERS[v]?.adapt(t2, spec); return true; } catch { return false; } };
      const usedVariants = new Set(items.map((it) => it.spec?.variant).filter(Boolean));
      for (const vb of c.variants) {
        if (usedVariants.has(vb.id) || items.length >= 4) break;
        const spec: ViewSpec = { ...(base.spec ?? { version: 1, view: v }), view: v, variant: vb.id };
        if (!tryAdapt(spec)) continue;
        await push({ ...base, key: `st-${v}-${vb.id}`, title: `${c.title} · ${vb.label}`, sub: '变体', spec }, `var|${base.file}|${vb.id}`);
      }
    }
    if (!items.length) continue;
    // 内部合并：家族全部卡片收进一张合并卡（缩略图下数据胶囊点按切换，标题/meta/标签随切换更新）
    if (items.length > 1) {
      const ds: NonNullable<GalleryItem['ds']> = items.map((it) => {
        const vlab = it.spec?.variant ? (c.variants.find((x) => x.id === it.spec!.variant)?.label ?? it.spec.variant) : '';
        // 胶囊短标：变体名 > 场景包名首段 > 标题截断（不放问句长标）
        const short = it.dir.includes('packs') ? it.sub.split('·')[0]!.trim() : it.title;
        return {
          label: vlab || (short.length > 12 ? `${short.slice(0, 11)}…` : short),
          title: it.title, meta: `${it.view}${vlab ? ` · ${vlab}` : ''} · ${it.sub}`, tags: tagsOf(it), png: it.png, light: it.light,
        };
      });
      dedupeDs(ds);
      items.splice(0, items.length, { ...items[0], title: items[0].title, sub: `${ds.length} 组演示 · 点按切换`, ds });
    }
    const gid = V2G.get(v) ?? 'other';
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(...items);
  }

  // 按逻辑组输出（成员图族名拼为 desc；eyebrow 用成员视图 ID——标识符保留英文）
  for (const g of LOGIC_GROUPS) {
    const items = byGroup.get(g.id) ?? [];
    if (!items.length) continue;
    const members = g.views.map((v) => getContract(v)?.title ?? v).filter(Boolean);
    const memberIds = [...new Set(items.map((it) => it.view))];
    famGroups.push({ id: g.id, eyebrow: memberIds.join(' · '), title: g.title, desc: members.join(' · '), items, color: g.color } as Group);
  }
  const restItems = byGroup.get('other');
  if (restItems?.length) famGroups.push({ id: 'other', eyebrow: 'other', title: '其他', desc: '', items: restItems });

  // 主题对比组已移除（R：画廊去主题实验室）；主题切换在各交互页内完成

  const totalCards = famGroups.reduce((a, g) => a + g.items.length, 0);
  const totalViews = famGroups.reduce((a, g) => a + g.items.reduce((b, it) => b + (it.ds?.length ?? 1), 0), 0);
  const navOf = (id: string, groups: Group[], on = false) => `<nav class="type-nav${on ? ' on' : ''}" id="${id}" aria-label="分组导航">${groups.map((g) => `<a href="#grp-${g.id}" style="--gc:${(g as Group & { color?: string }).color ?? '#888'}"><i></i>${esc(g.title)} <span>${g.items.length}</span></a>`).join('')}</nav>`;
  const hero = `<div class="wrap">
  <div class="hero">
    <span class="sparkle" style="left:13%;top:22%;font-size:17px">✦</span>
    <span class="sparkle" style="right:15%;top:30%;font-size:13px;animation-delay:-1.6s;color:var(--gold)">✧</span>
    <span class="sparkle" style="left:23%;bottom:16%;font-size:11px;animation-delay:-2.8s;color:var(--warn)">✦</span>
    <span class="sparkle" style="right:25%;bottom:22%;font-size:15px;animation-delay:-.9s">✧</span>
    <div class="eyebrow">virta · 预览画廊</div>
    <h1 class="fancy"><span class="script">Virta</span> <span class="serifit">Gallery</span></h1>
    <svg class="flourish" viewBox="0 0 430 26" aria-hidden="true"><defs><linearGradient id="fg" x1="0" x2="1"><stop offset="0" stop-color="#0f766e"/><stop offset=".55" stop-color="#14b8a6"/><stop offset="1" stop-color="#d99a06"/></linearGradient></defs><path d="M6 15 C 110 4, 205 24, 275 12 S 380 6, 424 14" fill="none" stroke="url(#fg)" stroke-width="2.4" stroke-linecap="round"/><path d="M215 9 l6.5 6.5 -6.5 6.5 -6.5-6.5z" fill="#0f766e"/></svg>
    <div class="meta-row" aria-label="能力速览">
      <span class="meta"><b>${famGroups.length}</b> 分组</span>
      <span class="meta"><b>${totalCards}</b> 张卡</span>
      <span class="meta"><b>${totalViews}</b> 个视图</span>
      <span class="meta">离线单文件</span>
    </div>
  </div>
  <header class="dock">
    <div class="nav-wrap">${navOf('nav-fam', famGroups, true)}</div>
  </header>
  <div id="t-fam" class="tab on">${famGroups.map(section).join('\n')}</div>
  <div class="footer-note"><span>Virta Gallery · 缩略图为真实 PNG 导出，浮窗为单文件交互页</span><code>npm run gallery</code></div>
</div>
<div class="preview-modal" id="previewModal" aria-hidden="true">
  <div class="modal-backdrop" data-close></div>
  <div class="modal-shell" role="dialog" aria-modal="true">
    <div class="modal-topbar">
      <div><div class="eyebrow">交互预览</div><h2 id="modalTitle">预览</h2><div class="modal-path" id="modalPath"></div></div>
      <div class="modal-actions"><a class="open-external" id="openExternal" href="#" target="_blank" rel="noopener">↗ 新窗口打开</a><button class="close-btn" type="button" data-close aria-label="关闭">×</button></div>
    </div>
    <div class="frame-wrap"><iframe id="previewFrame" title="图表预览"></iframe><div class="modal-loading" id="modalLoading">加载中</div></div>
  </div>
</div>
<script>
const modal=document.getElementById('previewModal'),frame=document.getElementById('previewFrame'),loading=document.getElementById('modalLoading');
let lastFocus=null;
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>{
  document.getElementById('modalTitle').textContent=b.dataset.title||'预览';
  document.getElementById('modalPath').textContent=b.dataset.preview;
  document.getElementById('openExternal').href=b.dataset.preview;
  loading.classList.remove('hide');frame.src=b.dataset.preview;
  lastFocus=document.activeElement;
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  modal.querySelector('.close-btn').focus();
}));
frame.addEventListener('load',()=>loading.classList.add('hide'));
const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');frame.src='about:blank';if(lastFocus)lastFocus.focus()};
modal.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',close));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
document.querySelectorAll('.type-nav').forEach(nav=>{
  nav.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();nav.scrollLeft+=e.deltaY}},{passive:false});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
    nav.querySelectorAll('a.cur').forEach(x=>x.classList.remove('cur'));a.classList.add('cur');
  }));
});
document.querySelectorAll('article[data-ds]').forEach(cd=>{
  const ds=JSON.parse(cd.dataset.ds);
  cd.querySelectorAll('.ds-seg button').forEach(b=>b.onclick=()=>{
    const d=ds[+b.dataset.i];if(!d)return;
    cd.querySelectorAll('.ds-seg button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});
    const img=cd.querySelector('.thumb img');if(img&&d.p){img.src=d.p;img.alt=d.t}
    const m=cd.querySelector('.meta');if(m)m.textContent=d.m;
    const tg=cd.querySelector('.tags');
    if(tg){tg.innerHTML='';(d.g||[]).forEach(t=>{const s=document.createElement('span');s.className='tag';s.textContent=t;tg.appendChild(s)})}
    cd.querySelectorAll('[data-preview]').forEach(btn=>{
      btn.dataset.preview=d.li;
      btn.dataset.title=d.t;
    });
  });
});
const spy=new IntersectionObserver(es=>{
  es.forEach(e=>{
    if(!e.isIntersecting)return;
    const nav=document.querySelector('.type-nav.on');if(!nav)return;
    const a=nav.querySelector('a[href="#'+e.target.id+'"]');if(!a)return;
    nav.querySelectorAll('a.cur').forEach(x=>x.classList.remove('cur'));a.classList.add('cur');
    nav.scrollTo({left:a.offsetLeft-nav.clientWidth/2+a.clientWidth/2,behavior:'smooth'});
  });
},{rootMargin:'-40% 0px -55% 0px'});
document.querySelectorAll('.group-section').forEach(s=>spy.observe(s));
</script>`;
  // —— 产物卫生：manifest 只留本轮用到的键，png/html 下未被引用的孤儿文件（过期变体、改名残留）删除 ——
  for (const k of Object.keys(manifest)) if (!cache.has(k)) delete manifest[k];
  const keep = new Set<string>();
  for (const r of cache.values()) {
    for (const p of [r.png, r.light, ...(r.alts ?? []).map((a) => a.path)]) if (p) keep.add(resolve(p));
  }
  for (const dir of [join(job.out, 'png'), join(job.out, 'html')]) {
    for (const f of readdirSync(dir)) {
      const fp = join(dir, f);
      if (statSync(fp).isFile() && !keep.has(resolve(fp))) unlinkSync(fp);
    }
  }
  const stray = join(job.out, 'nul');
  if (existsSync(stray)) unlinkSync(stray); // Windows 重定向 2>nul 的残留

  const html = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virta Gallery</title><style>${buildCss({ fonts: true })}${PAGE_CSS}</style></head><body>${hero}</body></html>`;
  const index = join(job.out, 'index.html');
  writeFileSync(index, html, 'utf8');
  writeFileSync(manPath, JSON.stringify(manifest), 'utf8');
  const BASE_OF: Record<string, string> = { matrix3d: 'bar', line3d: 'line', pie3d: 'pie', scatter3d: 'scatter' };
  const viewCount = new Set(famGroups.flatMap((gp) => gp.items.map((it) => BASE_OF[it.view] ?? it.view))).size;
  return { items: totalCards, views: viewCount, packs: packs.length, index, reused };
}
