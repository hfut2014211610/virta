// compose 命令：compose.json → 解析面板（pack.json chart 引用 | 内联 file+spec）
// → 逐面板 adapt+layout → 合并 Scene → svg/png/html（浏览器端联动筛选）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PaletteId, Table, Theme, ViewId, ViewSpec } from '@virta/contracts';
import { getContract, THEME_IDS, resolveView, validateSpec } from '@virta/contracts';
import { ADAPTERS, adaptInput, rawToTable, resolveTime } from '@virta/data-engine';
import { readInput } from '@virta/data-engine/node';
import { getRenderer } from '@virta/charts';
import { g, scene as mkScene, toSVG, type Node } from '@virta/chart-core';
import { composeHtml, type ComposePayload } from '@virta/viewer';
import { applySkin } from '@virta/chart-skin';
import { fontPath, resolveTheme } from '@virta/design-system';
import { Resvg } from '@resvg/resvg-js';
import { fail } from './render.js';
import { runtimeScript } from './assets.js';

interface ComposePanelDef {
  chart?: string; file?: string; spec?: ViewSpec; question?: string;
  w?: number; h?: number;
}
interface PackJson { charts?: { id: string; file: string; spec?: ViewSpec; question?: string }[] }

export interface ComposeJob {
  file: string;
  formats: ('html' | 'svg' | 'png')[];
  out: string;
  scale: number;
  fontFiles: string[];
  /** 输出文件名前缀（默认 compose） */
  stem?: string;
  /** 文件名用 stem 原样（不加 -layout-theme 后缀），demo 的 index.html/dashboard.html 用 */
  exactName?: boolean;
}

/** 面板尺寸：grid 12 栏 × h*130px；story 全宽 × h*150px。 */
function packGrid(panels: { w?: number; h?: number }[], W: number, topY: number, padX: number) {
  const cols = 12, gap = 14;
  const colW = (W - padX * 2 + gap) / cols;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let cx = 0, cy = topY, rowH = 0;
  for (const p of panels) {
    const w = Math.min(cols, Math.max(1, p.w ?? 6));
    const h = Math.max(1, p.h ?? 4);
    if (cx + w > cols) { cx = 0; cy += rowH + gap; rowH = 0; }
    const ph = h * 130;
    rects.push({ x: padX + cx * colW, y: cy, w: w * colW - gap, h: ph });
    cx += w; rowH = Math.max(rowH, ph);
  }
  return { rects, bottom: cy + rowH };
}
function packStory(panels: { h?: number }[], W: number, topY: number, padX: number) {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let cy = topY;
  for (const p of panels) {
    const ph = Math.max(1, p.h ?? 4) * 150 + 60;
    rects.push({ x: padX, y: cy, w: W - padX * 2, h: ph });
    cy += ph + 18;
  }
  return { rects, bottom: cy };
}

export interface ComposeFileShape {
  title?: string; layout?: 'grid' | 'story';
  theme?: Theme; palette?: PaletteId;
  size?: { width?: number; height?: number };
  /** 文件级时间契约（ADR-0012）：面板 spec.time 继承此处；缺省时按 render 方式写回 */
  time?: ViewSpec['time'];
  panels: ComposePanelDef[];
  links?: { column: string }[];
}

export interface ComposeResult {
  files: { format: string; path: string; bytes: number }[];
  payload: ComposePayload; panels: number;
  panelResults: { id: string; rendered: boolean; error?: string }[];
  views: string[];
  /** 时间写回假设（TZ_ASSUMED/ASOF_ASSUMED）等警告 */
  warnings: { code: string; level: 'info' | 'warn' | 'error'; message: string }[];
}

