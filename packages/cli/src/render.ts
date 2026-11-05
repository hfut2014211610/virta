// render 管线：table → adapt → frameStatic → layout → scene → html/svg/png。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { PaletteId, Table, Theme, ViewId, ViewSpec, VizError } from '@virta/contracts';
import { getContract } from '@virta/contracts';
import { ADAPTERS } from '@virta/data-engine';
import { getRenderer } from '@virta/charts';
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
function fontFallbackOk(fontFiles: string[]): boolean {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="white"/><text x="4" y="28" font-size="20">中文字形探测</text></svg>`;
  const img = new Resvg(svg, { font: { fontFiles, loadSystemFonts: true } }).render();
  let dark = 0;
  for (let i = 0; i < img.pixels.length; i += 4) if (img.pixels[i] < 200) dark++;
  return dark > 0;
}

const runtimeCache = new Map<string, string>();
/** esbuild 打 viewer 运行期（浏览器 iife）；缓存到内存。 */
async function viewerRuntime(): Promise<string> {
  const hit = runtimeCache.get('rt');
  if (hit) return hit;
  const res = await build({
    entryPoints: ['packages/viewer/src/runtime.ts'],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    write: false, minify: true, globalName: '__VIRTA_RT',
    define: { 'import.meta.url': '"http://localhost/__bundle__/"' },
  });
  const js = res.outputFiles[0].text + '\n__VIRTA_RT.boot(window.__VIRTA__);';
  runtimeCache.set('rt', js);
  return js;
}

export async function renderChart(job: RenderJob): Promise<RenderResult & { svgScene: string; payload: Payload }> {
  const { table, spec } = job;
  if (spec.view === 'auto') fail('INVALID_SPEC', '内部错误：view 未解析', 'renderChart 调用前先推荐');
  const view = spec.view as ViewId;
  const adapter = ADAPTERS[view];
  const renderer = getRenderer(view);
  const contract = getContract(view);
  if (!adapter || !renderer) fail('UNKNOWN_VIEW', `视图 ${view} 暂不支持渲染`, 'virta list 查看已支持视图', { candidates: Object.keys(ADAPTERS) });
  const adapt = adapter!; const rend = renderer!;

  const theme: Theme = spec.theme ?? 'light';
  const tokens = THEMES[theme];
  const { model, quality } = adapt.adapt(table, spec);
  const insights = adapt.insights(model, spec);
  const counts = adapt.counts(model);

  // 卡片框 → 绘图区 → 图族布局（图例项先行：model.series 可直接枚举）
  const palette = spec.palette ?? 'signal';
  const hiddenS = new Set(spec.state?.hiddenSeries ?? []);
  const seriesNames = ((model as { series?: { name: string }[] }).series ?? []).map((s) => s.name);
  const legend: LegendItem[] | undefined = seriesNames.length > 1
    ? seriesNames.map((name, i) => ({ name, color: paletteColors(palette, theme)[i % paletteColors(palette, theme).length], hidden: hiddenS.has(name) }))
    : undefined;
  const framed = frameStatic(job.width, job.height, {
    text: spec.text, insights, legend, theme: tokens, frame: job.frame,
  });
  const inner = rend.layout(model as never, {
    width: job.width, height: job.height,
    plot: framed.plot,
    theme, palette, tokens,
    variant: spec.variant, mode: spec.mode,
    options: spec.options ?? {}, state: spec.state,
    format: spec.format, annotations: spec.annotations, text: spec.text,
  });
  const sc = mkScene(job.width, job.height, [], tokens.paper);
  sc.defs = inner.defs;
  sc.hits = inner.hits;
  sc.root.children = [...framed.scene.root.children, ...inner.root.children];
  const svg = toSVG(sc);

  const payload: Payload = {
    spec, table, insights, reason: 'explicit',
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
      const html = singleFileHtml({ payload, svg, runtimeJs: await viewerRuntime(), theme });
      writeFileSync(path, html, 'utf8');
      files.push({ format: 'html', path, bytes: Buffer.byteLength(html), width: job.width, height: job.height });
    } else {
      fail('UNSUPPORTED_EXPORT', `不支持的导出格式 ${fmt}`, '支持 html,svg,png');
    }
  }
  void contract;
  return { files, warnings, svgScene: svg, payload };
}
