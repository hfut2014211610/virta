// render 管线：table → adapt → frameStatic → layout → scene → html/svg/png。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { PaletteId, Table, Theme, ViewId, ViewSpec, VizError } from '@virta/contracts';
import { getContract } from '@virta/contracts';
import { ADAPTERS, DOC_ADAPTER, projectQuality } from '@virta/data-engine';
import { getRenderer } from '@virta/charts';
import { FACETABLE, facetGroups, facetLayout } from '@virta/viewer';
import { scene as mkScene, toSVG } from '@virta/chart-core';
import { frameStatic, type LegendItem } from '@virta/chart-skin';
import { singleFileHtml, type Payload } from '@virta/viewer';
import { fontPath, paletteColors, THEMES } from '@virta/design-system';
import { Resvg } from '@resvg/resvg-js';

export class CliError extends Error {
  constructor(public viz: VizError) { super(viz.message); }
}
export const fail = (code: VizError['code'], message: string, hint?: string, details?: VizError['details']): never => {
  throw new CliError({ code, message, hint, recoverable: code !== 'INTERNAL', details });
};

export interface RenderJob {
  table: Table;
  spec: ViewSpec;
  /** 文档输入（report 视图专用）：非空时绕过表格适配器 */
  doc?: string;
  /** 导出格式 */
  formats: ('html' | 'svg' | 'png')[];
  out: string;           // 目录或无扩展名路径
  stem: string;
  width: number; height: number; scale: number;
  frame: 'card' | 'chart';
  fontFiles: string[];
}

export interface RenderResult {
  files: { format: 'html' | 'svg' | 'png'; path: string; bytes: number; width?: number; height?: number }[];
  warnings: { code: string; level: 'info' | 'warn' | 'error'; message: string }[];
}

