// scripts/agent-eval/check.ts · Agent 实测评估判定器（PHASE_2D §4.6/H15）
// 用法：tsx scripts/agent-eval/check.ts <eval-root> [--out <results.json>]
// 读取 <eval-root>/<taskId>/receipts/*.json（virta --json 的 Envelope），
// 只把 command=render|compose 的回执算作任务尝试（inspect/validate 等探查不计重试），
// 按 tasks.json 的 checks 逐条判定，输出 results.json。
//
// 指标口径（README 同述）：
//   首次成功率   = 首条 render/compose 回执即满足全部验收条件的任务占比
//   最终成功率   = mode=any 时任一尝试满足 / mode=last 时最后一条尝试满足
//   平均重试次数 = render/compose 尝试数 − 1（下限 0）
//   人工可发出率 = maintainer 在 results.json 填 human=「适合」的任务占比
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// —— tasks.json schema ——
export interface EvalCheck {
  kind: 'view' | 'variant' | 'variant-or-month-facet' | 'title' | 'file' | 'asof' | 'command' | 'ok' | 'panels';
  values?: string[];
  value?: string | number;
  format?: string;
  prefix?: string;
  desc?: string;
}
export interface EvalTask {
  id: string;
  /** 计划表「数据」列原文 */
  data: string;
  /** 仓库相对路径，prepare.ts 复制用 */
  files: string[];
  /** TASK.md 内容（逐字） */
  task: string;
  /** 验收条件原文（逐字） */
  acceptance: string;
  /** any（缺省）：任一尝试满足即过；last：只看最后一条尝试（A12「最终回执」语义） */
  mode?: 'any' | 'last';
  checks: EvalCheck[];
}
interface TasksFile { version: number; tasks: EvalTask[] }

export function loadTasks(): EvalTask[] {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks.json'), 'utf8')) as TasksFile;
  return raw.tasks;
}

// —— 回执（Envelope 的宽松视图；判定只读字段，不依赖 contracts 类型） ——
interface ReceiptFile { format?: string; path?: string }
interface ReceiptData {
  view?: string;
  variant?: string;
  panels?: number;
  files?: ReceiptFile[];
  spec?: { text?: { title?: string }; facet?: { column?: string }; time?: { asOf?: string } };
}
export interface ReceiptEnvelope {
  ok?: boolean;
  command?: string;
  version?: string;
  data?: ReceiptData;
  warnings?: unknown[];
  error?: { code?: string; message?: string };
}
export interface CheckResult { desc: string; pass: boolean; detail: string }
export interface TaskResult {
  task: string;
  pass: boolean;
  /** 首条 render/compose 回执是否已满足全部条件 */
  firstPass: boolean;
  mode: 'any' | 'last';
  /** 判定依据的那条回执（首个通过者；全败时为最后一条尝试）；无尝试时为 null */
  receipt: string | null;
  checks: CheckResult[];
  /** receipts/ 下文件总数（含 inspect/validate 等探查回执） */
  receipts: number;
  /** render/compose 回执数（= 任务尝试次数） */
  attempts: number;
  /** attempts − 1，下限 0 */
  retries: number;
  /** 维护者人工判断：「适合」/「不适合」/备注；评估后填写，判定器不写 */
  human: string | null;
}
export interface EvalSummary {
  tasks: number;
  passed: number;
  firstPassed: number;
  /** 0–1 */
  firstSuccessRate: number;
  /** 0–1 */
  finalSuccessRate: number;
  avgRetries: number;
  /** 已填写 human 的任务数 / 「适合」数 / 可发出率（未填写时 rate 为 null） */
  humanJudged: number;
  humanSendable: number;
  humanSendableRate: number | null;
}

const MONTH_FACET = /月|month/i;

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }

