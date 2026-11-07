#!/usr/bin/env node
// virta CLI（§5.8）：list/schema/inspect/validate/render/compose/demo/gallery/preview/guide。
// 规则：--json 时 stdout 只输出一个 Envelope；日志写 stderr；退出码按 §4.5。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import type { Envelope, Table, Theme, ViewId, ViewSpec, VizError } from '@virta/contracts';
import { CONTRACTS, EXIT_CODES, getContract, THEME_IDS, VIEW_IDS, VIEW_SPEC_SCHEMA } from '@virta/contracts';
import { ADAPTERS, profileTable, rawToTable, recommend, validate, resolveTime, parseInstant, tzValid } from '@virta/data-engine';
import { readInput, readInline } from '@virta/data-engine/node';
import { RENDERED_VIEWS } from '@virta/charts';
import { CliError, fail, renderChart } from './render.js';

const VERSION = '0.0.0';
const err = (s: string) => process.stderr.write(s + '\n');
const EXIT_MAP: Record<VizError['code'], number> = {
  UNKNOWN_VIEW: 2, INVALID_SPEC: 2, INVALID_OPTION: 2,
  INPUT_NOT_FOUND: 3, UNSUPPORTED_FORMAT: 3, PARSE_ERROR: 3, EMPTY_DATA: 3,
  MISSING_COLUMN: 4, AMBIGUOUS_MAPPING: 4,
  UNSUPPORTED_EXPORT: 5, RENDER_FAILED: 5, EXPORT_FAILED: 5,
  INTERNAL: 1,
  INVALID_TIME: 2,
};

function out<T>(cmd: string, data: T, json: boolean, warnings: import('@virta/contracts').QualityIssue[] = []): void {
  if (json) { process.stdout.write(JSON.stringify({ ok: true, command: cmd, version: VERSION, data, warnings }) + '\n'); }
}
function outErr(cmd: string, e: VizError, json: boolean): number {
  if (json) process.stdout.write(JSON.stringify({ ok: false, command: cmd, version: VERSION, error: e }) + '\n');
  else { err(`✗ ${e.message}`); if (e.hint) err(`提示：${e.hint}`); }
  return EXIT_MAP[e.code] ?? 1;
}

// —— 参数工具 ——
type PV = ReturnType<typeof parseArgs>;
const v = (args: PV, k: string) => args.values[k] as string | undefined;
const multi = (args: PV, k: string) => (Array.isArray(args.values[k]) ? args.values[k] : args.values[k] !== undefined ? [args.values[k]] : []) as string[];

/** --set k=v：dotted path；值尝试 JSON.parse。 */
function applySet(spec: ViewSpec, kv: string): void {
  const eq = kv.indexOf('=');
  if (eq < 1) fail('INVALID_OPTION', `--set 需要 key=value 形式：${kv}`, '例如 --set state.sort=desc');
  const path = kv.slice(0, eq).split('.');
  let val: unknown = kv.slice(eq + 1);
  try { val = JSON.parse(val as string); } catch { /* 字符串 */ }
  let cur = spec as unknown as Record<string, unknown>;
  for (const k of path.slice(0, -1)) { cur[k] = cur[k] ?? {}; cur = cur[k] as Record<string, unknown>; }
  cur[path[path.length - 1]] = val;
}

