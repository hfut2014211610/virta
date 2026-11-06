import type { ChartContract } from '../contract.js';

// line-basic：线形 × 填充 × 窗口 组合 + 标记/线宽
export const CONTRACT_LINE: ChartContract = {
  version: 1,
  view: 'line',
  aliases: [],
  title: '折线图',
  summary: '多系列折线；分类或时间作类目轴；支持平滑/直线/阶梯 × 无填充/面积/堆叠',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '缺省取第一列；月份等时间格式自动按时间轴' },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'], note: '宽表每个数值列一个系列；长表 series+value' },
    { role: 'series', label: '系列', type: 'category', required: false, aliases: ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'] },
  ],
  variants: [],
  options: [
    { key: 'missingValue', label: '缺失值', type: 'enum', group: 'data', static: true, default: 'gap',
      values: [{ value: 'gap', label: '留空' }, { value: 'zero', label: '补 0' }],
      description: '未观测点（无行/空值）默认不绘制；zero 恢复补 0' },
    { key: 'connectGaps', label: '连接缺口', type: 'boolean', group: 'display', static: true, default: false,
      description: '缺口处用虚线连接相邻观测段' },
    { key: 'lineStyle', label: '线形', type: 'enum', group: 'view', static: true, default: 'smooth',
      values: [
        { value: 'smooth', label: '平滑' }, { value: 'straight', label: '直线' }, { value: 'step', label: '阶梯' },
      ], description: '插值方式' },
    { key: 'fill', label: '填充', type: 'enum', group: 'view', static: true, default: 'none',
      values: [
        { value: 'none', label: '无' }, { value: 'area', label: '面积' }, { value: 'stack', label: '堆叠' },
      ], description: '线下填充；stack 按系列累计' },
    { key: 'window', label: '窗口', type: 'enum', group: 'view', static: false, default: 'all',
      values: [
        { value: 'all', label: '全部' }, { value: 'first6', label: '前 6 点' },
        { value: 'last6', label: '近 6 点' }, { value: 'last12', label: '近 12 点' },
      ], description: '显示的数据窗口' },
    { key: 'hatch', label: '纹理线', type: 'boolean', group: 'style', static: true, default: false,
      description: '线为纹理虚线样式，配合 mono 配色可无颜色辨识' },
    { key: 'marker', label: '标记', type: 'enum', group: 'style', static: true, default: 'circle',
      values: [
        { value: 'circle', label: '圆点' }, { value: 'square', label: '方块' },
        { value: 'diamond', label: '菱形' }, { value: 'none', label: '无' },
      ] },
    { key: 'lineWidth', label: '线宽', type: 'enum', group: 'style', static: true, default: '2.4',
      values: [
        { value: '1.6', label: '细' }, { value: '2.4', label: '中' }, { value: '3.4', label: '粗' },
      ] },
    { key: 'endLabels', label: '端点数值', type: 'boolean', group: 'display', static: true, default: false,
      description: '每系列末端显示数值标签' },
  ],
  inference: [
    '数值列 = 解析率 ≥80% 的列',
    'label 命中时间格式 → 时间轴语义，推荐时 ≥12 个点加分',
    '重复 label+series 组合求和并警告',
    '缺失/NA 默认不绘制（gap），可设 options.missingValue=zero 恢复补 0',
  ],
  example: { csv: '月份,线上,线下\n1月,420,300\n2月,460,330' },
  staticExport: true,
  legacyTemplate: 'line-basic',
};