/** 单条回执 × 单个验收条件 → {pass, detail}。env.ok=false 或 data 缺失时数据类条件自然失败。 */
export function evalCheck(check: EvalCheck, env: ReceiptEnvelope): { pass: boolean; detail: string } {
  const d = env.ok === true ? env.data : undefined;
  const spec = d?.spec;
  switch (check.kind) {
    case 'ok': {
      const pass = env.ok === true;
      return { pass, detail: pass ? 'ok=true' : `ok=${String(env.ok)} ${env.error?.code ?? ''}`.trim() };
    }
    case 'command': {
      const pass = env.command === check.value;
      return { pass, detail: `command=${env.command ?? '—'}` };
    }
    case 'view': {
      const pass = d !== undefined && (check.values ?? []).includes(d.view ?? '');
      return { pass, detail: `view=${d?.view ?? '—'}` };
    }
    case 'variant': {
      const pass = d?.variant === check.value;
      return { pass, detail: `variant=${d?.variant ?? '—'}` };
    }
    case 'variant-or-month-facet': {
      const byVariant = d?.variant === 'multi';
      const col = str(spec?.facet?.column);
      const byFacet = col !== '' && MONTH_FACET.test(col);
      return { pass: byVariant || byFacet, detail: `variant=${d?.variant ?? '—'} facet.column=${col || '—'}` };
    }
    case 'title': {
      const t = str(spec?.text?.title).trim();
      return { pass: t !== '', detail: t ? `title=${t}` : 'spec.text.title 为空' };
    }
    case 'file': {
      const hit = (d?.files ?? []).filter((f) => f.format === check.format);
      return {
        pass: hit.length > 0,
        detail: hit.length ? hit.map((f) => f.path ?? f.format ?? '').join(' | ') : `无 ${check.format} 文件`,
      };
    }
    case 'asof': {
      const asOf = str(spec?.time?.asOf);
      return { pass: asOf.startsWith(check.prefix ?? ''), detail: `time.asOf=${asOf || '—'}` };
    }
    case 'panels': {
      const pass = d?.panels === check.value;
      return { pass, detail: `panels=${d?.panels ?? '—'}` };
    }
    default:
      return { pass: false, detail: `未知 check kind：${(check as EvalCheck).kind}` };
  }
}

/** 一条回执是否满足任务全部验收条件。 */
export function envelopePasses(task: EvalTask, env: ReceiptEnvelope): boolean {
  return task.checks.every((c) => evalCheck(c, env).pass);
}

export interface ReceiptEntry { name: string; env: ReceiptEnvelope | null; parseError?: string }

/** 纯判定：给一组已解析回执（按文件名升序），产出任务结果。 */
export function evalTask(task: EvalTask, receipts: ReceiptEntry[]): TaskResult {
  const mode = task.mode ?? 'any';
  // 只认 render/compose 回执为任务尝试；ok:false 的同命令错误回执也算一次尝试
  const attempts = receipts.filter((r) => r.env !== null && (r.env.command === 'render' || r.env.command === 'compose'));
  const scored = attempts.map((r) => ({ name: r.name, env: r.env!, checks: task.checks.map((c) => ({ desc: c.desc ?? c.kind, ...evalCheck(c, r.env!) })), pass: envelopePasses(task, r.env!) }));

  const firstPass = scored.length > 0 && scored[0]!.pass;
  const decisive = mode === 'last'
    ? scored[scored.length - 1]
    : scored.find((s) => s.pass) ?? scored[scored.length - 1];
  const pass = mode === 'last' ? scored[scored.length - 1]?.pass === true : scored.some((s) => s.pass);

  return {
    task: task.id,
    pass,
    firstPass,
    mode,
    receipt: decisive?.name ?? null,
    checks: decisive?.checks ?? task.checks.map((c) => ({ desc: c.desc ?? c.kind, pass: false, detail: '无 render/compose 回执' })),
    receipts: receipts.length,
    attempts: attempts.length,
    retries: Math.max(0, attempts.length - 1),
    human: null,
  };
}

