import type { ChartContract } from '../contract.js';

// grid-basic：动态表 / 多维透视表（detail / pivot）
export const CONTRACT_GRID: ChartContract = {
  version: 1,
  view: 'grid',
  aliases: ['pivot'],
  title: '数据表',
  summary: '明细表与多维透视表；行×列交叉聚合（sum/count/avg/min/max）、合计、滚动分页',
  roles: [
    { role: 'dims', label: '维度列', type: 'any', required: false, multiple: true, aliases: [], note: '任意非数值列；≥2 个时默认进入 pivot' },
    { role: 'values', label: '数值列', type: 'number', required: false, multiple: true, aliases: ['value', '数值', '金额', '数量'], note: '解析率 ≥80% 自动识别；透视的值字段页内可切换' },
    { role: 'link', label: '链接列', type: 'text', required: false, aliases: ['链接', 'url', 'link', 'href', '网址'], note: 'ADR-0009：仅 http(s)/mailto 生效，其他协议去除并报 LINK_UNSAFE' },
    { role: 'tone', label: '行色', type: 'category', required: false, aliases: ['状态', '级别', 'tone', '风险', '警示'], note: 'ADR-0009：danger|warn|ok|info|muted 或中文 高/中/低/严重/提示，给行着色' },
  ],
  variants: [
    { id: 'detail', label: '明细', description: '逐行展示' },
    { id: 'pivot', label: '透视', description: '行列维度交叉聚合；≥2 维度列且有数值列时默认' },
  ],
  options: [
    { key: 'pageSize', label: '每页行数', type: 'number', group: 'display', static: false, default: 50, min: 10, max: 500,
      description: '明细/透视分页大小' },
    { key: 'agg', label: '聚合', type: 'enum', group: 'data', static: true, default: 'sum',
      values: [{ value: 'sum', label: '求和' }, { value: 'count', label: '计数' }, { value: 'avg', label: '均值' }, { value: 'min', label: '最小' }, { value: 'max', label: '最大' }],
      description: '透视模式的度量聚合方式' },
    { key: 'density', label: '密度', type: 'enum', group: 'style', static: true, default: 'comfort',
      values: [{ value: 'comfort', label: '舒适' }, { value: 'compact', label: '紧凑' }],
      description: '行高' },
    { key: 'showTotals', label: '合计', type: 'boolean', group: 'display', static: true, default: true,
      description: '透视模式显示行/列合计' },
    { key: 'zebra', label: '斑马纹', type: 'boolean', group: 'style', static: true, default: true,
      description: '隔行底纹' },
    { key: 'linkText', label: '链接文字列', type: 'string', group: 'data', static: false, default: '',
      description: 'link 角色的 URL 显示为哪一列的文字；缺省取首个文本列' },
  ],
  inference: [
    '数值列 = 解析率 ≥80%',
    '初始模式：≥2 维度列且有数值列 → 透视，否则明细',
    '行数 >5000 截断并警告（TRUNCATED）',
    '空值显示 — 并计数',
  ],
  example: { csv: '地区,渠道,品类,销售额,销量\n华东,线上,整机,1200,34\n华北,线下,配件,860,51' },
  staticExport: true,
  legacyTemplate: 'grid-basic',
  flow: true,
};
