import type { ChartContract } from '../contract.js';

// formula：公式展示（简版——居中公式文本 + 常用记号转写）
export const CONTRACT_FORMULA: ChartContract = {
  version: 1,
  view: 'formula',
  aliases: ['math', 'eq'],
  title: '公式',
  summary: '公式文本排版展示；^/_ 上下标、√、希腊字母、求和积分记号转写',
  roles: [
    { role: 'formula', label: '公式', type: 'text', required: true, aliases: ['formula', 'eq', 'expression', 'math', '公式', '表达式', '算式'] },
    { role: 'name', label: '名称', type: 'text', required: false, aliases: ['name', 'label', 'title', '名称', '说明', '备注'] },
  ],
  variants: [{ id: 'center', label: '居中', description: '公式居中排版' }],
  options: [
    { key: 'size', label: '字号', type: 'enum', group: 'style', static: true, default: 'm',
      values: [{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }] },
  ],
  inference: ['x^2/x_i → 上下标', 'sqrt() → √()，希腊字母/运算符符号化', '名称列作公式题注'],
  example: { csv: '公式,名称\nE = m*c^2,质能方程\nx_i = a_i + b_i,递推式' },
  staticExport: true,
};
