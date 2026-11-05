# ADR-0002 包架构与依赖方向

- 状态：已接受
- 日期：2026-11-05
- 决策：D7、D12

## 决定

npm workspaces 单仓，包与依赖方向（只能自上而下，禁止反向和循环）：

```text
contracts
   ├── design-system
   ├── data-engine ───────────────────────────┐
   └── chart-core (← design-system)           │
          └── chart-skin                      │
                 └── charts                   │
                        └── viewer (← data-engine)
                               └── cli (← data-engine/node, @resvg/resvg-js)
```

- `@virta/data-engine` 同构：核心不依赖 Node API，浏览器可跑；文件/stdin/xlsx 读取在 `@virta/data-engine/node` 子路径。
- `@virta/charts` 不依赖 data-engine，只接收 adapter 产出的 model。
- 运行环境 Node ≥ 22，纯 ESM，开发期由 tsx / vitest 直接跑 `src/*.ts`（exports 指向源码）；cli 与 viewer bundle 由 esbuild 产出到 dist。
- 依赖方向由 `test/deps-direction.test.ts` 强制检查：解析各包 `dependencies` 与上表对照。

## 理由

保证几何层与数据层解耦，使同一份 model 既能进交互页也能进静态导出；同构 data-engine 使浏览器内联动筛选不需要服务端。
