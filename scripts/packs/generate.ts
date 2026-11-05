// scripts/packs/generate.ts · 场景包 + edge-cases 数据生成器（§8.2）。
// mulberry32 固定种子 → 确定性输出；packs:gen 写入、packs:check 重新生成比对。
// 用法：tsx scripts/packs/generate.ts [--out <dir>]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 确定性 RNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(20251114);
const rnd = (lo: number, hi: number) => lo + R() * (hi - lo);
const rndi = (lo: number, hi: number) => Math.round(rnd(lo, hi));
const pick = <T>(xs: T[]) => xs[Math.floor(R() * xs.length)];

// ---------- CSV 工具 ----------
const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) =>
  [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
const n0 = (v: number) => Math.round(v);
const n1 = (v: number) => Math.round(v * 10) / 10;

type File = { name: string; text?: string; binary?: Uint8Array };
const files: File[] = [];
const emit = (pack: string, name: string, text: string) =>
  files.push({ name: path.posix.join('examples/packs', pack, name), text });
const emitEdge = (name: string, text: string) =>
  files.push({ name: path.posix.join('examples/edge-cases', name), text });

const MONTHS: string[] = [];
for (let y = 2024; y <= 2025; y++) for (let m = 1; m <= 12; m++) MONTHS.push(`${y}-${String(m).padStart(2, '0')}`);
const M2025 = MONTHS.slice(12);
const DAYS_2025: string[] = (() => {
  const out: string[] = [];
  const d = new Date(Date.UTC(2025, 0, 1));
  while (d.getUTCFullYear() === 2025) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
})();
const WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ============================================================ ① retail
function retail() {
  // monthly_sales：月份×3 渠道，双11 峰、2 月春节谷、2025-08 线下 -22%
  const rows: unknown[][] = [];
  MONTHS.forEach((m, mi) => {
    const month = Number(m.slice(5)), year = m.slice(0, 4);
    for (const ch of ['线上', '线下', '社群']) {
      let v = (ch === '线上' ? 420 : ch === '线下' ? 300 : 120) * (1 + mi * 0.008);
      v *= 1 + 0.15 * Math.sin((month - 3) / 12 * Math.PI * 2);
      if (month === 11) v *= ch === '线上' ? 1.9 : 1.3;
      if (month === 2) v *= 0.62;
      if (year === '2025' && month >= 8 && ch === '线下') v *= 0.78;
      v *= rnd(0.95, 1.05);
      rows.push([m, ch, n0(v), n0(v * rnd(4.2, 5.4))]);
    }
  });
  emit('retail', 'monthly_sales.csv', csv(['月份', '渠道', '销售额', '订单数'], rows));

  // category_tree：一级<二级<系列（distinct 递增 → sunburst）
  const tree: [string, Record<string, string[]>] = ['x', {
    大家电: { 冰箱: ['对开门', '三门'], 洗衣机: ['滚筒', '波轮'], 空调: ['挂机', '柜机'] },
    数码: { 手机: ['旗舰机', '中端机', '入门机'], 笔记本: ['轻薄本', '游戏本'], 平板: ['标准版'] },
    配件: { 手机配件: ['保护壳', '充电器', '耳机'], 电脑配件: ['键鼠', '扩展坞', '支架'], 穿戴: ['表带'] },
    家居: { 厨房: ['锅具', '刀具'], 清洁: ['拖把', '收纳'] },
  }];
  const t2: unknown[][] = [];
  for (const [l1, l2s] of Object.entries(tree[1])) {
    for (const [l2, l3s] of Object.entries(l2s)) {
      for (const l3 of l3s) {
        let v = rnd(80, 900);
        if (l1 === '配件') v *= 1.45; // 配件贡献主要增量
        t2.push([l1, l2, l3, n0(v)]);
      }
    }
  }
  emit('retail', 'category_tree.csv', csv(['一级品类', '二级品类', '系列', '销售额'], t2));

  // funnel_jul_aug：5 阶段 × 2 月，8 月加购→下单 -9pt
  const fr: unknown[][] = [];
  const f7 = [10000, 3200, 1450, 1180, 1080], f8 = [10600, 3350, 1520, 1120, 1030];
  ['曝光', '点击', '加购', '下单', '支付'].forEach((s, i) => {
    fr.push([s, '7月', f7[i]], [s, '8月', f8[i]]);
  });
  emit('retail', 'funnel_jul_aug.csv', csv(['阶段', '月份', '人数'], fr));

  // traffic_paths：无环 DAG
  const paths: [string, string, number][] = [
    ['搜索引擎', '首页', 6800], ['直接访问', '首页', 4200], ['社媒', '活动页', 3100], ['社媒', '首页', 900],
    ['首页', '品类页', 5900], ['首页', '搜索页', 2800], ['首页', '活动页', 1400], ['活动页', '商品页', 1200],
    ['品类页', '商品页', 5100], ['搜索页', '商品页', 1900], ['商品页', '加购', 2600], ['商品页', '收藏', 900],
    ['加购', '下单', 2100], ['收藏', '下单', 300], ['下单', '支付', 1900], ['支付', '复访', 600],
  ];
  emit('retail', 'traffic_paths.csv', csv(['source', 'target', 'value'], paths.map((p) => [p[0], p[1], n0(p[2] * rnd(0.9, 1.1))])));

  // store_hours：星期×小时(8-22)，周末晚高峰 → heatmap matrix（列名 小时 命中 HEAT_Y）
  const hr: unknown[][] = [];
  WEEK_CN.forEach((w, wi) => {
    for (let h = 8; h <= 22; h++) {
      let v = 40 + 60 * Math.exp(-(((h - 19) / 3.4) ** 2)) + (h >= 11 && h <= 13 ? 30 : 0);
      if (wi >= 5) v *= 1.8;
      hr.push([w, h, n0(v * rnd(0.9, 1.1))]);
    }
  });
  emit('retail', 'store_hours.csv', csv(['星期', '小时', '客流'], hr));

  // profit_bridge：瀑布
  emit('retail', 'profit_bridge.csv', csv(['阶段', '金额', '类型'], [
    ['期初毛利', 5200, 'absolute'], ['商品销售', 8600, 'delta'], ['增值服务', 1240, 'delta'],
    ['营销费用', -3150, 'delta'], ['物流成本', -980, 'delta'], ['退换损耗', -640, 'delta'],
    ['平台佣金', -1720, 'delta'], ['其他收支', 230, 'delta'], ['期末净利', 6780, 'absolute'],
  ]));

  // kpi：2 项未达标
  emit('retail', 'kpi.csv', csv(['指标', '实际', '目标', '较差线', '良好线', '量程', '上期'], [
    ['GMV增速', 18, 20, 8, 16, 30, 14], ['复购率', 34, 36, 20, 32, 50, 31], ['客单价', 268, 260, 200, 250, 350, 255],
    ['新客占比', 22, 30, 15, 26, 40, 28], ['履约时效', 91, 90, 70, 85, 100, 88], ['退货率', 8, 9, 12, 10, 5, 9],
  ]));

  // price_volume：SKU×(均价,销量,毛利,品类) 60 行，2 个高价高量离群
  const pv: unknown[][] = [];
  const cats = ['数码', '家电', '配件', '家居', '服饰'];
  for (let i = 0; i < 58; i++) {
    const price = n0(rnd(30, 800));
    pv.push([`SKU-${String(i + 1).padStart(3, '0')}`, price, n0(Math.max(10, 4000 / Math.sqrt(price) * rnd(0.6, 1.5))), n0(price * rnd(0.08, 0.3)), pick(cats)]);
  }
  pv.push(['SKU-901', 3200, 2600, 610, '数码'], ['SKU-902', 2800, 2200, 500, '数码']);
  emit('retail', 'price_volume.csv', csv(['SKU', '均价', '销量', '毛利', '品类'], pv));

  // order_values：渠道×客单价 ~600，社群右偏
  const ov: unknown[][] = [];
  for (let i = 0; i < 600; i++) {
    const ch = pick(['线上', '线上', '线下', '线下', '社群']);
    const v = ch === '社群' ? Math.min(900, rnd(60, 200) + R() ** 3 * 700) : ch === '线上' ? rnd(80, 420) : rnd(120, 520);
    ov.push([ch, n1(v)]);
  }
  emit('retail', 'order_values.csv', csv(['渠道', '客单价'], ov));

  // city_rank_monthly：城市×月份（月份在前 → line 形态；race 待 M7 启用 expectTop）
  const cities = ['上海', '北京', '深圳', '杭州', '成都', '广州'];
  const cr: unknown[][] = [];
  MONTHS.forEach((m, mi) => {
    cities.forEach((c, ci) => {
      let v = rnd(200, 700) * (1 + mi * 0.01) * (1 - ci * 0.08);
      if (c === '成都' && mi >= 20) v *= 1.6; // 9 月进前三
      cr.push([m, c, n0(v)]);
    });
  });
  emit('retail', 'city_rank_monthly.csv', csv(['月份', '城市', '销售额'], cr));

  // channel_yoy：渠道,2024,2025（英文+数字列名 → compare）
  emit('retail', 'channel_yoy.csv', csv(['渠道', '2024', '2025'], [
    ['线上', 5120, 6380], ['线下', 3860, 3010], ['社群', 980, 1520], ['直播', 640, 1180],
    ['会员店', 420, 560], ['闪购', 260, 480], ['分销', 180, 210], ['自营', 720, 890],
  ]));
}

// ============================================================ ② saas
function saas() {
  // dau_daily：365 天，6/15 阶跃、国庆低谷、周末周期 → heatmap calendar
  const dr: unknown[][] = DAYS_2025.map((d) => {
    const dt = new Date(d + 'T00:00:00Z'), md = +d.slice(5, 7), dd = +d.slice(8);
    const dow = dt.getUTCDay();
    let v = 8200 * (1 + (+d.slice(8, 10) - 1 + (md - 1) * 30) / 365 * 0.12);
    if (d >= '2025-06-15') v *= 1.22;
    if (d >= '2025-10-01' && d <= '2025-10-07') v *= 0.58;
    if (dow === 0 || dow === 6) v *= 0.82;
    return [d, n0(v * rnd(0.95, 1.05))];
  });
  emit('saas', 'dau_daily.csv', csv(['date', 'dau'], dr));

  // cohort_retention：cohort×period，6 月后批次留存高
  const cr: unknown[][] = [];
  for (let c = 0; c < 12; c++) {
    const base = c >= 5 ? 0.46 : 0.38;
    for (let p = 0; p <= Math.min(11, 11 - Math.max(0, c - 5)); p++) {
      cr.push([`2025-${String(c + 1).padStart(2, '0')}`, p, n0(1000 * (p === 0 ? 1 : base * Math.exp(-0.18 * (p - 1))) * rnd(0.94, 1.06))]);
    }
  }
  emit('saas', 'cohort_retention.csv', csv(['cohort', 'period', 'users'], cr));

  emit('saas', 'feature_usage.csv', csv(['维度', '基础版', '专业版', '企业版'], [
    ['协作', 42, 71, 88], ['文档', 66, 78, 82], ['自动化', 18, 54, 76], ['集成', 8, 32, 79],
    ['报表', 35, 62, 70], ['移动端', 55, 58, 61],
  ]));

  const op: [string, string, number][] = [
    ['注册页', '激活引导', 8200], ['广告落地', '注册页', 5400], ['邀请链接', '注册页', 2300], ['自然搜索', '注册页', 3100],
    ['激活引导', '创建工作区', 6100], ['激活引导', '流失', 2100], ['创建工作区', '邀请成员', 4400],
    ['邀请成员', '成员接受', 2600], ['成员接受', '首次协作', 2300], ['创建工作区', '首次协作', 1500],
    ['首次协作', '次日回访', 2000], ['次日回访', '付费转化', 900], ['首次协作', '模板试用', 1200],
    ['模板试用', '次日回访', 800], ['付费转化', '扩容增购', 380], ['成员接受', '流失', 300],
  ];
  emit('saas', 'onboarding_paths.csv', csv(['source', 'target', 'value'], op.map((p) => [p[0], p[1], n0(p[2] * rnd(0.92, 1.08))])));

  emit('saas', 'arr_bridge.csv', csv(['阶段', '金额', '类型'], [
    ['期初ARR', 4200, 'absolute'], ['新签', 1180, 'delta'], ['扩容', 1560, 'delta'], ['续费调整', 240, 'delta'],
    ['流失', -720, 'delta'], ['降级', -310, 'delta'], ['期末ARR', 6150, 'absolute'],
  ]));

  const cue: unknown[][] = [];
  const tiers: [string, number, number][] = [['标准', 800, 2400], ['专业', 1500, 5200], ['企业', 4200, 11800]];
  const chans = ['搜索广告', '内容营销', '渠道分销', '口碑转介'];
  for (let i = 0; i < 12; i++) {
    const t = pick(tiers), ch = pick(chans);
    const cac = t[1] * rnd(0.8, 1.25), ltv = t[2] * (ch === '渠道分销' && t[0] === '企业' ? rnd(0.55, 0.72) : rnd(2.2, 4.2)) / t[1] * cac;
    cue.push([ch, n0(cac), n0(ltv), rndi(20, 400), t[0]]);
  }
  emit('saas', 'channel_unit_econ.csv', csv(['channel', 'cac', 'ltv', 'customers', 'tier'], cue));

  const nps: unknown[][] = [];
  for (let i = 0; i < 900; i++) {
    const v = pick(['基础版', '基础版', '专业版', '专业版', '专业版', '企业版']);
    const s = v === '专业版' ? (R() < 0.5 ? rndi(30, 55) : rndi(70, 95)) : v === '企业版' ? rndi(55, 90) : rndi(20, 75);
    nps.push([v, s]);
  }
  emit('saas', 'nps_scores.csv', csv(['版本', '评分'], nps));

  emit('saas', 'roadmap.csv', csv(['task', 'start', 'end', 'group', 'progress', 'status', 'owner', 'deps', 'milestone'], [
    ['需求评审', '2025-03-03', '2025-03-14', '平台', 100, 'done', '林晓', '', ''],
    ['协作空间-后端', '2025-03-17', '2025-05-09', '协作空间', 100, 'done', '赵工', '需求评审', ''],
    ['协作空间-前端', '2025-03-24', '2025-05-23', '协作空间', 100, 'done', '周舟', '需求评审', ''],
    ['协作空间-联调', '2025-05-26', '2025-06-13', '协作空间', 100, 'done', '赵工', '协作空间-后端;协作空间-前端', ''],
    ['协作空间上线', '2025-06-15', '2025-06-15', '协作空间', 100, 'done', '林晓', '协作空间-联调', 'milestone'],
    ['权限体系重构', '2025-04-07', '2025-06-27', '平台', 85, 'active', '陈曦', '需求评审', ''],
    ['SSO 对接', '2025-07-01', '2025-08-08', '平台', 40, 'active', '陈曦', '权限体系重构', ''],
    ['审计日志', '2025-07-14', '2025-08-29', '平台', 15, 'active', '吴用', '权限体系重构', ''],
    ['移动端 3.0', '2025-06-02', '2025-08-15', '移动', 55, 'active', '周舟', '', ''],
    ['离线模式', '2025-08-18', '2025-09-26', '移动', 0, 'todo', '周舟', '移动端 3.0', ''],
    ['BI 报表', '2025-07-07', '2025-09-12', '数据', 30, 'delayed', '吴用', '', ''],
    ['数据导出 V2', '2025-09-15', '2025-10-24', '数据', 0, 'todo', '吴用', 'BI 报表', ''],
    ['AI 摘要', '2025-08-04', '2025-09-19', '智能', 20, 'active', '钱进', '', ''],
    ['智能搜索', '2025-09-22', '2025-11-14', '智能', 0, 'todo', '钱进', 'AI 摘要', ''],
    ['V3.0 发布', '2025-11-28', '2025-11-28', '发布', 0, 'todo', '林晓', 'SSO 对接;离线模式;数据导出 V2;智能搜索', 'milestone'],
    ['安全渗透测试', '2025-10-08', '2025-10-31', '发布', 0, 'todo', '外包', 'SSO 对接', ''],
  ]));

  const mm: unknown[][] = M2025.map((m, i) => {
    const arpa = i < 6 ? n0(205 - i * 2) : n0(198 - (i - 6) * 6); // Q3 ARPA 下降
    return [m, n0(320 * (1 + i * 0.045)), n0(1560 * (1 + i * 0.05)), arpa];
  });
  emit('saas', 'mrr_metrics.csv', csv(['月份', 'MRR', '付费客户数', 'ARPA'], mm));

  emit('saas', 'plans_compare.csv', csv(['套餐', '上半年', '下半年'], [
    ['免费版', 14200, 15800], ['基础版', 3100, 3360], ['专业版', 980, 1290], ['企业版', 210, 305], ['旗舰定制', 12, 18],
  ]));
}

// ============================================================ ③ quality
function quality() {
  emit('quality', 'defects.csv', csv(['缺陷类型', '数量'], [
    ['焊点虚焊', 462], ['外观划伤', 218], ['尺寸超差', 96], ['标签错贴', 58], ['元件偏移', 52],
    ['涂覆不均', 38], ['螺丝漏打', 24], ['包装破损', 18], ['丝印模糊', 14], ['其他', 20],
  ]));
  emit('quality', 'fishbone.csv', csv(['category', 'cause', 'sub', 'owner'], [
    ['人', '夜班新员工熟练度不足', '培训周期压缩', '生产部'], ['人', '夜班新员工熟练度不足', '师徒带教缺位', '生产部'],
    ['人', '检验员疲劳漏检', '连续加班', '质量部'], ['机', '回流焊温区漂移', '温控传感器老化', '设备部'],
    ['机', '回流焊温区漂移', '保养周期超期', '设备部'], ['机', '贴片机吸嘴磨损', '', '设备部'],
    ['料', '焊膏批次粘度波动', '供应商更换', '采购部'], ['料', 'PCB 受潮', '仓储湿度超标', '仓储部'],
    ['法', 'SPI 参数阈值过宽', '', '工艺部'], ['法', '首件确认流于形式', '班组长未签字', '工艺部'],
    ['环', '车间静电累积', '加湿机故障', '厂务部'], ['环', '夜班照明不足', '', '厂务部'],
    ['测', 'AOI 误判率高', '样板库未更新', '质量部'], ['测', '抽检频次不足', '', '质量部'],
  ]));
  // daily_defect_rate：3 产线×90 天，3 号线 9 月 3 点超 UCL + 8 点同侧
  const ddr: unknown[][] = [];
  const d0 = new Date('2025-07-04T00:00:00Z');
  for (let i = 0; i < 90; i++) {
    const d = new Date(d0); d.setUTCDate(d.getUTCDate() + i);
    const ds = d.toISOString().slice(0, 10);
    for (const line of ['1号线', '2号线', '3号线']) {
      let rate = line === '3号线' ? rnd(0.8, 2.2) : rnd(0.6, 1.8);
      if (line === '3号线' && ds >= '2025-09-10' && ds <= '2025-09-17') rate = rnd(2.6, 3.4); // 连续 8 点偏高
      if (line === '3号线' && ['2025-09-12', '2025-09-15', '2025-09-21'].includes(ds)) rate = rnd(4.0, 4.6); // 超 UCL
      ddr.push([ds, line, n1(rate), rndi(180, 320)]);
    }
  }
  emit('quality', 'daily_defect_rate.csv', csv(['日期', '产线', '不良率', '样本量'], ddr));

  const lh: unknown[][] = [];
  for (const line of ['1号线', '2号线', '3号线', '4号线', '5号线']) {
    for (let h = 0; h < 24; h++) {
      let v = rnd(2, 12);
      if (h >= 2 && h <= 5) v += 14; // 夜班高峰
      if (line === '3号线' && h >= 2 && h <= 5) v += 8;
      lh.push([line, h, n0(v)]);
    }
  }
  emit('quality', 'line_shift_heat.csv', csv(['产线', '小时', '不良数'], lh));

  const pt: unknown[][] = [];
  const procs: [string, number, number][] = [['贴片', 42, 4], ['回流焊', 58, 16], ['插件', 36, 5], ['波峰焊', 48, 6], ['测试', 65, 8], ['包装', 22, 3]];
  for (let i = 0; i < 800; i++) { const [p, mu, sd] = pick(procs); pt.push([p, n1(Math.max(5, mu + (R() + R() + R() - 1.5) * 2 * sd))]); }
  emit('quality', 'process_times.csv', csv(['工序', '耗时秒'], pt));

  emit('quality', 'yield_kpi.csv', csv(['产线', '实际良率', '目标', '较差线', '良好线'], [
    ['1号线', 97.2, 97, 94, 96.5], ['2号线', 96.8, 97, 94, 96.5], ['3号线', 92.1, 97, 94, 96.5],
    ['4号线', 97.5, 97, 94, 96.5], ['5号线', 96.1, 96, 94, 95.5],
  ]));

  const lmo: unknown[][] = [];
  for (const line of ['1号线', '2号线', '3号线', '4号线', '5号线']) {
    M2025.forEach((m, i) => lmo.push([line, m, n0(rnd(8200, 12000) * (1 + i * 0.005))]));
  }
  emit('quality', 'line_month_output.csv', csv(['产线', '月份', '产量'], lmo));

  const sb: unknown[][] = [];
  for (let i = 0; i < 200; i++) {
    const temp = rnd(225, 265), speed = rnd(60, 110);
    const bad = Math.max(0.2, 1.2 + (temp - 248) * 0.09 + (speed - 85) * 0.05 + rnd(-0.5, 0.5));
    sb.push([`B-${String(i + 1).padStart(3, '0')}`, n1(temp), n1(rnd(0.8, 1.6)), n0(speed), n1(rnd(38, 62)), n1(bad), pick(['1号线', '2号线', '3号线'])]);
  }
  emit('quality', 'sensor_batches.csv', csv(['批次', '温度', '压力', '速度', '湿度', '不良率', '产线'], sb));
}

// ============================================================ ④ delivery
function delivery() {
  emit('delivery', 'plan.csv', csv(['task', 'start', 'end', 'group', 'progress', 'status', 'owner', 'deps', 'milestone'], [
    ['需求冻结', '2025-08-04', '2025-08-04', '规划', 100, 'done', '产品', '', 'milestone'],
    ['技术方案评审', '2025-08-05', '2025-08-15', '规划', 100, 'done', '架构组', '需求冻结', ''],
    ['支付网关改造', '2025-08-18', '2025-09-26', '后端', 45, 'delayed', '王猛', '技术方案评审', ''],
    ['订单服务拆分', '2025-08-18', '2025-09-12', '后端', 90, 'active', '李倩', '技术方案评审', ''],
    ['风控规则引擎', '2025-09-01', '2025-10-10', '后端', 30, 'active', '赵工', '支付网关改造', ''],
    ['前端新版结算页', '2025-09-08', '2025-10-17', '前端', 25, 'active', '周舟', '订单服务拆分', ''],
    ['小程序适配', '2025-09-22', '2025-10-24', '前端', 10, 'active', '周舟', '前端新版结算页', ''],
    ['集成测试', '2025-10-20', '2025-11-07', '测试', 0, 'todo', '测试组', '风控规则引擎;小程序适配', ''],
    ['性能压测', '2025-10-27', '2025-11-07', '测试', 0, 'todo', '测试组', '风控规则引擎', ''],
    ['UAT 验收', '2025-11-10', '2025-11-21', '发布', 0, 'todo', '产品', '集成测试', ''],
    ['灰度发布', '2025-11-24', '2025-11-28', '发布', 0, 'todo', '运维', 'UAT 验收', ''],
    ['V3.0 全量', '2025-12-01', '2025-12-01', '发布', 0, 'todo', '运维', '灰度发布', 'milestone'],
    ['数据迁移方案', '2025-08-18', '2025-09-05', '数据', 100, 'done', '吴用', '技术方案评审', ''],
    ['历史订单迁移', '2025-09-08', '2025-10-03', '数据', 60, 'active', '吴用', '数据迁移方案', ''],
    ['对账平台升级', '2025-09-15', '2025-10-31', '数据', 20, 'active', '吴用', '历史订单迁移', ''],
    ['安全编码规范', '2025-08-11', '2025-08-22', '安全', 100, 'done', '安全组', '', ''],
    ['渗透测试', '2025-11-03', '2025-11-14', '安全', 0, 'todo', '安全组', '集成测试', ''],
    ['客服话术培训', '2025-11-10', '2025-11-21', '运营', 0, 'todo', '运营', 'UAT 验收', ''],
    ['监控告警接入', '2025-10-13', '2025-10-31', '运维', 15, 'active', '运维', '风控规则引擎', ''],
    ['回滚预案演练', '2025-11-17', '2025-11-21', '运维', 0, 'todo', '运维', '监控告警接入', ''],
    ['商户结算联调', '2025-09-29', '2025-10-24', '后端', 35, 'active', '李倩', '支付网关改造', ''],
    ['发票服务改造', '2025-10-13', '2025-11-14', '后端', 0, 'todo', '王猛', '商户结算联调', ''],
    ['文档与 API 更新', '2025-10-27', '2025-11-14', '平台', 0, 'todo', '平台', '发票服务改造', ''],
    ['渠道通知', '2025-11-24', '2025-11-28', '运营', 0, 'todo', '运营', '回滚预案演练', ''],
  ]));
  const bd: unknown[][] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date('2025-09-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    const plan = n0(240 - i * 8);
    let act = 240 - i * (i < 15 ? 6.2 : 8.6); // 第 3 周追赶前偏离
    bd.push([d.toISOString().slice(0, 10), plan, n0(Math.max(8, act + rnd(-4, 4)))]);
  }
  emit('delivery', 'burndown.csv', csv(['日期', '计划剩余', '实际剩余'], bd));

  // bug_flow：状态流转含回流（有环 → network）
  emit('delivery', 'bug_flow.csv', csv(['source', 'target', 'value'], [
    ['提交', '待评审', 186], ['待评审', '开发中', 152], ['待评审', '驳回', 24], ['开发中', '待测试', 138],
    ['待测试', '集成测试', 121], ['集成测试', '已修复', 88], ['集成测试', '重新打开', 33],
    ['重新打开', '开发中', 30], ['已修复', '回归通过', 84], ['回归通过', '关闭', 82],
    ['已修复', '重新打开', 6], ['待测试', '开发中', 12], ['开发中', '重新打开', 2], ['提交', '重复', 10],
  ]));

  const et: unknown[][] = [];
  const teams: Record<string, Record<string, string[]>> = {
    支付组: { 网关: ['新接口', '联调'], 结算: ['批价', '对账'] },
    前端组: { 结算页: ['改版', '埋点'], 小程序: ['适配'] },
    测试组: { 自动化: ['用例补齐', '性能脚本'], 手工: ['探索测试'] },
    数据组: { 迁移: ['清洗', '校验'], 报表: ['指标口径'] },
  };
  for (const [t, mods] of Object.entries(teams)) for (const [m, types] of Object.entries(mods))
    for (const ty of types) et.push([t, m, ty, n0(rnd(20, 160))]);
  emit('delivery', 'effort_tree.csv', csv(['团队', '模块', '任务类型', '工时'], et));

  emit('delivery', 'req_funnel.csv', csv(['阶段', '需求数'], [
    ['收集', 128], ['初审', 86], ['排期', 52], ['开发', 34], ['验收', 28], ['上线', 26],
  ]));
  emit('delivery', 'team_skill.csv', csv(['维度', '前端组', '后端组', '测试组'], [
    ['编码规范', 82, 88, 70], ['架构设计', 68, 85, 55], ['自动化测试', 62, 58, 90],
    ['性能优化', 66, 78, 60], ['业务理解', 74, 80, 72], ['文档能力', 58, 52, 76],
  ]));
  const sd: unknown[][] = [];
  const services = ['api-gw', 'order-svc', 'pay-svc', 'risk-svc', 'user-svc', 'msg-svc', 'settle-svc', 'invoice-svc', 'report-svc', 'auth-svc'];
  for (let i = 0; i < 30; i++) {
    const a = pick(services); let b = pick(services);
    while (b === a || (a === 'settle-svc' && b === 'pay-svc')) b = pick(services);
    sd.push([a, b, rndi(200, 9000), rndi(4, 120)]);
  }
  sd.push(['settle-svc', 'pay-svc', 420, 35]); // 一个回流环
  emit('delivery', 'service_deps.csv', csv(['source', 'target', 'calls', 'latency_ms'], sd));

  const org: unknown[][] = [['T0', '', '技术部', 'root', 0]];
  const depts: [string, string[]][] = [
    ['支付中心', ['网关组', '结算组', '风控组']], ['前端中心', ['业务前端组', '小程序组']],
    ['质量中心', ['功能测试组', '自动化组']], ['数据中心', ['数仓组', 'BI组']], ['平台中心', ['基础架构组', '运维组']],
  ];
  let id = 1;
  for (const [d, teams2] of depts) {
    const did = `T${id++}`;
    org.push([did, 'T0', d, 'dept', 0]);
    for (const t of teams2) org.push([`T${id++}`, did, t, 'team', rndi(4, 12)]);
  }
  emit('delivery', 'org.csv', csv(['id', 'parent', 'name', 'role', 'headcount'], org));

  const dd: unknown[][] = [];
  const modules = ['支付网关', '订单中心', '结算平台', '风控引擎', '用户中心', '消息平台', '发票服务', '报表平台', '权限中心', '搜索服务', '缓存层', '配置中心', '网关BFF', '对账服务', '审计日志'];
  for (const m of modules) {
    const kloc = rndi(8, 80), bugs = m === '支付网关' ? 96 : rndi(4, 60);
    dd.push([m, kloc, bugs, rndi(0, Math.max(3, bugs / 6))]);
  }
  emit('delivery', 'defect_density.csv', csv(['模块', '千行代码', '缺陷数', '严重缺陷'], dd));

  emit('delivery', 'weekly_report.md', `# V3.0 第 12 周周报

## 交付进度
- 支付网关改造进度 45%，计划完成时间滞后 6 天。
- 订单服务拆分完成率 90%，本周交付 3 个接口。
- 累计缺陷 412 个，其中严重缺陷 38 个，本周新增缺陷 27 个，修复 41 个。

## 质量指标
| 指标 | 数值 | 环比 |
| --- | --- | --- |
| 缺陷修复率 | 68% | +4% |
| 集成测试通过率 | 82% | -6% |
| 自动化覆盖率 | 74% | +2% |
| 平均修复时长 | 1.8 天 | -0.3 天 |
| 线上故障数 | 1 起 | -2 起 |

## 风险
支付网关改造是关键路径，延期将直接影响 11 月集成测试窗口。
`);
}

// ============================================================ ⑤ finance
function finance() {
  emit('finance', 'budget_vs_actual.csv', csv(['部门', '实际', '预算', '较差线', '良好线'], [
    ['市场部', 1320, 1000, 1300, 1100], ['研发部', 2180, 2200, 2500, 2250], ['销售部', 860, 880, 1000, 900],
    ['运营部', 640, 620, 750, 680], ['人事部', 380, 400, 460, 410], ['财务部', 295, 300, 350, 310],
    ['行政部', 210, 220, 260, 230], ['法务部', 165, 180, 210, 190],
  ]));
  emit('finance', 'profit_bridge.csv', csv(['阶段', '金额', '类型'], [
    ['期初利润', 2850, 'absolute'], ['主营收入', 12600, 'delta'], ['其他收入', 860, 'delta'],
    ['市场投放', -3200, 'delta'], ['人力成本', -4850, 'delta'], ['研发投入', -2180, 'delta'],
    ['管理费用', -1180, 'delta'], ['税费', -690, 'delta'], ['汇兑损益', 120, 'delta'], ['期末净利', 2330, 'absolute'],
  ]));
  const ex: unknown[][] = [];
  const book: Record<string, Record<string, string[]>> = {
    市场部: { 广告投放: ['信息流', '搜索竞价', '品牌广告'], 活动: ['展会', '地推'] },
    研发部: { 人力: ['工资', '社保公积金'], 云资源: ['计算', '存储', '带宽'] },
    销售部: { 差旅: ['机票酒店', '市内交通'], 佣金: ['提成'] },
    运营部: { 内容: ['外包稿酬'], 客服: ['外包坐席', '系统'] },
  };
  for (const [d, subs] of Object.entries(book)) for (const [s, items] of Object.entries(subs))
    for (const it of items) ex.push([d, s, it, n0(rnd(30, 800))]);
  emit('finance', 'expense_tree.csv', csv(['部门', '科目', '明细', '金额'], ex));

  const lg: unknown[][] = [];
  const regions = ['华东', '华南', '华北', '西南'];
  const depts2 = ['市场部', '研发部', '销售部', '运营部'];
  const subjects = ['广告费', '差旅费', '人力成本', '云资源', '办公费'];
  for (let i = 0; i < 600; i++) {
    const amt = n0(rnd(2, 180));
    lg.push([`2025-${String(rndi(1, 12)).padStart(2, '0')}`, pick(depts2), pick(subjects), pick(regions), amt, n0(amt * rnd(0.9, 1.1))]);
  }
  emit('finance', 'ledger.csv', csv(['月份', '部门', '科目', '区域', '金额', '预算'], lg));

  const rm: unknown[][] = M2025.map((m, i) => {
    const rev = n0(980 * (1 + i * 0.02));
    const gm = i >= 9 ? n1(31.5 - (i - 9) * 2.4) : n1(rnd(30, 34)); // Q4 毛利率下滑
    return [m, rev, gm];
  });
  emit('finance', 'revenue_margin.csv', csv(['月份', '营收', '毛利率'], rm));

  const cf: unknown[][] = DAYS_2025.map((d) => {
    const md = +d.slice(5, 7);
    let v = rnd(40, 120) + 20 * Math.sin(md / 12 * Math.PI * 2);
    if (md >= 10) v -= rnd(60, 130); // Q4 现金流承压
    return [d, n1(v)];
  });
  emit('finance', 'cashflow_daily.csv', csv(['date', 'net_cash'], cf));
}

// ============================================================ ⑥ edge-cases
function edges() {
  emitEdge('long-labels.csv', csv(['分类', '数值'], [
    ['这是一个长度超过六十个中文字符的超长分类标签它用于验证图表标签避让和截断策略在各种边界条件下的鲁棒性表现', 120],
    ['Another very long english category label that exceeds sixty characters for label overflow testing', 95],
    ['短标签', 60],
  ]));
  emitEdge('single-row.csv', csv(['分类', '数值'], [['唯一行', 42]]));
  emitEdge('all-zero.csv', csv(['分类', '数值'], [['A', 0], ['B', 0], ['C', 0]]));
  emitEdge('all-negative.csv', csv(['分类', '数值'], [['A', -120], ['B', -85], ['C', -230], ['D', -40]]));
  emitEdge('duplicate-keys.csv', csv(['分类', '数值'], [['A', 10], ['B', 20], ['A', 30], ['B', 15], ['A', 5]]));
  emitEdge('missing-columns.csv', csv(['名称', '备注'], [['甲', 'x'], ['乙', 'y'], ['丙', 'z']]));
  // GBK 编码：字节由 Node 侧 iconv 写入（generate 阶段以 Buffer 产出）
  emitEdge('empty.csv', '');
  emitEdge('header-only.csv', '分类,数值\n');
  emitEdge('mixed-dates.csv', csv(['日期', '数值'], [
    ['2025-01-05', 10], ['2025/02/12', 20], ['2025.3.18', 30], ['2025年4月2日', 40], ['5月6日', 50], ['bad-date', 60],
  ]));
  emitEdge('excel-serials.csv', csv(['日期序列', '数值'], [
    [45678, 100], [45708, 110], [45739, 105], [45769, 130],
  ]));
  emitEdge('xss-label.csv', csv(['分类', '数值'], [
    ['<script>alert(1)</script>', 10], ['</script><img src=x onerror=alert(2)>', 20], ['正常项', 30],
  ]));
  emitEdge('sankey-cyclic.csv', csv(['source', 'target', 'value'], [
    ['A', 'B', 40], ['B', 'C', 30], ['C', 'A', 10], ['C', 'D', 20], ['B', 'D', 12],
  ]));
  emitEdge('waterfall-unknown-marker.csv', csv(['阶段', '金额', '类型'], [
    ['期初', 100, 'absolute'], ['增量', 50, 'delta'], ['未知项', 30, 'weird'], ['损耗', -20, 'delta'], ['期末', 160, 'absolute'],
  ]));
  emitEdge('scatter-missing.csv', csv(['x', 'y', '组别'], [
    [1, 10, 'A'], [2, '', 'A'], ['', 30, 'B'], [4, 40, 'B'], [5, null, 'B'], [6, 60, 'A'],
  ]));
  emitEdge('gantt-dirty-dates.csv', csv(['task', 'start', 'end'], [
    ['任务A', '2025-01-05', '2025-02-01'], ['任务B', '垃圾日期', '2025-03-01'], ['任务C', '2025-03-01', ''], ['任务D', '', ''],
  ]));
}

// ---------- pack.json ----------
interface PackChart { id: string; file: string; question: string; spec: Record<string, unknown>; expectTop?: string; expectInsight?: string }
interface Pack { id: string; title: string; story: string; charts: PackChart[] }
const spec = (view: string, extra: Record<string, unknown> = {}) => ({ version: 1, view, ...extra });

const PACKS: Pack[] = [
  {
    id: 'retail', title: '零售电商 · 2025 年度经营复盘',
    story: '全年 GMV 同比 +18%；8 月华南线下门店调整、大促加购→下单转化下降，Q3 承压；配件品类贡献主要增量。',
    charts: [
      { id: 'trend', file: 'monthly_sales.csv', question: '销售从什么时候开始承压？', spec: spec('line', { options: { fill: 'stack' }, text: { title: '月度销售额', unit: '万元' } }), expectTop: 'line', expectInsight: 'change' },
      { id: 'category', file: 'category_tree.csv', question: '哪条品类线贡献增量？', spec: spec('sunburst'), expectTop: 'sunburst' },
      { id: 'funnel', file: 'funnel_jul_aug.csv', question: '转化在哪一步掉？', spec: spec('funnel'), expectTop: 'funnel', expectInsight: 'bottleneck' },
      { id: 'paths', file: 'traffic_paths.csv', question: '流量怎么走？', spec: spec('sankey'), expectTop: 'sankey' },
      { id: 'hours', file: 'store_hours.csv', question: '客流高峰在什么时候？', spec: spec('heatmap'), expectTop: 'heatmap' },
      { id: 'bridge', file: 'profit_bridge.csv', question: '利润从哪漏的？', spec: spec('bar', { variant: 'waterfall' }), expectTop: 'bar' },
      { id: 'kpi', file: 'kpi.csv', question: '哪些指标没达标？', spec: spec('bullet'), expectTop: 'bullet', expectInsight: 'target' },
      { id: 'pricevol', file: 'price_volume.csv', question: '高价 SKU 卖得动吗？', spec: spec('scatter'), expectTop: 'scatter' },
      { id: 'orderval', file: 'order_values.csv', question: '各渠道客单价分布？', spec: spec('boxplot'), expectTop: 'boxplot' },
      { id: 'cityrank', file: 'city_rank_monthly.csv', question: '城市排名怎么变？', spec: spec('rank', { variant: 'race' }), expectTop: 'rank', expectInsight: 'peak' },
      { id: 'yoy', file: 'channel_yoy.csv', question: '各渠道同比？', spec: spec('compare'), expectTop: 'compare', expectInsight: 'change' },
    ],
  },
  {
    id: 'saas', title: 'SaaS 产品增长 · 2025',
    story: '6/15 协作空间上线后新用户第 4 周留存 38%→46%；企业版 CAC 上升 30%，LTV/CAC 逼近 3 倍警戒线。',
    charts: [
      { id: 'dau', file: 'dau_daily.csv', question: 'DAU 什么时候跃升？', spec: spec('heatmap', { mode: 'calendar' }), expectTop: 'heatmap' },
      { id: 'cohort', file: 'cohort_retention.csv', question: '留存改善了吗？', spec: spec('cohort'), expectTop: 'cohort', expectInsight: 'retention' },
      { id: 'features', file: 'feature_usage.csv', question: '各版本功能使用差异？', spec: spec('radar'), expectTop: 'radar' },
      { id: 'onboarding', file: 'onboarding_paths.csv', question: '新手在哪流失？', spec: spec('sankey'), expectTop: 'sankey' },
      { id: 'arr', file: 'arr_bridge.csv', question: 'ARR 增长结构？', spec: spec('bar', { variant: 'waterfall' }), expectTop: 'bar' },
      { id: 'econ', file: 'channel_unit_econ.csv', question: '渠道经济模型健康吗？', spec: spec('scatter'), expectTop: 'scatter' },
      { id: 'nps', file: 'nps_scores.csv', question: 'NPS 分布形态？', spec: spec('boxplot'), expectTop: 'boxplot' },
      { id: 'roadmap', file: 'roadmap.csv', question: '版本计划会延期吗？', spec: spec('gantt'), expectTop: 'gantt' },
      { id: 'mrr', file: 'mrr_metrics.csv', question: 'ARPA 为什么降？', spec: spec('combo'), expectInsight: 'trend' },
      { id: 'plans', file: 'plans_compare.csv', question: '套餐结构变化？', spec: spec('compare'), expectTop: 'compare', expectInsight: 'change' },
    ],
  },
  {
    id: 'quality', title: '制造质量 · 3 号线不良率异常',
    story: '9 月 3 号线不良率超出控制上限；Pareto 显示焊点虚焊占 46%；鱼骨定位到夜班新员工与回流焊温区漂移。',
    charts: [
      { id: 'pareto', file: 'defects.csv', question: '缺陷集中在哪几类？', spec: spec('bar', { variant: 'pareto' }), expectTop: 'bar', expectInsight: 'concentration' },
      { id: 'fish', file: 'fishbone.csv', question: '根因在哪一环？', spec: spec('fishbone'), expectTop: 'fishbone' },
      { id: 'control', file: 'daily_defect_rate.csv', question: '不良率何时失控？', spec: spec('control'), expectTop: 'control', expectInsight: 'outlier' },
      { id: 'shift', file: 'line_shift_heat.csv', question: '夜班是否更高发？', spec: spec('heatmap'), expectTop: 'heatmap' },
      { id: 'times', file: 'process_times.csv', question: '哪道工序离散大？', spec: spec('boxplot'), expectTop: 'boxplot' },
      { id: 'yield', file: 'yield_kpi.csv', question: '各线良率达标吗？', spec: spec('bullet', { mapping: { actual: '实际良率', target: '目标' } }), expectTop: 'bullet' },
      { id: 'output', file: 'line_month_output.csv', question: '各线月度产出？', spec: spec('matrix3d'), expectTop: 'rank' },
      { id: 'sensor', file: 'sensor_batches.csv', question: '工艺参数与不良的关系？', spec: spec('parallel'), expectTop: 'parallel', expectInsight: 'concentration' },
    ],
  },
  {
    id: 'delivery', title: '研发交付 · V3.0 延期风险',
    story: '关键路径「支付网关改造」滞后 6 天；缺陷回流集中在集成测试阶段。',
    charts: [
      { id: 'plan', file: 'plan.csv', question: '关键路径是什么？', spec: spec('gantt'), expectTop: 'gantt', expectInsight: 'critical-path' },
      { id: 'burndown', file: 'burndown.csv', question: '燃尽偏离了吗？', spec: spec('line'), expectTop: 'line' },
      { id: 'bugflow', file: 'bug_flow.csv', question: '缺陷在哪回流？', spec: spec('network'), expectTop: 'network', expectInsight: 'concentration' },
      { id: 'effort', file: 'effort_tree.csv', question: '工时花在哪？', spec: spec('treemap'), expectTop: 'sunburst', expectInsight: 'concentration' },
      { id: 'reqfunnel', file: 'req_funnel.csv', question: '需求漏斗健康吗？', spec: spec('funnel'), expectTop: 'funnel' },
      { id: 'skill', file: 'team_skill.csv', question: '团队能力短板？', spec: spec('radar'), expectTop: 'radar' },
      { id: 'deps', file: 'service_deps.csv', question: '服务依赖核心在哪？', spec: spec('network'), expectTop: 'network', expectInsight: 'concentration' },
      { id: 'org', file: 'org.csv', question: '组织结构？', spec: spec('tree'), expectTop: 'tree', expectInsight: 'distribution' },
      { id: 'density', file: 'defect_density.csv', question: '哪个模块质量差？', spec: spec('scatter'), expectTop: 'scatter' },
      { id: 'weekly', file: 'weekly_report.md', question: '本周指标？', spec: spec('report') },
    ],
  },
  {
    id: 'finance', title: '预算执行 · 年度费用超支 6.8%',
    story: '年度费用超预算 6.8%，主要来自市场投放 +32%；Q4 经营现金流承压。',
    charts: [
      { id: 'bva', file: 'budget_vs_actual.csv', question: '哪些部门超支？', spec: spec('bullet', { mapping: { actual: '实际', target: '预算' } }), expectTop: 'bullet' },
      { id: 'bridge', file: 'profit_bridge.csv', question: '利润桥怎么走的？', spec: spec('bar', { variant: 'waterfall' }), expectTop: 'bar' },
      { id: 'tree', file: 'expense_tree.csv', question: '费用结构？', spec: spec('sunburst'), expectTop: 'sunburst' },
      { id: 'ledger', file: 'ledger.csv', question: '多维明细怎么切？', spec: spec('grid', { variant: 'pivot' }), expectTop: 'grid' },
      { id: 'margin', file: 'revenue_margin.csv', question: '毛利率何时下滑？', spec: spec('combo'), expectTop: 'combo', expectInsight: 'trend' },
      { id: 'cash', file: 'cashflow_daily.csv', question: '现金流哪些天为负？', spec: spec('heatmap', { mode: 'calendar' }), expectTop: 'heatmap' },
    ],
  },
];

// ---------- README ----------
function readme(p: Pack): string {
  const lines = [`# ${p.title}`, '', p.story, '', '| 图 | 数据 | 回答的问题 |', '| --- | --- | --- |'];
  for (const c of p.charts) lines.push(`| ${c.spec['view']} | ${c.file} | ${c.question} |`);
  return lines.join('\n') + '\n';
}

// ---------- main ----------
retail(); saas(); quality(); delivery(); finance(); edges();
for (const p of PACKS) {
  emit(p.id, 'pack.json', JSON.stringify({ id: p.id, title: p.title, story: p.story, charts: p.charts }, null, 2) + '\n');
  emit(p.id, 'README.md', readme(p));
}
// retail 联动仪表盘（M5 compose；面板引用 pack.json 图表 id）
emit('retail', 'compose.json', JSON.stringify({
  title: '零售电商 · 2025 经营总览',
  layout: 'grid',
  theme: 'light',
  palette: 'signal',
  panels: [
    { chart: 'kpi', w: 4, h: 4 },
    { chart: 'trend', w: 8, h: 4 },
    { chart: 'category', w: 5, h: 5 },
    { chart: 'orderval', w: 4, h: 5 },
    { chart: 'funnel', w: 3, h: 5 },
    { chart: 'paths', w: 7, h: 5 },
    { chart: 'hours', w: 5, h: 5 },
  ],
  links: [{ column: '渠道' }],
}, null, 2) + '\n');

const outRoot = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.resolve(__dirname, '../..');
let n = 0;
for (const f of files) {
  const p = path.join(outRoot, f.name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.binary ?? f.text ?? '');
  n++;
}
console.log(`packs:gen → ${n} files`);
