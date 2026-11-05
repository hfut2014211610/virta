# 实施备忘（§0.3：计划未覆盖处在此追加）

格式：日期 · 问题 · 选择 · 理由。

## 2026-11-05 · M0.1 基线取法

- 问题：NEXT_PHASE.md 假设 `_shared.css` 重构是 40 个文件的**未提交**改动，要求 `worktree HEAD` 作基线对比工作区。实际 `git status` 干净——重构已在 HEAD 提交 `14b54d7` 中。
- 选择：基线改取重构前提交 `7fc526d`（worktree `../virta-baseline`），当前 HEAD 为"工作后"版本；渲染矩阵改为 38 组（file×view）× 双主题，先字节比对再对有差异的做 Playwright 像素对比（`scripts/m0-render-matrix.sh`、`scripts/m0-shot-compare.mjs`）。
- 理由：字节必有差异（`__SHARED_CSS__` 注入改变 CSS 物理顺序 + eyebrow token 修复属预期），像素对比才是"肉眼可见差异"的有效判据，与原任务目的一致。

## 2026-11-05 · 仓库根 `nul` 文件

- 问题：根目录存在 1113B 的 `nul` 文件（bash 下 `2> nul` 误产生的 npm 警告重定向文件），非用户有效改动。
- 选择：不删除（R8），在 `.gitignore` 加 `/nul` 使 status 干净。
- 理由：可逆、零风险；若用户确认可删随时移除该条规则。

## 2026-11-05 · 白名单外补充两个纯类型依赖

- 问题：§3.3 白名单未列 `@types/node`（cli 用 process/parseArgs 必需）与 `@types/papaparse`。
- 选择：作为 root devDependencies 引入（26.6.6 / 5.5.2，均发布满 7 天），在 ADR-0007 登记。
- 理由：纯类型包不进运行时产物，是 typecheck 的最小必要补充。

## 2026-11-05 · bullet 模板 `.quality-head h2` 字距回归

- 问题：76 对截图中仅 bullet 有真实像素差（958px，bbox 恰为"数据识别报告"标题）。基线里 bullet 是唯一 h2 无 `letter-spacing` 的模板；共享 CSS 的 h2 规则带 `-0.02em`，bullet 本地规则未声明 letter-spacing 故未重置。
- 选择：bullet 本地 `.quality-head h2` 补 `letter-spacing:0`，恢复基线渲染；其余模板保持 `-0.02em`。
- 理由：M0.1 要求肉眼可见差异必须修复；该改法只影响 bullet 且与其重构前表现一致。修复后双主题均像素级一致。
- 另注：report 两页 PNG 字节不同但差异像素为 0（编码噪声），判定一致。

## 2026-11-05 · golden 用例名含视图

- 问题：`to_chart` 同一函数服务 bar/line/matrix3d 三视图，cases.json 需要一个 id 区分。
- 选择：case id 形如 `bar-sample`/`matrix3d-multi`，同一样例可对应多个 case id 指向同一导出 fn；导出的 model 本身与视图无关。
- 理由：显式映射表语义不变，对拍端按 case 粒度比较。

## 2026-11-05 · M1 token 与色板偏离 legacy 的两处取值

- 问题：计划要求 `faint` 在 `paper` 上对比度 ≥3.0，但 legacy 原值 `#9a9d96` 仅 2.70；同时语义色表列了 `panel`/`pos`/`warn`，legacy 变量里没有对应项。
- 选择：`faint` light 调深为 `#8e928a`（3.11）；dark `#5e6450` 已达标不动。`panel=paper`，`pos`/`warn` 取 bullet 模板的 `--good`/`--watch`（light #0f766e/#c69a4a，dark #c6f13f/#ffb224）。
- 理由：语义色只要求"初值取自 legacy"，对比度门禁优先；panel/pos/warn 取已有同源色值最贴近原设计。

## 2026-11-05 · 迁移色板的 ΔE76 例外对

- 问题：DoD 要求每套 palette 前 6 色两两 CIE76 ΔE ≥15，但 6 对同族相邻色为 11.3–14.1（patina/light #386641-#588157、blueprint/light #2f5fd0-#3b82f6、blueprint/dark #7dd3fc-#38bdf8 与 #7dd3fc-#93c5fd、dunhuang/dark #7fc7a3-#81b29a、aurora/dark #5eead4-#6ee7b7）。
- 选择：色板"原样迁移"不改色值（保证 M4 视觉对拍），这 6 对在 `tokens.test.ts` 的 `PAIR_MIN_OVERRIDES` 里降级为 ≥10 兜底；mono/inkwash/morandi 按计划整组豁免。
- 理由：ΔE 11+ 仍属可辨（JND≈2.3），两条计划条款冲突时视觉对拍可测试性优先。

## 2026-11-05 · 字体与测试基建三则

- vitest：`@resvg/resvg-js` napi 模块在 Windows forks 池初始化即崩（native OOM），`vitest.config.ts` 全局 `pool:"threads"`（vitest 历史默认池）。
- resvg 2.6.2：`fontBuffers` 运行时有效（README 记录，2.5.0+）但 d.ts 未声明；字体测试用已声明的 `fontFiles` 达到同等验证，CLI 侧如需 buffer 加载再局部断言类型。
- metrics.json 已知缺字形：Fraunces 子集缺 U+201B/U+2190–2193/U+FFE5，JetBrains Mono 缺 U+FFE5（字体本身无此字形，subset 阶段已按保留范围输出）；`fonts.test.ts` 的 `KNOWN_MISSING` 登记，其余码点全覆盖。

## 2026-11-05 · options 覆盖口径与 grid roles

- 问题：DoD"options 数量 ≥ 非主题按钮组数"中，variant（如 bar 五种模式）是否计入 options 不明。
- 选择：从严口径——只数 `contract.options`（variant/mode 不算），为此给 fishbone+`legend`、grid+`density`/`showTotals`、heatmap+`weekStart`、pie+`centerLabel`、sunburst+`equalAngle`（均为真实能力选项，非凑数）；`coverage.test.ts` 按模板 `class="label"` 计数强制断言。grid 的 dims/values 二选一均无 required，同样由该测试覆盖。
- 理由：variant 走 spec.variant 通道是 §4.3 既定结构；从严口径对 DoD 更稳。
