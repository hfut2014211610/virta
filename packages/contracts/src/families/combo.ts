import type { ChartContract } from '../contract.js';

// combo：双轴组合图（bar+line / bar+bar / line+line），T1 新视图（M6）
export const CONTRACT_COMBO: ChartContract = {
  version: 1,
  view: 'combo',
  aliases: ['双轴', '组合图'],
  title: '双轴组合图',
  summary: '两个度量共用类目轴：左轴系列与右轴系列分别成柱/线；右轴为百分比时自动用 % 格式',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '月份', '日期'], note: '类目/时间轴' },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '占比', '比率'], note: '恰好 2 个度量列；量级差 >10× 或其一为百分比时推荐' },
    { role: 'axis', label: '右轴列', type: 'any', required: false, aliases: [], note: '用 options.y2Series 指定走右轴的系列名' },
  ],
  variants: [
    { id: 'bar+line', label: '柱+线', description: '左轴柱 + 右轴线（默认）' },
    { id: 'bar+bar', label: '双柱', description: '左右轴都为分组柱' },
    { id: 'line+line', label: '双线', description: '左右轴都为线' },
  ],
  options: [
    { key: 'missingValue', label: '缺失值', type: 'enum', group: 'data', static: true, default: 'gap',
      values: [{ value: 'gap', label: '留空' }, { value: 'zero', label: '补 0' }],
      description: '未观测点（无行/空值）默认不绘制；zero 恢复补 0' },
    { key: 'connectGaps', label: '连接缺口', type: 'boolean', group: 'display', static: true, default: false,
      description: '缺口处用虚线连接相邻观测段' },
    { key: 'y2Series', label: '右轴系列', type: 'enum', group: 'view', static: true, default: 'auto',
      values: [{ value: 'auto', label: '自动（第 2 列）' }, { value: 'first', label: '第 1 列' }, { value: 'second', label: '第 2 列' }],
      description: '哪个度量列走右轴' },
    { key: 'y2Format', label: '右轴格式', type: 'enum', group: 'view', static: true, default: 'auto',
      values: [{ value: 'auto', label: '自动' }, { value: 'percent', label: '百分比' }, { value: 'raw', label: '原始值' }] },
    { key: 'lineStyle', label: '线形', type: 'enum', group: 'style', static: true, default: 'smooth',
      values: [{ value: 'smooth', label: '平滑' }, { value: 'straight', label: '直线' }, { value: 'step', label: '阶梯' }] },
  ],
  inference: [
    '度量列恰为 2 个；y2Series 缺省取第 2 列',
    '右轴列解析为百分比 → 自动 % 刻度',
  ],
  example: { csv: '月份,营收,毛利率\n1月,420,32\n2月,460,35' },
  staticExport: true,
};
