// 视觉测试共用的 virta 渲染入口。
// G8 根因（PHASE_2C §1.2）：各 spec 的 beforeAll 在不同 Playwright worker 中并行 spawn
// `npx tsx` + esbuild 现场编译 + 共享 tsx 编译缓存与 out/ 写入，进程级资源瞬时争用
// 导致 tsx 子进程偶发非零退出（rank-race 在串行循环尾部、并发高峰时中招）。
// 修复：mkdir 原子锁把渲染生成跨进程串行化——渲染产物文件名本就无冲突，争用的是进程资源。
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const LOCK = 'out/visual/.render-lock';

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function withRenderLock<T>(fn: () => T): T {
  mkdirSync('out/visual', { recursive: true });
  for (let i = 0; ; i++) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      if (i > 2400) throw new Error('render-lock 等待超时（>120s）');
      sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

/** virta CLI（source 模式 tsx）。args 支持字符串（按空格切）或数组；stdin 可选。 */
export function virt(args: string | string[], stdin?: string): string {
  const argv = typeof args === 'string' ? args.split(' ') : args;
  return withRenderLock(() =>
    execFileSync('npx', ['tsx', 'packages/cli/src/main.ts', ...argv], { encoding: 'utf8', input: stdin, shell: true }));
}
