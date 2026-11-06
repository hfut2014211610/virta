# ADR-0001 TypeScript 重写与 legacy 冻结

- 状态：已归档（M9 已执行，`legacy-vizscape → archive/legacy-vizscape`）
- 日期：2026-11-05
- 决策：D1、D5

## 决定

在 `packages/*` 用 TypeScript 重写全部能力（方案 B），`archive/legacy-vizscape/`（Python，vizscape）只作参考实现和 golden 数据来源。

## 约束

- `archive/legacy-vizscape/` **冻结**：不加功能、不修 bug。唯一允许的改动是 `_shared.css` 抽取重构的收口（已在 HEAD 提交 `14b54d7`）。
- golden 对拍：TS adapter 的 model 必须与 `scripts/golden/dump_legacy.py` 导出的 JSON 深比较一致（数值容差 1e-6，数组顺序一致；质量问题只比 code 和 count）。
- 17 个图族达到对等并经用户确认 `docs/plan/M9_PARITY.md` 后，已执行 M9：`git mv legacy-vizscape archive/legacy-vizscape`，本 ADR 状态为"已归档"。golden 静态 JSON 已入库，构建/CI 不依赖 Python。

## 理由

legacy 单文件模板架构无法支撑组合页、静态导出双渲染器和浏览器内重新适配；但它是唯一可运行的语义参考，冻结 + golden 对拍可保证重写不丢失行为。
