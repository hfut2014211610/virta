import type { ChartContract } from '../contract.js';

// line3d-basic：3D 折线图（带状折线，补齐 palette）
export const CONTRACT_LINE3D: ChartContract = {
  version: 1,
  view: 'line3d',
  aliases: [],
  title: '3D 折线',
  summary: '每系列一条带状折线（深度轴）；地面网格、三轴、参考墙、飘带填充',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '分类/时间轴（≥2 项）' },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'], note: '宽表多个数值列各一条系列；长表系列列+数值列' },
    { role: 'series', label: '系列', type: 'category', required: false, aliases: ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'], note: '深度轴（每条系列一根带状折线）' },
  ],
  variants: [],
  options: [
    { key: 'floorGrid', label: '地面网格', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'axes3d', label: '三轴', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'wall', label: '参考墙', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'ribbon', label: '飘带填充', type: 'boolean', group: 'style', static: true, default: true },
    { key: 'dots', label: '数据点', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    '缺省：宽表每个数值列=一个系列；长表按系列列分组；xAxis/series 的 ECharts JSON 也支持',
    '所有系列共用同一 Z 刻度；拖拽旋转 + 滚轮缩放',
  ],
  example: { csv: 'label,消费,出行,政务\n1月,420,300,180\n2月,460,330,200' },
  staticExport: true,
  legacyTemplate: 'line3d-basic',
};
