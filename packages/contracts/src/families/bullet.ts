import type { ChartContract } from '../contract.js';

// bullet：KPI 子弹图 阈值带 + 目标线
export const CONTRACT_BULLET: ChartContract = {
  version: 1,
  view: 'bullet',
  aliases: [],
  title: '子弹图',
  summary: 'KPI 达标面板：实际长条 + 目标刻线 + poor/good 阈值带',
  roles: [
    { role: 'label', label: '指标', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '缺省取第一列' },
    { role: 'actual', label: '实际', type: 'number', required: true, aliases: ['actual', 'value', '实际', '实际值', '本期值', '完成值'] },
    { role: 'target', label: '目标', type: 'number', required: true, aliases: ['target', 'goal', '目标', '目标值', '计划值', 'plan', '指标目标'], note: '与 actual 成对' },
    { role: 'poor', label: '较差线', type: 'number', required: false, aliases: ['poor', 'low', 'bad', 'bad_max', '差', '较差线', '较差上限', '差阈值'], note: '阈值带；缺省按量程 55%' },
    { role: 'good', label: '良好线', type: 'number', required: false, aliases: ['good', 'high', 'ok', 'good_min', '好', '良好线', '良好下限', '好阈值'], note: '缺省按量程 80%' },
    { role: 'max', label: '量程', type: 'number', required: false, aliases: ['max', 'scale', 'upper', '上限', '量程'], note: '参与量程估计；全图统一量程' },
  ],
  variants: [],
  options: [
    { key: 'sort', label: '排序', type: 'enum', group: 'view', static: false, default: 'original',
      values: [
        { value: 'original', label: '原顺序' }, { value: 'ratio', label: '达成率 低→高' }, { value: 'gap', label: '差距 大→小' },
      ] },
    { key: 'onlyBehind', label: '只看落后', type: 'boolean', group: 'view', static: false, default: false,
      description: '过滤到未达标指标' },
    { key: 'gapLabels', label: '差距标注', type: 'boolean', group: 'display', static: true, default: true,
      description: '显示 实际-目标 差距' },
    { key: 'scale', label: '刻度', type: 'boolean', group: 'display', static: true, default: true,
      description: '底部量程刻度' },
  ],
  inference: [
    '达成度 = actual/target 自动判定状态色（达标/接近/落后）',
    'poor/good 缺省按量程 55%/80% 估计',
    'max 缺省时全图取统一量程',
  ],
  example: { csv: '指标,实际,目标\n营收,820,1000\n毛利,46,50' },
  staticExport: true,
  legacyTemplate: 'bullet',
};
