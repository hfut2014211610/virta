import type { ChartContract } from '../contract.js';

// rank：横向排行（static / race），T1 新视图（M6）
export const CONTRACT_RANK: ChartContract = {
  version: 1,
  view: 'rank',
  aliases: ['排行', '排名'],
  title: '排行榜',
  summary: '横向条形按值降序；race 变体按时间列分帧，state.time 选帧，帧间补间',
  roles: [
    { role: 'label', label: '条目', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '名称', '城市', '门店', '产品', '条目'] },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '得分'] },
    { role: 'time', label: '时间', type: 'category', required: false, aliases: ['time', 'date', 'day', '月份', '日期', '时间', '期'], note: '有 → race 分帧' },
  ],
  variants: [
    { id: 'static', label: '静态', description: '单帧排行（默认）' },
    { id: 'race', label: '动态', description: '按时间分帧，可切帧/播放' },
  ],
  options: [
    { key: 'missingValue', label: '缺失值', type: 'enum', group: 'data', static: true, default: 'gap',
      values: [{ value: 'gap', label: '留空' }, { value: 'zero', label: '补 0' }],
      description: '未观测点（无行/空值）默认不绘制；zero 恢复补 0' },
    { key: 'connectGaps', label: '连接缺口', type: 'boolean', group: 'display', static: true, default: false,
      description: '缺口处用虚线连接相邻观测段' },
    { key: 'topN', label: '展示条数', type: 'number', group: 'view', static: true, default: 10, min: 3, max: 30,
      description: '超过的条目合并为「其他」' },
    { key: 'order', label: '排序', type: 'enum', group: 'view', static: true, default: 'desc',
      values: [{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }] },
    { key: 'others', label: '合并其他', type: 'boolean', group: 'view', static: true, default: true },
    { key: 'valueLabels', label: '数值标签', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'texture', label: '纹理', type: 'enum', group: 'style', static: true, default: 'none',
      values: [{ value: 'none', label: '无' }, { value: 'hatch', label: '斜纹' }, { value: 'dots', label: '点纹' }, { value: 'grid', label: '网格' }] },
    { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'multi',
      values: [{ value: 'multi', label: '多色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
  ],
  inference: [
    '同一 label+time 多行求和并警告',
    'race 帧序按时间列字典序',
  ],
  example: { csv: '城市,销售额\n北京,482\n上海,470' },
  staticExport: true,
};
