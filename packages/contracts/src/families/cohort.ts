import type { ChartContract } from '../contract.js';

// cohort：留存三角热力图（retention% / absolute），T1 新视图（M6）
export const CONTRACT_COHORT: ChartContract = {
  version: 1,
  view: 'cohort',
  aliases: ['留存', '群组'],
  title: '队列留存',
  summary: '行=批次、列=第 N 期；retention% 按第 0 期归一化，absolute 显示原始数',
  roles: [
    { role: 'cohort', label: '批次', type: 'category', required: true, aliases: ['cohort', '批次', '群', '组', '月份', 'month'], note: '类日期值' },
    { role: 'period', label: '期数', type: 'number', required: true, aliases: ['period', '期', '第几期', '期数', 'week', 'n'], note: '整数 0..N' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '人数', '留存', 'users'] },
  ],
  variants: [
    { id: 'retention', label: '留存 %', description: '按第 0 期归一化（默认）' },
    { id: 'absolute', label: '绝对数', description: '原始计数热力' },
  ],
  options: [
    { key: 'maxPeriod', label: '最大期数', type: 'number', group: 'view', static: true, default: 0, min: 0, max: 52,
      description: '0 = 不截断' },
    { key: 'cellText', label: '格内数值', type: 'enum', group: 'display', static: true, default: 'pct',
      values: [{ value: 'pct', label: '百分比' }, { value: 'value', label: '原始数' }, { value: 'none', label: '无' }] },
    { key: 'diagonal', label: '对角裁剪', type: 'boolean', group: 'view', static: true, default: true,
      description: '未到期的格子留空' },
  ],
  inference: [
    'period 取整数；cohort 按字典序排列',
    '未到期的（cohort+period 组合缺失）记 diagonal 空格',
  ],
  example: { csv: 'cohort,period,users\n2025-01,0,1000\n2025-01,1,620' },
  staticExport: true,
};
