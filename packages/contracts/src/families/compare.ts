import type { ChartContract } from '../contract.js';

// compare：两期对比（slope / dumbbell），T1 新视图（M6）
export const CONTRACT_COMPARE: ChartContract = {
  version: 1,
  view: 'compare',
  aliases: ['对比', '前后'],
  title: '两期对比',
  summary: '标签 + 两个对比期度量：slope 斜率图 / dumbbell 哑铃图，方向反转项高亮',
  roles: [
    { role: 'label', label: '条目', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '名称', '渠道', '部门', '套餐'] },
    { role: 'from', label: '前期', type: 'number', required: true, aliases: ['from', 'a', '前期', '上期', '去年', '上半年', 'before', 'old', '2024'] },
    { role: 'to', label: '后期', type: 'number', required: true, aliases: ['to', 'b', '后期', '本期', '今年', '下半年', 'after', 'new', '2025'] },
  ],
  variants: [
    { id: 'slope', label: '斜率', description: '两列点连线，看斜率方向（默认）' },
    { id: 'dumbbell', label: '哑铃', description: '横向 from→to 线段 + 双端点' },
  ],
  options: [
    { key: 'missingValue', label: '缺失值', type: 'enum', group: 'data', static: true, default: 'gap',
      values: [{ value: 'gap', label: '留空' }, { value: 'zero', label: '补 0' }],
      description: '未观测点（无行/空值）默认不绘制；zero 恢复补 0' },
    { key: 'connectGaps', label: '连接缺口', type: 'boolean', group: 'display', static: true, default: false,
      description: '缺口处用虚线连接相邻观测段' },
    { key: 'highlightReversed', label: '反转高亮', type: 'boolean', group: 'view', static: true, default: true,
      description: '整体上升中下降的项用警示色' },
    { key: 'sortByDelta', label: '按变化排序', type: 'boolean', group: 'view', static: true, default: false, variants: ['dumbbell'] },
    { key: 'deltaLabels', label: '变化标签', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    '列名像对比期（年份/前后/上下期）时强烈推荐',
    '恰好 2 个度量列',
  ],
  example: { csv: '渠道,2024,2025\n线上,4000,5200' },
  staticExport: true,
};
