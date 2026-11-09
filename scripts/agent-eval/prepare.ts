// scripts/agent-eval/prepare.ts · 为每个评估任务建独立工作目录（PHASE_2D §4.6/H15）
// 用法：tsx scripts/agent-eval/prepare.ts [--out <dir>]
// 默认在系统临时目录新建 virta-agent-eval-*；--out 指定目录时直接复用。
// 每个任务目录 <root>/<id>/：复制任务数据文件（按 basename 平铺）+ TASK.md（只含任务描述）。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTasks } from './check.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function prepare(out?: string): { root: string; tasks: { id: string; dir: string; files: string[] }[] } {
  const tasks = loadTasks();
  const root = out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'virta-agent-eval-'));
  fs.mkdirSync(root, { recursive: true });
  const made: { id: string; dir: string; files: string[] }[] = [];
  for (const t of tasks) {
    const dir = path.join(root, t.id);
    fs.mkdirSync(dir, { recursive: true });
    const seen = new Map<string, string>();
    const copied: string[] = [];
    for (const rel of t.files) {
      const src = path.join(REPO, rel);
      if (!fs.existsSync(src)) throw new Error(`任务 ${t.id} 数据文件不存在：${rel}`);
      const base = path.basename(rel);
      const prev = seen.get(base);
      if (prev && prev !== rel) throw new Error(`任务 ${t.id} 文件重名冲突：${prev} 与 ${rel} 都叫 ${base}`);
      seen.set(base, rel);
      fs.copyFileSync(src, path.join(dir, base));
      copied.push(base);
    }
    fs.writeFileSync(path.join(dir, 'TASK.md'), t.task + '\n', 'utf8');
    made.push({ id: t.id, dir, files: copied });
  }
  return { root, tasks: made };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    const r = prepare(argValue('--out'));
    console.log(`✓ 评估工作目录已就绪：${r.root}`);
    for (const t of r.tasks) console.log(`  ${t.id}/  ${t.files.join(', ')}`);
    console.log('下一步见 scripts/agent-eval/README.md（维护者发起全新 Agent 会话）。');
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
