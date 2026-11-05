import type { ChartContract } from '../contract.js';

// tree：层级树（tidy / org / mindmap / indented），T2 新视图（M7）
export const CONTRACT_TREE: ChartContract = {
  version: 1,
  view: 'tree',
  aliases: ['树', '树图', '组织结构', '层级'],
  title: '层级树',
  summary: 'id+parent 或 level1..N 层级：整齐树 / 组织图 / 脑图 / 缩进列表，内部节点显示汇总',
  roles: [
    { role: 'id', label: '节点 ID', type: 'category', required: false, aliases: ['id', '编号', 'code', '节点'], note: '与 parent 配合；无 id/parent 时按 level 列成树' },
    { role: 'parent', label: '父节点', type: 'category', required: false, aliases: ['parent', 'pid', '父', '父级', '上级', 'parentid', '父节点'] },
    { role: 'name', label: '节点名', type: 'category', required: false, aliases: ['name', '名称', '部门', '节点名', 'label'] },
    { role: 'level', label: '层级', type: 'category', required: false, multiple: true, aliases: [], note: 'level1..N 形态：任意非数值列按列序成层级' },
    { role: 'value', label: '数值', type: 'number', required: false, aliases: [], note: '叶子值，内部节点自动汇总' },
  ],
  variants: [
    { id: 'tidy', label: '整齐树', description: '纵向分层，叶子均布（默认）' },
    { id: 'org', label: '组织图', description: '卡片节点 + 数值角标' },
    { id: 'mindmap', label: '脑图', description: '横向脑图，右侧展开' },
    { id: 'indented', label: '缩进列表', description: '行内缩进 + 汇总值' },
  ],
  options: [
    { key: 'showValues', label: '节点数值', type: 'boolean', group: 'display', static: true, default: true,
      description: '节点上显示值/汇总' },
    { key: 'collapseDepth', label: '默认展开层数', type: 'number', group: 'view', static: true, default: 0,
      description: '0 = 全部展开；N = 只展开前 N 层' },
  ],
  inference: [
    '检测到 id + parent 列时强烈推荐（0.95）',
    'level1..N 形态也可成树（层级视图保底）',
    '内部节点值为后代叶子之和',
  ],
  example: { csv: 'id,parent,name,headcount\nT0,,技术部,\nT1,T0,支付中心,12' },
  staticExport: true,
};
