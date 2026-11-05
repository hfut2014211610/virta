import type { ChartContract } from '../contract.js';

// fishbone-basic：鱼骨图（因果分析，6M 分类、二级原因、负责人）
export const CONTRACT_FISHBONE: ChartContract = {
  version: 1,
  view: 'fishbone',
  aliases: ['fish'],
  title: '鱼骨图',
  summary: '因果图：category 大骨 + cause 小骨 + sub 孙骨；双向鱼头；图例显隐重排',
  roles: [
    { role: 'category', label: '大骨', type: 'category', required: true, aliases: ['category', 'cat', 'dimension', '类别', '类目', '维度', '大骨', '分类', '分组', 'group', '方面'] },
    { role: 'cause', label: '小骨', type: 'text', required: true, aliases: ['cause', 'reason', '原因', '小骨', '因子', '因素', '问题点', '根因', 'label', 'name', '事项', '原因描述'] },
    { role: 'sub', label: '孙骨', type: 'text', required: false, aliases: ['sub', 'subcause', '子原因', '子因', '孙骨', '二级原因', '细分'], note: '45° 孙骨' },
    { role: 'owner', label: '负责人', type: 'category', required: false, aliases: ['owner', 'assignee', '负责人', '成员', '责任人'], note: '悬浮显示' },
  ],
  variants: [],
  options: [
    { key: 'direction', label: '方向', type: 'enum', group: 'view', static: true, default: 'right',
      values: [{ value: 'right', label: '鱼头向右' }, { value: 'left', label: '鱼头向左' }] },
    { key: 'density', label: '密度', type: 'enum', group: 'style', static: true, default: 'comfort',
      values: [{ value: 'comfort', label: '舒适' }, { value: 'compact', label: '紧凑' }] },
    { key: 'legend', label: '图例', type: 'boolean', group: 'display', static: true, default: true,
      description: '大骨分类图例；点击图例显隐该类并重排（页内交互）' },
  ],
  inference: [
    '去重 + 空 cause 跳过',
    '类间失衡警告',
    '图例点击显隐并重排（页内交互）',
  ],
  example: { csv: '类别,原因,子原因\n人员,技能不足,培训缺失\n设备,老化,' },
  staticExport: true,
  legacyTemplate: 'fishbone-basic',
};
