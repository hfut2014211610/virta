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

## 2026-11-06 · M2 推荐引擎打分表落地偏差记录

- **层级判定**：§5.1 画像的"子→父映射唯一"保留在 `profile.hierarchy`；但 sunburst 样例里父级名跨祖父级复用（「人力」同时在研发/运营下），严格函数映射判不出层级。打分层（`hierScore`）改用启发式：**维度列 distinct 沿列序严格递增 = 树形**；label×series、id×group、source×target 交叉表 distinct 不递增被排除；同时要求恰好 1 个度量、排除时间维（时间×类目是矩阵不是树）。
- **决胜序**：同分按 SCORERS 表序（特例→兜底）；`0.8+0.05` 浮点误差曾让 line 击败同 0.85 的 heatmap-calendar，排序键改 `round(score*1e4)` 整数。
- **别名命中**：adapter 保持 legacy 严格全等（golden 基准）；打分层单独放宽两处——bullet 的 actual 允许列名包含别名（「实际良率」⊃「实际」），target 增补「预算/计划」别名（燃尽"计划剩余"不含糊因仍需全等命中）。
- **回避规则**（打分表未覆盖处，§0.3）：sankey 形（source+target 同现）bullet 不抢；命中 HEAT 轴别名（hour/星期等）boxplot 不抢；boxplot raw 要求恰好 1 维（多维事实表归 grid）；line 长表形态限 2 维（更多维度归 grid）；rank 需要单维标签且无系列列、≥12 行；kpi 要求标签列名像「指标/kpi/metric」；funnel 标签列名必须是阶段类词（stage/阶段/环节/步骤/漏斗/流程），不能只命中通用 label 别名；scatter 要求无 LABEL 主键、无时间列；全文本表 grid 0.2 兜底。
- **radar 同量级**：判据取各度量列量级（min/max 绝对值上界）之比 <10；列内量程差异（雷达本身做逐轴归一）不计。
- **场景包**：T1/T2 视图（combo/cohort/compare/rank/tree/network/control/parallel/histogram/kpi）已进打分器并可拿第一（如 cohort 0.90、control 0.85、network 0.85、tree 0.95、compare 0.80），但渲染要等 M6/M7——`pack.json` 的 `expectTop` 只对当前 top1 与计划意图一致的条目启用，其余条目实现后启用（M6/M7 任务单已有此要求）。store_hours 的小时列用「小时」（命中 HEAT_Y）；计划原文「时段」在 HEAT_X 侧，不改 legacy 别名表。
- **xlsx/二进制 edge**：`excel_dates` 用 `excel-serials.csv`（序列号列）表达；`gbk.csv` 由 python 一次性生成提交，`packs:check` 跳过二进制/非 UTF-8 文件比对；10k/100k 行数据按计划在 perf 测试运行时生成，不提交。

## 2026-11-06 · M2 结构

- 别名总表收口 `src/aliases.ts`（含 gantt/heatmap/fishbone/boxplot/sankey 私有别名），`legacy-core.ts` 只做解析/统计/质量骨架。
- `families/index.ts` 的 `makeAdapter` 统一接 `score.ts`（§5.1 表序 SCORERS）、`insights.ts`（中文模板+importance 降序≤8）、`counts.ts`；`validate.ts` 按契约 roles/options 产出 ValidateReceipt（歧义/越界给 `--set`/`--unset` 可执行建议）。
- 同构层无 Node API：`read.ts`（papaparse/JSON/ECharts 透传/嗅探）+ `node/index.ts`（fs、GB18030 回退 >1% 替换字符、read-excel-file readSheet、stdin/--data 嗅探）。

## M3 备忘（渲染栈纵切）

- **架构**：layout 产平台无关 Scene（色值已在 layout 解析）；`toSVG` 确定性（坐标 2 位小数、属性序固定）；
  `drawCanvas` 同 Scene 消费；PNG = resvg 光栅化 SVG（字体 = design-system 3 个 TTF + `--font-file` + 系统字体）。
