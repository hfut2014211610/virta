// 别名总表（§5.1）：core.py RAW_*_ALIAS + 各图族私有别名，统一从这里取。
// normKey 语义与 legacy 一致：只保留 [0-9a-zA-Z一-鿿] 并转小写。

export function normKey(k: unknown): string {
  return String(k ?? '').trim().toLowerCase().replace(/[^0-9a-zA-Z一-鿿]+/g, '');
}
const n = (xs: string[]) => xs.map(normKey);

// ---- core.py 共享别名 ----
export const RAW_LABEL_ALIASES = ['label', 'name', 'category', 'x', '分类', '类别', '标签', '名称', '阶段', '指标'];
export const RAW_VALUE_ALIAS = ['value', 'count', 'amount', 'y', '数值', '数量', '金额', '销量', '营收', '增减'];
export const RAW_SERIES_ALIAS = ['series', 'group', '系列', '分组', '渠道', '门店', '城市', '部门'];
export const RAW_TYPE_ALIAS = ['type', 'kind', 'marker', '阶段类型', '类型', '行类型'];
export const RAW_ACTUAL_ALIAS = ['actual', 'value', '实际', '实际值', '本期值', '完成值'];
export const RAW_TARGET_ALIAS = ['target', 'goal', '目标', '目标值', '计划值', 'plan', '指标目标'];
export const RAW_POOR_ALIAS = ['poor', 'low', 'bad', 'bad_max', '差', '较差线', '较差上限', '差阈值'];
export const RAW_GOOD_ALIAS = ['good', 'high', 'ok', 'good_min', '好', '良好线', '良好下限', '好阈值'];
export const RAW_MAX_ALIAS = ['max', 'scale', 'upper', '上限', '量程'];
export const RAW_X_ALIAS = ['x', 'x值', '横轴', '自变量', '投放入', '成本', '投入'];
export const RAW_Y_ALIAS = ['y', 'y值', '纵轴', '因变量', '转化', '收益', '产出'];
export const RAW_SIZE_ALIAS = ['size', '气泡', '气泡大小', '规模', '权重'];

export const LABEL_ALIASES = n(RAW_LABEL_ALIASES);
export const VALUE_ALIAS = n(RAW_VALUE_ALIAS);
export const SERIES_ALIAS = n(RAW_SERIES_ALIAS);
export const TYPE_ALIAS = n(RAW_TYPE_ALIAS);
export const ACTUAL_ALIAS = n(RAW_ACTUAL_ALIAS);
export const TARGET_ALIAS = n(RAW_TARGET_ALIAS);
export const POOR_ALIAS = n(RAW_POOR_ALIAS);
export const GOOD_ALIAS = n(RAW_GOOD_ALIAS);
export const MAX_ALIAS = n(RAW_MAX_ALIAS);
export const X_ALIAS = n(RAW_X_ALIAS);
export const Y_ALIAS = n(RAW_Y_ALIAS);
export const SIZE_ALIAS = n(RAW_SIZE_ALIAS);

export const ABS_TOKENS = new Set(['absolute', 'anchor', 'subtotal', 'total', '小计', '合计', '总计', '累计']);
export const DELTA_TOKENS = new Set(['delta', 'change', 'variance', '增减', '变动', '差额']);

// ---- treemap / pie3d ----
export const TREEMAP_GROUP_ALIAS = n(['大区', '区域', '地区', '大类', '一级', '父类', '部门', '板块', '分组', 'group', 'category2', 'region', 'area']);

// ---- sankey ----
export const SANKEY_SOURCE_ALIAS = n(['source', 'from', 'src', '源', '来源', '起点', '上游', 'fromnode']);
export const SANKEY_TARGET_ALIAS = n(['target', 'to', 'dst', '目标', '去向', '终点', '下游', 'tonode']);

// ---- scatter ----
export const SC_LABEL_ALIAS = n(['label', 'category', '分类', '类别', '标签']);

// ---- scatter3d ----
export const Z_ALIAS = n(['z', 'z值', '竖轴', '深轴', '高度', '深度', 'z轴', '利润', '评分', '数量', '金额', '销量', '权重']);

// ---- boxplot ----
export const BOX_GROUP_ALIAS = n(['group', 'category', '类别', '组', '分组', '产线', '批次', '班级', '组别']);
export const BOX_Q1_ALIAS = n(['q1', '下四分位', 'p25']);
export const BOX_MED_ALIAS = n(['median', 'med', '中位数', 'p50']);
export const BOX_Q3_ALIAS = n(['q3', '上四分位', 'p75']);
export const BOX_MIN_ALIAS = n(['min', '最小值', '下限', 'low']);
export const BOX_MAX_ALIAS = n(['max', '最大值', '上限', 'high']);

// ---- heatmap ----
export const HEAT_X_ALIAS = n(['x', 'col', 'column', '列', '横轴', 'weekday', '星期', '时段', '类目x']);
export const HEAT_Y_ALIAS = n(['y', 'row', '行', '纵轴', 'hour', '小时', '类目y']);
export const HEAT_DATE_ALIAS = n(['date', 'day', '日期', '时间', 'time', 'dt', 'dayord']);

