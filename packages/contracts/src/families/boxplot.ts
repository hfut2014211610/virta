import type { ChartContract } from '../contract.js';

// boxplot-basic：箱线图（观测聚合 / 五数汇总两模式）
export const CONTRACT_BOXPLOT: ChartContract = {
  version: 1,
  view: 'boxplot',
  aliases: ['box'],
  title: '箱线图',
  summary: '分布对比：原始观测聚合为五数，或直接给 min/q1/median/q3/max 汇总；离群点空心圆',
  roles: [
    { role: 'group', label: '组', type: 'category', required: true, aliases: ['group', 'category', '类别', '组', '分组', '产线', '批次', '班级', '组别'], note: '缺省取第一列' },
    { role: 'value', label: '观测值', type: 'number', required: false, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '偏差', '耗时', '评分'], note: 'observations 模式必需' },
    { role: 'min', label: '最小值', type: 'number', required: false, aliases: ['min', '最小值', '下限', 'low'], note: 'summary 模式；缺省以 Q1 代替并警告' },
    { role: 'q1', label: '下四分位', type: 'number', required: false, aliases: ['q1', '下四分位', 'p25'], note: 'summary 模式必需' },
    { role: 'median', label: '中位数', type: 'number', required: false, aliases: ['median', 'med', '中位数', 'p50'] },
    { role: 'q3', label: '上四分位', type: 'number', required: false, aliases: ['q3', '上四分位', 'p75'] },
    { role: 'max', label: '最大值', type: 'number', required: false, aliases: ['max', '最大值', '上限', 'high'], note: '缺省以 Q3 代替并警告' },
  ],
  modes: [
    { id: 'observations', label: '观测聚合', requires: ['group', 'value'], when: '每组多条原始观测' },
    { id: 'summary', label: '五数汇总', requires: ['group', 'min', 'q1', 'median', 'q3', 'max'], when: '已给五数列' },
  ],
  variants: [],
  options: [
    { key: 'sort', label: '排序', type: 'enum', group: 'view', static: false, default: 'none',
      values: [{ value: 'none', label: '首见' }, { value: 'asc', label: '中位数↑' }, { value: 'desc', label: '中位数↓' }] },
    { key: 'rawPoints', label: '原始散点', type: 'boolean', group: 'display', static: true, default: false,
      description: 'observations 模式叠加抖动散点' },
    { key: 'mean', label: '均值', type: 'boolean', group: 'display', static: true, default: true,
      description: '叠加均值菱形标记' },
  ],
  inference: [
    'type-7 分位数',
    '须线 = Q1∓1.5·IQR 界内最值',
    '界外离群空心圆',
    '组内 n<5 警告',
  ],
  example: { csv: '产线,偏差\nA线,0.32\nA线,-0.85' },
  staticExport: true,
  legacyTemplate: 'boxplot-basic',
};
