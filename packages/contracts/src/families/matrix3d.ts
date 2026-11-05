import type { ChartContract } from '../contract.js';

// bar-matrix：3D 透视柱状矩阵 3 截面 × 3 棱边 × 4 顶帽
export const CONTRACT_MATRIX3D: ChartContract = {
  version: 1,
  view: 'matrix3d',
  aliases: [],
  title: '3D 矩阵',
  summary: 'label×series 透视柱状矩阵（整体视角）；旋转、缩放、负值保护',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'] },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'] },
    { role: 'series', label: '系列', type: 'category', required: false, aliases: ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'] },
  ],
  variants: [],
  options: [
    { key: 'norm', label: '归一', type: 'enum', group: 'data', static: true, default: 'global',
      values: [{ value: 'global', label: '全局' }, { value: 'per_column', label: '按列' }],
      description: '柱高归一基准' },
    { key: 'sort', label: '排序', type: 'enum', group: 'view', static: false, default: 'none',
      values: [
        { value: 'value', label: '按值' }, { value: 'label', label: '按标签' }, { value: 'none', label: '原始' },
      ] },
    { key: 'section', label: '截面', type: 'enum', group: 'style', static: true, default: 'square',
      values: [{ value: 'square', label: '方柱' }, { value: 'circle', label: '圆柱' }, { value: 'octagon', label: '八棱' }] },
    { key: 'edge', label: '棱边', type: 'enum', group: 'style', static: true, default: 'sharp',
      values: [{ value: 'sharp', label: '锐边' }, { value: 'round', label: '圆棱' }, { value: 'chamfer', label: '切棱' }] },
    { key: 'cap', label: '顶帽', type: 'enum', group: 'style', static: true, default: 'flat',
      values: [
        { value: 'flat', label: '平顶' }, { value: 'dome', label: '穹顶' },
        { value: 'spire', label: '尖顶' }, { value: 'notch', label: '凹槽' },
      ] },
    { key: 'topLabels', label: '顶面数值', type: 'boolean', group: 'display', static: true, default: false },
    { key: 'shading', label: '浓淡', type: 'boolean', group: 'style', static: true, default: true,
      description: '按高度做明暗浓淡' },
    { key: 'axes3d', label: '坐标轴', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'autoRotate', label: '自动旋转', type: 'boolean', group: 'view', static: false, default: false },
  ],
  inference: [
    '同 barline 模型：数值列 ≥80%，重复组合求和，缺失按 0 计',
    '含负值时 3D 矩阵停用并在质量报告说明',
  ],
  example: { csv: '月份,产品A,产品B\n1月,120,80\n2月,150,95' },
  staticExport: true,
  legacyTemplate: 'bar-matrix',
};
