# Agent 实测评估（PHASE_2D §4.6 / H15）

用一个**全新的 Agent 会话**跑 `tasks.json` 中的 12 个任务，量化 virta 对 Agent 的实用性。
本目录只负责准备环境与判定回执；**被测 Agent 由维护者另行发起**，评估脚本本身不扮演被测方。

## 文件

| 文件 | 作用 |
|---|---|
| `tasks.json` | 任务集 A01–A12（描述与验收条件逐字保留自 `docs/plan/PHASE_2D.md` §4.6），含机读 `checks` |
| `prepare.ts` | 在系统临时目录为每个任务建独立工作目录，复制数据文件并写入 `TASK.md` |
| `check.ts` | 读取各任务目录 `receipts/*.json`，按验收条件逐条判定，输出 `results.json` |
| `README.md` | 本文件：执行规程与指标口径 |

## 执行规程

1. **准备**：在仓库根目录运行

   ```bash
   npx tsx scripts/agent-eval/prepare.ts
   ```

   输出形如 `%TEMP%/virta-agent-eval-XXXX/`（`--out <dir>` 可指定目录）。每个子目录 `A01/`…`A12/`
   内含该任务的数据文件和 `TASK.md`（只含任务描述）。

2. **安装被测环境**：维护者在本机全局安装当前版本 virta，并安装技能：

   ```bash
   npm i -g <virta tarball>     # 或维护者既定的安装方式
   virta doctor                 # 自检通过
   virta skill install --dir <Agent 技能目录>   # 如 ~/.agents/skills
   ```

3. **发起被测会话**：新建一个 Agent 会话，**工作目录设为第 1 步输出的根目录**，
   **不给它仓库访问权**（不能读本仓库、不能看 `scripts/agent-eval/`）。
   给它的指令固定为：

   > 依次完成每个子目录中 TASK.md 描述的任务。每次调用 virta 都加 --json，并把回执保存为该目录下的 receipts/<序号>.json。

4. **判定**：会话跑完后执行

   ```bash
   npx tsx scripts/agent-eval/check.ts <prepare 输出的根目录>
   ```

   默认把 `results.json` 写到评估根目录（`--out <path>` 可改位置）。

5. **人工判断**：维护者对每个任务的最终图片给出「适合发出 / 不适合发出」的结论，
   填进 `results.json` 对应任务的 `human` 字段（缺省 `null`）。A11 的组合页按整页判断。

## 判定口径

- 回执 = 各任务目录 `receipts/*.json`（virta `--json` 的 Envelope 整体）。
- **只有 `command` 为 `render` 或 `compose` 的回执算任务尝试**；`inspect`/`validate` 等
  探查回执计入 `receipts` 总数但不算尝试、不影响成败。
- 每条尝试回执按任务的 `checks` 逐条判定；`checks[]` 展示的是判定依据的那条回执
  （任一通过取首个通过者；全败取最后一条；无尝试则全列失败）。
- `mode`：缺省 `any`（任一尝试满足全部条件即任务完成）；A12 为 `last`——
  「最终回执 `ok = true` 且 `view = bar`」，只看最后一条尝试。
- `human` 字段由维护者填写，判定器不写；建议取值 `适合` / `不适合`（可附一句理由）。

## 指标定义

| 指标 | 口径 |
|---|---|
| 首次成功率 | 首条 render/compose 回执即满足全部验收条件的任务占比（`firstPass`） |
| 最终成功率 | 任务最终满足验收条件的占比（`pass`；A12 以最后一条尝试为准） |
| 平均重试次数 | 各任务 `attempts − 1` 的均值（下限 0；探查类回执不计） |
| 人工可发出率 | `human` 已填写任务中判「适合」的占比；未填写时为 `null` |

结果汇总在 `results.json` 的 `summary`，逐项明细在 `tasks[]`。
被测 Agent 的模型、工具与版本记录在 IMPLEMENTATION_NOTES（Phase 3 复测用同一配置）。

## 真实数据试点

用户提供研发截止日报真实数据后，按同样规程另跑一次。**真实数据与结果均不入库**（R9），
只把指标数字记入 `docs/adr/IMPLEMENTATION_NOTES.md`。
