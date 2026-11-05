# AGENTS.md · Virta 实施指南

> 唯一设计与计划来源：`docs/plan/NEXT_PHASE.md`（Phase 2 · Rev 2）。冲突以该文为准；未覆盖的细节按其 §0.3 处理并追加到 `docs/adr/IMPLEMENTATION_NOTES.md`。

## 硬性规则（R1–R8）

- R1 `legacy-vizscape/` 冻结：不加功能不修 bug，只作参考与 golden 数据来源。
- R2 依赖只用 `docs/adr/0007` 白名单内精确版本；新增须发布满 7 天并写 ADR。
- R3 产物 HTML 离线可开：不引 CDN，字体/脚本/数据全内联。
- R4 每个里程碑结束 `npm run typecheck && npm test` 全绿后本地提交，**不 push**。
- R5 本期不做地图（§13 预留）；字体已授权联网下载。
- R6 UI 文案简体中文，集中在 `packages/viewer/src/i18n/zh-CN.ts` 与 contract 文案；标识符用英文。
- R7 契约级变更（contracts 类型、CLI 参数、JSON 回执）必须写/更新 `docs/adr/`。
- R8 不删不覆盖用户未提交改动；`git status` 出现非本人改动先停下记录。

## 常用命令

```bash
npm run typecheck      # tsc -b 全仓类型检查
npm test               # vitest 单元/集成/golden 对拍
npm run test:e2e       # CLI 端到端（test/e2e/）
npm run test:visual    # Playwright 视觉回归（test/visual/，基线在 snapshots/）
npm run test:visual:update   # 更新视觉基线（以 Linux CI 为准）
npm run test:perf      # 性能预算（test/perf/）
npm run build          # esbuild → viewer dist/<view>.js 与 cli dist/cli.js
npm run virta -- <cmd> # 运行 CLI（tsx 直跑源码），如 npm run virta -- render x.csv --view bar
npm run packs:gen      # 生成场景包数据（固定种子，确定性）
npm run packs:check    # 重生成并与已提交文件比对
npm run golden:dump    # Python 导出 legacy model JSON → packages/data-engine/test/golden/
npm run gallery        # 生成画廊
```

## 结构速查

- `packages/contracts` 类型契约 v1（§4）；`design-system` token/主题/配色/字体/CSS；
  `data-engine` 读取/画像/适配/推荐/校验/洞察（同构，`/node` 子路径做文件 IO）；
  `chart-core` Scene/比例尺/度量/渲染器/命中/补间/避让；`chart-skin` 轴/图例/tooltip/标注/卡片框；
  `charts` 图族 layout；`viewer` 页面壳与交互；`cli` 命令行。
- 依赖只能自上而下（contracts→…→cli），由 `test/deps-direction.test.ts` 强制。
- `examples/basic` 最小样例（legacy 迁移）；`examples/packs` 场景包；`examples/edge-cases` 边界用例。
- `scripts/golden` legacy 导出；`scripts/packs` 生成器；`scripts/fonts` 字体管线；`scripts/build.mjs` 构建。

## 验证（每里程碑 DoD 基线）

`npm run typecheck && npm test` 全绿 → 更新本文件 → `git status` 干净 → 本地提交（不 push）。

## 里程碑状态

- [x] M0 基线收口与工程脚手架
- [x] M1 契约与设计系统（20 视图 ChartContract + ViewSpec JSON Schema + tokens/色板/OKLCH 色阶/buildCss + 子集字体管线）
- [x] M2 数据引擎（同构读取 CSV/JSON/XLSX + GB18030 回退；17 图族 legacy 适配器 32/32 golden 对拍；画像 profile + §5.1 打分表推荐 top5 + 契约校验 validate + 中文洞察 insights/counts；5 个场景包 + edge-cases 由 `npm run packs:gen` 确定性生成、`packs:check` 比对；doc 管线 buildDoc）
- [ ] M3 渲染栈纵切（bar + line）
- [ ] M4 legacy 图族迁移（B1/B2/B3）
- [ ] M5 Agent 能力收尾与组合页
- [ ] M6 T1 新图表与分面
- [ ] M7 T2 新图表
- [ ] M8 Demo、画廊与视觉打磨
- [ ] M9 legacy 归档（需用户确认对等清单）
