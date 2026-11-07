# ADR-0010 时间契约：asOf/tz 与派生列

> 状态：已采纳 · 2026-11-06 · 依据 `docs/plan/PHASE_2A.md` §2 A3/A4/A5、§4.2

## 决策

- `ViewSpec` 新增 `time`：`asOf`（ISO 8601 必须带偏移/Z）、`tz`（IANA，缺省=系统时区）、`weekStart`（默认 1）、`workdays`（默认 1–5）、`holidays`、`extraWorkdays`。CLI 缺省时**解析后写回**回执 `spec`，重放可复现（U2a-2：用系统时区并报 `TZ_ASSUMED`；未给 asOf 报 `ASOF_ASSUMED`）。
- A4 时刻语义：`RoleSpec.instant?: 'start'|'end'`——只有日期的值，开始类角色取当天 00:00、截止类取当天 23:59:59.999（按 tz 的墙上时间，不依赖进程 `TZ`）。
- A5 派生列 `spec.derive`：`dueStatus`（due/done/soonWorkdays=3，输出 done|done-late|overdue|due-today|due-soon|upcoming|unknown）与 `dateDiff`（from/to/unit=day|workday，端点空→null）。在 `adaptInput` 开头统一执行，新列进 `Table.columns`，可被 mapping/inspect 引用。
- 实现：`data-engine/time/zoned.ts`（`zonedParts`/`fromZoned`，基于 `Intl.DateTimeFormat.formatToParts` 迭代修正偏移，覆盖 DST 跳变与重叠）、`time/workday.ts`、`derive.ts`。
- gantt 今日线用 asOf+tz（修 F3 UTC bug）；旧 HTML 用 payload 固化的 asOf，打开时不取当前时间。有 `time.asOf` 时标题区/静态卡脚注显示「数据截至 …（tz）」。
- CLI：`--as-of`/`--tz`（等价 `--set time.*`）；不可解析报 `INVALID_TIME`（USAGE，退出码 2）。`inspect` 命中截止类别名时附 derive 建议。gantt `end` 别名去掉 `完成日期`（归 `actual`），对 `完成日期` 列给 `AMBIGUOUS_MAPPING` 歧义提示而非静默猜测。
- 确定性：同数据+同 spec（含 asOf/tz）在 `TZ=UTC` 与 `TZ=Asia/Shanghai` 下 SVG 逐字节一致。

## 2b 修订（C9 日期解析 + 带符号差值）

- `instantOf` 格式扩展：带偏移 ISO 不变；日期/日期+时间交 `parseGanttDate` 识别
  （`-` `/` `.` 中文年月日、紧凑 8 位、Excel 序列号），再 `fromZoned` 按 start/end 落点。
- 纯数字规则：8 位合法 YMD → 紧凑日期；[20000,80000] → Excel 1900 序列号；
  ≥1e11 → epoch ms；其余一律 null（日期判错比报错危险）。
- 解析失败由 `applyDerives` 按列累计 → `UNPARSABLE_DATES`（warn，count + ≤5 例子）；
  缺失 token 不计入。
- `workdaysBetween` 带符号：`to < from` 返回负值；`dateDiff` workday 单位同生效。
