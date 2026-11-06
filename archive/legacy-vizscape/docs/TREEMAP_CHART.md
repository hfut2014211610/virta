# Virta 矩形树状图（treemap-basic）输入契约

矩形树状图回答**「份额构成与层级占比」**：矩形面积 ∝ 数值，squarify 布局近似保持方块比例，可读性优于 slice-dice。与 sunburst 互补——treemap 看面积，sunburst 看层级路径。

## 1. 双输入形态（自动判定）

| 形态 | 列 | 说明 |
|---|---|---|
| **两层** | `group` + `label` + `value` | 按组 squarify 分区（带组头），组内再 squarify 子项 |
| **一维** | `label` + `value` | 直接平铺看类别份额 |

```csv
group,label,value
华东,上海,120
华东,杭州,80
```

- 负值 / 0 值剔除并警告；同组同名子项自动合并；
- `value` 取首个数值列，别名全量兼容。

## 2. 交互

- **悬浮浮窗跟随光标**、触边翻转并钳在卡片内——不遮挡命中矩形（v2 修复：旧版浮窗居中压在方块上，且同方块内移动会误清画布）；
- **点击矩形下钻**到该组；面包屑「全部」或 `↑ 返回上级` 回到顶层；
- 图例 chip 点击显隐（顶层按组整组显隐，下钻后按子项）；
- `🏷 标签` / `％ 数值` / `▤ 分组底色` 开关；10 套配色风格 + 双主题；
- 方块内文字亮度自适应（浅色块用深字，深色块用浅字）。

## 3. 命令

```powershell
python vizscape.py render revenue.csv --view treemap --theme light --out out/tm.html
```
