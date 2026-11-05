// scripts/packs/check.ts · 重生成到临时目录并与已提交数据比对（确定性测试，§8.2）。
// 二进制/非 UTF-8 文件（如 gbk.csv）不参与比对——它们由一次性脚本生成并提交。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'virta-packs-'));
execFileSync('npx', ['tsx', path.join(__dirname, 'generate.ts'), '--out', tmp], { stdio: 'inherit', cwd: REPO, shell: true });

function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(base, e.name);
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const roots = ['examples/packs', 'examples/edge-cases'];
const SKIP = new Set(['examples/edge-cases/gbk.csv']);
let diff = 0;
for (const root of roots) {
  const committed = walk(path.join(REPO, root)).map((r) => path.posix.join(root, r)).filter((r) => !SKIP.has(r));
  const generated = walk(path.join(tmp, root)).map((r) => path.posix.join(root, r));
  for (const f of committed) {
    if (!generated.includes(f)) { console.error(`生成器缺文件: ${f}`); diff++; continue; }
    const a = fs.readFileSync(path.join(REPO, f));
    const b = fs.readFileSync(path.join(tmp, f));
    if (!a.equals(b)) { console.error(`内容不一致: ${f}`); diff++; }
  }
  for (const f of generated) {
    if (!committed.includes(f)) { console.error(`提交了生成器不产出的文件: ${f}`); diff++; }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (diff) { console.error(`packs:check ✗ ${diff} 处差异`); process.exit(1); }
console.log('packs:check ✓ 确定性通过');
