import type { ChartContract } from '../contract.js';

// sequence：时序图（简版——生命线 + 编号消息箭头）
export const CONTRACT_SEQUENCE: ChartContract = {
  version: 1,
  view: 'sequence',
  aliases: ['seq', 'uml'],
  title: '时序图',
  summary: '参与者生命线 + 按序消息箭头；自调用回环',
  roles: [
    { role: 'from', label: '发起方', type: 'text', required: true, aliases: ['from', 'source', 'caller', '从', '发起', '发起方', '调用方'] },
    { role: 'to', label: '接收方', type: 'text', required: true, aliases: ['to', 'target', 'callee', '到', '接收', '接收方', '被调方'] },
    { role: 'msg', label: '消息', type: 'text', required: false, aliases: ['msg', 'message', 'label', '消息', '动作', '说明', '事件'] },
  ],
  variants: [{ id: 'plain', label: '平铺', description: '消息按序平铺' }],
  options: [
    { key: 'numbers', label: '消息编号', type: 'boolean', group: 'display', static: true, default: true },
  ],
  inference: ['参与者按首现顺序排生命线', '消息按行序自上而下编号', 'from=to → 自调用回环'],
  example: { csv: '从,到,消息\n用户,前端,提交订单\n前端,网关,POST /orders\n网关,订单服务,创建订单' },
  staticExport: true,
};
