import type { ChartContract } from '../contract.js';

// heatmap-basic：日历 / 矩阵双模式热力图
export const CONTRACT_HEATMAP: ChartContract = {
  version: 1,
  view: 'heatmap',
  aliases: ['heat'],
  title: '热力图',
  summary: '日历热力图（GitHub 式）或 x×y 矩阵热力图；顺序/发散色阶；多年份切换',
  roles: [
    { role: 'date', label: '日期', type: 'date', required: false, aliases: ['date', 'day', '日期', '时间', 'time', 'dt', 'dayord'], note: 'calendar 模式必需' },
    { role: 'x', label: '列', type: 'category', required: false, aliases: ['x', 'col', 'column', '列', '横轴', 'weekday', '星期', '时段', '类目x'], note: 'matrix 模式：两个维度列之一' },
    { role: 'y', label: '行', type: 'category', required: false, aliases: ['y', 'row', '行', '纵轴', 'hour', '小时', '类目y'], note: 'matrix 模式' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', '数值', '数量', '金额', '销量', '客流', '强度'], note: '缺省取首个 ≥80% 数值列' },
  ],
  modes: [
    { id: 'calendar', label: '日历', requires: ['date', 'value'], when: '存在可解析日期列' },
    { id: 'matrix', label: '矩阵', requires: ['x', 'y', 'value'], when: '无日期列，存在两个维度列' },
  ],
  variants: [],
  options: [
    { key: 'scale', label: '色带', type: 'enum', group: 'style', static: true, default: 'sequential',
      values: [{ value: 'sequential', label: '顺序' }, { value: 'diverging', label: '发散' }],
      description: '发散用于有正负语义的值（如现金流）' },
    { key: 'density', label: '密度', type: 'enum', group: 'style', static: true, default: 'comfort',
      values: [{ value: 'comfort', label: '舒适' }, { value: 'compact', label: '紧凑' }] },
    { key: 'valueLabels', label: '数值标注', type: 'boolean', group: 'display', static: true, default: false },
    { key: 'weekStart', label: '周起始', type: 'enum', group: 'view', static: true, default: 'monday',
      values: [{ value: 'monday', label: '周一' }, { value: 'sunday', label: '周日' }],
      description: 'calendar 模式的周起始日' },
  ],
  inference: [
    'x/y 缺省 = 前两个非数值列',
    '重复 (x,y) 求和',
    '覆盖率 <50% 警告（SPARSE_GRID）',
    '稀疏格空心呈现',
    '日期列存在即 calendar；跨年数据按年切换（state.time）',
  ],
  example: { csv: '星期,时段,客流\n周一,上午,120\n周一,下午,260' },
  staticExport: true,
  legacyTemplate: 'heatmap-basic',
};