- **字体族名对齐**：`FONTS` 栈同时含 @font-face 别名（VirDisplay/VirMono）与 TTF 内部族名
  （Fraunces/JetBrains Mono），否则 resvg fontdb 匹配不到内嵌字体（§0.3 记录）。
- **字体回退检测**：resvg 渲染固定中文串「中文字形探测」，像素全空 → receipt `warnings` 加
  `FONT_FALLBACK` 并提示 `--font-file`。
- **viewer 单文件**：HTML 内联首屏 SVG（SSR 首屏即图）+ `window.__VIRTA__` payload + esbuild
  iife 运行期（`packages/viewer/dist/<view>.js`，CLI 渲染时按需现打）。运行期做
  adapt→layout→toSVG 重渲染、图例开关、编辑抽屉（contract.options 自动生成）、hash `#s=` 同步、
  复制 spec、PNG/SVG/CSV/spec 导出、方向键导航、ResizeObserver 自适应。
- **bundle 预算**：当前 `<view>.js` ≈157KB（min），略高于 150KB 目标——因 ADAPTERS 全量注册
  （所有图族 to_* 都被打进）。M4 图族逐个落地时再按视图切 slim bundle；已记 §0.3。
- **CLI 语义**：`--set` 点号路径合并优先级 `--set`>专用参数>`--spec`>默认；退出码按 §4.5；
  `render -` 读 stdin（`--format` 指定解析）；`--data` 内联 JSON；docText 输入暂报
  UNSUPPORTED_FORMAT（report 管线 M4 接）。
- **frameStatic**：输出外层 scene + plot 矩形；图例在 layout 前由 model.series 先算（静态图例进卡片框）。
- **scaleLinear**：niceTicks 外扩域（测试断言用 `s.domain` 端点，不要用原域端点）。
- **Table.rows 是对象行**（非数组）：viewer/CSV 导出按 `columns` 取值。
- **视觉**：`test/visual/bar-line.spec.ts` 首屏断言 chart 底边 ≤800px@1280×800 + toHaveScreenshot
  基线（`snapshots/bar-line.spec.ts/`）+ 新旧并排 `snapshots/compare/{bar,line}-{legacy,new}.png`。

## M4 备忘（legacy 图族迁移 B1/B2/B3）

- **渲染器组织**：`packages/charts/src/{b1,b2,b3}.ts` 按批分组（B1 matrix3d/scatter/pie/bullet/funnel；
  B2 heatmap/treemap/sunburst/sankey/boxplot/radar；B3 gantt/fishbone/grid/report/pie3d/line3d/scatter3d），
  统一 `FamilyRenderer.layout(model, ctx)` → Scene；`src/index.ts` RENDERERS 全量注册 20 视图。
- **gantt 模型语义**：`tasks[].s/e` 是相对天数（minS 归零），`baseOrd`/`baseIso` 才是绝对基准；
  x 域固定 `[0, span]`，刻度标签 = `ISO(baseOrd+d)`，`today` 亦为相对天（§0.3：勿直接拿 s/e 当序数）。
- **heatmap calendar**：`years[y]` 的 pair 是 `[绝对日序, 值]`；周内位置用真实
  `getUTCDay` + `jan1Dow` 对齐（od−jan1+jan1Dow）/7，不能 `%7` 近似。
- **report 文档通路**：CLI `render` 对 md/txt 输入走 `job.doc` 分支——`DOC_ADAPTER.buildDoc` 直产
  DocModel，quality 用 `projectQuality(dm.quality)` 投影，counts/insights 由 stats 合成；
  `Payload.doc` 透传到浏览器端，运行期同样 buildDoc。inspect/validate 对文档输入给
  UNSUPPORTED_FORMAT + hint（§0.3：文档仅 render --view report）。
- **per-view slim bundle（预算达标）**：runtime `boot(payload, deps)` 改为注入式
  （`RuntimeDeps = {adapt, buildDoc, renderer}`），不再静态 import ADAPTERS/getRenderer；
  `packages/viewer/view-map.json` 记录 view→{charts 文件, renderer 名, adapter 模块, toModel 名}，
  `scripts/build.mjs` 与 CLI `viewerRuntime(view)` 共用同一 stdin 入口模板。每视图 bundle
  75–86KB（min），满足 §5.7 ≤150KB；同文件渲染器（b1/b2/b3 内 5–8 个）暂时共打进，已足够达标。
