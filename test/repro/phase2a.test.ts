// M2a.0 复现锚点：PHASE_2A.md §1 的 F1–F7，每个 it.fails 对应当前缺陷。
// 各里程碑完成后把对应 it.fails 改为 it 并保持转绿（§5 验收用例的单元化部分）。
import { describe, expect, it } from 'vitest';
import { ADAPTERS, adaptInput, DOC_ADAPTER } from '@virta/data-engine';
import { getContract } from '@virta/contracts';
import { getRenderer } from '@virta/charts';
import { toSVG, type Scene } from '@virta/chart-core';
import { resolveTheme } from '@virta/design-system';
import type { Table, ViewSpec } from '@virta/contracts';

const ctxOf = (w = 1200, h = 675, extra: Record<string, unknown> = {}) => ({
  width: w, height: h,
  plot: { x: 20, y: 20, w: w - 40, h: h - 40 },
  theme: 'light' as const, palette: 'signal' as const,
  tokens: resolveTheme('light'),
  options: {}, state: undefined,
  ...extra,
}) as never;

const table = (columns: string[], rows: Record<string, unknown>[]): Table =>
  ({ columns, rows, source: { name: 'repro.csv', format: 'csv' as const, rows: rows.length } });

const adapt = (view: string, t: Table, spec: Partial<ViewSpec> = {}) =>
  ADAPTERS[view as never]!.adapt(t, { version: 1, view: view as never, ...spec } as ViewSpec).model;

const svgOf = (sc: Scene) => toSVG(sc);

/** 最小 SVG path 校验：命令参数个数合法、无 NaN（拦 F7 的 `M x V y` 这类非法路径）。 */
const PATH_ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
function assertValidPath(d: string) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i]!;
    expect(Object.keys(PATH_ARITY), `未知命令 ${cmd} in "${d}"`).toContain(cmd);
    const n = PATH_ARITY[cmd]!;
    for (let k = 0; k < n; k++) {
      const tok = tokens[i + 1 + k];
      expect(Number.isFinite(Number(tok)), `${cmd} 缺参数 ${k} in "${d}"`).toBe(true);
    }
    i += 1 + n;
    // 隐式重复命令：同一命令后续仍按同 arity 消耗（M 后续按 L）
    const eff = cmd === 'M' ? 'L' : cmd;
    while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]!)) {
      for (let k = 0; k < PATH_ARITY[eff]!; k++) {
        expect(Number.isFinite(Number(tokens[i + k])), `${eff} 缺参数 in "${d}"`).toBe(true);
      }
      i += PATH_ARITY[eff]!;
    }
  }
}

describe('F1 长内容截断（§4.1，M2a.2 根治）', () => {
  it('grid：measure 给出全量高度；滚动窗口页能取到最后一行', () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ 月份: `m${i}`, 部门: 'd', 科目: 's', 区域: 'r', 金额: i }));
    const m = adapt('grid', table(['月份', '部门', '科目', '区域', '金额'], rows), { variant: 'detail' }) as never;
    const rd = getRenderer('grid')!;
    const mea = rd.measure!(m, { width: 1200 });
    expect(mea.height).toBeGreaterThanOrEqual(600 * 18); // 全量行高，非画布钳制
    const ctx = ctxOf(1200, 700, { state: { range: [550, 0] } } as never);
    const sc = rd.layout(m, ctx);
    const scroll = (sc as { scroll?: { total: number; page: number; start: number } }).scroll!;
    const end = scroll.start + scroll.page;
    // 最后一页翻到尾部应包含第 600 行
    const ctx2 = ctxOf(1200, 700, { state: { range: [Math.max(0, scroll.total - scroll.page), 0] } } as never);
    expect(svgOf(rd.layout(m, ctx2))).toContain('m599');
    expect(end).toBeGreaterThan(0);
  });
  it('report：measure 全量高度 + flow 窗口输出末段', () => {
    const md = Array.from({ length: 60 }, (_, i) => `# 章节${i}\n这是第 ${i} 段正文。`).join('\n');
    const m = DOC_ADAPTER.buildDoc(md, 'repro.md');
    const rd = getRenderer('report')!;
    const mea = rd.measure!(m as never, { width: 1200 });
    expect(mea.height).toBeGreaterThan(700);
    const ctx = ctxOf(1200, 700, { flow: { offset: mea.height - 400, height: 400 } } as never);
    expect(svgOf(rd.layout(m as never, ctx))).toContain('第 59 段');
  });
});

