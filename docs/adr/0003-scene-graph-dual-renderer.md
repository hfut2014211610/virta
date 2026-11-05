# ADR-0003 场景图 + 双渲染器

- 状态：已接受
- 日期：2026-11-05
- 决策：D8、D9、D4

## 决定

- 每个图族的 layout 只产出与平台无关的 `Scene`（group/rect/path/line/circle/text + defs + hits），颜色在 layout 阶段解析为具体色值，渲染器不认识 CSS 变量。
- 双渲染器：`drawCanvas`（交互，DPR + Path2D + 命中测试网格索引 + 补间）与 `toSVG`（静态，确定性输出、坐标 2 位小数、属性顺序固定）。
- PNG = SVG 经 `@resvg/resvg-js` 光栅化；交互版与静态版共用同一份几何。
- **确定性文字度量**：布局统一用内置字宽表 `measureText`（CJK 1.0em、mono 0.6em、拉丁查 metrics.json 表），Node 与浏览器布局一致，不依赖 DOM `measureText`。标签避让统一留 4px 余量。

## 理由

同一 Scene 既满足交互（命中、补间、tooltip）又满足静态导出（离线 SVG/PNG），避免两套几何实现漂移；确定性度量让测试可以在无浏览器环境对拍布局。
