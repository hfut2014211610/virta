# ADR-0014 严格 spec 校验与视图别名统一解析

> 状态：已采纳 · 2026-11-07 · 依据 `docs/plan/PHASE_2B.md` §2 C7/C8、§4.2（缺陷 B4–B8、B17）

## 背景

`--set` 走静默路径写入，未知顶层键、未声明选项、非法枚举值一概放行（`--set options.lineStyle=zap`、
`--palette nonsense` 都静默接受）；`pivot`/`spc` 等别名只在个别路径解析；`--height auto`
在非流式视图下把 NaN 写进 canvas；`--data '{bad'` 以 INTERNAL 崩溃而非 PARSE_ERROR。

## 决策

### 1. `contracts/validate-spec.ts`（C7）

`validateSpec(spec, contract)` → `{ok:true}|{ok:false;error:VizError}`：

- 顶层键白名单 `VIEW_SPEC_KEYS`（测试锁定与 `VIEW_SPEC_SCHEMA.properties` 一致；
  schema 同步补齐 `time`/`derive`/`page`/`state.sortBy`/`state.query`/`size.height:'auto'`）。
- `options.*` 键必须在 `contract.options` 声明；枚举值匹配 `values`；number 受 `min/max`；
  boolean/string 类型核验。
- `theme`/`palette`/`variant`/`mode` 白名单；`state`/`text`/`time`/`page`/`facet`/`format`/`size`
  子键白名单；`mapping` 必为对象、`derive`/`annotations` 必为数组。
- 错误码：`INVALID_SPEC`（结构）/`INVALID_OPTION`（取值），退出码 2；hint 用编辑距离给最近邻。
- 内部标注（推荐理由）不再写进 spec——`__reason` 改由 WeakMap 携带，白名单保持纯净。

### 2. `contracts/views.ts`：`resolveView`（C8）

唯一别名入口：`resolveView(id)` → `{view, variant?}`；`pivot` → `{view:'grid', variant:'pivot'}`。
`buildSpec`、compose 各面板统一调用；未知视图 → `UNKNOWN_VIEW`（2）+ 候选列表。

### 3. 接入点

`buildSpec`（覆盖 `--spec`/`--set`/专用参数）、`validate` 命令、compose 逐面板。
`--data` 解析失败 → `PARSE_ERROR`（3）。

### 4. `--height auto` 语义（B8）

`spec.size.height='auto'` 仅对流式（`contract.flow`）与 `preferredHeight` 视图生效；其余回退
675 并报 `HEIGHT_AUTO_FALLBACK`（info）。宽高断言有限正数（`INVALID_OPTION`）；PNG 且宽度
<16px → `EXPORT_FAILED`（替代 resvg 断言崩溃）。`renderJob` 宽高只从 `spec.size` 取一次。

### 5. guide 三态（B17）

`virta guide` → ≤40 行速览；`--agent` → `docs/agent/SKILL.md` 全文；`--json` →
`{commands, views, aliases, exportFormats, errorCodes}`。

## 后果

- 参数错误在适配前被拦下，错误可定位（面板 id / 最近邻 hint）。
- Schema 与白名单单源化，契约变更的同步由测试强制。
