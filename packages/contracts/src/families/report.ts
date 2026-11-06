import type { ChartContract } from '../contract.js';

// report-basic：md/txt 文档报告页（KPI 卡、目录、篇幅条、指标表、识别报告）
export const CONTRACT_REPORT: ChartContract = {
  version: 1,
  view: 'report',
  aliases: [],
  title: '文档报告',
  summary: 'Markdown/纯文本 → 结构化报告页：KPI 卡、目录、指标表、数据识别报告',
  roles: [
    { role: 'doc', label: '文档', type: 'text', required: true, aliases: [], note: '.md/.txt 输入；不做表格角色映射' },
  ],
  variants: [],
  options: [
    { key: 'fontSize', label: '字号', type: 'enum', group: 'view', static: true, default: '15',
      values: [{ value: '14', label: '小' }, { value: '15', label: '标准' }, { value: '16.5', label: '大' }] },
    { key: 'wide', label: '宽版', type: 'boolean', group: 'view', static: true, default: false,
      description: '正文栏加宽' },
  ],
  inference: [
    '指标抽取：数字+单位句式 → KPI 卡与指标表',
    '链接协议白名单校验（http/https/mailto/锚点），图片占位',
    '输出指标数、章节数、表格数与置信度',
  ],
  example: { csv: '' },
  staticExport: true,
  legacyTemplate: 'report-basic',
  flow: true,
};
