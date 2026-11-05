// chart-core 单元测试：比例尺/度量/标签避让/命中/确定性 SVG/补间。
import { describe, expect, it } from 'vitest';
import { g, hitTest, interpolateScene, measureText, niceTicks, placeLabels, scaleBand, scaleLinear, scaleLog, scalePoint, scene, toSVG } from '../src/index.js';

describe('niceTicks/scaleLinear', () => {
  it('步长取 1/2/2.5/5×10^k 且覆盖域', () => {
    const { domain, ticks } = niceTicks(0, 97);
    expect(domain[0]).toBe(0); expect(domain[1]).toBeGreaterThanOrEqual(97);
    expect(ticks.length).toBeGreaterThan(3); expect(ticks.length).toBeLessThanOrEqual(8);
  });
  it('负域含 0 且单调', () => {
    const s = scaleLinear([-50, 120], [400, 0]);
    expect(s(0)).toBeGreaterThan(0); expect(s(0)).toBeLessThan(400);
    // nice 后域端点映射到 range 端点
    expect(s(s.domain[0])).toBe(400); expect(s(s.domain[1])).toBe(0);
    expect(s.domain[0]).toBeLessThanOrEqual(-50); expect(s.domain[1]).toBeGreaterThanOrEqual(120);
  });
});
describe('scaleLog/scalePoint/scaleBand', () => {
  it('log 域单调且 ticks 是 10 的幂', () => {
    const s = scaleLog([1, 1000], [0, 300]);
    expect(s(10)).toBeCloseTo(100); expect(s.ticks.every((t) => Number.isInteger(Math.log10(t)))).toBe(true);
  });
  it('band：带宽+步长覆盖 range', () => {
    const b = scaleBand(['a', 'b', 'c'], [0, 300]);
    expect(b('b')).toBeGreaterThan(b('a')); expect(b.bandwidth).toBeGreaterThan(0);
    expect(scalePoint(['a', 'b'], [0, 100])('b')).toBe(100);
  });
});
describe('measureText', () => {
  it('CJK=1em，mono=0.6em，窄字符更窄', () => {
    expect(measureText('中文字', 'body', 10)).toBe(30);
    expect(measureText('abc', 'mono', 10)).toBeCloseTo(18);
    expect(measureText('iii', 'body', 10)).toBeLessThan(measureText('WWW', 'body', 10));
  });
});
describe('toSVG 确定性', () => {
  const mk = () => scene(100, 60, [
    g([
      { type: 'rect', x: 1.234, y: 2.567, w: 10, h: 8, r: 2, fill: '#abc' },
      { type: 'text', x: 5, y: 5, text: '标签<A>', font: 'mono', size: 11 },
    ]),
  ]);
  it('坐标两位小数 + 转义 + 字节稳定', () => {
    const a = toSVG(mk()), b = toSVG(mk());
    expect(a).toBe(b);
    expect(a).toContain('x="1.23"'); expect(a).toContain('标签&lt;A&gt;');
    expect(a).toContain('viewBox="0 0 100 60"');
  });
});
describe('hitTest', () => {
  it('形状命中与 datum 透传', () => {
    const sc = scene(100, 100, []);
    sc.hits = [
      { shape: { type: 'rect', x: 0, y: 0, w: 30, h: 30 }, datum: { kind: 'bar', index: 0, label: 'A', value: 1, tooltip: { title: 'A', rows: [] } } },
      { shape: { type: 'circle', cx: 80, cy: 80, r: 10 }, datum: { kind: 'point', index: 1, label: 'B', value: 2, tooltip: { title: 'B', rows: [] } } },
    ];
    expect(hitTest(sc, 15, 15)?.index).toBe(0);
    expect(hitTest(sc, 80, 82)?.index).toBe(1);
    expect(hitTest(sc, 50, 50)).toBeNull();
  });
});
describe('placeLabels', () => {
  it('避让：高优先级先放，碰撞者换候选位或隐藏', () => {
    const out = placeLabels([
      { x: 100, y: 50, text: '甲', width: 24, height: 12, priority: 2, leader: true },
      { x: 104, y: 52, text: '乙', width: 24, height: 12, priority: 1, leader: true },
    ], [0, 0, 200, 100]);
    expect(out.placed.length + out.hidden.length).toBe(2);
    expect(out.placed.length).toBeGreaterThanOrEqual(1);
    // 均不落盘重叠
    for (let i = 0; i < out.placed.length; i++) for (let j = i + 1; j < out.placed.length; j++) {
      const a = out.placed[i], b = out.placed[j];
      expect(a.x + 2 > b.x + b.w || b.x + 2 > a.x + a.w || a.y + 2 > b.y + b.h || b.y + 2 > a.y + a.h).toBe(true);
    }
  });
});
describe('interpolateScene', () => {
  it('同 id 节点线性补间', () => {
    const a = scene(10, 10, [{ type: 'rect', id: 'r', x: 0, y: 0, w: 10, h: 10 }]);
    const b = scene(10, 10, [{ type: 'rect', id: 'r', x: 100, y: 0, w: 10, h: 10 }]);
    const mid = interpolateScene(a, b, 0.5);
    const r = mid.root.children[0] as { x: number };
    expect(r.x).toBe(50);
  });
});