describe('F2 报告链接（§4.1，M2a.2）', () => {
  it('[文字](url) 不以源码出现，且 SVG 输出 <a href>', () => {
    const m = DOC_ADAPTER.buildDoc('# t\n详见 [T-1](https://example.com/x) 单据。', 'r.md');
    const svg = svgOf(getRenderer('report')!.layout(m as never, ctxOf()));
    expect(svg).not.toContain('[T-1](');
    expect(svg).toContain('<a href="https://example.com/x"');
  });
});

describe('F3 asOf/时区（§4.2，M2a.1）', () => {
  it('gantt 今日线应使用 spec.time.asOf 而非进程当前时刻', () => {
    const rows = [{ label: 'a', start: '2020-01-01', end: '2020-02-01' }];
    const m = adapt('gantt', table(['label', 'start', 'end'], rows),
      { time: { asOf: '2020-01-10T00:00:00+08:00', tz: 'Asia/Shanghai' } } as never) as { today: number | null };
    // model.today 是相对 baseOrd 的偏移：asOf 01-10 − base 01-01 = 9
    expect(m.today).toBe(9);
  });
});

describe('F4 缺失值不补 0（§4.3，M2a.4）', () => {
  it('line 空单元格应建模为 null（未观测），不是 0', () => {
    const rows = [{ m: '1', v: 5 }, { m: '2', v: '' }, { m: '3', v: 7 }];
    const m = adapt('line', table(['m', 'v'], rows)) as { series: { values: (number | null)[] }[] };
    expect(m.series[0]!.values).toContain(null);
    // missingValue=zero 恢复 legacy 补 0
    const m0 = adapt('line', table(['m', 'v'], rows), { options: { missingValue: 'zero' } as never }) as { series: { values: (number | null)[] }[] };
    expect(m0.series[0]!.values).not.toContain(null);
  });
});

describe('F5 compose report 面板（§4.4，M2a.3）', () => {
  it('report 应能通过统一入口 adaptInput 适配文档输入', () => {
    const out = adaptInput({ doc: '# 标题\n正文。' }, 'report', { version: 1, view: 'report' } as ViewSpec);
    expect((out.model as { stats: { paragraphs: number } }).stats.paragraphs).toBeGreaterThan(0);
  });
});

describe('F6 计划与实际（§4.5，M2a.5）', () => {
  it('gantt 契约应有 baseline/actual 角色', () => {
    const roles = getContract('gantt')!.roles.map((r) => r.role);
    expect(roles).toContain('baseline');
    expect(roles).toContain('actual');
  });
});

describe('F7 阶梯线（§4.3/A9，M2a.4）', () => {
  it('combo step：所有 path 语法合法且终点到最后一个数据点', () => {
    const rows = [{ m: 'a', x: 1, y: 2 }, { m: 'b', x: 3, y: 4 }, { m: 'c', x: 5, y: 6 }];
    const m = adapt('combo', table(['m', 'x', 'y'], rows)) as never;
    const sc = getRenderer('combo')!.layout(m, ctxOf(1200, 675, { options: { lineStyle: 'step' } }));
    const paths = sc.root.children.flatMap(function f(n): string[] {
      const self = n.type === 'path' && (n as { d?: string }).d ? [(n as { d: string }).d] : [];
      return self.concat((n as { children?: never[] }).children?.flatMap(f) ?? []);
    });
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) assertValidPath(d);
  });
  it('line step：路径终点 x 等于最后一个数据点的 x', () => {
    const rows = [{ m: 'a', v: 1 }, { m: 'b', v: 3 }, { m: 'c', v: 2 }];
    const m = adapt('line', table(['m', 'v'], rows)) as never;
    const sc = getRenderer('line')!.layout(m, ctxOf(1200, 675, { options: { lineStyle: 'step' } }));
    const paths = sc.root.children.flatMap(function f(n): string[] {
      const self = n.type === 'path' && (n as { d?: string }).d ? [(n as { d: string }).d] : [];
      return self.concat((n as { children?: never[] }).children?.flatMap(f) ?? []);
    });
    const d = paths.find((p) => p.includes('H') || p.includes('V')) ?? paths[0]!;
    assertValidPath(d);
    // step-middle：最后一段水平线应延伸到最后一个数据点，路径末 x ≈ 数据点 x
    const nums = d.match(/-?\d+\.?\d*/g)!.map(Number);
    const lastX = Math.max(...nums.filter((_, i) => i % 2 === 0));
    const sceneMaxX = Math.max(...nums);
    expect(Math.abs(lastX - sceneMaxX)).toBeLessThanOrEqual(0.01);
  });
});
