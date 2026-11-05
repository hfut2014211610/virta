// demo 命令：pack → index.html（story 布局：问题→交互图→洞察）+ dashboard.html（grid + 自动联动）
// + png/*.png（每图卡片版）。--all 遍历全部场景包并生成 demo 首页。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PaletteId, Table, Theme, ViewId, ViewSpec } from '@virta/contracts';
import { rawToTable, profileTable } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { runComposeFile, type ComposeFileShape } from './compose.js';
import { renderChart } from './render.js';
import { fail } from './render.js';

const PACKS_DIR = join('examples', 'packs');

interface PackChart { id: string; file: string; question?: string; spec?: ViewSpec }
interface PackJson { id: string; title?: string; story?: string; charts: PackChart[] }

export interface DemoJob {
  pack: string;
  out: string;
  scale: number;
  fontFiles: string[];
  theme?: Theme;
  palette?: PaletteId;
}

export function listPacks(): string[] {
  if (!existsSync(PACKS_DIR)) return [];
  return readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PACKS_DIR, d.name, 'pack.json')))
    .map((d) => d.name)
    .sort();
}

/** 自动联动列：在 ≥2 个图表文件中同为维度的列（按出现次数降序，最多 3 个）。 */
function autoLinks(tabs: { table: Table }[]): { column: string }[] {
  const dimCount = new Map<string, number>();
  for (const { table } of tabs) {
    const prof = profileTable(table);
    for (const d of new Set(prof.dims)) dimCount.set(d, (dimCount.get(d) ?? 0) + 1);
  }
  return [...dimCount.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([column]) => ({ column }));
}

export async function runDemo(job: DemoJob): Promise<{ pack: string; files: string[]; charts: number }> {
  const dir = join(PACKS_DIR, job.pack);
  const packPath = join(dir, 'pack.json');
  if (!existsSync(packPath)) fail('INPUT_NOT_FOUND', `场景包不存在：${job.pack}`, `可选：${listPacks().join(', ')}`);
  const pack = JSON.parse(readFileSync(packPath, 'utf8')) as PackJson;
  const theme: Theme = job.theme ?? 'light';
  const palette: PaletteId = job.palette ?? 'signal';
  const outDir = join(job.out, pack.id);
  const pngDir = join(outDir, 'png');
  mkdirSync(pngDir, { recursive: true });

  const files: string[] = [];
  // 预载各图表数据（png 导出 + 联动列检测共用）
  const loaded: { c: PackChart; table?: Table; docText?: string }[] = [];
  for (const c of pack.charts) {
    const fp = join(dir, c.file);
    if (!existsSync(fp)) fail('INPUT_NOT_FOUND', `pack ${pack.id} 缺少数据文件 ${c.file}`);
    const l = await readInput(fp);
    loaded.push({ c, table: l.result ? rawToTable(l.result.raw as never, l.source) : undefined, docText: l.docText });
  }

  // 1) index.html：story 布局
  const storyCf: ComposeFileShape = {
    title: pack.title ?? pack.id, layout: 'story', theme, palette,
    panels: pack.charts.map((c) => ({ chart: c.id, question: c.question })),
  };
  const story = await runComposeFile(storyCf, dir, { file: '', formats: ['html'], out: outDir, stem: 'index', exactName: true, scale: 1, fontFiles: job.fontFiles });
  files.push(...story.files.map((f) => f.path));

  // 2) dashboard.html：grid 布局 + 自动联动
  const links = autoLinks(loaded.filter((l) => l.table) as { table: Table }[]);
  const gridCf: ComposeFileShape = {
    title: `${pack.title ?? pack.id} · 仪表盘`, layout: 'grid', theme, palette, links,
    panels: pack.charts.map((c) => ({
      chart: c.id, question: c.question,
      w: c.spec?.view === 'kpi' ? 4 : c.spec?.view === 'grid' ? 12 : 6,
      h: c.spec?.view === 'kpi' ? 3 : 5,
    })),
  };
  const grid = await runComposeFile(gridCf, dir, { file: '', formats: ['html'], out: outDir, stem: 'dashboard', exactName: true, scale: 1, fontFiles: job.fontFiles });
  files.push(...grid.files.map((f) => f.path));

  // 3) png/*.png：每图卡片版
  for (const l of loaded) {
    if (!l.c.spec?.view) continue;
    const spec: ViewSpec = { theme, palette, ...l.c.spec, version: 1 };
    const res = await renderChart({
      table: l.table ?? { columns: [], rows: [], source: { name: l.c.file, format: 'md' as const, rows: 0 } },
      spec, formats: ['png'], doc: l.docText,
      out: pngDir, stem: l.c.id,
      width: 1200, height: 675, scale: job.scale, frame: 'card', fontFiles: job.fontFiles,
    });
    files.push(...res.files.map((f) => f.path));
  }
  return { pack: pack.id, files, charts: pack.charts.length };
}

/** demo --all 首页：各场景包入口卡片。 */
export function writeDemoIndex(out: string, packs: { id: string; title: string; story?: string; charts: number }[]): void {
  const cards = packs.map((p) => `
    <div class="card">
      <div class="card-t">${p.title ?? p.id}</div>
      <div class="card-s">${p.story ?? ''}</div>
      <div class="card-l"><a href="${p.id}/index.html">故事页</a><a href="${p.id}/dashboard.html">仪表盘</a><span>${p.charts} 图</span></div>
    </div>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virta Demo 场景包</title><style>
body{margin:0;font-family:"Noto Sans CJK SC",system-ui,sans-serif;background:#f7f5ef;color:#1e2420;padding:56px 7vw}
h1{font-size:44px;letter-spacing:.06em;margin:0 0 8px}h1 em{font-style:normal;color:#0f766e}
.sub{color:#6b7268;margin-bottom:40px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px}
.card{background:#fff;border:1px solid #e3e0d4;border-radius:14px;padding:22px 24px}
.card-t{font-size:18px;font-weight:600;margin-bottom:8px}.card-s{color:#6b7268;font-size:13px;line-height:1.7;min-height:44px}
.card-l{margin-top:14px;display:flex;gap:16px;align-items:center;font-size:13px}
.card-l a{color:#0f766e;text-decoration:none;font-weight:600}.card-l span{color:#9aa096;margin-left:auto}
</style></head><body>
<h1>VIRTA <em>Demo</em></h1><div class="sub">${packs.length} 个场景包 · 故事页 + 联动仪表盘 + 卡片 PNG</div>
<div class="grid">${cards}</div>
</body></html>`;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html, 'utf8');
}
