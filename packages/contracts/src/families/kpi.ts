import type { ChartContract } from '../contract.js';

// kpi：指标卡片（cards / cards+spark），T1 新视图（M6）
export const CONTRACT_KPI: ChartContract = {
  version: 1,
  view: 'kpi',
  aliases: ['指标卡', '大数字'],
  title: '指标卡',
  summary: '每指标一张卡：大数字 + 环比箭头 + 目标进度；cards+spark 附迷你趋势线',
  roles: [
    { role: 'metric', label: '指标', type: 'category', required: true, aliases: ['metric', 'kpi', 'label', 'name', '指标', '指标名', '名称', '度量'], note: '≤8 行' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'actual', 'count', 'amount', 'y', '数值', '实际', '本期', '金额'] },
    { role: 'target', label: '目标', type: 'number', required: false, aliases: ['target', 'goal', '目标', '目标值', '计划'] },
    { role: 'previous', label: '上期', type: 'number', required: false, aliases: ['previous', 'prev', 'last', '上期', '同比', '环比'] },
    { role: 'trend', label: '趋势列', type: 'any', required: false, aliases: [], note: '卡片组数据：留空则从序列推断' },
  ],
  variants: [
    { id: 'cards', label: '卡片', description: '大数字 + 环比 + 目标（默认）' },
    { id: 'cards+spark', label: '卡片+趋势', description: '附迷你趋势线' },
  ],
  options: [
    { key: 'columns', label: '每行卡数', type: 'number', group: 'view', static: true, default: 3, min: 1, max: 6 },
    { key: 'targetBar', label: '目标进度条', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'invertBad', label: '反向指标', type: 'enum', group: 'view', static: true, default: 'auto',
      values: [{ value: 'auto', label: '自动（含 率/成本/时长 字样的负数为好）' }, { value: 'off', label: '关闭' }] },
  ],
  inference: [
    'previous 存在 → 显示环比箭头与百分比',
    'target 存在 → 显示达成率进度条',
  ],
  example: { csv: '指标,实际,目标,上期\nGMV增速,18,25,12' },
  staticExport: true,
};
