import type { ChartContract } from '../contract.js';

// er：实体关系图（简版——实体框+字段行+引用连线）
export const CONTRACT_ER: ChartContract = {
  version: 1,
  view: 'er',
  aliases: ['erd', 'schema'],
  title: 'ER图',
  summary: '实体-字段方框 + 外键引用连线；简版按网格排布',
  roles: [
    { role: 'entity', label: '实体', type: 'text', required: true, aliases: ['entity', 'table', '实体', '表', '表名', '对象'] },
    { role: 'field', label: '字段', type: 'text', required: true, aliases: ['field', 'column', 'attr', '字段', '列', '属性', '名称'] },
    { role: 'type', label: '类型', type: 'category', required: false, aliases: ['type', 'datatype', '类型', '数据类型'], note: 'int/varchar 等；PK/FK 参与强调' },
    { role: 'ref', label: '引用', type: 'text', required: false, aliases: ['ref', 'references', 'fk', '引用', '引用表', '外键', '关联表'], note: '指向的实体名，形成连线' },
  ],
  variants: [{ id: 'grid', label: '网格', description: '实体网格排布' }],
  options: [
    { key: 'fieldTypes', label: '字段类型', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'edgeLabels', label: '连线标签', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'texture', label: '纹理', type: 'enum', group: 'style', static: true, default: 'none',
      values: [{ value: 'none', label: '无' }, { value: 'hatch', label: '斜纹' }, { value: 'dots', label: '点纹' }, { value: 'grid', label: '网格' }] },
    { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'multi',
      values: [{ value: 'multi', label: '多色' }, { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' }] },
  ],
  inference: ['字段行按实体归并为方框', '引用列 → 实体间连线', 'PK/FK 行加粗标注'],
  example: { csv: '实体,字段,类型,引用\n用户,用户ID,PK,\n订单,订单ID,PK,\n订单,用户ID,FK,用户' },
  staticExport: true,
};