/** 读 <dir>/receipts/*.json；文件名按 numeric collation 升序（1.json < 2.json < 10.json）。 */
export function readReceipts(dir: string): ReceiptEntry[] {
  const rd = path.join(dir, 'receipts');
  if (!fs.existsSync(rd)) return [];
  return fs.readdirSync(rd)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      try {
        return { name, env: JSON.parse(fs.readFileSync(path.join(rd, name), 'utf8')) as ReceiptEnvelope };
      } catch (e) {
        return { name, env: null, parseError: (e as Error).message };
      }
    });
}

export function evalTaskDir(task: EvalTask, dir: string): TaskResult {
  return evalTask(task, readReceipts(dir));
}

export function summarize(results: TaskResult[]): EvalSummary {
  const n = results.length;
  const firstPassed = results.filter((r) => r.firstPass).length;
  const passed = results.filter((r) => r.pass).length;
  const judged = results.filter((r) => typeof r.human === 'string' && r.human.trim() !== '');
  const sendable = judged.filter((r) => r.human!.startsWith('适合')).length;
  return {
    tasks: n,
    passed,
    firstPassed,
    firstSuccessRate: n ? firstPassed / n : 0,
    finalSuccessRate: n ? passed / n : 0,
    avgRetries: n ? results.reduce((s, r) => s + r.retries, 0) / n : 0,
    humanJudged: judged.length,
    humanSendable: sendable,
    humanSendableRate: judged.length ? sendable / judged.length : null,
  };
}

export interface EvalOutput {
  version: 1;
  evalRoot: string;
  generatedAt: string;
  tasks: TaskResult[];
  summary: EvalSummary;
}

export function run(evalRoot: string, outPath?: string): { output: EvalOutput; outFile: string } {
  const tasks = loadTasks();
  const results = tasks.map((t) => {
    const dir = path.join(evalRoot, t.id);
    return fs.existsSync(dir) ? evalTaskDir(t, dir) : evalTask(t, []);
  });
  const output: EvalOutput = {
    version: 1,
    evalRoot,
    generatedAt: new Date().toISOString(),
    tasks: results,
    summary: summarize(results),
  };
  const outFile = outPath ?? path.join(evalRoot, 'results.json');
  // 保留已填写的 human 判定：重跑判定不覆盖维护者结论
  if (fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, 'utf8')) as EvalOutput;
      const prevHuman = new Map((prev.tasks ?? []).map((t) => [t.task, t.human]));
      for (const t of results) if (prevHuman.get(t.task)) t.human = prevHuman.get(t.task)!;
      output.summary = summarize(results);
    } catch { /* 旧文件损坏则不保留 */ }
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n', 'utf8');
  return { output, outFile };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const root = process.argv[2];
  if (!root) {
    console.error('用法：tsx scripts/agent-eval/check.ts <eval-root> [--out <results.json>]');
    process.exit(2);
  }
  const oi = process.argv.indexOf('--out');
  const out = oi >= 0 ? process.argv[oi + 1] : undefined;
  try {
    const { output, outFile } = run(root, out);
    const s = output.summary;
    console.log(`✓ results.json → ${outFile}`);
    console.log(`  首次成功率 ${(s.firstSuccessRate * 100).toFixed(0)}%（${s.firstPassed}/${s.tasks}）`);
    console.log(`  最终成功率 ${(s.finalSuccessRate * 100).toFixed(0)}%（${s.passed}/${s.tasks}）`);
    console.log(`  平均重试次数 ${s.avgRetries.toFixed(2)}`);
    console.log(`  人工可发出率 ${s.humanSendableRate === null ? '待填写 human 字段' : `${(s.humanSendableRate * 100).toFixed(0)}%（${s.humanSendable}/${s.humanJudged}）`}`);
    for (const t of output.tasks) {
      console.log(`  ${t.task}  ${t.pass ? 'PASS' : 'FAIL'}${t.firstPass ? ' (首过)' : ''}  attempts=${t.attempts} retries=${t.retries}${t.receipt ? `  ← ${t.receipt}` : ''}`);
    }
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