- **伪 3D**：matrix3d/pie3d/line3d/scatter3d 用 `project3d(x,y,z,azimuth,tilt)` 等轴投影，
  `state.azimuth/tilt` 可调；pie3d 借 2D 环形 + 侧壁路径（dz=8）；line3d z=系列分层。
- **已知打磨项（M8 再处理）**：fishbone 鱼刺文字密集时仍可能相邻；sunburst 标签按扇区角宽隐藏；
  sankey 流带透明度 0.22（legacy 近似）；line3d/scatter3d 地框仅简线。均无数据正确性问题。
- **视觉基线**：`test/visual/families.spec.ts` 20 用例（19 视图 + boxplot-summary 变体 + heatmap-calendar），
  每例断言浏览器内联运行期产 SVG、图元 >3、首屏底边 ≤820px，截图基线 `snapshots/families.spec.ts/`。

## M5 · Agent 能力收尾与组合页（§0.3 决策）

- **compose.json 面板两种写法**（文档未明确）：`{chart: "<id>"}` 引用同目录 pack.json 的
  charts 条目（file+spec+question 自动带出），或 `{file, spec}` 直接内联。`links` 位于顶层。
- **grid 尺寸**：12 栏，面板宽 w/12、高 h×130px（h 默认 4）；story 全宽、高 h×150+60。
  面板内卡片 = 圆角矩形 + question/title/首条洞察 + 内层 Scene（无卡片框二次扣区）。
- **联动实现**：runtime-compose `bootCompose(payload, views)`；点击图元后取
  `datum.series/label/value` 中落在链接列值域者写入 `filter[col]`；筛选只作用于含该列的面板。
  HTML 首屏 svg 为占位（浏览器 boot 后即按真实尺寸重渲）；静态 svg/png 为服务端合并 Scene。
- **recommend.mapping 键名与 contract roles 对齐**（e2e 暴露的不一致）：
  sunburst `level`（原 `levels`）、treemap `label`+`group`、radar `value`（原 `values`）。
  打分/推荐层从此与 validate 的角色检查同名，Agent 可直接把 candidate.mapping 写进 spec。
- **validate 修正**：必需角色缺失时跳过 adapter 数据质量检查（别名解析独立于 spec.mapping，
  未绑角色时跑 to_* 只会产出误导性崩溃）；`projectQuality` 对 undefined 输入容错。
- **render 前置校验**：`mapping.*` 指向不存在列 → MISSING_COLUMN；必需角色多列歧义 →
  AMBIGUOUS_MAPPING（这两个 ErrorCode 此前在 CLI 没有触发点）。stdin `readInline` 包 try，
  JSON 语法错误正确映射 PARSE_ERROR。
- **e2e 注意**：`--set mapping.X=["a","b"]` 的数组引号会被 shell 吃掉——传数组 mapping
  一律用 `--spec` 文件（SKILL.md 已写明）。`compose`/`demo`/`gallery` 占位回执需经
  `args.values['json']` 判定输出形态。

## M6 · T1 新图表与分面（§0.3 决策）

- **T1 六视图**：combo（复用 BarlineModel 双度量柱+线）、rank（静态榜 + race 帧序列）、
  histogram（分箱 + 可选分组/累计曲线）、kpi（指标卡 + 目标/环比 + sparkline 变体）、
  compare（斜率图 + dumbbell 变体，支持年份列名 2024/2025 作 from/to）、
  cohort（队列×期次留存三角热力）。契约各 1 个、适配器集中在 `families/t1.ts`、
  渲染器集中在 `charts/src/t1.ts`，模型类型从 `@virta/data-engine` 导出。
- **适配器别名与兜底**：T1 别名收口进 `aliases.ts`；compare 标签列兜底取"首个非数值列"
  （JS 对象把 `2024/2025` 数字键排到前部，取 cols[0] 会误选度量列）；histogram 组别
  别名补 `组别`；rank 标签别名覆盖 城市/版本 等 pack 列名。
