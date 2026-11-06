import type { ChartContract } from '../contract.js';

// bar-basic：分组/堆叠/100%堆叠/Pareto/瀑布 + 3 表面 × 3 配色 + 3 形状 + 伪3D
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
    { key: 'missingValue', label: '缺失值', type: 'enum', group: 'data', static: true, default: 'gap',
      values: [{ value: 'gap', label: '留空' }, { value: 'zero', label: '补 0' }],
      description: '未观测点（无行/空值）默认不绘制；zero 恢复补 0' },
    { key: 'finish', label: '表面', type: 'enum', group: 'style', static: true, default: 'flat',
      values: [
        { value: 'flat', label: '纯色' }, { value: 'outline', label: '描边' }, { value: 'hatch', label: '斜纹' },
      ], description: '柱体表面质感；hatch 适合不依赖颜色的场景' },
    { key: 'colorMode', label: '配色', type: 'enum', group: 'style', static: true, default: 'gradient',
      values: [
        { value: 'mono', label: '单色' }, { value: 'gradient', label: '渐变' },
        { value: 'multi', label: '多色' }, { value: 'value', label: '按数值' },
      ], description: '单色=预设主色；渐变=系列色纵向渐变；多色=系列色平涂；按数值=顺序色阶（|值| 越大越饱和）。预设色板为二级输入 spec.palette' },
    { key: 'shape', label: '形状', type: 'enum', group: 'style', static: true, default: 'round',
      values: [
        { value: 'round', label: '圆角' }, { value: 'rect', label: '直角' }, { value: 'pill', label: '胶囊' },
      ], description: '柱体轮廓；伪 3D 仅 round/rect 且 grouped/stacked/pct 时可用' },
    { key: 'depth3d', label: '伪 3D', type: 'boolean', group: 'style', static: true, default: false,
      description: '侧向厚度立体效果；非 round/rect 形状或 pareto/waterfall 时自动关闭' },
    { key: 'valueLabels', label: '数值标签', type: 'boolean', group: 'display', static: true, default: false,
      description: '柱顶显示数值；多系列柱宽 <18px 时自动隐藏' },
  ],
  inference: [
    '数值列 = 解析率 ≥80% 的列',
    '重复 label+series 组合求和并警告',
    '缺失/NA 默认不绘制（gap），可设 options.missingValue=zero 恢复补 0line 加分',
    '百分号保留原刻度（10% = 10）并警告',
    'pct/pareto 在可见系列含负值时禁用并回退 grouped',
    'colorMode=value（按数值）时斜纹失效；waterfall 锁定涨跌语义色；渐变需纯色底（描边/斜纹下回退多色）',
  ],
  example: { csv: '月份,产品A,产品B\n1月,120,80\n2月,150,95' },
  staticExport: true,
  legacyTemplate: 'bar-basic',
};
