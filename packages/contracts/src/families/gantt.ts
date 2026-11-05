import type { ChartContract } from '../contract.js';

// gantt-basic：甘特图（时间轴 + 日历双视图）
export const CONTRACT_GANTT: ChartContract = {
  version: 1,
  view: 'gantt',
  aliases: [],
  title: '甘特图',
  summary: '任务时间轴/日历双视图；泳道分组、依赖箭头、里程碑、进度、状态',
  roles: [
    { role: 'task', label: '任务', type: 'text', required: true, aliases: ['task', '任务', '事项', '工作', '工作项', '活动', 'label', 'name', '名称'] },
    { role: 'start', label: '开始', type: 'date', required: true, aliases: ['start', 'begin', 'startdate', '开始', '开始日期', '开始时间', '启动'], note: '日期或相对天数（D+n）' },
    { role: 'end', label: '结束', type: 'date', required: false, aliases: ['end', 'finish', 'enddate', 'due', 'deadline', '结束', '结束日期', '截止日期', '完成日期'], note: '与 duration 二选一' },
    { role: 'duration', label: '工期', type: 'number', required: false, aliases: ['duration', 'days', 'dur', '工期', '时长', '天数'] },
    { role: 'group', label: '泳道', type: 'category', required: false, aliases: ['phase', 'lane', 'swimlane', 'module', '泳道', '阶段', '分组', '模块', '部门', 'group', '项目'] },
    { role: 'progress', label: '进度', type: 'number', required: false, aliases: ['progress', 'pct', 'percent', '进度', '完成度', '完成率'], note: '0-100' },
    { role: 'status', label: '状态', type: 'category', required: false, aliases: ['status', 'state', '状态'], note: 'done/active/delayed/todo' },
    { role: 'owner', label: '负责人', type: 'category', required: false, aliases: ['owner', 'assignee', '负责人', '成员', '责任人'] },
    { role: 'deps', label: '依赖', type: 'text', required: false, aliases: ['deps', 'depends', 'dependson', 'predecessor', 'predecessors', '依赖', '前置', '前置任务', '前置依赖'], note: '依赖任务名，肘形连线' },
    { role: 'type', label: '类型', type: 'category', required: false, aliases: ['type', '类型'], note: '=milestone 强制里程碑' },
  ],
  variants: [
    { id: 'timeline', label: '时间轴', description: '横向时间刻度' },
    { id: 'calendar', label: '日历', description: '按周泳道排布' },
  ],
  options: [
    { key: 'colorBy', label: '着色', type: 'enum', group: 'style', static: true, default: 'group',
      values: [{ value: 'group', label: '按泳道' }, { value: 'status', label: '按状态' }] },
    { key: 'density', label: '密度', type: 'enum', group: 'style', static: true, default: 'comfort',
      values: [{ value: 'comfort', label: '舒适' }, { value: 'compact', label: '紧凑' }] },
    { key: 'weekendShading', label: '周末底纹', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'deps', label: '依赖连线', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'todayLine', label: '今日线', type: 'boolean', group: 'display', static: true, default: true },
    { key: 'progress', label: '进度', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: [
    '日期多格式（YYYY-MM-DD/中文/紧凑/epoch/Excel 序列号/ISO 时间）',
    '纯数字 → 相对天数 D+n 轴',
    '脏日期剔除并计数（见 GANTT_CHART.md）',
    '日历视图按周泳道排布',
  ],
  example: { csv: '任务,开始,结束,进度,状态\n设计,2026-01-05,2026-01-16,100,done' },
  staticExport: true,
  legacyTemplate: 'gantt-basic',
};
