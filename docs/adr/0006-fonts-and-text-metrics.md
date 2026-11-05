# ADR-0006 字体与文字度量（含地图搁置说明）

- 状态：已接受
- 日期：2026-11-05
- 决策：D9、R3、R5；§5.2

## 决定

- 字体角色：`display`（Fraunces，仅拉丁）、`body`（中文系统栈）、`mono`（JetBrains Mono）。联网下载已获授权。
- 流程（`scripts/fonts/`）：官方来源下载 → SHA-256 记入 `packages/design-system/fonts/SOURCE.md` → instancer 固定 Fraunces 两个静态实例（opsz=72, wght=300/500）→ 子集化（拉丁/标点区间，保留 kern/tnum/lnum，每个 TTF ≤40KB）→ 授权文件 OFL-*.txt → `metrics.json` 字宽表。
- 使用：HTML 内联 base64 `@font-face`（`font-display:block`）；resvg 用 `fontBuffers` 加载同一 TTF；中文字体不内嵌（体积），PNG 缺字形时回执给 `FONT_FALLBACK` 警告。
- 下载确实失败时退回纯系统字体栈并在 IMPLEMENTATION_NOTES 记录为未完成项，不得静默跳过。
- 禁止中文斜体：标题强调用 `--acc` + 字重。

## 地图说明

地图本期搁置（用户决定）：不装 d3-geo/topojson-client/mapshaper，不下载边界数据。预留设计（含 `--geo` 参数、adcode 匹配、审图号合规）保留在 `docs/plan/NEXT_PHASE.md` §13，重启时单独开里程碑并补 ADR。
