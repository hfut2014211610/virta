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
