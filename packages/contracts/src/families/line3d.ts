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
  variants: [
    { id: 'bands', label: '带状', description: '每系列一条带状折线沿深度轴排布（默认）' },
    { id: 'curve', label: '三维曲线', description: 'x/y/z 数值列的三维空间轨迹线' },
  ],
  options: [
    { key: 'lineStyle', label: '线形', type: 'enum', group: 'view', static: true, default: 'smooth',
      values: [
        { value: 'smooth', label: '平滑' }, { value: 'straight', label: '直线' }, { value: 'step', label: '阶梯' },
      ], description: '插值方式（屏幕空间，与 2D 折线一致）' },
    { key: 'window', label: '窗口', type: 'enum', group: 'view', static: false, default: 'all',
      values: [
        { value: 'all', label: '全部' }, { value: 'first6', label: '前 6 点' },
        { value: 'last6', label: '近 6 点' }, { value: 'last12', label: '近 12 点' },
      ], description: '显示的数据窗口' },
    { key: 'marker', label: '标记', type: 'enum', group: 'style', static: true, default: 'circle',
      values: [
        { value: 'circle', label: '圆点' }, { value: 'square', label: '方块' },
        { value: 'diamond', label: '菱形' }, { value: 'none', label: '无' },
      ] },
    { key: 'lineWidth', label: '线宽', type: 'enum', group: 'style', static: true, default: '2.4',
      values: [
        { value: '1.6', label: '细' }, { value: '2.4', label: '中' }, { value: '3.4', label: '粗' },
      ] },
    { key: 'hatch', label: '纹理线', type: 'boolean', group: 'style', static: true, default: false,
      description: '线为纹理虚线样式，配合 mono 配色可无颜色辨识' },
    { key: 'ribbon', label: '飘带填充', type: 'boolean', group: 'style', static: true, default: true },
    { key: 'endLabels', label: '端点数值', type: 'boolean', group: 'display', static: true, default: false,
      description: '末端显示数值标签' },
    { key: 'floorGrid', label: '地面网格', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'axes3d', label: '三轴', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    '缺省：宽表每个数值列=一个系列；长表按系列列分组；xAxis/series 的 ECharts JSON 也支持',
    '所有系列共用同一 Z 刻度；拖拽旋转 + 滚轮缩放',
  ],
  example: { csv: 'label,消费,出行,政务\n1月,420,300,180\n2月,460,330,200' },
  staticExport: true,
  legacyTemplate: 'line3d-basic',
};
