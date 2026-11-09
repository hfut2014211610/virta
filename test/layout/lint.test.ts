// §4.3 版面检查：lintScene 全量扫描——
// ① examples/basic 各视图主样例 × {light,dark} × {1200×675, 600×360}
// ② 5 个场景包每张图按 pack.json spec 渲染 1200×675
// ③ 每个 compose 文件每个面板按实际尺寸（经 runComposeFile 回执告警覆盖）
// error 类问题必须为 0；豁免须写进 allowlist.json（视图/样例/类型/理由）。
// M2d.1 基线：allowlist 记录当前 error；M2d.2 修复后文件必须清空。
import { existsSync, readdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintScene, measureText, scene as mkScene, type LintKind, type Scene } from '@virta/chart-core';
import { applySkin, frameStatic, type LegendItem } from '@virta/chart-skin';
import { ADAPTERS, adaptInput, rawToTable } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { getRenderer } from '@virta/charts';
import { FACETABLE, facetGroups, facetLayout } from '@virta/viewer';
import { paletteColors, resolveTheme } from '@virta/design-system';
import { runComposeFile } from '../../packages/cli/src/compose.js';
import type { PaletteId, Table, Theme, ViewSpec } from '@virta/contracts';

interface AllowEntry { case: string; kind: LintKind; note: string }
const ALLOW: AllowEntry[] = existsSync(join(__dirname, 'allowlist.json'))
  ? JSON.parse(readFileSync(join(__dirname, 'allowlist.json'), 'utf8')) as AllowEntry[]
  : [];

const BASIC = 'examples/basic';
const GAL = 'examples/gallery';
const ERR_KINDS = new Set<LintKind>(['text-overlap', 'text-clipped', 'non-finite']);

// 视图 → 主样例（含 flow 视图：静态导出同为 Scene）
const CASES: [string, string, string][] = [
  ['bar', 'sample.csv', BASIC],
  ['line', 'sample-multi.csv', BASIC],
  ['matrix3d', 'sample-line3d.csv', BASIC],
  ['scatter', 'sample-scatter.csv', BASIC],
  ['pie', 'sample.csv', BASIC],
  ['bullet', 'sample-bullet.csv', BASIC],
  ['funnel', 'sample-funnel.csv', BASIC],
  ['heatmap', 'sample-heatmap.csv', BASIC],
  ['treemap', 'sample-treemap.csv', BASIC],
  ['sunburst', 'sample-sunburst.csv', BASIC],
  ['sankey', 'sample-sankey.csv', BASIC],
  ['boxplot', 'sample-boxplot.csv', BASIC],
  ['radar', 'sample-radar.csv', BASIC],
  ['gantt', 'sample-gantt.csv', BASIC],
  ['fishbone', 'sample-fishbone.csv', BASIC],
  ['grid', 'sample-grid.csv', BASIC],
  ['report', 'sample-report.md', BASIC],
  ['pie3d', 'sample-pie3d.csv', BASIC],
  ['line3d', 'sample-line3d.csv', BASIC],
  ['scatter3d', 'sample-scatter3d.csv', BASIC],
  ['combo', 'sample-combo.csv', BASIC],
  ['rank', 'sample-rank.csv', BASIC],
  ['histogram', 'sample-histogram.csv', BASIC],
  ['kpi', 'sample-kpi.csv', BASIC],
  ['compare', 'sample-compare.csv', BASIC],
  ['cohort', 'sample-cohort.csv', BASIC],
  ['tree', 'sample-tree.csv', BASIC],
  ['network', 'sample-network.csv', BASIC],
  ['control', 'sample-control.csv', BASIC],
  ['parallel', 'sample-parallel.csv', BASIC],
  ['er', 'er-schema.csv', GAL],
  ['flowchart', 'flowchart-approve.csv', GAL],
  ['sequence', 'sequence-order.csv', GAL],
  ['burndown', 'burndown-sprint.csv', GAL],
  ['formula', 'formula-math.csv', GAL],
];

const fileCache = new Map<string, Awaited<ReturnType<typeof readInput>>>();
async function loadTable(file: string): Promise<{ table?: Table; doc?: string }> {
  let l = fileCache.get(file);
  if (!l) { l = await readInput(file); fileCache.set(file, l); }
  if (l.docText !== undefined) return { doc: l.docText };
  return { table: rawToTable(l.result!.raw as never, l.source) as Table };
}

/** 对齐 render.ts：adaptInput → frameStatic → layout（facet 走 facetLayout）→ merge → applySkin。 */
function renderScene(view: string, input: { table?: Table; doc?: string }, spec: ViewSpec, W: number, H: number, theme: Theme): Scene {
  const tokens = resolveTheme(theme);
  const palette = (spec.palette ?? 'signal') as PaletteId;
  const adapted = adaptInput({ table: input.table, doc: input.doc, name: 'lint' }, view as never, spec);
  const model = adapted.model;
  const hiddenS = new Set(spec.state?.hiddenSeries ?? []);
  const seriesNames = ((model as { series?: { name: string }[] }).series ?? []).map((s) => s.name);
  const groupNames = seriesNames.length <= 1 && view === 'histogram'
    ? ((model as { groups?: { name: string }[] }).groups ?? []).map((s) => s.name).filter((n) => n !== '__all__') : [];
  const legendNames = seriesNames.length > 1 ? seriesNames : groupNames;
  const legend: LegendItem[] | undefined = legendNames.length > 1
    ? legendNames.map((name, i) => ({ name, color: paletteColors(palette, theme)[i % paletteColors(palette, theme).length]!, hidden: hiddenS.has(name) })) : undefined;
  const framed = frameStatic(W, H, { text: spec.text, insights: adapted.insights, legend, theme: tokens, frame: 'card' });
  const rend = getRenderer(view as never)!;
  const ctx = {
    width: W, height: H, plot: framed.plot, theme, palette, tokens,
    variant: spec.variant, mode: spec.mode, options: spec.options ?? {}, state: spec.state,
    format: spec.format, annotations: spec.annotations, text: spec.text,
  } as never;
  let inner: Scene;
  const facetCol = spec.facet?.column;
  if (input.table && facetCol && FACETABLE.has(view) && input.table.columns.includes(facetCol)) {
    const subs = facetGroups(input.table.rows as Record<string, unknown>[], facetCol)
      .map((gr) => ({ name: gr.name, model: ADAPTERS[view as never]!.adapt({ ...input.table!, rows: gr.rows } as Table, spec).model }));
    inner = facetLayout(view, rend, subs, ctx, spec.facet?.sharedScale ?? false, spec.facet?.columns) as Scene;
  } else {
    inner = rend.layout(model as never, ctx);
  }
  const sc = mkScene(W, H, [], tokens.paper);
  sc.defs = inner.defs; sc.hits = inner.hits;
  sc.root.children = [...framed.scene.root.children, ...inner.root.children];
  applySkin(sc, tokens.skin);
  return sc;
}

