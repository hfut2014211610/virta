// render 管线：table → adapt → frameStatic → layout → scene → html/svg/png。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { PaletteId, Table, Theme, ViewId, ViewSpec, VizError } from '@virta/contracts';
import { getContract, THEME_IDS } from '@virta/contracts';
import { ADAPTERS, adaptInput, projectQuality, resolveTime, parseInstant, zonedParts } from '@virta/data-engine';
import { getRenderer } from '@virta/charts';
import { FACETABLE, facetGroups, facetLayout } from '@virta/viewer';
import { scene as mkScene, toSVG } from '@virta/chart-core';
import { applySkin, frameStatic, type LegendItem } from '@virta/chart-skin';
import { singleFileHtml, type Payload } from '@virta/viewer';
import { fontPath, paletteColors, resolveTheme } from '@virta/design-system';
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
  files: { format: 'html' | 'svg' | 'png'; path: string; bytes: number; width?: number; height?: number; page?: number; pages?: number }[];
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
const VIEW_MAP = JSON.parse(readFileSync(join('packages/viewer/view-map.json'), 'utf8')) as Record<string, { charts: string; renderer: string; adapter: string; toModel: string; toModelCurve?: string; post?: string }>;

/** per-view 入口源码：与 scripts/build.mjs 同款，只打包本视图 renderer+toModel(+post)。
 *  ADR-0012：adapt 走统一管线 runPipeline（派生列/映射/缺失值/后处理与 CLI 同一条路径）。 */