// ---- gantt ----
export const GANTT_TASK_ALIAS = n(['task', '任务', '事项', '工作', '工作项', '活动', 'label', 'name', '名称']);
export const GANTT_START_ALIAS = n(['start', 'begin', 'startdate', '开始', '开始日期', '开始时间', '启动']);
export const GANTT_END_ALIAS = n(['end', 'finish', 'enddate', 'due', 'deadline', '结束', '结束日期', '截止日期', '完成日期']);
export const GANTT_DUR_ALIAS = n(['duration', 'days', 'dur', '工期', '时长', '天数']);
export const GANTT_GROUP_ALIAS = n(['phase', 'lane', 'swimlane', 'module', '阶段', '分组', '模块', '泳道', '部门', 'group', '项目']);
export const GANTT_PROGRESS_ALIAS = n(['progress', 'pct', 'percent', '进度', '完成度', '完成率']);
export const GANTT_STATUS_ALIAS = n(['status', 'state', '状态']);
export const GANTT_OWNER_ALIAS = n(['owner', 'assignee', '负责人', '成员', '责任人']);
export const GANTT_DEPS_ALIAS = n(['deps', 'depends', 'dependson', 'predecessor', 'predecessors', '依赖', '前置', '前置任务', '前置依赖']);
export const GANTT_MILESTONE_TOKENS = new Set(['milestone', 'ms', '里程碑', '节点']);
export const GANTT_STATUS_MAP: Record<string, string> = {};
for (const k of ['done', 'complete', 'completed', 'finished', '完成', '已完成', '已结束']) GANTT_STATUS_MAP[normKey(k)] = 'done';
for (const k of ['active', 'doing', 'wip', 'inprogress', 'ongoing', '进行中', '进行', '执行中']) GANTT_STATUS_MAP[normKey(k)] = 'active';
for (const k of ['delayed', 'delay', 'blocked', 'atrisk', 'risk', '延期', '延迟', '滞后', '风险', '阻塞']) GANTT_STATUS_MAP[normKey(k)] = 'delayed';
for (const k of ['todo', 'planned', 'notstarted', 'backlog', '未开始', '待办', '待定', '计划', '排期中']) GANTT_STATUS_MAP[normKey(k)] = 'todo';

// ---- fishbone ----
export const FISH_CAT_ALIAS = n(['category', 'cat', 'dimension', '类别', '类目', '维度', '大骨', '分类', '分组', 'group', '方面']);
export const FISH_CAUSE_ALIAS = n(['cause', 'reason', '原因', '小骨', '因子', '因素', '问题点', '根因', 'label', 'name', '事项', '原因描述']);
export const FISH_SUB_ALIAS = n(['sub', 'subcause', '子原因', '子因', '孙骨', '二级原因', '细分']);

// ---- T1 新视图（M6）----
export const RANK_TIME_ALIAS = n(['time', 'date', 'day', '月份', '日期', '时间', '期']);
export const RANK_LABEL_ALIAS = n([...RAW_LABEL_ALIASES, ...RAW_SERIES_ALIAS, '城市', '门店', '产品', '国家', '地区', '品牌', '版本', '套餐', '人员', '条目']);
export const HIST_GROUP_ALIAS = n(['group', 'series', '类别', '组', '组别', '分组', '渠道', '版本']);
export const KPI_METRIC_ALIAS = n(['metric', 'kpi', 'label', 'name', '指标', '指标名', '名称', '度量']);
export const KPI_PREV_ALIAS = n(['previous', 'prev', 'last', '上期', '同比', '环比']);
export const COMPARE_FROM_ALIAS = n(['from', 'a', '前期', '上期', '去年', '上半年', 'before', 'old']);
export const COMPARE_TO_ALIAS = n(['to', 'b', '后期', '本期', '今年', '下半年', 'after', 'new']);
export const COHORT_KEY_ALIAS = n(['cohort', '批次', '群', '组', '月份', 'month']);
export const COHORT_PERIOD_ALIAS = n(['period', '期', '第几期', '期数', 'week', 'n']);

// ---- T2 新视图（M7）----
export const TREE_ID_ALIAS = n(['id', '编号', 'code', '节点', 'node', 'nid']);
export const TREE_PARENT_ALIAS = n(['parent', 'pid', '父', '父级', '上级', 'parentid', '父节点', '上级id']);
export const TREE_NAME_ALIAS = n(['name', '名称', '部门', '节点名', 'label', '标题']);
export const CONTROL_DATE_ALIAS = n(['date', 'day', '日期', '时间', '月份', 'time', '批次', '周']);
export const CONTROL_N_ALIAS = n(['n', '样本量', '样本数', '样本大小', 'size', 'count']);
export const CONTROL_UCL_ALIAS = n(['ucl', '控制上限', '上限', 'upperlimit']);
export const CONTROL_LCL_ALIAS = n(['lcl', '控制下限', '下限', 'lowerlimit']);
export const CONTROL_GROUP_ALIAS = n(['group', '产线', '系列', '分组', '班组', '车间']);
export const PARALLEL_GROUP_ALIAS = n(['group', '系列', '类别', '分组', '产线', '版本', '渠道']);
