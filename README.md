# Virta

> Data in motion.

**Virta** 是一个数据可视化工具研发项目：把散乱的数据，变成可探索、可讲述、可复用的视图系统。

- 项目名：Virta
- npm 包 / CLI：`virta`
- 短命令：`vt`
- 包命名空间：`@virta/*`
- 定位：数据可视化工具，不止画图，更组织视角、证据和叙事
- 维护方式：单一维护者（Devin）

## 仓库结构

```text
legacy-vizscape/         # 上一代 Python 实现（vizscape）：可运行的参考实现
packages/contracts/      # 公共类型契约（Series / ChartData / ViewSpec / ViewState / VizError）
packages/data-engine/    # 数据模型、normalize、transform、aggregation、adapter
packages/chart-core/     # 几何、scale、layout、hit-testing、渲染管线
packages/design-system/  # token 值、主题、icon、视觉基元
packages/chart-skin/     # 图表皮肤：轴、网格、tooltip、legend、annotation 样式
apps/playground/         # 能力验证演练场
docs/adr/                # 架构决策记录
snapshots/               # 视觉回归基线
```

## 调用示例（目标形态）

```bash
npm install virta
pnpm add @virta/core @virta/design-system
npx virta render examples/sales.csv --view line
vt inspect examples/sales.csv
```

## legacy-vizscape

当前可运行的实现是 `legacy-vizscape/`（Python，输出零依赖单文件 HTML）：

```bash
cd legacy-vizscape
python vizscape.py list                               # 列出模板
python vizscape.py inspect examples/sample.csv        # 识别数据并推荐图形
python vizscape.py render examples/sample.csv --view auto
python vizscape.py schema                             # 图族输入契约（给 Agent 用）
```

新骨架按包边界从 legacy 迁移：解析与数据模型 → `data-engine`，几何与渲染 → `chart-core`，主题与图表皮肤 → `design-system` / `chart-skin`；公共类型集中在 `contracts/`，契约级变更记录到 `docs/adr/`。
