import type { ChartContract } from '../contract.js';

// control：控制图（I / X̄ / p），T2 新视图（M7）
export const CONTRACT_CONTROL: ChartContract = {
  version: 1,
  view: 'control',
  aliases: ['控制图', 'spc', '休哈特'],
  title: '控制图',
  summary: 'date + value（+ n/ucl/lcl/group）：自动计算控制限，高亮 Western Electric 规则 1/2 失控点',
  roles: [
    { role: 'date', label: '日期', type: 'date', required: true, aliases: ['date', 'day', '日期', '时间', '月份', 'time', '批次'] },
    { role: 'value', label: '测量值', type: 'number', required: true, aliases: [], note: '不良率/缺陷数/计量值' },
    { role: 'n', label: '样本量', type: 'number', required: false, aliases: ['n', '样本量', '样本数', '样本大小', 'size', 'count'], note: '有 n 时按 p 图加权中心线' },
    { role: 'ucl', label: '控制上限', type: 'number', required: false, aliases: ['ucl', '控制上限', '上限'] },
    { role: 'lcl', label: '控制下限', type: 'number', required: false, aliases: ['lcl', '控制下限', '下限'] },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['group', '产线', '系列', '分组', '班组', '车间'], note: '每条分组独立计算控制限' },
  ],
  variants: [
    { id: 'i', label: 'I 图', description: '单值-移动极差（默认；σ = MR̄/1.128）' },
    { id: 'p', label: 'P 图', description: '有 n 时比例控制限 σ=√(p̄(1-p̄)/n̄)' },
    { id: 'xbar', label: 'X̄ 图', description: '均值图（同 I 限算法）' },
  ],
  options: [
    { key: 'showSigmaBands', label: 'σ 色带', type: 'boolean', group: 'display', static: true, default: true,
      description: '±1σ/±2σ 浅色带' },
    { key: 'weRules', label: 'WE 规则', type: 'boolean', group: 'view', static: true, default: true,
      description: '高亮规则 1（超 3σ）与规则 2（3 点中 2 点同侧超 2σ）' },
  ],
  inference: [
    '日期 + 测量值 + 控制限/样本量列 → 0.85',
    '显式 ucl/lcl 列优先于自动计算',
    '规则 1/2 失控点用警示色标记',
  ],
  example: { csv: '日期,不良率,样本量\n2025-07-04,1.0,198' },
  staticExport: true,
};
