import type { ChartContract } from '../contract.js';

// funnel-basic：转化漏斗图（单系列/多系列）
export const CONTRACT_FUNNEL: ChartContract = {
  version: 1,
  view: 'funnel',
  aliases: [],
  title: '漏斗图',
  summary: '阶段转化漏斗；转化率/流失率自动计算；非递减与负值告警',
  roles: [
    { role: 'label', label: '阶段', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '行顺序 = 阶段顺序' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'] },
    { role: 'series', label: '系列', type: 'category', required: false, aliases: ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'], note: '多漏斗对比' },
  ],
  variants: [
    { id: 'single', label: '单系列', description: '单个漏斗' },
    { id: 'multi', label: '多系列', description: '存在 series 列时多漏斗并排对比', requires: ['series'] },
  ],
  options: [
    { key: 'align', label: '对齐', type: 'enum', group: 'style', static: true, default: 'center',
      values: [{ value: 'center', label: '居中' }, { value: 'left', label: '左对齐' }] },
    { key: 'colorMode', label: '色彩', type: 'enum', group: 'style', static: true, default: 'ramp',
      values: [{ value: 'ramp', label: '渐层' }, { value: 'cat', label: '分类' }] },
    { key: 'finish', label: '质感', type: 'enum', group: 'style', static: true, default: 'gradient',
      values: [
        { value: 'gradient', label: '渐变' }, { value: 'flat', label: '纯色' }, { value: 'glass', label: '玻璃' },
        { value: 'metal', label: '金属' }, { value: 'outline', label: '描边' }, { value: 'papercut', label: '纸雕' },
      ] },
    { key: 'showRates', label: '转化率', type: 'boolean', group: 'display', static: true, default: true,
      description: '级间转化率/流失率标注' },
    { key: 'highlightDrop', label: '高亮最大流失', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    '转化率/流失率自动计算',
    '最大流失级红色标注',
    '阶段数 <2 拒绝',
    '阶段值非递减、负值均告警',
  ],
  example: { csv: '阶段,人数\n访问,10000\n注册,3200\n付费,860' },
  staticExport: true,
  legacyTemplate: 'funnel-basic',
};
