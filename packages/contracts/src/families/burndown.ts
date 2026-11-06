import type { ChartContract } from '../contract.js';

// burndown：燃尽图（简版——理想斜线 + 实际剩余折线）
export const CONTRACT_BURNDOWN: ChartContract = {
  version: 1,
  view: 'burndown',
  aliases: ['burn'],
  title: '燃尽图',
  summary: '迭代剩余工作量折线 vs 理想斜线',
  roles: [
    { role: 'day', label: '日期', type: 'text', required: true, aliases: ['day', 'date', 'sprint', 'iteration', '天', '日期', '迭代日', '第几天'] },
    { role: 'remaining', label: '剩余', type: 'number', required: true, aliases: ['remaining', 'left', 'points', '剩余', '剩余工时', '剩余点数', '未完成'] },
  ],
  variants: [{ id: 'line', label: '折线', description: '剩余折线+理想斜线' }],
  options: [
    { key: 'ideal', label: '理想线', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'valueLabels', label: '数值标签', type: 'boolean', group: 'display', static: true, default: false },
  ],
  inference: ['首日剩余 → 理想线起点', '理想线 = 首日→末日归零斜线', '实际线超前/滞后对比理想线'],
  example: { csv: '天,剩余\n1,120\n2,108\n3,95\n4,88' },
  staticExport: true,
};