/** CJK 缺字形探测（§5.8）：用已配置字体渲染固定中文，像素为空则回执警告。 */
const fontProbeCache = new Map<string, boolean>();
function fontFallbackOk(fontFiles: string[]): boolean {
  const key = fontFiles.join('|');
  const hit = fontProbeCache.get(key);
  if (hit !== undefined) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="white"/><text x="4" y="28" font-size="20">中文字形探测</text></svg>`;
  const img = new Resvg(svg, { font: { fontFiles, loadSystemFonts: true } }).render();
  let dark = 0;
  for (let i = 0; i < img.pixels.length; i += 4) if (img.pixels[i] < 200) dark++;
  const ok = dark > 0;
  fontProbeCache.set(key, ok);
  return ok;
}

const runtimeCache = new Map<string, string>();
const VIEW_MAP = JSON.parse(readFileSync(join('packages/viewer/view-map.json'), 'utf8')) as Record<string, { charts: string; renderer: string; adapter: string; toModel: string; toModelCurve?: string }>;

/** per-view 入口源码：与 scripts/build.mjs 同款，只打包本视图 renderer+toModel。 */
function viewEntrySource(view: string): string {
  const m = VIEW_MAP[view];
  if (!m) fail('UNKNOWN_VIEW', `view-map 缺少 ${view}`);
  const isDoc = view === 'report';
  return `import { boot } from './packages/viewer/src/runtime.js';
import { ${m.renderer} } from './packages/charts/src/${m.charts}.js';
import { ${[m.toModel, m.toModelCurve].filter(Boolean).join(', ')} } from './packages/data-engine/src/${m.adapter}.js';
import { facetLayout, facetGroups, FACETABLE } from './packages/viewer/src/facet.js';
const deps = {
  renderer: ${m.renderer},
  ${isDoc
    ? `buildDoc: (text, name) => ${m.toModel}(text, name),`
    : `adapt: (t, s) => ${m.toModelCurve ? `(s?.variant === 'curve' ? ${m.toModelCurve} : ${m.toModel})` : m.toModel}(t.passthrough?.kind === 'echarts' ? { __echarts: t.passthrough.data } : t.rows),`}
};
boot(window.__VIRTA__, deps);
`;
}

/** esbuild 打 viewer 运行期（浏览器 iife，按视图 slim）；缓存到内存。 */
async function viewerRuntime(view: string): Promise<string> {
  const hit = runtimeCache.get(view);
  if (hit) return hit;
  const res = await build({
    stdin: { contents: viewEntrySource(view), resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    write: false, minify: true, globalName: '__VIRTA_RT',
    define: { 'import.meta.url': '"http://localhost/__bundle__/"' },
  });
  const js = res.outputFiles[0].text;
  runtimeCache.set(view, js);
  return js;
}

export async function renderChart(job: RenderJob): Promise<RenderResult & { svgScene: string; payload: Payload }> {
  const { table, spec } = job;
  if (spec.view === 'auto') fail('INVALID_SPEC', '内部错误：view 未解析', 'renderChart 调用前先推荐');
  const view = spec.view as ViewId;
  const adapter = ADAPTERS[view];
  const renderer = getRenderer(view);
  const contract = getContract(view);
  const isDoc = job.doc !== undefined;
  if (!renderer || (!isDoc && !adapter)) fail('UNKNOWN_VIEW', `视图 ${view} 暂不支持渲染`, 'virta list 查看已支持视图', { candidates: Object.keys(ADAPTERS) });
  const rend = renderer!;

  const theme: Theme = spec.theme ?? 'light';
  const tokens = THEMES[theme];
  let model: unknown, quality: ReturnType<typeof projectQuality> | undefined;
  let insights: import('@virta/contracts').Insight[];
  let counts: Record<string, number>;
  if (isDoc) {
    const dm = DOC_ADAPTER.buildDoc(job.doc!, job.stem);
    model = dm;
    quality = projectQuality(dm.quality);
    insights = [
      { kind: 'distribution', text: `共 ${dm.stats.sections} 个章节、${dm.stats.paragraphs} 段`, importance: 50 },
      { kind: 'target', text: `识别 ${dm.metrics.length} 个指标`, importance: 40 },
    ];
    counts = { 章节: dm.stats.sections, 段落: dm.stats.paragraphs, 表格: dm.stats.tables, 指标: dm.metrics.length };
  } else {
    const adapt = adapter!;
    const a = adapt.adapt(table, spec);
    model = a.model;
    quality = a.quality;
    insights = adapt.insights(model, spec);
    counts = adapt.counts(model);
  }

  // 卡片框 → 绘图区 → 图族布局（图例项先行：model.series/groups 可直接枚举）
  const palette = spec.palette ?? 'signal';
  const hiddenS = new Set(spec.state?.hiddenSeries ?? []);
  const seriesNames = ((model as { series?: { name: string }[] }).series ?? []).map((s) => s.name);
  const groupNames = seriesNames.length <= 1 && view === 'histogram'
    ? ((model as { groups?: { name: string }[] }).groups ?? []).map((s2) => s2.name).filter((n) => n !== '__all__')
    : [];
  const legendNames = seriesNames.length > 1 ? seriesNames : groupNames;
  const legend: LegendItem[] | undefined = legendNames.length > 1
    ? legendNames.map((name, i) => ({ name, color: paletteColors(palette, theme)[i % paletteColors(palette, theme).length], hidden: hiddenS.has(name) }))
    : undefined;
  const framed = frameStatic(job.width, job.height, {
    text: spec.text, insights, legend, theme: tokens, frame: job.frame,
  });
  const facetCol = spec.facet?.column;
  let inner;
  if (!isDoc && facetCol) {
    if (!FACETABLE.has(view)) fail('INVALID_SPEC', `视图 ${view} 不支持分面`, `分面支持：${[...FACETABLE].join('/')}`);
    if (!table.columns.includes(facetCol)) fail('MISSING_COLUMN', `分面列不存在：${facetCol}`, `--unset facet.column，或改用表内列`, { candidates: table.columns });
    const subs = facetGroups(table.rows as Record<string, unknown>[], facetCol)
      .map((gr) => ({ name: gr.name, model: adapter!.adapt({ ...table, rows: gr.rows } as Table, spec).model }));
    inner = facetLayout(view, rend, subs, {
      width: job.width, height: job.height, plot: framed.plot,
      theme, palette, tokens, variant: spec.variant, mode: spec.mode,
      options: spec.options ?? {}, state: spec.state,
      format: spec.format, annotations: spec.annotations, text: spec.text,
    }, spec.facet?.sharedScale ?? false, spec.facet?.columns);
  } else {
    inner = rend.layout(model as never, {
      width: job.width, height: job.height,
      plot: framed.plot,
      theme, palette, tokens,
      variant: spec.variant, mode: spec.mode,
      options: spec.options ?? {}, state: spec.state,
      format: spec.format, annotations: spec.annotations, text: spec.text,
    });
  }
  const sc = mkScene(job.width, job.height, [], tokens.paper);
  sc.defs = inner.defs;
  sc.hits = inner.hits;
  sc.root.children = [...framed.scene.root.children, ...inner.root.children];
  const svg = toSVG(sc);

  const payload: Payload = {
    spec, table, insights, reason: 'explicit', doc: job.doc, viewTitle: contract?.title,
    counts,
    quality: { confidence: quality?.confidence ?? 'high', issues: quality?.issues ?? [], mapping: quality?.mapping ?? {} },
  };

  // —— 导出 ——
  const warnings: RenderResult['warnings'] = [];
  const files: RenderResult['files'] = [];
  const stem = `${job.stem}-${view}${spec.variant ? `-${spec.variant}` : ''}-${theme}`;
  const mkdir = (p: string) => { mkdirSync(p, { recursive: true }); };
  const fontFiles = [fontPath('display-light'), fontPath('display-medium'), fontPath('mono'), ...job.fontFiles];
  for (const fmt of job.formats) {
    const path = `${join(job.out, stem)}.${fmt === 'png' ? 'png' : fmt}`;
    mkdir(job.out);
    if (fmt === 'svg') {
      writeFileSync(path, svg, 'utf8');
      files.push({ format: 'svg', path, bytes: Buffer.byteLength(svg), width: job.width, height: job.height });
    } else if (fmt === 'png') {
      if (!fontFallbackOk(fontFiles)) {
        warnings.push({ code: 'FONT_FALLBACK', level: 'warn', message: '中文字形缺失：请用 --font-file 指定覆盖中文的字体' });
      }
      try {
        const r = new Resvg(svg, {
          font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
          background: tokens.paper,
          fitTo: { mode: 'zoom', value: job.scale },
        });
        const png = r.render().asPng();
        writeFileSync(path, png);
        files.push({ format: 'png', path, bytes: png.length, width: job.width * job.scale, height: job.height * job.scale });
      } catch (e) {
        fail('EXPORT_FAILED', `PNG 导出失败：${(e as Error).message}`, '检查 --font-file 与尺寸参数');
      }
    } else if (fmt === 'html') {
      const html = singleFileHtml({ payload, svg, runtimeJs: await viewerRuntime(view), theme });
      writeFileSync(path, html, 'utf8');
      files.push({ format: 'html', path, bytes: Buffer.byteLength(html), width: job.width, height: job.height });
    } else {
      fail('UNSUPPORTED_EXPORT', `不支持的导出格式 ${fmt}`, '支持 html,svg,png');
    }
  }
  void contract;
  return { files, warnings, svgScene: svg, payload };
}