interface Finding { scope: string; caseId: string; kind: LintKind; severity: string; detail: string }
const findings: Finding[] = [];
const warns: Finding[] = [];

const collect = (caseId: string, scope: string, sc: Scene, theme: Theme) => {
  for (const i of lintScene(sc, measureText, { paper: resolveTheme(theme).paper })) {
    const f = { scope, caseId, kind: i.kind, severity: i.severity, detail: i.detail };
    (i.severity === 'error' ? findings : warns).push(f);
  }
};

describe('§4.3 版面检查基线', () => {
  it('① basic/gallery 主样例 × 2 主题 × 2 尺寸', async () => {
    for (const [view, file, dir] of CASES) {
      const input = await loadTable(`${dir}/${file}`);
      for (const theme of ['light', 'dark'] as const) {
        for (const [w, h] of [[1200, 675], [600, 360]] as const) {
          const spec: ViewSpec = { version: 1, view: view as never, theme };
          const sc = renderScene(view, input, spec, w, h, theme);
          collect(view, `${view}/${file}/${theme}/${w}x${h}`, sc, theme);
        }
      }
    }
    expect(warns.length + findings.length).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('② 场景包每张图按 pack.json spec 渲染', async () => {
    const packs = readdirSync('examples/packs', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const pack of packs) {
      const pj = JSON.parse(readFileSync(`examples/packs/${pack}/pack.json`, 'utf8')) as { charts?: { id: string; file: string; spec?: ViewSpec }[] };
      for (const c of pj.charts ?? []) {
        const input = await loadTable(`examples/packs/${pack}/${c.file}`);
        const spec: ViewSpec = { version: 1, ...c.spec, theme: 'light' };
        const sc = renderScene(String(spec.view), input, spec, 1200, 675, 'light');
        collect(`pack/${pack}/${c.id}`, `pack/${pack}/${c.id}/${spec.view}`, sc, 'light');
      }
    }
    expect(warns.length + findings.length).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('③ 每个 compose 文件：面板按实际尺寸 lint（经 runComposeFile 告警）', async () => {
    const composeFiles = [
      'examples/packs/retail/compose.json',
      'examples/packs/delivery/deadline.compose.json',
      'examples/edge-cases/xss-compose.json',
    ].filter(existsSync);
    expect(composeFiles.length).toBeGreaterThan(0);
    const out = mkdtempSync(join(tmpdir(), 'virta-lint-'));
    for (const f of composeFiles) {
      const cf = JSON.parse(readFileSync(f, 'utf8'));
      const r = await runComposeFile(cf, join(f, '..'), { formats: ['svg'], out, scale: 1, fontFiles: [] });
      for (const w of r.warnings) {
        const kind = w.code === 'LAYOUT_TEXT_OVERLAP' ? 'text-overlap' : w.code === 'LAYOUT_TEXT_CLIPPED' ? 'text-clipped' : 'low-contrast';
        const f2: Finding = { scope: `compose/${f}`, caseId: `compose/${f}`, kind, severity: kind === 'low-contrast' ? 'warn' : 'error', detail: `${w.message}${w.examples?.length ? `：${w.examples.slice(0, 3).join('；')}` : ''}` };
        (kind === 'low-contrast' ? warns : findings).push(f2);
      }
    }
  }, 120_000);

  it('汇总：无 allowlist 之外的 error；allowlist 无失效条目', () => {
    const used = new Set<number>();
    const unexpected = findings.filter((f) => {
      const idx = ALLOW.findIndex((a) => a.case === f.caseId && a.kind === f.kind);
      if (idx >= 0) { used.add(idx); return false; }
      return true;
    });
    const stale = ALLOW.filter((_, i) => !used.has(i));
    const lines = [
      `error 共 ${findings.length}（豁免命中 ${used.size} 条，意外 ${unexpected.length}），warn 共 ${warns.length}`,
      ...findings.slice(0, 80).map((f) => `  ${f.scope} ${f.kind}: ${f.detail}`),
      ...unexpected.slice(0, 30).map((f) => `  [意外] ${f.scope} ${f.kind}: ${f.detail}`),
      ...stale.map((a) => `  [allowlist 失效] ${a.case} ${a.kind}（${a.note}）`),
    ];
    console.log('\n' + lines.join('\n') + '\n');
    expect(unexpected, lines.join('\n')).toEqual([]);
    expect(stale, 'allowlist 存在已修复但未删除的条目，请清空').toEqual([]);
  });
});
