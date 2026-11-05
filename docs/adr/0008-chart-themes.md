# ADR-0008 · 四套可切换图表主题（minimal / sketch / pastel / tech）

## 状态

已接受（M9 主题扩展）。

## 背景

`ViewSpec.theme` 原仅 `'light' | 'dark'` 两套语义色（Meridian / Pulse）。本期要求新增四套可切换图表主题：极简卡片（shadcn 风）、手绘草图（roughviz 风）、现代柔彩（nivo 风）、深色科技（Highcharts dark 风），且要求配色/背景/字体/字号/边框/圆角/网格/坐标轴/图例/标签/提示框/阴影/动效抽象为统一主题配置，按图表语义适配，数据表达不受影响。

## 决策

### 1. 契约：`Theme` 枚举扩为 6 值

- `packages/contracts/src/spec.ts`：`THEME_IDS = ['light','dark','minimal','sketch','pastel','tech']`，`Theme = typeof THEME_IDS[number]`。
- `spec-schema.ts` 的 `theme.enum` 同步；`--theme` CLI 参数与 `compose.json` 的 `theme` 字段同步支持新值，并对未知值报 `INVALID_OPTION`/`INVALID_SPEC`（此前非法值会在 `THEMES[theme]` 处静默崩溃）。
- 这是契约级变更（R7），故立此 ADR；`version` 仍为 1，旧 spec（light/dark）完全兼容。

### 2. 统一主题配置：`ChartTheme = ThemeTokens + ThemeSkin`

- `design-system/src/skins.ts` 新增 `ThemeSkin`：`typeScale`（全局字号倍率）、`grid`（solid/dash/dot/none）、`baseline`（零基线色与宽度）、`legendRadius`、`markStroke`（数据标记细描边）、`markRadiusScale`、`rough`（手绘抖动幅度 px）、`glow`、卡片圆角组（`--r-card/--r-panel/--r-table/--r-tip`）、页面网格纹（`--grid-size/--grid-opacity`）、`colorScheme`。
- `resolveTheme(id): ChartTheme` 把 `THEMES[id]` 色 token 与 `SKINS[id]` 合并。`LayoutContext.tokens` 类型由 `ThemeTokens` 升级为 `ChartTheme`——chart-skin 各函数签名不变（仍收一个 `t`），内部改读 `t.skin.*`，渲染器零改动。
- `light`/`dark` 的 `ThemeSkin` 取值与改造前硬编码完全一致（typeScale=1、grid=solid、baseline ink×1.5、legendRadius=2、圆角 20/16/14/10、网格纹 56px/.6），保证既有视觉基线不受影响。

### 3. 配色：10 套 palette × 6 主题派生

- `PALETTES` 改为由 `BASE`（light/dark 原值）派生：`minimal`/`tech` 直接复用 light/dark 基色；`pastel` 在 OKLCH 向白混合 0.32；`sketch` 按色板序号做确定性色相微旋（±5°）与彩度收敛的蜡笔化。
- `accentFor()` 对 light/dark 保持原回退链（dark 缺省回退 light acc），新主题按明度族回退（minimal/sketch/pastel→light，tech→dark），避免亮色 accent 落在深底。
- `buildCss()` 的 `--acc` 覆盖规则扩展为 (theme × palette) 全组合，与 `accentFor()` 同一解析链；`html[data-theme]` 规则覆盖全部 6 主题并输出皮肤 CSS 变量。

### 4. 渲染管线：`applySkin(scene, skin)` 后处理

- `chart-skin/src/skin.ts`：layout 产出 Scene 后统一应用——text.size × typeScale；rect 圆角 × markRadiusScale；带 `datum` 的填充图元补 `markStroke` 细描边；`stroke` 为 hex 的描边型图元（线/轮廓）加同色 `shadow` 发光（tech）。
- **手绘抖动**：rect/circle/line/path 按"坐标空间哈希"做确定性偏移（同一坐标恒得同一偏移 → 饼图/桑基等相邻图形共享边不错位；重复渲染不闪动）。line 转含中间点的 path，rect/circle 转多边形 path，path 经自写 SVG path 解析器归一化为绝对坐标后逐点抖动（A 命令只抖终点，半径与旗标保持几何语义）。小图元按包围盒减幅，避免抖动吞掉形状。
- hits、defs（渐变/图案/裁剪）不参与处理：命中精度与数据语义不受主题影响；text 不抖动保证读数。
- 接入点：`cli/render.ts`、`cli/compose.ts`、`viewer/runtime.ts`、`viewer/runtime-compose.ts` 在 Scene 定稿后调用。

### 5. 交互与画廊

- 单文件页主题 seg 由 2 键扩为 6 键（`ZH.themeNames`），切换即以同一 spec 重 layout——数据/筛选/配置不变；组合页主题按钮改为 6 主题循环。
- 画廊：删除 `STYLE_CARDS` 风格重复卡（主题皮肤已由主题分组统一呈现）；新增「四套主题 · 同数据对比」分组：bar/line/pie/sankey/network/tree × minimal/sketch/pastel/tech，各出 PNG 缩略图 + 单文件交互页。

## 语义适配说明

- 柱线图：网格/坐标轴由 `skin.grid`/`skin.baseline` 控制；tech 主题线形发光。
- 饼图/矩形树图/桑基/网络/甘特：色块边界由 palette 派生色 + `markStroke` 描边 + rough 抖动共同塑造；桑基/网络节点与连线同为 Scene 图元，统一受益。
- 降级：手绘字体未引入（离线与 resvg 确定性约束，字体栈三主题共用，仅字号/字重变化）；渐变/图案 defs 不抖动（纹理保持清晰）；3D 透视类渲染走同一 Scene 后处理，抖动对伪 3D 挤出面同样生效。

## 结果

- 无新增运行时依赖（全部自实现，OKLCH/空间哈希/path 解析均为本仓代码）。
- `npm run typecheck && npm test` 全绿；light/dark 输出与改造前一致。
