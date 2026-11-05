import type { ChartContract } from '../contract.js';

// sunburst-basic：旭日图（N 层 + 下钻 + 面包屑）
export const CONTRACT_SUNBURST: ChartContract = {
  version: 1,
  view: 'sunburst',
  aliases: [],
  title: '旭日图',
  summary: 'N 层层级占比；按列顺序成层级 ≤4 层；点击下钻 + 面包屑',
  roles: [
    { role: 'level', label: '层级', type: 'category', required: true, multiple: true, aliases: [], note: '任意非数值列，按列顺序成层级，≤4 层' },
    { role: 'value', label: '数值', type: 'number', required: true, aliases: [], note: '最后一个数值列，叶子聚合' },
  ],
  variants: [],
  options: [
    { key: 'arcLabels', label: '弧上标签', type: 'boolean', group: 'display', static: true, default: true,
      description: '扇弧上显示层级名；过窄扇区自动隐藏' },
    { key: 'equalAngle', label: '等角', type: 'boolean', group: 'view', static: true, default: false,
      description: '同级扇区均分角度（忽略数值），默认按值占比' },
  ],
  inference: [
    '空层级单元格压缩路径',
    '同名兄弟合并',
    '负值剔除并警告',
    '占比 <0.5% 扇区计入识别报告',
  ],
  example: { csv: '部门,类目,事项,金额\n研发,人力,薪酬,5200' },
  staticExport: true,
  legacyTemplate: 'sunburst-basic',
};
