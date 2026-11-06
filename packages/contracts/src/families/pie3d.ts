import type { ChartContract } from '../contract.js';

// pie3d-basic：3D 分层饼图
export const CONTRACT_PIE3D: ChartContract = {
  version: 1,
  view: 'pie3d',
  aliases: [],
  title: '3D 饼图',
  summary: '伪 3D 立体饼：多层数据按 label 合并为单层饼 + 厚度侧壁；拖拽旋转',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '占比扇区' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'], note: '每层求和后取占比' },
    { role: 'group', label: '分层', type: 'category', required: false, aliases: ['大区', '区域', '地区', '大类', '一级', '父类', '部门', '板块', '分组', 'group', 'category2', 'region', 'area'], note: '缺省=单层；无别名时按基数最少的文本列自动判断' },
  ],
  variants: [],
  options: [
    { key: 'wall', label: '厚度侧壁', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'sliceLabels', label: '扇区标签', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'texture', label: '纹理', type: 'enum', group: 'style', static: true, default: 'none',
      values: [{ value: 'none', label: '无' }, { value: 'hatch', label: '斜纹' }, { value: 'dots', label: '点纹' }, { value: 'grid', label: '网格' }] },
    { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'multi',
      values: [{ value: 'multi', label: '多色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
  ],
  inference: [
    '多层数据按 label 合并为单层伪 3D 饼（椭圆压扁 + 侧壁）',
    '占比 <3% 的扇区并入「其他」',
    '负值/0 值剔除并警告',
  ],
  example: { csv: '季度,品类,营收\nQ1,手机,320\nQ1,笔记本,210\nQ2,手机,350' },
  staticExport: true,
  legacyTemplate: 'pie3d-basic',
};