async function loadTable(args: PV): Promise<{ table: Table; docText?: string; input: string }> {
  const pos = args.positionals[0];
  const inline = v(args, 'data');
  const fmt = v(args, 'format') as 'csv' | 'json' | 'xlsx' | 'md' | 'txt' | undefined;
  if (inline !== undefined) {
    const res = readInline(inline, fmt === 'csv' ? 'csv' : 'json');
    return { table: rawToTable(res.raw as never, { name: 'inline', format: 'json', rows: 0 }), input: 'inline' };
  }
  if (!pos) fail('INVALID_SPEC', '缺少输入文件参数（或 - 读 stdin）', 'virta render <input|->');
  let loaded: Awaited<ReturnType<typeof readInput>>;
  if (pos === '-') {
    const buf = readFileSync(0);
    const text = new TextDecoder('utf-8').decode(buf);
    try {
      loaded = { result: readInline(text, fmt === 'json' ? 'json' : fmt === 'csv' ? 'csv' : undefined), source: { name: 'stdin', format: fmt ?? 'csv', rows: 0 } };
    } catch (e) {
      fail('PARSE_ERROR', (e as Error).message, '--format csv|json');
    }
  } else {
    try {
      loaded = await readInput(pos, { format: fmt, sheet: v(args, 'sheet') });
    } catch (e) {
      const m = (e as Error).message;
      if (/不存在|ENOENT|not found/i.test(m)) fail('INPUT_NOT_FOUND', `输入文件不存在：${pos}`, '检查路径；stdin 用 -');
      if (/format|格式|unsupported/i.test(m)) fail('UNSUPPORTED_FORMAT', m, '--format csv|json');
      fail('PARSE_ERROR', m, '--format csv|json；xlsx 用 --sheet');
    }
  }
  if (loaded!.docText !== undefined) return { table: undefined as unknown as Table, docText: loaded!.docText, input: pos! };
  const res = loaded!.result;
  if (!res) fail('EMPTY_DATA', '输入数据为空', '检查文件内容是否为空');
  const table = rawToTable(res!.raw as never, loaded!.source);
  if (!table.rows.length) fail('EMPTY_DATA', '输入数据为空（0 行）', '检查分隔符与 --format');
  return { table, docText: undefined, input: pos! };
}

function buildSpec(args: PV, table?: Table): ViewSpec {
  let spec: ViewSpec = { version: 1, view: 'auto' };
  const specArg = v(args, 'spec');
  if (specArg) {
    const txt = existsSync(specArg) ? readFileSync(specArg, 'utf8') : specArg;
    try { spec = { ...spec, ...(JSON.parse(txt) as ViewSpec) }; }
    catch { fail('INVALID_SPEC', '--spec 不是合法 JSON 或可读文件', 'virta schema <view> 查看契约'); }
  }
  const theme = v(args, 'theme');
  if (theme) {
    if (!THEME_IDS.includes(theme as Theme)) fail('INVALID_OPTION', `未知主题 ${theme}`, `支持：${THEME_IDS.join(' | ')}`);
    spec.theme = theme as Theme;
  }
  const pal = v(args, 'palette'); if (pal) spec.palette = pal as never;
  const variant = v(args, 'variant'); if (variant) spec.variant = variant;
  const view = v(args, 'view'); if (view) spec.view = view as ViewId;
  for (const k of ['title', 'subtitle', 'note', 'source', 'unit'] as const) {
    const x = v(args, k); if (x) spec.text = { ...spec.text, [k]: x };
  }
  const w = v(args, 'width'), h = v(args, 'height');
  if (w || h) {
    const hh = h === 'auto' ? 'auto' as const : h ? Number(h) : 675;
    if (hh !== 'auto' && (!Number.isFinite(hh) || hh <= 0)) fail('INVALID_OPTION', `--height 需为正数或 auto：${h}`, '如 --height 1600 或 --height auto');
    spec.size = { width: w ? Number(w) : 1200, height: hh };
  }
  for (const kv of multi(args, 'set')) applySet(spec, kv);
  // ADR-0010：--as-of/--tz 等价 --set time.*；不可解析报 INVALID_TIME
  const asOf = v(args, 'as-of');
  if (asOf !== undefined) {
    if (!parseInstant(asOf)) fail('INVALID_TIME', `无法解析 --as-of：${asOf}`, '示例：2026-11-05T17:00:00+08:00 或 2026-11-05T09:00:00Z');
    spec.time = { ...spec.time, asOf };
  }
  const tz = v(args, 'tz');
  if (tz !== undefined) {
    if (!tzValid(tz)) fail('INVALID_TIME', `未知时区 --tz：${tz}`, 'IANA 时区名，如 Asia/Shanghai、UTC、America/New_York');
    spec.time = { ...spec.time, tz };
  }
  if (spec.time?.asOf !== undefined && !parseInstant(spec.time.asOf)) fail('INVALID_TIME', `无法解析 time.asOf：${spec.time.asOf}`, '需 ISO 8601 且带时区偏移或 Z');
  if (spec.time?.tz !== undefined && !tzValid(spec.time.tz)) fail('INVALID_TIME', `未知时区 time.tz：${spec.time.tz}`, 'IANA 时区名');
  if (spec.view !== 'auto' && !VIEW_IDS.includes(spec.view as ViewId)) {
    fail('UNKNOWN_VIEW', `未知视图 ${spec.view}`, 'virta list 查看全部视图', { candidates: [...VIEW_IDS] });
  }
  if (spec.view === 'auto' && table) {
    const top = recommend(profileTable(table), table)[0];
    if (!top) fail('RENDER_FAILED', '无法为该数据推荐视图');
    spec.view = top.view;
    if (top.variant && !spec.variant) spec.variant = top.variant;
    if (top.mode && !spec.mode) spec.mode = top.mode;
    (spec as { __reason?: string }).__reason = top.reason;
  }
  return spec;
}

