# Virta 动态表 / 多维透视表（grid-basic）输入契约

动态表回答**「精确值是什么、怎么切着看」**——不一定要画图。一个模板两种模式，页内互切。

## 1. 输入

**任意行式表格**（csv / json / xlsx），无固定列要求：

- **数值列** = 解析率 ≥80% 的列（自动识别，全量数值别名兼容）；
- **维度列** = 其余列；
- 空值显示 `—` 并计数；行数 >5000 截断并警告。

```csv
地区,渠道,品类,月份,销售额,销量
华东,线上,整机,1月,1200,34
```

## 2. 两种模式

**明细模式**（`--view grid`）：

- 列头点击排序（升 → 降 → 原序循环，数值按值排、文本按中文 locale 排）；
- 全文搜索（跨全部可见列，180ms 防抖）；
- 列显隐 chips；分页 50 行/页。

**透视模式**（`--view pivot`）：

- 行维度 ≤2 级（两级时嵌套展示，一级组自动小计）；
- 列维度 ≤1 级（列展开）；
- 值列任选其一数值列；聚合：sum / count / avg / min / max；
- 合计行 + 合计列自动；
- 行组按聚合值降序。

初始模式：显式 `--view grid|pivot` 优先；否则 ≥2 维度列且有数值列 → 透视，否则明细。

## 3. auto 推荐

`inspect` / `--view auto` 遇到 **≥3 个维度列且 ≥1 数值列** 的数据时推荐 grid（比硬画图诚实）：

```
RECOMMEND --view grid  # auto: 4 维度列 × 2 数值列 → grid（多维表）
```

## 4. 命令

```powershell
python vizscape.py render data.csv --view grid --theme light --out out/grid.html
python vizscape.py render data.csv --view pivot --theme light --out out/pivot.html
python vizscape.py schema grid   # Agent 取完整契约 JSON
```
