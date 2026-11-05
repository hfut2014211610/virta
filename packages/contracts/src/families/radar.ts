import type { ChartContract } from '../contract.js';

// radar-basic：雷达评分对比图（宽表/长表两模式）
export const CONTRACT_RADAR: ChartContract = {
  version: 1,
  view: 'radar',
  aliases: [],
  title: '雷达图',
  summary: '多维评分对比；宽表每数值列一轴，或 axis+item+value 长表；各轴独立归一',
  roles: [
    { role: 'label', label: '维度', type: 'category', required: true, aliases: ['label', 'name', 'item', '类别', '名称', '对比项', '维度', '指标'], note: '宽表取第一列；长表为对比项列' },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', '数值', '评分', '得分', 'score'], note: '宽表：其余数值列各为一轴；长表：axis+item+value 三列' },
    { role: 'axis', label: '轴', type: 'category', required: false, aliases: ['axis', '维度', 'dimension'], note: '长表模式的轴列' },
    { role: 'item', label: '对比项', type: 'category', required: false, aliases: ['item', '对比项', '系列', 'series', '对象'], note: '长表模式的系列列' },
  ],
  modes: [
    { id: 'wide', label: '宽表', requires: ['label', 'value'], when: '第一列文本 + ≥2 个数值列' },
    { id: 'long', label: '长表', requires: ['axis', 'item', 'value'], when: '单系列 + ≥2 文本列自动按 (维度,对比项) 展开' },
  ],
  variants: [],
  options: [
    { key: 'fillPoly', label: '填充多边形', type: 'boolean', group: 'style', static: true, default: true },
    { key: 'gridAxes', label: '网格与轴', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'ringLabels', label: '轴刻度环', type: 'boolean', group: 'display', static: true, default: false },
    { key: 'vertexLabels', label: '顶点数值', type: 'boolean', group: 'display', static: true, default: false },
  ],
  inference: [
    '宽表优先；检测到 axis/item/value 结构自动转长表模式',
    '轴数 <3 拒绝',
    '各轴独立归一',
  ],
  example: { csv: '车型,动力,油耗,舒适,操控\nA款,8,6,9,7\nB款,6,8,7,8' },
  staticExport: true,
  legacyTemplate: 'radar-basic',
};
