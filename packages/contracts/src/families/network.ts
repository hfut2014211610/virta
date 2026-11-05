import type { ChartContract } from '../contract.js';

// network：网络图（force / circular），T2 新视图（M7）
export const CONTRACT_NETWORK: ChartContract = {
  version: 1,
  view: 'network',
  aliases: ['网络', '关系图', '力导向', '依赖'],
  title: '网络图',
  summary: 'source + target（+ value）：力导向（确定性种子）/ 环形布局；有环流网络优先于 sankey',
  roles: [
    { role: 'source', label: '源节点', type: 'category', required: true, aliases: ['source', 'from', 'src', '源', '来源', '起点', '上游', 'fromnode'] },
    { role: 'target', label: '目标节点', type: 'category', required: true, aliases: ['target', 'to', 'dst', '目标', '去向', '终点', '下游', 'tonode'] },
    { role: 'value', label: '权重', type: 'number', required: false, aliases: [], note: '边宽；缺省按 1 计' },
    { role: 'group', label: '节点分组', type: 'category', required: false, aliases: ['group', '类别', '分组', '类型'], note: '节点着色（按 source 端取）' },
  ],
  variants: [
    { id: 'force', label: '力导向', description: 'velocity Verlet 预迭代 300 步，固定种子（默认）' },
    { id: 'circular', label: '环形', description: '节点均布圆周，边为弦' },
  ],
  options: [
    { key: 'linkDistance', label: '边长', type: 'number', group: 'view', static: true, default: 80 },
    { key: 'nodeLabels', label: '节点标签', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    'source+target 且无环 → sankey 更优（0.6）',
    '有环/无层次 → network（0.85）',
    '力导向迭代固定种子，静态导出可复现',
  ],
  example: { csv: 'source,target,value\n提交,待评审,186\n待评审,驳回,24' },
  staticExport: true,
};
