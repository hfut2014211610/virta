# ADR-0007 第三方依赖白名单

- 状态：已接受
- 日期：2026-11-05
- 决策：R2；§3.3

## 运行时依赖（精确版本）

| 包 | 版本 | 用途 | 位置 |
|---|---|---|---|
| papaparse | 5.7.0 | CSV 解析 | data-engine |
| read-excel-file | 9.3.12 | xlsx（`read-excel-file/node`） | data-engine/node |
| @resvg/resvg-js | 2.6.2 | SVG → PNG | cli |

## 开发依赖（root devDependencies）

| 包 | 版本 | 用途 |
|---|---|---|
| typescript | 5.9.2 | 类型检查（不升 7.x） |
| esbuild | 0.28.2 | viewer 分图族 bundle 与 cli 构建 |
| vitest | 4.1.12 | 单元/集成测试 |
| @playwright/test | 1.64.1 | 视觉回归与首屏验收（不进产物链路） |
| tsx | 4.23.15 | 运行 TS 脚本 |
| @types/node | 26.6.6 | Node API 类型（纯类型，不进产物） |
| @types/papaparse | 5.5.2 | papaparse 类型（纯类型，不进产物） |

> @types/* 两个纯类型依赖是 §3.3 白名单外的补充：typecheck 必需、不进入运行时产物，理由记录于 IMPLEMENTATION_NOTES.md。

## 规则

- 一律锁精确版本，不用 `^`/`~`；新增依赖必须是发布满 7 天的版本且先写 ADR。
- Markdown/纯文本解析不引依赖（移植 `docmd.py`）；地图相关依赖本期不安装（§13）。
- Python 侧（`fonttools`、`brotli`、`openpyxl`）只用于 scripts/，pip 安装，不进 npm 依赖。
