# ADR-0005 CLI 回执信封与退出码

- 状态：已接受
- 日期：2026-11-05
- 决策：D2、D6；§4.5/§4.6/§5.8

## 决定

- 包名 `virta`，命令 `virta`，短命令 `vt`；参数解析用 Node 内置 `util.parseArgs`，不引参数库。
- 所有 `--json` 命令 stdout **只输出一个 `Envelope<T>` 对象**，日志/进度一律 stderr；`ok:false` 时含 `VizError`。
- 退出码：`OK=0, INTERNAL=1, USAGE=2, INPUT=3, DATA=4, RENDER=5`，ErrorCode→退出码映射实现为 `ERROR_TO_EXIT`（contracts/quality.ts）。
- 无 `--json` 时输出人类可读摘要（`✓ 生成 …`、`✗ message` + `提示：hint`）。
- `--set k=v` 点号路径合并 spec，优先级 `--set` > 专用参数 > `--spec` > 默认。
- 分发：暂不发布 npm，`"private": true` 但 package.json 按可发布标准写；本地经 `npm run virta`/`npm link` 使用。

## 理由

结构化回执（含解析补全后的完整 spec 与 `summaryMd`）让 Agent 可以无猜测地串联 inspect → validate → render；固定退出码让调用方按类别处理错误。

## 2a 增量

- ErrorCode 新增 `INVALID_TIME`（USAGE，退出码 2）；CLI 新增 `--as-of`/`--tz`（等价 `--set time.*`）。
- render 回执 `files[]` 新增 `page`/`pages`（流式视图 PNG 分页）；`--size Wxauto` 用自然高度。
- compose 回执每面板新增 `rendered: boolean` 与 `error?`；任一面板预渲染失败 → `ok:false`。