function viewEntrySource(view: string): string {
  const m = VIEW_MAP[view];
  if (!m) fail('UNKNOWN_VIEW', `view-map 缺少 ${view}`);
  const isDoc = view === 'report';
  return `import { boot } from './packages/viewer/src/runtime.js';
import { ${m.renderer} } from './packages/charts/src/${m.charts}.js';
import { ${[m.toModel, m.toModelCurve].filter(Boolean).join(', ')} } from './packages/data-engine/src/${m.adapter}.js';
${isDoc ? '' : `import { runPipeline } from './packages/data-engine/src/pipeline.js';
${m.post ? `import { ${m.post} } from './packages/data-engine/src/families/post.js';` : ''}`}
const deps = {
  renderer: ${m.renderer},
  ${isDoc
    ? `buildDoc: (text, name) => ${m.toModel}(text, name),`
    : `adapt: (t, s) => runPipeline(t, s, ${JSON.stringify(view)}, (raw) => ${m.toModelCurve ? `(s?.variant === 'curve' ? ${m.toModelCurve} : ${m.toModel})` : m.toModel}(raw)${m.post ? `, ${m.post}` : ''}).model,`}
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
  // B8：宽高只经 spec.size 解析（buildSpec 统一写入）；断言有限正数，PNG 小于 16px 直接失败
  if (!Number.isFinite(job.width) || job.width <= 0) fail('INVALID_OPTION', `宽度需为正数：${job.width}`, '如 --width 1200');
  if (job.width < 16 && job.formats.includes('png')) fail('EXPORT_FAILED', `宽度 ${job.width}px 小于 16px，resvg 无法渲染`, '改用 --width ≥16 或去掉 --export png');
  if (spec.size?.height !== 'auto' && (!Number.isFinite(job.height) || job.height <= 0)) fail('INVALID_OPTION', `高度需为正数或 auto：${spec.size?.height ?? job.height}`, '--height 675 或 --height auto（仅流式/自适应视图）');
  const warnings: RenderResult['warnings'] = [];

  const theme: Theme = spec.theme ?? 'light';
  if (!THEME_IDS.includes(theme)) fail('INVALID_SPEC', `未知主题 ${theme}`, `支持：${THEME_IDS.join(' | ')}`);
  const tokens = resolveTheme(theme);
  // A7 统一适配入口：表格/文档同一条路径（与 compose、运行期共用）
  const adapted = adaptInput({ table, doc: job.doc, name: job.stem }, view, spec);
  const model = adapted.model;
  const quality: ReturnType<typeof projectQuality> | undefined = adapted.quality;
  const insights = adapted.insights;
  const counts = adapted.counts;

  // 行数驱动图族（甘特等）：静态导出撑高到期望高度，行不被压缩/不丢尾部
  const prefH = (rend as { preferredHeight?: (m: unknown, r: { width: number; variant?: string; options?: Record<string, string | number | boolean>; state?: ViewSpec['state'] }) => number | null })
    .preferredHeight?.(model, { width: job.width, variant: spec.variant, options: spec.options ?? {}, state: spec.state });
  // ADR-0009 流式视图：静态导出用自然高度（内容不受画布钳制）；'--height auto' 同理
  const isFlow = contract?.flow === true;
  const measured = isFlow ? rend.measure?.(model as never, { width: job.width, variant: spec.variant, options: spec.options ?? {}, format: spec.format }) : undefined;
  const frameOverhead = 1000 - frameStatic(job.width, 1000, { text: spec.text, insights, theme: tokens, frame: job.frame }).plot.h;
  if (measured) job.height = Math.max(spec.size?.height === 'auto' ? 0 : job.height, measured.height + frameOverhead);
  else if (spec.size?.height === 'auto' && prefH) job.height = prefH;
  else if (spec.size?.height === 'auto') { job.height = 675; warnings.push({ code: 'HEIGHT_AUTO_FALLBACK', level: 'info', message: '--height auto 仅对流式/自适应视图生效，已回退 675' }); }
  else if (prefH && prefH > job.height) job.height = Math.min(prefH, 5000);

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
  // ADR-0010：有 asOf 时静态卡脚注显示「数据截至 …（tz）」
  const textWithAsOf = (() => {
    if (!spec.time?.asOf) return spec.text;
    const { tz } = resolveTime(spec);
    const zp = zonedParts(parseInstant(spec.time.asOf)!, tz);
    const p = (n: number) => String(n).padStart(2, '0');
    const note = `数据截至 ${zp.y}-${p(zp.mo)}-${p(zp.d)} ${p(zp.h)}:${p(zp.mi)}（${tz}）`;
    return { ...spec.text, source: [spec.text?.source, note].filter(Boolean).join(' · ') };
  })();
  const framed = frameStatic(job.width, job.height, {
    text: textWithAsOf, insights, legend, theme: tokens, frame: job.frame,
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
  applySkin(sc, tokens.skin);
  const svg = toSVG(sc);

  // ADR-0009 流式静态分页：自然高度超过 page.height（默认 1600）时按页拆分，
  // grid 走滚动窗口（每页自动重复表头），其余 flow 视图走 measure().breaks + flow 窗口
  const pageH = Math.max(240, spec.page?.height ?? 1600);
  const needPages = isFlow && spec.page?.break !== 'none' && measured !== undefined
    && measured.height + frameOverhead > pageH && job.formats.some((fm) => fm === 'svg' || fm === 'png');
  const pageSvgs: { svg: string; height: number }[] = [];
  if (needPages) {
    const framePage = () => frameStatic(job.width, pageH, { text: textWithAsOf, insights, legend, theme: tokens, frame: job.frame });
    const pageLayout = (extra: Record<string, unknown>) => rend.layout(model as never, {
      width: job.width, height: pageH, plot: framePage().plot, theme, palette, tokens,
      variant: spec.variant, mode: spec.mode, options: spec.options ?? {}, state: spec.state,
      format: spec.format, annotations: spec.annotations, text: spec.text, ...extra,
    } as never);
    const merge = (inner: ReturnType<typeof rend.layout>, fp: ReturnType<typeof framePage>) => {
      const scp = mkScene(job.width, pageH, [], tokens.paper);
      scp.defs = inner.defs; scp.hits = inner.hits;
      scp.root.children = [...fp.scene.root.children, ...inner.root.children];
      applySkin(scp, tokens.skin);
      return toSVG(scp);
    };
    if (view === 'grid' || spec.view === 'grid') {
      for (let start = 0, guard = 0; guard < 4000; guard++) {
        const fp = framePage();
        const inner = rend.layout(model as never, {
          width: job.width, height: pageH, plot: fp.plot, theme, palette, tokens,
          variant: spec.variant, mode: spec.mode, options: spec.options ?? {},
          state: { ...(spec.state ?? {}), range: [start, 0] },
          format: spec.format, annotations: spec.annotations, text: spec.text,
        });
        pageSvgs.push({ svg: merge(inner, fp), height: pageH });
        const scroll = (inner as unknown as { scroll?: { total: number; page: number; start: number } }).scroll;
        if (!scroll || scroll.page <= 0 || start + scroll.page >= scroll.total) break;
        start += scroll.page;
      }
    } else {
      const fp = framePage();
      const plotH = fp.plot.h;
      const offs = [0];
      for (let cur = 0; cur + plotH < measured!.height;) {
        const nxt = measured!.breaks.filter((b) => b > cur && b <= cur + plotH).pop() ?? cur + plotH;
        offs.push(nxt); cur = nxt;
      }
      for (const off of offs) {
        const inner = pageLayout({ flow: { offset: off, height: plotH } });
        pageSvgs.push({ svg: merge(inner, fp), height: pageH });
      }
    }
  }

  const payload: Payload = {
    spec, table, insights, reason: 'explicit', doc: job.doc, viewTitle: contract?.title,
    counts,
    quality: { confidence: quality?.confidence ?? 'high', issues: quality?.issues ?? [], mapping: quality?.mapping ?? {} },
  };

  // —— 导出 ——
  const files: RenderResult['files'] = [];
  const stem = `${job.stem}-${view}${spec.variant ? `-${spec.variant}` : ''}-${theme}`;
  const mkdir = (p: string) => { mkdirSync(p, { recursive: true }); };
  const fontFiles = [fontPath('display-light'), fontPath('display-medium'), fontPath('mono'), ...job.fontFiles];
  for (const fmt of job.formats) {
    mkdir(job.out);
    if (fmt === 'svg' || fmt === 'png') {
      const sheets = pageSvgs.length ? pageSvgs : [{ svg, height: job.height }];
      for (let pi = 0; pi < sheets.length; pi++) {
        const suffix = sheets.length > 1 ? `-p${pi + 1}` : '';
        const path = `${join(job.out, stem)}${suffix}.${fmt}`;
        const meta = { page: sheets.length > 1 ? pi + 1 : undefined, pages: sheets.length > 1 ? sheets.length : undefined };
        if (fmt === 'svg') {
          writeFileSync(path, sheets[pi]!.svg, 'utf8');
          files.push({ format: 'svg', path, bytes: Buffer.byteLength(sheets[pi]!.svg), width: job.width, height: sheets[pi]!.height, ...meta });
        } else {
          if (!fontFallbackOk(fontFiles) && pi === 0) {
            warnings.push({ code: 'FONT_FALLBACK', level: 'warn', message: '中文字形缺失：请用 --font-file 指定覆盖中文的字体' });
          }
          try {
            const r = new Resvg(sheets[pi]!.svg, {
              font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
              background: tokens.paper,
              fitTo: { mode: 'zoom', value: job.scale },
            });
            const png = r.render().asPng();
            writeFileSync(path, png);
            files.push({ format: 'png', path, bytes: png.length, width: job.width * job.scale, height: sheets[pi]!.height * job.scale, ...meta });
          } catch (e) {
            fail('EXPORT_FAILED', `PNG 导出失败：${(e as Error).message}`, '检查 --font-file 与尺寸参数');
          }
        }
      }
      continue;
    }
    const path = `${join(job.out, stem)}.${fmt}`;
    if (fmt === 'html') {
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
