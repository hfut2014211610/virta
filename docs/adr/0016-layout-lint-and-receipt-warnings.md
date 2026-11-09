# ADR-0016 版面检查与回执告警（Phase 2d 契约增量）

> 状态：已采纳 · 2026-11-09 · 依据 `docs/plan/PHASE_2D.md` §2（H1–H7）、§3

## 背景

Phase 2c 发布后第五轮审查发现两类系统性问题：交互失效（D1 悬停提示从不显示、
D2 组合页无悬停）与呈现质量退化（D3–D9：标题回退英文 id、标签重叠、值域越零、
treemap 退化等），且没有任何测试/回执能发现它们（D10）。本期引入版面检查器与
对应回执告警，并让 tooltip 的 DOM 位置不再被渲染器清掉。

## 决策

### 1. 回执告警码（`RenderReceipt.warnings` / `ComposeReceipt.warnings`）

`QualityCode` 新增四项，`QualityIssue` 新增可选字段 `hint?: string`：

| code | level | 字段 |
|---|---|---|
| `LAYOUT_TEXT_OVERLAP` | warn | `count`、`examples`（≤5 条，形如「华东 120」×「杭州 80」重叠 N%） |
| `LAYOUT_TEXT_CLIPPED` | warn | `count`、`examples` |
| `LAYOUT_LOW_CONTRAST` | warn | `count`、`examples`（detail 含实测对比度） |
| `TITLE_MISSING` | info | `hint: '--title "…"'` |

- `ErrorCode` 与退出码不变：版面问题不阻断导出，Agent 可据告警调整参数重试。
- compose 的每条面板告警在 `message` 前缀「面板「id」」。
- 非有限坐标（lint ④）属 error 级内部问题，不进回执（出现即视为渲染缺陷）。

### 2. 版面检查器（`chart-core/src/lint.ts`）

`lintScene(scene, measure, opts?): LayoutIssue[]`，阈值写成导出常量：

- `LINT_OVERLAP_RATIO = 0.15`：两文本包围盒相交面积 > 较小者 15% 记重叠（旋转文字
  按旋转后轴对齐包围盒）。`error`
- `LINT_CLIP_TOLERANCE = 2`：文本包围盒超出画布 2px 以上。`error`
- `LINT_MIN_CONTRAST = 3`：文字色与背景 WCAG 对比度 < 3:1。背景取包含文字中心的
  最上层 rect 填充色（带透明度先与 paper 混合），无则取 paper。`warn`
- 任意节点数值字段（含 path `d`）出现 NaN/Infinity。`error`

`measure` 注入 `MeasureFn`（Node 用 `measureText`；浏览器如需更精度量可换实现）。
调用点：`cli/render.ts`（合帧后整幅）与 `cli/compose.ts`（逐面板实际尺寸）。

### 3. 页面 DOM 结构（viewer 内部，非公共契约，记录供测试引用）

```html
<div id="chart-box">
  <div id="chart-stage">…渲染目标…</div>
  <div id="tooltip" role="tooltip"></div>
</div>
```

- 一切渲染写入（SVG、错误提示、flow-doc/flow-table）只写 `#chart-stage`；
  `#chart-box` 保留尺寸测量、`__scene` 挂载、事件监听、滚动容器职责。
- `#tooltip` 与 stage 并列，任何渲染器清空内容都不会触及浮层；每次 mousemove
  经 `$('#tooltip')` 现取，不在启动时缓存。
- 组合页为页面级单个 `position:fixed` 的 `#tooltip`，各面板 mousemove 共享。
- 打印样式隐藏 `#tooltip`；`viewer/src/tooltip.ts` 为单图页/组合页共用实现，
  负责生成转义 HTML 与近右/下边界的翻转定位。

### 4. 面板与静态标题兜底链（H4/H5，记录约定）

`spec.text.title` → pack chart 的 `title` → 契约中文视图名（`contract.title`），
永不显示 chart id 或文件名；未给标题的静态导出追加 `TITLE_MISSING`（info）。

## 影响

- contracts：`QualityCode` +4、`QualityIssue.hint`（可选字段，向后兼容）。
- chart-core：`lint.ts` 新导出，无行为变更。
- cli：render/compose 回执 warnings 可能新增 LAYOUT_* / TITLE_MISSING 条目。
- viewer：`#chart-box` 内多一层 `#chart-stage`；既有选择器 `#chart-box svg`
  为后代选择器，不受影响。
