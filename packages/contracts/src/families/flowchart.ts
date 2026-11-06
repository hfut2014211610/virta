import type { ChartContract } from '../contract.js';

// flowchart：流程图（简版——节点按层级排布 + 正交连线）
export const CONTRACT_FLOWCHART: ChartContract = {
  version: 1,
  view: 'flowchart',
  aliases: ['flow', 'process'],
  title: '流程图',
  summary: '节点分层排布 + 连线；出度>1 自动菱形判断节点',
  roles: [
    { role: 'from', label: '源', type: 'text', required: true, aliases: ['from', 'source', 'src', '节点', '源', '步骤', '当前'] },
    { role: 'to', label: '目标', type: 'text', required: true, aliases: ['to', 'target', 'dst', 'next', '目标', '下一个', '下一步'] },
    { role: 'label', label: '标签', type: 'text', required: false, aliases: ['label', 'condition', '标签', '条件', '分支'] },
    { role: 'type', label: '类型', type: 'category', required: false, aliases: ['type', 'kind', '类型', '节点类型'], note: 'start/end/decision 影响形状' },
  ],
  variants: [
    { id: 'tb', label: '纵向', description: '自上而下' },
    { id: 'lr', label: '横向', description: '自左而右' },
  ],
  options: [
    { key: 'edgeLabels', label: '连线标签', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: ['源/目标去重为节点', '层级 = 最长路径深度', '出度>1 或 type=decision → 菱形'],
  example: { csv: '源,目标,标签\n提交申请,主管审批,\n主管审批,通过,同意\n主管审批,驳回,拒绝' },
  staticExport: true,
};
