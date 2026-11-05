import type { ChartContract } from '../contract.js';

// sankey-basic：桑基图（流量路径，去环 + 最长路径分层 + barycenter）
export const CONTRACT_SANKEY: ChartContract = {
  version: 1,
  view: 'sankey',
  aliases: [],
  title: '桑基图',
  summary: 'source→target 流量；自环剔除、成环去最弱边并警告；拖动节点',
  roles: [
    { role: 'source', label: '源', type: 'category', required: true, aliases: ['source', 'from', 'src', '源', '来源', '起点', '上游', 'fromnode'] },
    { role: 'target', label: '目标', type: 'category', required: true, aliases: ['target', 'to', 'dst', '目标', '去向', '终点', '下游', 'tonode'] },
    { role: 'value', label: '流量', type: 'number', required: true, aliases: ['value', 'count', 'amount', '数值', '数量', '金额', '销量', '流量', '人数'] },
  ],
  variants: [],
  options: [
    { key: 'labelMode', label: '标签', type: 'enum', group: 'display', static: true, default: 'both',
      values: [{ value: 'both', label: '名称+值' }, { value: 'name', label: '仅名称' }, { value: 'none', label: '隐藏' }],
      description: '末列标签经避让布局，小节点也要有标签' },
    { key: 'density', label: '密度', type: 'enum', group: 'style', static: true, default: 'comfort',
      values: [{ value: 'comfort', label: '舒适' }, { value: 'compact', label: '紧凑' }] },
    { key: 'flowGradient', label: '流带渐变', type: 'boolean', group: 'style', static: true, default: true },
  ],
  inference: [
    '重复边求和',
    '自环剔除',
    '成环去最弱边并警告（CYCLE_REMOVED）',
    '最长路径分层 + barycenter 排序',
  ],
  example: { csv: 'source,target,value\n访问,注册,3200\n注册,付费,860' },
  staticExport: true,
  legacyTemplate: 'sankey-basic',
};
