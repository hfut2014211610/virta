import type { ChartContract } from '../contract.js';

// parallel：平行坐标，T2 新视图（M7）
export const CONTRACT_PARALLEL: ChartContract = {
  version: 1,
  view: 'parallel',
  aliases: ['平行坐标', '平行轴'],
  title: '平行坐标',
  summary: '多个度量各一轴，每行一条折线；轴可拖动排序、轴上刷选取交集',
  roles: [
    { role: 'values', label: '度量列', type: 'number', required: true, multiple: true, aliases: [], note: '全部数值列，≥2 个；按列序成轴' },
    { role: 'group', label: '分组', type: 'category', required: false, aliases: ['group', '系列', '类别', '分组', '产线', '版本', '渠道'], note: '折线按组着色' },
  ],
  variants: [],
  options: [
    { key: 'opacity', label: '线透明度', type: 'number', group: 'display', static: true, default: 0.4 },
    { key: 'axisRange', label: '轴区间', type: 'enum', group: 'view', static: true, default: 'auto',
      values: [{ value: 'auto', label: '各自值域' }, { value: 'zero', label: '含 0' }] },
  ],
  inference: [
    '≥4 个度量、≥20 行 → 0.6',
    '轴顺序支持运行时拖动（state.axisOrder 持久化）',
    '多轴刷选取交集',
  ],
  example: { csv: '批次,温度,压力,速度,湿度,不良率,产线\nB-001,247.8,0.8,109,58,2.9,3号线' },
  staticExport: true,
};
