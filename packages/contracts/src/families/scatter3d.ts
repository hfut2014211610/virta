import type { ChartContract } from '../contract.js';

// scatter3d-basic：三维散点图（补齐 palette）
export const CONTRACT_SCATTER3D: ChartContract = {
  version: 1,
  view: 'scatter3d',
  aliases: [],
  title: '3D 散点',
  summary: 'x/y/z 三维散点；地面网格、三轴、气泡；拖拽旋转 + 滚轮缩放',
  roles: [
    { role: 'x', label: 'X', type: 'number', required: true, aliases: ['x', 'x值', '横轴'], note: '缺省取第一个数值列' },
    { role: 'y', label: 'Y', type: 'number', required: true, aliases: ['y', 'y值', '纵轴'], note: '缺省取第二个数值列' },
    { role: 'z', label: 'Z', type: 'number', required: true, aliases: ['z', 'z值', '竖轴', '深轴', '高度', '深度', 'z轴', '利润', '评分', '数量', '金额', '销量', '权重'], note: '缺省取第三个数值列' },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['group', 'series', '分组', '系列', '渠道', '门店', '城市', '部门'], note: '分组着色' },
    { role: 'size', label: '气泡', type: 'number', required: false, aliases: ['size', '气泡', '气泡大小', '规模', '权重'], note: '气泡面积' },
  ],
  variants: [],
  options: [
    { key: 'floorGrid', label: '地面网格', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'axes3d', label: '三轴', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'bubbles', label: '气泡', type: 'boolean', group: 'view', static: true, default: true,
      description: '按 size 列决定点大小' },
  ],
  inference: [
    'x/y/z 缺省 = 前三个数值列',
    '拖拽旋转 + 滚轮缩放（页内交互）',
  ],
  example: { csv: '成本,转化,利润,渠道\n1200,340,560,线上' },
  staticExport: true,
  legacyTemplate: 'scatter3d-basic',
};
