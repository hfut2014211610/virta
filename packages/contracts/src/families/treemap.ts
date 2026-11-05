import type { ChartContract } from '../contract.js';

// treemap-basic：矩形树状图（一层/两层 + 下钻）
export const CONTRACT_TREEMAP: ChartContract = {
  version: 1,
  view: 'treemap',
  aliases: [],
  title: '矩形树状图',
  summary: '层级面积图；有 group 列即两层；点击下钻 + 面包屑返回',
  roles: [
    { role: 'label', label: '名称', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '叶子名' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'] },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['大区', '区域', '地区', '大类', '一级', '父类', '部门', '板块', '分组', 'group', 'category2', 'region', 'area'], note: '有即两层模式' },
  ],
  variants: [
    { id: 'flat', label: '一层', description: '无分组' },
    { id: 'grouped', label: '两层', description: 'group+label 两层', requires: ['group'] },
  ],
  options: [
    { key: 'showLabels', label: '标签', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'showValues', label: '数值', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'groupBg', label: '分组底色', type: 'boolean', group: 'style', static: true, default: true,
      description: '两层模式的分组衬底色块' },
  ],
  inference: [
    '负值/0 值剔除并警告',
    '同组同名子项合并',
    '点击下钻 / 面包屑返回（页内交互）',
  ],
  example: { csv: '大区,城市,销售额\n华东,上海,120\n华东,杭州,80' },
  staticExport: true,
  legacyTemplate: 'treemap-basic',
};