export async function runCompose(job: ComposeJob): Promise<ComposeResult> {
  const cjPath = job.file;
  if (!existsSync(cjPath)) fail('INPUT_NOT_FOUND', `compose.json 不存在：${cjPath}`);
  let cf: ComposeFileShape;
  try { cf = JSON.parse(readFileSync(cjPath, 'utf8')) as ComposeFileShape; }
  catch { fail('INVALID_SPEC', `${cjPath} 不是合法 JSON`, '参考 pack.json 的 compose 字段'); }
  return runComposeFile(cf!, dirname(cjPath), job);
}

/** 直接以内存 ComposeFile 运行（demo 等调用方用）；dir 用于解析 pack.json 与数据文件。 */
export async function runComposeFile(cf: ComposeFileShape, dir: string, job: ComposeJob): Promise<ComposeResult> {
  const packPath = join(dir, 'pack.json');
  const pack: PackJson | null = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')) as PackJson : null;
  const defs: (ComposePanelDef & { file: string; spec: ViewSpec })[] = [];
  for (const p of cf!.panels ?? []) {
    if (p.chart) {
      const c = pack?.charts?.find((x) => x.id === p.chart);
      if (!c) fail('INVALID_SPEC', `面板引用未知 chart「${p.chart}」`, `${dir}/pack.json 的 charts[].id`);
      defs.push({ ...p, file: c!.file, spec: { version: 1, ...c!.spec } as ViewSpec, question: p.question ?? c!.question });
    } else if (p.file && p.spec) {
      defs.push({ ...p, file: p.file, spec: p.spec });
    } else fail('INVALID_SPEC', '面板需要 chart 引用或 file+spec', JSON.stringify(p));
  }
  if (!defs.length) fail('EMPTY_DATA', 'compose.json 没有面板');

  const theme: Theme = cf!.theme ?? 'light';
  if (!THEME_IDS.includes(theme)) fail('INVALID_SPEC', `未知主题 ${theme}`, `支持：${THEME_IDS.join(' | ')}`);
  const tokens = resolveTheme(theme);
  const palette = cf!.palette ?? 'signal';
  const W = cf!.size?.width ?? 1440;

  // ADR-0012：文件级 time 解析一次 → 各面板 spec.time 继承并写回（payload 可复现）；
  // 缺省时按 render 的方式写回 asOf/tz 并报 TZ_ASSUMED / ASOF_ASSUMED。
  const rt = resolveTime({ version: 1, view: 'bar', time: cf!.time } as ViewSpec);
  const warnings: ComposeResult['warnings'] = rt.assumed.map((c) => ({
    code: c, level: 'info' as const,
    message: c === 'TZ_ASSUMED' ? `未指定时区，按系统时区 ${rt.tz} 处理` : `未指定 asOf，按当前时刻 ${rt.asOfIso} 处理`,
  }));
  const inheritTime = (s: ViewSpec): ViewSpec['time'] => ({
    ...cf!.time, asOf: cf!.time?.asOf ?? rt.asOfIso, tz: cf!.time?.tz ?? rt.tz, ...s.time,
  });

  // 逐面板：读数 → adaptInput（A7 统一入口）→ 预渲染校验（rendered/error，F5）
  const views: string[] = [];
  const panelData: { id: string; view: ViewId; spec: ViewSpec; table: Table; doc?: string; question?: string; insights: ComposePayload['panels'][0]['insights']; model: unknown; w?: number; h?: number; rendered: boolean; error?: string; flow: boolean }[] = [];
  for (const [i, d] of defs.entries()) {
    const fpath = join(dir, d.file);
    if (!existsSync(fpath)) fail('INPUT_NOT_FOUND', `面板 ${i} 数据文件不存在：${fpath}`);
    const loaded = await readInput(fpath);
    const spec: ViewSpec = { theme, palette, ...d.spec, version: 1, time: inheritTime(d.spec) };
    if (spec.view as unknown === 'auto') fail('INVALID_SPEC', `面板 ${i} view=auto：compose 需要显式视图`, 'virta inspect 先定视图');
    // ADR-0014：别名解析 + 面板 spec 严格校验（与 buildSpec 同一套规则）
    const rv = resolveView(spec.view as string);
    if (!rv) fail('UNKNOWN_VIEW', `面板 ${i} 未知视图 ${spec.view}`, 'virta list 查看全部视图');
    spec.view = rv!.view;
    if (rv!.variant && !spec.variant) spec.variant = rv!.variant;
    const vr = validateSpec(spec, getContract(spec.view as ViewId));
    if (!vr.ok) fail(vr.error.code, `面板 ${d.chart ?? i}: ${vr.error.message}`, vr.error.hint);
    const view = spec.view as ViewId;
    views.push(view);
    const renderer = getRenderer(view);
    if (!renderer) fail('UNKNOWN_VIEW', `面板 ${i} 视图 ${view} 无渲染器`);
    if (loaded.docText === undefined && !ADAPTERS[view]) fail('UNKNOWN_VIEW', `面板 ${i} 视图 ${view} 无适配器`);
    const flow = getContract(view)?.flow === true;
    const table = loaded.docText === undefined ? rawToTable(loaded.result!.raw as never, loaded.source) : { columns: [], rows: [], source: { name: d.file, format: 'md' as const, rows: 0 } };
    const entry: { id: string; view: ViewId; spec: ViewSpec; table: Table; doc?: string; question?: string; insights: ComposePayload['panels'][0]['insights']; model: unknown; w?: number; h?: number; rendered: boolean; error?: string; flow: boolean } =
      { id: d.chart ?? `p${i}`, view, spec, table, doc: loaded.docText, question: d.question, insights: [], model: undefined, w: d.w, h: d.h, rendered: true, flow };
    try {
      const out = adaptInput({ table: loaded.docText === undefined ? table : undefined, doc: loaded.docText, name: d.file }, view, spec);
      entry.model = out.model;
      entry.insights = out.insights;
      // CLI 端预渲染：布局一遍确认面板可渲（避免「CLI 成功但 HTML 坏」）
      renderer!.layout(out.model as never, {
        width: 560, height: 320, plot: { x: 0, y: 0, w: 560, h: 320 },
        theme, palette, tokens, variant: spec.variant, mode: spec.mode,
        options: spec.options ?? {}, state: spec.state, format: spec.format,
        annotations: spec.annotations, text: spec.text,
      } as never);
    } catch (e) {
      entry.rendered = false;
      entry.error = (e as Error).message;
    }
    panelData.push(entry);
  }

  // 布局合并：flow 面板在 grid 布局下独占整行（ADR-0009/§4.4）
  const isGrid = (cf!.layout ?? 'grid') === 'grid';
  const padX = 24, topY = 92;
  const layoutDefs = defs.map((d, i) => ({ w: panelData[i]?.flow ? 12 : d.w, h: d.h }));
  const { rects, bottom } = isGrid
    ? packGrid(layoutDefs, W, topY, padX)
    : packStory(defs, W, topY, padX);
  const H = bottom + 24;
  const children: Node[] = [
    { type: 'text', x: padX, y: 30, text: 'VIRTA · COMPOSE', font: 'mono', size: 11, baseline: 'top', fill: tokens.acc },
    { type: 'text', x: padX, y: 40, text: cf!.title ?? '', font: 'display', size: 30, weight: 600, baseline: 'top', fill: tokens.ink },
  ];
  panelData.forEach((p, i) => {
    const r = rects[i];
    const pn: Node[] = [
      { type: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: 12, fill: tokens.paper, stroke: tokens.line, strokeWidth: 1 },
    ];
    let ty = r.y + 10;
    if (p.question) { pn.push({ type: 'text', x: r.x + 14, y: ty + 4, text: p.question, font: 'mono', size: 10.5, baseline: 'top', fill: tokens.acc }); ty += 16; }
    pn.push({ type: 'text', x: r.x + 14, y: ty + 4, text: p.spec.text?.title ?? p.id, font: 'body', size: 14, weight: 600, baseline: 'top', fill: tokens.ink });
    const first = p.insights[0];
    if (first) pn.push({ type: 'text', x: r.x + 14, y: ty + 24, text: `◆ ${first.text}`, font: 'body', size: 10.5, baseline: 'top', fill: tokens.muted });
    const inner = { x: r.x + 12, y: ty + (first ? 42 : 28), w: r.w - 24, h: r.h - (ty + (first ? 42 : 28) - r.y) - 12 };
    if (!p.rendered) {
      pn.push({ type: 'text', x: inner.x + 10, y: inner.y + 20, text: `✗ 面板渲染失败：${p.error}`, font: 'body', size: 12, baseline: 'top', fill: tokens.warn });
      children.push(g(pn));
      return;
    }
    const rend = getRenderer(p.view)!;
    const sc = rend.layout(p.model as never, {
      width: inner.w, height: inner.h, plot: inner,
      theme, palette, tokens,
      variant: p.spec.variant, mode: p.spec.mode,
      options: p.spec.options ?? {}, state: p.spec.state,
      format: p.spec.format, annotations: p.spec.annotations, text: undefined,
    } as never);
    children.push(g([...pn, ...sc.root.children]));
  });
  const sc = mkScene(W, H, children, tokens.paper);
  applySkin(sc, tokens.skin);
  const svg = toSVG(sc);

  // 导出
  const files: { format: string; path: string; bytes: number }[] = [];
  mkdirSync(job.out, { recursive: true });
  const stem = job.stem ?? 'compose';
  for (const fmt of job.formats) {
    const path = join(job.out, job.exactName ? `${stem}.${fmt === 'png' ? 'png' : fmt}` : `${stem}-${cf!.layout ?? 'grid'}-${theme}.${fmt === 'png' ? 'png' : fmt}`);
    if (fmt === 'svg') {
      writeFileSync(path, svg, 'utf8');
      files.push({ format: 'svg', path, bytes: Buffer.byteLength(svg) });
    } else if (fmt === 'png') {
      const fontFiles = [fontPath('display-light'), fontPath('display-medium'), fontPath('mono'), ...job.fontFiles];
      const r = new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'sans-serif' }, background: tokens.paper, fitTo: { mode: 'zoom', value: job.scale } });
      const png = r.render().asPng();
      writeFileSync(path, png);
      files.push({ format: 'png', path, bytes: png.length });
    } else if (fmt === 'html') {
      const payload: ComposePayload = {
        title: cf!.title, layout: cf!.layout ?? 'grid', theme, palette,
        links: cf!.links ?? [],
        panels: panelData.map((p) => ({ id: p.id, view: p.view, spec: p.spec, table: p.table, doc: p.doc, question: p.question, insights: p.insights, w: p.w, h: p.h, flow: p.flow })),
      };
      const runtimeJs = await runtimeScript('compose', views);
      // 首屏每面板 SVG：直接用静态合并场景不可拆分——HTML 里先放占位，浏览器 boot 后立即重渲
      const svgs = panelData.map(() => '');
      const html = composeHtml({ payload, svgs, runtimeJs, theme });
      writeFileSync(path, html, 'utf8');
      files.push({ format: 'html', path, bytes: Buffer.byteLength(html) });
    }
  }
  return {
    files,
    payload: { title: cf!.title, layout: cf!.layout ?? 'grid', theme, palette, links: cf!.links ?? [], panels: panelData.map((p) => ({ id: p.id, view: p.view, spec: p.spec, table: p.table, doc: p.doc, question: p.question, insights: p.insights, w: p.w, h: p.h, flow: p.flow })) },
    panels: panelData.length,
    panelResults: panelData.map((p) => ({ id: p.id, rendered: p.rendered, error: p.error })),
    views: [...new Set(views)],
    warnings,
  };
}

export const stemOfCompose = (p: string) => p.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '');
