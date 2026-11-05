# Bullet 子弹图输入契约

> 定位：只回答“指标离目标还差多少，以及落在哪个定性区间”。不做趋势，不做排名比赛，不做复杂对比。

## 适用场景

- KPI 月度/季度对目标达成
- 销售、运营、交付、续费、满意度等“越高越好”指标
- 老板只想先看“哪里低于 80% 和哪里差一点”

不适合：

- 反向指标（越低越好）：请先翻转成正向分数，例如下降 15% → 完成效率 85
- 有正有负的变化量：用瀑布图
- 趋势/预测：用折线图

## 输入 schema

| 列 | 必需 | 别名 |
|---|---|---|
| 分类/指标 | 是 | label, name, category, x, 分类, 类别, 标签, 名称, 指标 |
| 实际值 | 是 | actual, value, 实际, 实际值, 本期值, 完成值 |
| 目标值 | 是 | target, goal, 目标, 目标值, 计划值, plan, 指标目标 |
| 较差线上限 | 否 | poor, low, bad, bad_max, 差, 较差线, 较差上限, 差阈值 |
| 良好线下限 | 否 | good, high, ok, good_min, 好, 良好线, 良好下限, 好阈值 |
| 量程上限 | 否 | max, scale, upper, 上限, 量程 |

## 缺省规则

- `max` 缺省：取 `actual / target / poor / good` 中的最大非空值 × 1.08；若全 0，则量程=1
- `poor` 缺省：`max × 55%`
- `good` 缺省：`max × 80%`
- `poor ≥ good`：回退为默认刻度并警告
- 空值按 0 计，非法值按 0 计；写入数据识别报告
- 不求和重复指标；重复指标名会警告，但不会合并 KPI
- 负值指标：直接报错退出（Bullet 设计为完成度/KPI 场景）

## 视觉语义

- 浅灰底：只能接受
- 中灰底：尚可
- 青绿底：良好
- 长条：actual
- 竖黑线：target
- 左侧色条：达标 / 接近 / 偏离

## 页面交互（模板运行时）

- **布局**：▦ 卡片（每行独立卡片）/ ☰ 紧凑（多行并入同一面板，行高压 20px 轨道，隐藏"目标"文字标签，左边条收窄为 4px）
- **排序**：原顺序 / 达成率 低→高 / 差距 大→小
- **视图**：⚠ 只看落后（只留偏离行；无偏离时给 🎉 空态）· ± 差距标注（行首 chip 显示 +/− 差值）· ┊ 刻度（25/50/75% 竖线）
- **风格**：10 种主色（signal/朱砂/铜绿/蓝图/水墨/单色/落日/敦煌/极光/莫兰迪），只换主色，达标/接近/偏离语义色固定
- ▶ 重播动画：逐行错峰入场；筛选恢复时行也会重播入场（display 切换触发），属预期微交互

## 示例

```bash
python vizscape.py render examples/sample-bullet.csv --template bullet --theme light --out out/sample-bullet-light.html
python vizscape.py render examples/sample-bullet.csv --template bullet --theme dark --out out/sample-bullet-dark.html
```
