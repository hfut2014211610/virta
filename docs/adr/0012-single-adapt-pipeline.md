# ADR-0012 单一适配管线 runPipeline 与运行期一致性

> 状态：已采纳 · 2026-11-07 · 依据 `docs/plan/PHASE_2B.md` §2 C1–C4、§4.2（缺陷 B2/B3/B13）

## 背景

浏览器打开 HTML 后重新计算数据，但走的是另一套代码：per-view 入口只做列映射复制
后裸调 `toModel`，跳过派生列、`missingValue`、gantt asOf 今日线；compose 运行期
连 `spec.mapping` 都不处理（此前 CLI 预检原地改行碰巧掩盖了它）。结果：派生列消失、
断线不补、今日线按打开时刻漂移、"数据截至"脚注缺失。

## 决策

### 1. 单一管线（C1）

`data-engine/src/pipeline.ts` 新增：

```ts
runPipeline(table, spec, view, toModel, post?) → { model, issues }
```

固定顺序：**派生列（asOf/tz 已解析）→ tableToRaw（逐行浅拷贝）→ 映射复制（只写
原本不存在的键）→ toModel → 缺失值处理 → post 钩子**。`ADAPTERS`、per-view bundle、
compose bundle 三处只调用它；`families/index.ts` 原 gantt/line3d 包装删除。

- line3d curve 变体的 toModel 差异并入管线调用点（`PIPELINE_TOMODEL` / 入口生成器），
  不再绕过 derive/mapping/缺失值。

### 2. 后处理钩子独立注册（C2）

`families/post.ts` 以 view 为键注册 `POST_HOOKS`（当前仅 `ganttPost`：按 spec.time 的
asOf+tz 写今日线）。per-view bundle 只打包本视图的 `toModel` 与钩子（view-map.json
新增 `post` 字段），不引入全部图族。

### 3. 输入不可变（C3）

`tableToRaw` 逐行浅拷贝；派生列写副本；映射只写副本行。原 Table 及行对象不被修改——
此前"CLI 预检原地改行 → payload 泄漏 role 键"的碰巧正确性被根除（compose 面板改由
管线在运行期自行应用 mapping）。`packages/data-engine/test/pipeline.test.ts` 对
`Object.freeze` 输入做断言。

### 4. 运行期一致性（C4）

`chart-core` 新增 `modelHash`：稳定序列化（键排序、number `toFixed(6)`）+ FNV-1a。
运行期在 `window.__virta.modelHash`（compose：`panels[i].modelHash`）写回；不进回执。
`test/visual/parity.spec.ts` 拿它与 Node 端 `adaptInput` 的哈希对拍——几何依赖宽度
无法直接比较，model 是两端唯一应当完全相等的中间量。

### 5. 时间与 Date.now 纪律

- compose 文件级 `time`：`ComposeFileShape.time` 解析一次，各面板 `spec.time` 继承；
  缺省按 render 方式写回 asOf/tz 并报 `TZ_ASSUMED`/`ASOF_ASSUMED`；payload 每面板 spec
  带 `time`。
- 运行期任何位置不调用 `Date.now()`：静态检查强制 `packages/viewer/src` 与
  `packages/data-engine/src` 中只有 `derive.resolveTime` 允许（`families/gantt.ts` 的
  默认"今天"也改经 `resolveTime` 取得）。

### 6. 顺带修复

compose 回执 html `bytes` 改为对写入字符串取 `Buffer.byteLength`（B3/B13）。

## 后果

- 交互页与静态导出共享同一条计算路径；新增处理步骤只需改 pipeline 一处。
- spec.mapping/derive/missingValue/time 在浏览器端与 CLI 完全同语义。
- 后续 spec 校验（ADR-0014）与 modelHash parity 形成"契约—计算—渲染"三段兜底。
