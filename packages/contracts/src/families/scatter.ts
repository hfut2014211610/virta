import type { ChartContract } from '../contract.js';

// scatter-basic：散点/相关性气泡图
export const CONTRACT_SCATTER: ChartContract = {
  version: 1,
  view: 'scatter',
  aliases: [],
  title: '散点图',
  summary: 'x/y 数值散点；趋势线、log 轴、均值线、置信椭圆、刷选、按 size 列气泡',
  roles: [
    { role: 'x', label: '横轴', type: 'number', required: true, aliases: ['x', 'x值', '横轴', '自变量', '投入', '投放入', '成本'], note: '缺省取第一个数值列' },
    { role: 'y', label: '纵轴', type: 'number', required: true, aliases: ['y', 'y值', '纵轴', '因变量', '转化', '收益', '产出'], note: '缺省取第二个数值列' },
    { role: 'size', label: '气泡', type: 'number', required: false, aliases: ['size', '气泡', '气泡大小', '规模', '权重'], note: '气泡面积' },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['group', 'series', '分组', '系列', '渠道', '门店', '城市', '部门'], note: '分组着色' },
    { role: 'label', label: '点名', type: 'category', required: false, aliases: ['label', 'category', '分类', '类别', '标签'], note: '悬浮点名' },
  ],
  variants: [],
  options: [
    { key: 'trendline', label: '趋势线', type: 'boolean', group: 'view', static: true, default: true },
    { key: 'meanLines', label: '均值线', type: 'boolean', group: 'view', static: true, default: false,
      description: 'x/y 均值十字线' },
    { key: 'logX', label: 'log X', type: 'boolean', group: 'view', static: true, default: false },
    { key: 'logY', label: 'log Y', type: 'boolean', group: 'view', static: true, default: false },
    { key: 'ellipse', label: '置信椭圆', type: 'boolean', group: 'view', static: true, default: false,
      description: '95% 置信椭圆（全体或分组）' },
    { key: 'marker', label: '点形', type: 'enum', group: 'style', static: true, default: 'circle',
      values: [
        { value: 'circle', label: '圆点' }, { value: 'square', label: '方块' }, { value: 'diamond', label: '菱形' },
        { value: 'triangle', label: '三角' }, { value: 'mixed', label: '按分组' },
      ] },
    { key: 'dotSize', label: '点径', type: 'enum', group: 'style', static: true, default: '1',
      values: [{ value: '0.72', label: '小' }, { value: '1', label: '中' }, { value: '1.45', label: '大' }] },
    { key: 'bubble', label: '气泡', type: 'enum', group: 'view', static: true, default: 'metric',
      values: [{ value: 'uniform', label: '统一' }, { value: 'metric', label: '按 size 列' }],
      description: 'metric 时按 size 列决定面积' },
    { key: 'labelMode', label: '标注', type: 'enum', group: 'display', static: true, default: 'none',
      values: [{ value: 'none', label: '无' }, { value: 'outlier', label: '离群值' }, { value: 'all', label: '全部' }] },
  ],
  inference: [
    'x/y 缺省 = 前两个数值列',
    '相关系数 r 自动计算入识别报告',
    '缺失行剔除并计数',
  ],
  example: { csv: '投入,转化,规模,渠道\n1200,340,20,线上\n800,210,12,线下' },
  staticExport: true,
  legacyTemplate: 'scatter-basic',
};
