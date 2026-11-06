import type { ChartContract } from '../contract.js';

// pie-basic：占比环形/实心饼图
export const CONTRACT_PIE: ChartContract = {
  version: 1,
  view: 'pie',
  aliases: [],
  title: '饼图',
  summary: '占比环形/实心饼图；小扇区并入「其他」；引导线标签走避让',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '缺省取第一列' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'] },
  ],
  variants: [
    { id: 'donut', label: '环形', description: '默认' },
    { id: 'pie', label: '实心', description: '实心圆饼' },
  ],
  options: [
    { key: 'ringRatio', label: '环宽', type: 'enum', group: 'style', static: true, default: '0.6',
      values: [{ value: '0.72', label: '细' }, { value: '0.6', label: '中' }, { value: '0.45', label: '厚' }],
      description: 'donut 内径占外径比' },
    { key: 'texture', label: '纹理', type: 'enum', group: 'style', static: true, default: 'none',
      values: [{ value: 'none', label: '无' }, { value: 'hatch', label: '斜纹' }, { value: 'dots', label: '点纹' }, { value: 'grid', label: '网格' }] },
    { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'multi',
      values: [{ value: 'multi', label: '多色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
    { key: 'labelMode', label: '标注', type: 'enum', group: 'display', static: true, default: 'leader',
      values: [{ value: 'none', label: '无' }, { value: 'inside', label: '扇内' }, { value: 'leader', label: '引导线' }],
      description: '引导线必须走标签避让' },
    { key: 'collapseOther', label: '其他合并', type: 'boolean', group: 'data', static: true, default: true,
      description: '占比 <3% 的扇区并入「其他」' },
    { key: 'centerLabel', label: '中心合计', type: 'boolean', group: 'display', static: true, default: true,
      description: 'donut 环心显示总计；实心 pie 时忽略' },
  ],
  inference: [
    '占比 <3% 的扇区自动并入「其他」（可关）',
    '负值/0 值剔除并警告',
    '重复 label 求和',
  ],
  example: { csv: '渠道,营收\n线上,520\n线下,340' },
  staticExport: true,
  legacyTemplate: 'pie-basic',
};