const stemOf = (input: string) => input === '-' ? 'stdin' : basename(input, extname(input)).replace(/[^\w一-龥.-]+/g, '_');

// —— 命令 ——
const COMMANDS: Record<string, (args: PV) => number | Promise<number>> = {
  async list(args) {
    const json = Boolean(args.values['json']);
    const data = [...VIEW_IDS].map((id) => {
      const c = getContract(id);
      return { id, aliases: c?.aliases ?? [], title: c?.title ?? id, variants: c?.variants.map((x) => x.id) ?? [], staticExport: c?.staticExport ?? false, rendered: RENDERED_VIEWS.includes(id) };
    });
    if (!json) for (const d of data) console.log(`${d.rendered ? '●' : '○'} ${d.id.padEnd(10)} ${d.title}${d.variants.length ? ` (${d.variants.join('|')})` : ''}`);
    out('list', data, json);
    return 0;
  },
  async schema(args) {
    const json = Boolean(args.values['json']);
    if (args.values['spec-schema']) { out('schema', VIEW_SPEC_SCHEMA, true); if (!json) console.log(JSON.stringify(VIEW_SPEC_SCHEMA, null, 2)); return 0; }
    const view = args.positionals[0] as ViewId | undefined;
    const data = view ? getContract(view) : CONTRACTS;
    if (view && !data) return outErr('schema', { code: 'UNKNOWN_VIEW', message: `未知视图 ${view}`, recoverable: true }, json);
    if (!json) console.log(JSON.stringify(data, null, 2));
    out('schema', data, json);
    return 0;
  },
  async inspect(args) {
    const json = Boolean(args.values['json']);
    const { table, docText, input } = await loadTable(args);
    if (docText !== undefined) fail('UNSUPPORTED_FORMAT', 'md/txt 文档请用 render --view report', 'inspect 仅支持表格输入');
    const profile = profileTable(table);
    const candidates = recommend(profile, table).slice(0, 5).map((c) => ({ view: c.view, variant: c.variant, mode: c.mode, score: c.score, reason: c.reason, mapping: c.mapping, missingRoles: c.missingRoles }));
    const data = { input, format: table.source.format, rows: table.rows.length, profile, candidates };
    if (!json) {
      console.log(`✓ ${input} · ${table.rows.length} 行 × ${table.columns.length} 列`);
      console.log(`  维度 ${profile.dims.join(', ') || '—'} | 度量 ${profile.measures.join(', ') || '—'}`);
      for (const c of candidates) console.log(`  ${c.score} ${c.view}${c.variant ? ':' + c.variant : ''} · ${c.reason}`);
    }
    out('inspect', data, json);
    return 0;
  },
  async validate(args) {
    const json = Boolean(args.values['json']);
    const { table, docText } = await loadTable(args);
    if (docText !== undefined) fail('UNSUPPORTED_FORMAT', 'md/txt 文档请用 render --view report', 'validate 仅支持表格输入');
    const spec = buildSpec(args);
    if (spec.view === 'auto') { spec.view = (recommend(profileTable(table), table)[0]?.view ?? 'bar') as ViewId; }
    const rec = validate(table, spec);
    if (!json) {
      console.log(rec.valid ? `✓ ${spec.view} 校验通过` : `✗ ${spec.view} 校验未通过`);
      for (const s of rec.suggestions) console.log(`  → ${s}`);
    }
    out('validate', rec, json);
    return rec.valid ? 0 : 4;
  },
  async render(args) {
    const json = Boolean(args.values['json']);
    const { table, docText, input } = await loadTable(args);
    const spec = buildSpec(args, table);
    if (docText !== undefined) {
      if (spec.view === 'auto') spec.view = 'report';
      if (spec.view !== 'report') return outErr('render', { code: 'UNSUPPORTED_FORMAT', message: '文档输入仅支持 report 视图', hint: 'render x.md --view report', recoverable: true }, json);
    }
    const view = spec.view as ViewId;
    if (docText === undefined && !ADAPTERS[view]) return outErr('render', { code: 'UNKNOWN_VIEW', message: `视图 ${view} 暂不支持`, hint: 'virta list', recoverable: true }, json);
    // ADR-0010：time 缺省时解析后写回回执 spec（asOf/tz 可重放）
    const rt = resolveTime(spec);
    spec.time = { ...spec.time, asOf: spec.time?.asOf ?? rt.asOfIso, tz: spec.time?.tz ?? rt.tz };
    const tWarns = rt.assumed.map((c) => ({ code: c, level: 'info' as const,
      message: c === 'TZ_ASSUMED' ? `未指定时区，按系统时区 ${rt.tz} 处理` : `未指定 asOf，按当前时刻 ${rt.asOfIso} 处理` }));
    // mapping 前置校验：列不存在 → MISSING_COLUMN；必需角色多列歧义 → AMBIGUOUS_MAPPING（§4.5 DATA 类）
    if (docText === undefined) {
      const rec = validate(table, spec);
      const miss = rec.issues.find((i) => i.code === 'MISSING_VALUES' && i.level === 'error' && /不存在/.test(i.message));
      if (miss) return outErr('render', { code: 'MISSING_COLUMN', message: miss.message, hint: rec.suggestions[0] ?? 'virta inspect 查看可用列', recoverable: true }, json);
      if (rec.ambiguous.length && rec.missingRoles.length) {
        const a = rec.ambiguous[0] as { role: string; columns: string[] };
        return outErr('render', { code: 'AMBIGUOUS_MAPPING', message: `角色 ${a.role} 匹配到多列：${a.columns.join('、')}`, hint: rec.suggestions[0] ?? `--set mapping.${a.role}=<列名>`, recoverable: true }, json);
      }
    }
    const formats = (v(args, 'export') ?? 'html').split(',').map((s) => s.trim()) as ('html' | 'svg' | 'png')[];
    for (const f of formats) if (!['html', 'svg', 'png'].includes(f)) return outErr('render', { code: 'UNSUPPORTED_EXPORT', message: `不支持导出 ${f}`, hint: '支持 html,svg,png', recoverable: true }, json);
    const outArg = v(args, 'out') ?? './out';
    const job = {
      table: docText !== undefined ? { columns: [], rows: [], source: { name: stemOf(input), format: 'md' as const, rows: 0 } } : table,
      spec, formats, doc: docText,
      out: outArg, stem: stemOf(input),
      width: Number(v(args, 'width') ?? spec.size?.width ?? 1200),
      height: Number(v(args, 'height') ?? spec.size?.height ?? 675),
      scale: Number(v(args, 'scale') ?? 2),
      frame: (v(args, 'frame') ?? 'card') as 'card' | 'chart',
      fontFiles: multi(args, 'font-file'),
    };
    try {
      const { files, warnings, payload } = await renderChart(job);
      const counts = payload.counts;
      const receipt = {
        view, variant: spec.variant, mode: spec.mode,
        reason: (spec as { __reason?: string }).__reason ?? 'explicit',
        files, counts,
        quality: payload.quality, insights: payload.insights, spec,
        summaryMd: `${payload.spec.text?.title ?? view} · ${view}${spec.variant ? ':' + spec.variant : ''} · ${docText !== undefined ? '1 篇文档' : `${table.rows.length} 行`} → ${files.map((f) => f.format).join('/')}`,
      };
      if (!json) for (const f of files) console.log(`✓ 生成 ${f.path} · ${receipt.reason}`);
      out('render', receipt, json, [...warnings, ...tWarns] as never);
      return 0;
    } catch (e) {
      if (e instanceof CliError) return outErr('render', e.viz, json);
      return outErr('render', { code: 'RENDER_FAILED', message: (e as Error).message, recoverable: false }, json);
    }
  },
  async preview(args) {
    const f = args.positionals[0];
    if (!f || !existsSync(f)) return outErr('preview', { code: 'INPUT_NOT_FOUND', message: `文件不存在：${f}`, recoverable: true }, Boolean(args.values['json']));
    const opener = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const a = process.platform === 'win32' ? ['/c', 'start', '', f] : [f];
    execFile(opener, a, () => { /* 尽力而为 */ });
    if (!args.values['json']) console.log(`✓ 已打开 ${f}`);
    out('preview', { opened: f }, Boolean(args.values['json']));
    return 0;
  },
  async guide(args) {
    const p = 'docs/agent/SKILL.md';
    const txt = existsSync(p) ? readFileSync(p, 'utf8') : '（docs/agent/SKILL.md 尚未生成）';
    if (args.values['json']) out('guide', { markdown: txt }, true);
    else console.log(txt);
    return 0;
  },
  async compose(args) {
    const json = Boolean(args.values['json']);
    const f = args.positionals[0];
    if (!f) return outErr('compose', { code: 'INVALID_SPEC', message: '缺少 compose.json 路径', hint: 'virta compose <compose.json>', recoverable: true }, json);
    const formats = (v(args, 'export') ?? 'html,png').split(',').map((s) => s.trim()) as ('html' | 'svg' | 'png')[];
    for (const fm of formats) if (!['html', 'svg', 'png'].includes(fm)) return outErr('compose', { code: 'UNSUPPORTED_EXPORT', message: `不支持导出 ${fm}`, hint: '支持 html,svg,png', recoverable: true }, json);
    try {
      const { runCompose } = await import('./compose.js');
      const r = await runCompose({
        file: f, formats,
        out: v(args, 'out') ?? './out',
        scale: Number(v(args, 'scale') ?? 2),
        fontFiles: multi(args, 'font-file'),
      });
      // §4.4：任一面板预渲染失败 → ok:false（不再「CLI 成功但 HTML 坏」）
      const failed = r.panelResults.filter((p) => !p.rendered);
      if (failed.length) {
        return outErr('compose', {
          code: 'RENDER_FAILED',
          message: `面板渲染失败：${failed.map((f) => f.id).join('、')} — ${failed[0]!.error}`,
          hint: 'virta render 单独渲该面板排查', recoverable: false,
        }, json);
      }
      const receipt = { title: r.payload.title, layout: r.payload.layout, panels: r.panels, panelResults: r.panelResults, views: r.views, links: r.payload.links, files: r.files, summaryMd: `${r.payload.title ?? '组合页'} · ${r.payload.layout} · ${r.panels} 面板 → ${r.files.map((x) => x.format).join('/')}` };
      if (!json) for (const x of r.files) console.log(`✓ 生成 ${x.path}`);
      out('compose', receipt, json, r.warnings as never);
      return 0;
    } catch (e) {
      if (e instanceof CliError) return outErr('compose', e.viz, json);
      return outErr('compose', { code: 'RENDER_FAILED', message: (e as Error).message, recoverable: false }, json);
    }
  },
  async demo(args) {
    const json = Boolean(args.values['json']);
    const all = Boolean(args.values['all']);
    const pack = String(args.positionals[0] ?? '');
    if (!all && !pack) return outErr('demo', { code: 'INVALID_SPEC', message: '缺少场景包名或 --all', hint: 'virta demo retail | virta demo --all', recoverable: true }, json);
    const outDir = v(args, 'out') ?? 'out/demo';
    const job = { out: outDir, scale: Number(v(args, 'scale') ?? 1), fontFiles: multi(args, 'font-file'), theme: v(args, 'theme') as Theme | undefined, palette: v(args, 'palette') as 'signal' | 'patina' | 'mono' | undefined };
    try {
      const { runDemo, writeDemoIndex, listPacks } = await import('./demo.js');
      const ids = all ? listPacks() : [pack];
      if (!ids.length) return outErr('demo', { code: 'INPUT_NOT_FOUND', message: 'examples/packs 下没有场景包', recoverable: true }, json);
      const packs: { id: string; title: string; story?: string; charts: number }[] = [];
      const files: string[] = [];
      for (const id of ids) {
        const r = await runDemo({ ...job, pack: id });
        files.push(...r.files);
        const meta = JSON.parse(readFileSync(join('examples/packs', id, 'pack.json'), 'utf8')) as { title?: string; story?: string };
        packs.push({ id, title: meta.title ?? id, story: meta.story, charts: r.charts });
      }
      if (all) writeDemoIndex(outDir, packs);
      if (!json) for (const f of files) console.log(`✓ 生成 ${f}`);
      out('demo', { packs: packs.map((p) => p.id), files, index: all ? join(outDir, 'index.html') : join(outDir, ids[0]!, 'index.html') }, json);
      return 0;
    } catch (e) {
      if (e instanceof CliError) return outErr('demo', e.viz, json);
      return outErr('demo', { code: 'RENDER_FAILED', message: (e as Error).message, recoverable: false }, json);
    }
  },
  async gallery(args) {
    const json = Boolean(args.values['json']);
    try {
      const { runGallery } = await import('./gallery.js');
      const r = await runGallery({ out: v(args, 'out') ?? 'out/gallery', scale: Number(v(args, 'scale') ?? 1), fontFiles: multi(args, 'font-file'), theme: v(args, 'theme') as Theme | undefined, palette: v(args, 'palette') as 'signal' | 'patina' | 'mono' | undefined, only: v(args, 'only'), force: Boolean(args.values['force']) });
      if (!json) console.log(`✓ 画廊生成 ${r.index}（${r.views} 图族 / ${r.packs} 场景 / ${r.items} 卡片${r.reused ? `，增量复用 ${r.reused} 项` : ''}）`);
      out('gallery', r, json);
      return 0;
    } catch (e) {
      if (e instanceof CliError) return outErr('gallery', e.viz, json);
      return outErr('gallery', { code: 'RENDER_FAILED', message: (e as Error).message, recoverable: false }, json);
    }
  },
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`virta ${VERSION} — Virta 数据可视化 CLI
用法：virta <command> [options]
  list [--json]                        列出全部视图
  schema [view] [--json] [--spec-schema]
  inspect <input|-> [--format csv|json] [--sheet N] [--json]
  validate <input|-> --view <v> [--spec f|json] [--set k=v]... [--json]
  render <input|-> [--view v|auto] [--variant id] [--spec f|json] [--set k=v]...
           [--data <json>] [--format csv|json] [--sheet N] [--theme ${THEME_IDS.join('|')}] [--palette id]
           [--title ..] [--subtitle ..] [--note ..] [--source ..] [--unit ..]
           [--export html,svg,png] [--out dir] [--width 1200] [--height 675] [--scale 2]
           [--frame card|chart] [--font-file ttf]... [--json]
  compose <compose.json>               （M5）  demo/gallery（M8）
  gallery [--out dir] [--only 图族|场景|关键词] [--force]   增量生成画廊（默认复用未变更产物）
  preview <file.html>                  用系统浏览器打开
  guide [--agent]                      Agent 使用指南`);
    return cmd ? 0 : 2;
  }
  const fn = COMMANDS[cmd];
  if (!fn) { err(`✗ 未知命令 ${cmd}`); err('提示：virta --help'); return 2; }
  let args: PV;
  try {
    args = parseArgs({
      args: argv.slice(1), allowPositionals: true, strict: false,
      options: {
        json: { type: 'boolean' }, format: { type: 'string' }, sheet: { type: 'string' },
        view: { type: 'string' }, variant: { type: 'string' }, spec: { type: 'string' },
        set: { type: 'string', multiple: true }, data: { type: 'string' },
        theme: { type: 'string' }, palette: { type: 'string' },
        title: { type: 'string' }, subtitle: { type: 'string' }, note: { type: 'string' },
        source: { type: 'string' }, unit: { type: 'string' },
        export: { type: 'string' }, out: { type: 'string' },
        width: { type: 'string' }, height: { type: 'string' }, scale: { type: 'string' },
        frame: { type: 'string' }, 'font-file': { type: 'string', multiple: true },
        'as-of': { type: 'string' }, tz: { type: 'string' },
        'spec-schema': { type: 'boolean' }, agent: { type: 'boolean' }, all: { type: 'boolean' },
        only: { type: 'string' }, force: { type: 'boolean' },
      },
    });
  } catch (e) {
    err(`✗ 参数解析失败：${(e as Error).message}`);
    return 2;
  }
  try {
    return await fn(args);
  } catch (e) {
    if (e instanceof CliError) return outErr(cmd, e.viz, Boolean(args.values['json']));
    err(`✗ ${(e as Error).stack ?? e}`);
    return 1;
  }
}

process.exitCode = await main();
