import type { ChartContract } from '../contract.js';

// histogram：分布直方图（count / density / cumulative），T1 新视图（M6）
export const CONTRACT_HISTOGRAM: ChartContract = {
  version: 1,
  view: 'histogram',
  aliases: ['分布', '直方图'],
  title: '直方图',
  summary: 'Freedman–Diaconis 自动分箱；多组时叠加半透明；cumulative 变体叠累计曲线',
  roles: [
    { role: 'value', label: '观测值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '耗时', '评分', '偏差'], note: '唯一度量列时强烈推荐' },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['group', 'series', '类别', '组', '分组', '渠道', '版本'], note: '有 → 多组叠加' },
  ],
  variants: [
    { id: 'count', label: '计数', description: '每箱样本数（默认）' },
    { id: 'density', label: '密度', description: '占比 % 显示' },
    { id: 'cumulative', label: '累计', description: '箱柱 + 累计 % 曲线' },
  ],
  options: [
  ],
  inference: [
    '分箱数 = FD 规则（IQR / ∛n），上限 40',
    '异常值不截断，按最外箱延伸',
  ],
  example: { csv: '评分\n82\n91' },
  staticExport: true,
};
