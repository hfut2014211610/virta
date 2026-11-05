import type { ChartContract } from '../contract.js';

// bar-basic：分组/堆叠/100%堆叠/Pareto/瀑布 + 11 表面 + 9 形状 + 伪3D
export const CONTRACT_BAR: ChartContract = {
  version: 1,
  view: 'bar',
  aliases: [],
  title: '柱状图',
  summary: '通用 label+series 表格模型；单系列、长表、宽表、ECharts 风格 JSON 均可；支持瀑布与 Pareto',
  roles: [
    { role: 'label', label: '分类', type: 'category', required: true, aliases: ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'], note: '缺省取第一列' },
    { role: 'value', label: '数值', type: 'number', required: true, multiple: true, aliases: ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'], note: '宽表时除 label 外每个数值列即一个系列' },
    { role: 'series', label: '系列', type: 'category', required: false, aliases: ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'], note: '长表分组列' },
    { role: 'type', label: '行类型', type: 'category', required: false, aliases: ['type', 'kind', 'marker', '阶段类型', '类型', '行类型'], note: '瀑布/矩阵模式：absolute|delta 标记' },
  ],
  variants: [
    { id: 'grouped', label: '分组', description: '多系列并列' },
    { id: 'stacked', label: '堆叠', description: '系列累计叠加，混合正负分别累计' },
    { id: 'pct', label: '100%堆叠', description: '每类总量归一为 100 看结构占比', disabledWhen: '存在负值' },
    { id: 'pareto', label: 'Pareto', description: '分类小计降序 + 累计占比折线 + 80% 参考线', disabledWhen: '存在负值' },
    { id: 'waterfall', label: '瀑布', description: '增减贡献桥，absolute 行为锚点/小计' },
  ],
  options: [
    { key: 'finish', label: '表面', type: 'enum', group: 'style', static: true, default: 'gradient',
      values: [
        { value: 'gradient', label: '渐变' }, { value: 'flat', label: '纯色' }, { value: 'outline', label: '描边' },
        { value: 'hatch', label: '斜纹' }, { value: 'glass', label: '玻璃' }, { value: 'papercut', label: '纸雕' },
        { value: 'ribbed', label: '竖纹' }, { value: 'dotted', label: '点阵' }, { value: 'metal', label: '金属' },
        { value: 'neon', label: '霓虹' }, { value: 'carve', label: '浮雕' },
      ], description: '柱体表面质感；hatch/dotted/outline 适合不依赖颜色的场景' },
    { key: 'shape', label: '形状', type: 'enum', group: 'style', static: true, default: 'round',
      values: [
        { value: 'round', label: '圆角' }, { value: 'rect', label: '直角' }, { value: 'pill', label: '胶囊' },
        { value: 'dome', label: '穹顶' }, { value: 'taper', label: '梯形' }, { value: 'skew', label: '斜切' },
        { value: 'crystal', label: '尖顶' }, { value: 'barrel', label: '收腰' }, { value: 'notch', label: '缺口' },
      ], description: '柱体轮廓；伪 3D 仅 round/rect 且 grouped/stacked/pct 时可用' },
    { key: 'depth3d', label: '伪 3D', type: 'boolean', group: 'style', static: true, default: false,
      description: '侧向厚度立体效果；非 round/rect 形状或 pareto/waterfall 时自动关闭' },
    { key: 'valueLabels', label: '数值标签', type: 'boolean', group: 'display', static: true, default: false,
      description: '柱顶显示数值；多系列柱宽 <18px 时自动隐藏' },
  ],
  inference: [
    '数值列 = 解析率 ≥80% 的列',
    '重复 label+series 组合求和并警告',
    '缺失/NA 按 0 计并警告',
    'label 命中时间格式时推荐引擎给 line 加分',
    '百分号保留原刻度（10% = 10）并警告',
    'pct/pareto 在可见系列含负值时禁用并回退 grouped',
  ],
  example: { csv: '月份,产品A,产品B\n1月,120,80\n2月,150,95' },
  staticExport: true,
  legacyTemplate: 'bar-basic',
};
