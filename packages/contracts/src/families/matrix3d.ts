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
  variants: [
    { id: 'matrix', label: '柱阵', description: 'label×series 柱体矩阵' },
    { id: 'curve', label: '曲线', description: '每个系列沿分类轴的三维曲线（双因素）' },
  ],
  options: [
    { key: 'shading', label: '浓淡', type: 'boolean', group: 'style', static: true, default: true,
      description: '按高度做明暗浓淡' },
    { key: 'fog', label: '景深雾化', type: 'boolean', group: 'style', static: true, default: true },
    { key: 'topLabels', label: '顶面数值', type: 'boolean', group: 'display', static: true, default: false,
      description: '柱顶标注数值；单元格 >60 时不可用' },
    { key: 'axes3d', label: '坐标网格', type: 'boolean', group: 'display', static: true, default: true,
      description: '地面网格 + 后墙值轴 + 系列名' },
    { key: 'sort', label: '排序', type: 'enum', group: 'view', static: false, default: 'none',
      values: [
        { value: 'value', label: '按值' }, { value: 'label', label: '按标签' }, { value: 'none', label: '原始' },
      ] },
    { key: 'tilt', label: '视角', type: 'enum', group: 'view', static: true, default: 'mid',
      values: [{ value: 'high', label: '俯视' }, { value: 'mid', label: '标准' }, { value: 'low', label: '平视' }] },
    { key: 'autoRotate', label: '自动旋转', type: 'boolean', group: 'view', static: false, default: false },
    { key: 'norm', label: '归一', type: 'enum', group: 'data', static: true, default: 'global',
      values: [{ value: 'global', label: '全局' }, { value: 'per_column', label: '按列' }],
      description: '柱高归一基准' },
  ],
  inference: [
    '同 barline 模型：数值列 ≥80%，重复组合求和，缺失按 0 计',
    '含负值时 3D 矩阵停用并在质量报告说明',
  ],
  example: { csv: '月份,产品A,产品B\n1月,120,80\n2月,150,95' },
  staticExport: true,
  legacyTemplate: 'bar-matrix',
};
