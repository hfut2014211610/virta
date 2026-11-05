// T2 适配器/洞察单测（M7）：tree / network / control / parallel。
import { describe, expect, it } from 'vitest';
import { toTree, toNetwork, toControl, toParallel } from '../src/families/t2.js';
import { insights } from '../src/insights.js';
import { counts } from '../src/counts.js';
import type { Raw } from '../src/families/barline.js';

const org: Raw = [
  { id: 'R', parent: '', name: '研发中心', value: null },
  { id: 'R1', parent: 'R', name: '平台组', value: null },
  { id: 'R2', parent: 'R', name: '算法组', value: null },
  { id: 'R11', parent: 'R1', name: '网关', value: 9 },
  { id: 'R12', parent: 'R1', name: '存储', value: 7 },
  { id: 'R21', parent: 'R2', name: '推荐', value: 8 },
];

describe('toTree', () => {
  it('id+parent 形态：建树 + 后代求和', () => {
    const m = toTree(org);
    expect(m.form).toBe('idparent');
    expect(m.roots).toEqual(['R']);
    const r = m.nodes.find((n) => n.id === 'R')!;
    const r1 = m.nodes.find((n) => n.id === 'R1')!;
    expect(r.value).toBe(9 + 7 + 8);
    expect(r1.value).toBe(16);
    expect(r1.depth).toBe(1);
  });
  it('level1..N 形态：路径成树', () => {
    const m = toTree([
      { 大区: '华东', 省: '江苏', 销售额: 420 },
      { 大区: '华东', 省: '浙江', 销售额: 510 },
      { 大区: '华南', 省: '广东', 销售额: 610 },
    ] as unknown as Raw);
    expect(m.form).toBe('levels');
    expect(m.nodes.find((n) => n.name === '华东')!.value).toBe(930);
    expect(m.roots.length).toBe(2);
  });
  it('无 id/parent 且层级列不足时报错', () => {
    expect(() => toTree([{ 名称: 'x', 值: 1 }] as unknown as Raw)).toThrow(/id\+parent|层级/);
  });
});

describe('toNetwork', () => {
  const flow: Raw = [
    { source: 'A', target: 'B', value: 10 },
    { source: 'B', target: 'C', value: 5 },
    { source: 'C', target: 'A', value: 3 },
  ];
  it('聚合边 + 节点流量 + 环检测', () => {
    const m = toNetwork(flow);
    expect(m.links.length).toBe(3);
    expect(m.cyclic).toBe(true);
    expect(m.nodes.find((n) => n.id === 'A')!.flow).toBe(13);
  });
  it('无环 → cyclic=false', () => {
    const m = toNetwork([{ source: 'A', target: 'B', value: 1 }, { source: 'B', target: 'C', value: 2 }] as Raw);
    expect(m.cyclic).toBe(false);
  });
  it('缺 source/target 报错', () => {
    expect(() => toNetwork([{ a: 1, b: 2 }] as unknown as Raw)).toThrow(/source.*target/);
  });
});

describe('toControl', () => {
  const rows: Raw = Array.from({ length: 12 }, (_, i) => ({
    日期: `2025-09-${String(i + 1).padStart(2, '0')}`, 不良率: i === 10 ? 6.0 : 1.0 + (i % 3) * 0.2, 样本量: 200,
  }));
  it('p 图：n 加权中心线 + σ=√(p̄(1-p̄)/n̄) + 规则1 标记', () => {
    const m = toControl(rows);
    expect(m.mode).toBe('p');
    const ln = m.lines[0];
    expect(ln.ucl).toBeGreaterThan(ln.cl);
    expect(ln.lcl).toBeLessThan(ln.cl);
    const flagged = ln.points.filter((p) => p.flag === 'r1');
    expect(flagged.length).toBe(1);
    expect(flagged[0].v).toBe(6.0);
  });
  it('显式 ucl/lcl 列优先', () => {
    const m = toControl([
      { date: '2025-01-01', 值: 5, ucl: 10, lcl: 0 },
      { date: '2025-01-02', 值: 12, ucl: 10, lcl: 0 },
    ] as unknown as Raw);
    expect(m.lines[0].ucl).toBe(10);
    expect(m.lines[0].points[1].flag).toBe('r1');
  });
  it('分组各算各的限', () => {
    const m = toControl([
      { 日期: '2025-01-01', 产线: '甲', 不良率: 1, 样本量: 100 },
      { 日期: '2025-01-01', 产线: '乙', 不良率: 3, 样本量: 100 },
      { 日期: '2025-01-02', 产线: '甲', 不良率: 1.1, 样本量: 100 },
      { 日期: '2025-01-02', 产线: '乙', 不良率: 3.2, 样本量: 100 },
    ] as unknown as Raw);
    expect(m.lines.length).toBe(2);
    expect(m.lines[0].cl).not.toBe(m.lines[1].cl);
  });
});

describe('toParallel', () => {
  it('全部数值列成轴 + 分组', () => {
    const m = toParallel(Array.from({ length: 24 }, (_, i) => ({
      批次: `B${i}`, 温度: 240 + i, 压力: 1 + i * 0.01, 速度: 100 - i, 湿度: 50, 产线: i % 2 ? '甲' : '乙',
    })) as unknown as Raw);
    expect(m.axes.length).toBe(4);
    expect(m.rows.length).toBe(24);
    expect(m.group_key).toBe('产线');
    expect(m.axes[0].key).toBe('温度');
  });
  it('不足 2 个数值列报错', () => {
    expect(() => toParallel([{ a: 'x', v: 1 }] as unknown as Raw)).toThrow(/数值列/);
  });
});

describe('T2 洞察/计数', () => {
  it('network：枢纽与最强边', () => {
    const ins = insights('network', toNetwork([
      { source: 'A', target: 'B', value: 10 }, { source: 'B', target: 'A', value: 8 },
    ] as Raw));
    expect(ins[0].text).toContain('节点');
    expect(ins.some((i) => i.text.includes('枢纽'))).toBe(true);
  });
  it('control：失控洞察', () => {
    const m = toControl([
      ...Array.from({ length: 8 }, (_, i) => ({ 日期: `2025-01-0${i + 1}`, 不良率: 1 + (i % 3) * 0.1, 样本量: 100 })),
      { 日期: '2025-01-09', 不良率: 9, 样本量: 100 },
    ] as unknown as Raw);
    const ins = insights('control', m);
    expect(ins.some((i) => i.text.includes('失控'))).toBe(true);
    expect(counts('control', m)['outOfControl']).toBe(1);
  });
  it('counts', () => {
    expect(counts('tree', toTree(org))).toMatchObject({ nodes: 6, roots: 1 });
    expect(counts('network', toNetwork([{ source: 'A', target: 'B', value: 1 }] as Raw))).toMatchObject({ nodes: 2, links: 1 });
    expect(counts('parallel', toParallel([
      { a: 1, b: 2, g: 'x' }, { a: 2, b: 3, g: 'y' },
    ] as unknown as Raw))).toMatchObject({ axes: 2, rows: 2 });
  });
});