- **打分微调**（保既有期望）：rank-race 要 label+measure+时序维且 distinct ≥6 帧才给 0.9
  （Q1–Q4 四帧数据仍归 pie/bar）；combo 仅在"恰 1 个维度的宽表 + 列名/类型命中百分比语义"
  时给 0.9（revenue_margin 毛利率 → combo；多维控制图数据不抢 control）。
- **spec.facet**：`{column, columns, sharedScale}`；`FACETABLE` = bar/line/scatter/histogram/compare，
  不支持视图报 INVALID_SPEC、缺列报 MISSING_COLUMN；各面板独立 adapt，sharedScale 时把
  全量值域经 `ctx.options` 注入渲染器。facet 布局放 `packages/viewer/src/facet.ts`
  （CLI 经 `@virta/viewer` 复用）——若留在 `@virta/charts` 入口，浏览器 runtime 会拖入
  全部渲染器使 slim bundle 涨到 ~149KB；迁移后各视图 90–96KB。
- **pack 断言启用**：finance margin→combo/trend、retail cityrank→rank/peak、retail yoy→
  compare/change、saas cohort→retention、saas mrr→trend、saas plans→change、
  quality output→rank。pack.json/compose.json 均由生成器产出（hand-edit 的 compose.json
  并入 generate.ts，CRLF 经 packs:gen 归一 LF）。
- **渲染细节**：compare 两端标签做贪心垂直避让；histogram 分组图例由 render.ts 从
  `model.groups` 提取（此前只认 model.series）。

## M7 · T2 新图表（§0.3 决策）

- **T2 四视图**：tree（tidy/org/mindmap/indented 四变体）、network（force/circular）、
  control（I 图 + WE 规则 1/2 失控标记）、parallel（多轴折线 + 分组着色）。
  契约各 1 个、适配器集中在 `families/t2.ts`、渲染器集中在 `charts/src/t2.ts`。
- **tree 双输入形态**：`id+parent`（行内层级）与 `level1..N`（多列层级）二选一，
  契约 roles 全 optional——`coverage.test.ts` 的"每图族至少一个 required role"断言
  把 tree 与 grid 并列为例外（两种形态互斥，无法静态声明必选角色）。levels 形态
  节点键 = 路径 `join('/')`，逐级前缀汇总 value。
- **network 确定性力导**：velocity Verlet + 库仑斥力/弹簧/向心力，`seed(42)` 固定
  初始环位 + 抖动，300 步预迭代后按包围盒归一化铺满绘图区（§5.4 的"预迭代 300 步
  并固定种子"；Barnes–Hut 为可选项未实现）。circular 按 flow 降序圆周均布。
- **control**：series 分组各算 3σ 控制限；`r1` 单点超限、`r2` 3 点中 2 点同侧超 2σ
  分别标红点/橙点；多系列时 UCL/LCL 标签带系列名防碰撞。打分 0.9 限定"时序维 +
  度量 + 可选样本量/限值列"语义（combo 已限单维宽表，不再抢控制图数据）。
- **parallel**：各轴独立线性尺度（`state.axisOrder` 持久化轴序）；打分 0.75 限定
  ≥4 度量列（sensor_batches 5 度量 → parallel；2–3 度量仍归 scatter/radar）。
- **indented 变体**：纯文本树补了层级引导竖线 + 展开三角 marker path + 行级命中区
  （此前该变体 SVG 无 rect/path/circle/line，视觉断言"图元数 >3"失败，且命中区为空）。
- **打分微调**：sControl/sTree/sNetwork/sParallel 按 §5.1 阈值实校准；sample-tree-levels
  与 effort_tree/expense_tree 这类多列层级数据归 sunburst/treemap（tree 家族只认领
  id+parent 显式层级），与 §8 pack 期望一致。
- **交互边界**：renderer 声明 `drill`/`drag-node`/`brush` 能力，viewer runtime 目前
  只实现 tooltip 命中；点击下钻、节点拖拽、轴刷选留 M8 打磨（与 M4 起的既有口径一致）。
