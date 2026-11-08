# Virta Phase 2d 详细设计与实施计划：交互修复、呈现质量与 Agent 实测

> 状态：待实施 · 编写：2026-11-09
> 位置：Phase 2c 已完成（`v0.1.0` 已发布），本期紧随其后，完成后发布 `v0.2.0`。之后是 Phase 3（`docs/plan/PHASE_3.md`）。
> 输入：2026-11-09 第五轮审查。方法是按团队成员的方式从 Release 安装，在仓库外把 35 个视图在浅色主题下各渲染一遍，另取 12 个视图出深色版；跑一遍 demo；用浏览器实际操作交互页。证据在维护者本机审查目录（不入库）。
> 读者：实施 Agent 与维护者。规则沿用 `NEXT_PHASE.md` §0（R1–R8）、`PHASE_2B.md` 对 R4 的修订（允许 fast-forward push）、`PHASE_2C.md` §0.4（R9 信息安全），本文只写增量。

---

## 0. 定位与边界

### 0.1 为什么要有 2d

v0.1 已经能装、能用、能交给 Agent，但第五轮审查发现三类问题：

1. **核心交互失效**：单图页面的悬停提示框从 M3 起就不显示；组合页根本没有悬停提示。
2. **呈现质量问题**：标签重叠、配色无法区分系列、坐标轴范围不合理、treemap 布局算法有误、面板标题显示英文 id。
3. **测试盲区**：没有任何测试检查交互行为是否生效；视觉回归只和基线截图比，而基线是在问题已经存在时拍的，等于把问题一起锁进了基线。

2d 的目标是修完所有已知问题，并建立两道长期防线：浏览器交互测试和版面检查器。同时用一次 Agent 实测拿到基线数据，作为 Phase 3 排优先级的依据。

### 0.2 本期不做

- 不加新视图、不加新命令。Phase 3 的内容（`virta brief`、gauge、地图、MCP、npm 公开发布）不提前做。
- 不改交互页工具栏的布局。M8 返工时已经决定"选项行默认常开"（IMPLEMENTATION_NOTES 第 319 行），本期不重新讨论。
- 不引入新的第三方依赖（R2）。CI 中 GitHub Actions 的版本升级不属于 npm 依赖，但同样要满足"发布满 7 天"。

### 0.3 准入条件

- `git status` 中只允许出现他人的未跟踪目录 `.workbuddy-ai/`（R8）。
- 提交身份遵守 R9。

---

## 1. 问题清单

"已确认"表示根因已经在源码中核实；"待核实"表示只有现象，根因是假设，实施时第一步要先确认。

| # | 级别 | 问题 | 根因 / 位置 | 状态 |
|---|---|---|---|---|
| D1 | **P0** | 单图交互页的悬停提示框完全不显示，所有 SVG 视图都受影响。不报错，只是看不到 | `html.ts:143` 把 `#tooltip` 放在 `#chart-box` 里面；`runtime.ts:182` 每次渲染执行 `box.innerHTML = …`，把 `#tooltip` 一起清掉了；`runtime.ts:275` 在启动时取到的 `tip` 已经是一个脱离页面的节点，后续的显示操作全部无效。M3（`toSVG` 首次接入）以来一直如此。审查时在 bar、line、scatter、pie 页面上扫遍整个图区，`document.querySelector('#tooltip')` 都返回 null | 已确认 |
| D2 | P1 | 组合页没有悬停提示，只能点击联动 | `runtime-compose.ts:115` 只注册了 click 事件 | 已确认 |
| D3 | P1 | 零售仪表盘 11 个面板中有 10 个的标题显示英文 id，如 `category`、`funnel`、`paths`、`hours`、`bridge` | `examples/packs/retail/pack.json` 只有 `trend` 写了 `text.title`，其余没写时直接退回成 chart id。其他场景包需要一并检查 | 已确认（数据）；兜底逻辑的位置待定位 |
| D4 | P1 | 标签重叠：<br>• 桑基图的节点标签压在节点上，或互相重叠<br>• 斜率图（compare）底部 6 个端点标签挤成一团<br>• 时间轴有 24 个刻度时，日期标签全部叠在一起（零售 trend 面板） | `chart-core/src/labels.ts` 中的 `placeLabels`（贪心避让）已经实现、也有单测，但**没有任何渲染器调用它**，只在 `chart-core/test/core.test.ts` 中出现。轴刻度没有根据实测宽度做稀疏或旋转 | 已确认（避让未接入）；各视图细节待核实 |
| D5 | P1 | 堆叠面积图所有系列使用同一个色系，组合页面板也没有图例，系列无法区分（零售 trend 面板） | 两个可疑点，都要先核实：<br>① 组合页面板的配色方式或渐变把多系列压成了单色系；<br>② `charts/src/line.ts:96-97` 对已经换算成像素的 `ysBase` 又调用了一次 `y()`，堆叠填充的底边可能算错 | 待核实 |
| D6 | P2 | 数据全为正数时，坐标轴仍出现负刻度：零售 pricevol 散点图的 x 轴从 -1,000 开始，y 轴到 -500 | 值域两端对称留白，没有考虑零 | 待核实 |
| D7 | P2 | 静态 PNG/SVG 没传 `--title` 时没有标题，只有几行洞察小字，单独发到聊天里，读者不知道这是什么图 | 静态版式框架只在 `spec.text.title` 存在时才画标题 | 已确认（现象）；位置待定位 |
| D8 | P1 | treemap 画成了满宽的横条（零售、样例都一样），失去了面积对比的意义 | `charts/src/b2.ts:94-114` 的 `squarify` 有算法错误：`worst` 和 `layRow` 都用"占全部总量的比例 × **剩余**矩形面积"来算面积，第一行之后的每一行面积都会被低估，于是退化成条带。正确做法是面积始终按"值 ÷ 总量 × **原始**矩形面积"计算 | 已确认 |
| D9 | P2 | formula 的公式只占画面中央很小一块，周围大片留白 | 固定字号，没有按可用空间缩放 | 已确认（现象） |
| D10 | P1 | 测试盲区：没有任何测试检查交互是否生效；`xss.spec.ts` 只是把鼠标移上去，不检查提示框是否出现；视觉基线锁住了 D3–D9 | `test/visual/` | 已确认 |
| D11 | P2 | CI 告警：<br>• `actions/checkout@v4`、`actions/setup-node@v4` 运行在已弃用的 Node 20 上<br>• `ubuntu-latest` 正在迁移到 Ubuntu 26，视觉基线依赖平台字体渲染，换镜像会导致整批截图差异 | `.github/workflows/ci.yml`、`release.yml` | 已确认 |
| D13 | P2 | `test/security/no-leak.test.ts` 偶发失败：2026-11-09 在本机第一次运行时 3 个用例中有 1 个失败，测试耗时 7.5s；紧接着再跑两次都通过，耗时 0.2s | 推测是冷启动时扫描 git 历史或文件超过了 vitest 默认 5s 超时。先在冷缓存下复现并确认失败信息，再修：给扫描设合理的显式超时，或减少重复的 git 调用。不得简单地加重试 | 待核实 |
| D12 | P1 | 2c 计划中"Agent 只依靠技能文档完成一次任务"的试点没有做，实施记录里只有逐条命令的演练；也没有用真实数据跑过 | `IMPLEMENTATION_NOTES.md` 中 M2c.5 一节 | 已确认 |

---

## 2. 决策

| # | 决策 | 理由 |
|---|---|---|
| H1 | **渲染目标与浮层分离**：`#chart-box` 内部改为两个子元素：`<div id="chart-stage">`（渲染目标）和 `<div id="tooltip">`（浮层，与 stage 并列）。所有渲染写入，包括 SVG、错误提示、flow-table、flow-doc，都只写 `#chart-stage`。`#chart-box` 保持现有职责：尺寸测量、`__scene` 挂载、事件监听、滚动容器。每次 mousemove 都通过 `$('#tooltip')` 现取元素，不在启动时缓存 | 从结构上消除 D1：以后不管哪种渲染器清空内容，都碰不到浮层。现有选择器 `#chart-box svg` 是后代选择器，测试和 CSS 不受影响 |
| H2 | **共享 tooltip 模块**：新增 `viewer/src/tooltip.ts`，导出 `showTooltip(tip, datum, clientX, clientY, container)` 和 `hideTooltip(tip)`。HTML 统一用 `html` 模板生成（转义规则不变），并负责边界翻转：靠近右边或下边时，浮层翻到光标另一侧。单图页和组合页都使用它 | D1 和 D2 共用一份实现，避免两套行为不一致 |
| H3 | **组合页的悬停提示**：页面级只有一个 `position: fixed` 的 `#tooltip`；每个面板注册 mousemove 并调用 `hitTest`，再交给 `showTooltip`；mouseleave 时隐藏；点击联动保持不变 | 修复 D2 |
| H4 | **标题兜底链**：面板标题和静态标题统一按 `spec.text.title` → pack chart 的 `title` → 契约中的中文视图名（如"旭日图"）取值，**永远不显示 chart id 或文件名**。所有场景包的每张图都要在 `scripts/packs/generate.ts` 中补上中文标题，然后执行 `packs:gen` 重新生成，不能手改生成物。新增 pack 规范测试：每个 chart 都必须有 `spec.text.title` | 修复 D3。场景包是对外演示的门面 |
| H5 | **静态导出默认有标题**：没给标题时，按 H4 兜底到中文视图名，并在回执 warnings 中加一条 `TITLE_MISSING`（level: info，hint: `--title "…"`）。SKILL.md 的标准流程写明"对外分享的图必须传 `--title`" | 修复 D7。同时告诉 Agent 应该补标题，而不是让它默默产出一张"柱状图"标题的图 |
| H6 | **版面检查器**：新增 `chart-core/src/lint.ts`：`lintScene(scene, measure): LayoutIssue[]`，检查四类问题：<br>① **文字互相重叠**：两个 text 节点的包围盒相交面积大于较小者的 15%。包围盒用 `measureText` 计算；带旋转的文字按旋转后的轴对齐包围盒计算<br>② **文字超出画布**：超过 2px 即算<br>③ **对比度不足**：文字颜色与背景的 WCAG 对比度小于 3:1。背景取包含该文字的最上层 rect 填充色，没有时取主题 paper 色；带透明度时与 paper 混合后再算<br>④ **非有限坐标**：出现 NaN 或 Infinity<br>①、②、④ 为 error，③ 为 warn | D4、D7、D9 这类问题的系统性防线。今后新增视图也会自动受它约束，不再依赖人眼巡检 |
| H7 | **版面检查进回执**：`render` 和 `compose` 把 lint 结果按 `LAYOUT_TEXT_OVERLAP`、`LAYOUT_TEXT_CLIPPED`、`LAYOUT_LOW_CONTRAST`（都是 warn）写进 warnings，`details` 中包含涉及的文字和数量。不改变退出码 | Agent 能知道图有排版问题，可以换参数重试，比如改宽度、换变体、改 topN。这是契约增量，写 ADR-0016 |
| H8 | **标签避让接入**：凡是由渲染器自行放置的数据标签，一律改为调用 `placeLabels`：桑基图节点标签、compare 端点标签、pie 和 pie3d 的外部标签、scatter 点标签、line 的 `endLabels`、funnel 侧标。实在放不下的标签允许隐藏，但只能从低优先级（值小）的开始隐藏，并在 tooltip 中保留完整信息 | 修复 D4，复用已有并且测过的实现 |
| H9 | **轴刻度自适应**：在 chart-skin 的轴组件中统一处理：先按实测标签宽度计算是否放得下；放不下时依次尝试：① 隔 n 个取一个（保证首尾都在）② 旋转 −45° ③ 截断并加省略号。时间轴优先在年份变化处显示年份，其余位置只显示月份 | 修复 D4 中的日期叠字问题，所有带轴的视图一并受益 |
| H10 | **值域规则**：`chart-core/src/scales.ts` 新增 `paddedDomain(min, max, { pad = 0.05, zero: 'include' \| 'clamp' \| 'free' })`。数据全为非负时，下界不低于 0（`clamp`）；数据全为非正时，上界不高于 0。bar、area 这类以零为基准的图用 `include`；scatter、line 用 `clamp`；control 用 `free`，因为它的值域由控制限决定 | 修复 D6 |
| H11 | **treemap 修复**：`squarify` 按标准算法重写：先算出每个节点的目标面积 `area = value / total × W × H`；`worst(row, side)` 基于这些面积和当前剩余矩形的短边计算；放完一行后从剩余矩形中扣掉这一行占用的面积。分组的两层布局复用同一个函数 | 修复 D8。现在是算法错误，不是参数问题 |
| H12 | **formula 自适应字号**：从默认字号开始，按实测的公式块宽高等比放大，直到宽或高达到可用区域的 70%，上限 48px | 修复 D9 |
| H13 | **视觉基线需要人工确认**：本期修复会改变大部分截图。重拍基线之前，先生成全部视图和全部场景包的缩略图总览（contact sheet），由维护者（主导会话）逐张看过并确认后，才能接受新基线。实施 Agent 不得自行判定"差异属于预期" | D10 的教训：基线只能证明"没变"，不能证明"是对的" |
| H14 | **CI 固定镜像**：`test` job（包括视觉回归）改为 `runs-on: ubuntu-24.04`，固定平台，避免镜像迁移导致基线整体漂移。dist 矩阵继续用 `-latest`，及早暴露新平台的问题。`actions/checkout` 和 `actions/setup-node` 升级到原生运行在 Node 24 上的主版本。实施前先查官方 Release，确认版本号和发布日期满 7 天，写进 IMPLEMENTATION_NOTES | 修复 D11 |
| H15 | **Agent 实测评估**：把 §4.6 的任务集和检查器放进仓库，由一个**全新的 Agent 会话**执行。这个会话只装 `virta` 和技能，在临时目录中工作，看不到仓库。本期只建立基线，**不设通过门槛**；结果写进 IMPLEMENTATION_NOTES，作为 Phase 3 排优先级的依据 | 修复 D12，把"Agent 接入实用性"从主观判断变成数据 |

---

## 3. 契约增量（ADR-0016）

```ts
// RenderReceipt.warnings / ComposeReceipt.warnings 新增的 code（level 均为 'warn'，TITLE_MISSING 为 'info'）：
//   LAYOUT_TEXT_OVERLAP   details: { count, samples: string[] (最多 5 条，形如 "「华东 120」×「杭州 80」") }
//   LAYOUT_TEXT_CLIPPED   details: { count, samples: string[] }
//   LAYOUT_LOW_CONTRAST   details: { count, samples: string[], minRatio: number }
//   TITLE_MISSING         hint: '--title "…"'
// ErrorCode、退出码不变。
// 页面 DOM：#chart-box > #chart-stage + #tooltip（属于 viewer 的内部结构，不算公共契约，但需要在 ADR 中记录，方便测试引用）
```

---

## 4. 分项设计

### 4.1 交互修复（D1、D2，H1–H3）

- `html.ts` 页面模板改为 `<div id="chart-box"><div id="chart-stage">${svg}</div><div id="tooltip" aria-live="polite" role="tooltip"></div></div>`。
- `runtime.ts`：
  - 以下几处的写入目标都改为 `$('#chart-stage')`：第 177 行和第 164 行的错误提示、第 182 行的 SVG、第 161–162 行的 flow 渲染。
  - 第 183–185 行的 `box.firstElementChild` 改为 `stage.firstElementChild`。
  - 第 275–297 行的 tooltip 逻辑改为调用 `tooltip.ts`，每次通过 `$('#tooltip')` 现取元素。
  - **要先核实**：3D 视图的拖拽逻辑（第 271 行附近）和 `__scene` 的读取有没有依赖 `box.firstElementChild`，有的话一并改。
- `compose-html.ts` 和 `runtime-compose.ts` 按 H3 处理：每个面板的 SVG 和点击联动不变，新增 mousemove、mouseleave 和页面级 `#tooltip`。
- CSS：`#chart-box` 保持 `position: relative`（核实现状）；`#tooltip` 的 `pointer-events: none`、`z-index`、深色主题样式都要核实。打印样式中隐藏 `#tooltip`。

### 4.2 呈现质量（D3–D9，H4、H5、H8–H12）

- **D3 标题**：
  - 先定位组合页面板标题和单图页标题取值的地方，用 grep 找 `chart.id`、`.id ??`、`stem` 作为标题的写法，全部改成 H4 的兜底链。
  - 中文视图名取契约中已有的中文名称字段（核实字段名）。如果没有这个字段，就在 contracts 中为 35 个视图补一个 `title` 字段，属于契约增量，写进 ADR-0016。
  - 在 `generate.ts` 中给 5 个场景包的每张图补上标题。标题写成结论导向的短句，不超过 16 个字，例如"月度销售额"、"品类销售构成"、"转化漏斗"、"流量路径"，与该图的 `question` 呼应。
- **D4 避让与刻度**：
  - 按 H8 列出的视图逐个接入 `placeLabels`。每个视图接入后，都要用 §4.3 的版面检查跑一遍它的主样例和所在场景包，确认 error 为 0。
  - 轴刻度按 H9 在 chart-skin 中统一实现，不要在各视图里各写一份。
- **D5 堆叠面积**：
  - 先核实 §1 中的两个可疑点：分别用单图模式和组合页渲染 `retail/monthly_sales.csv`（`options.fill=stack`），对比配色是否一致，并检查 `line.ts:96-97` 的底边计算。
  - 修复要求：每个系列使用调色板中不同的颜色。组合页中系列数不少于 2 的面板显示紧凑图例（单行、可折行、最多 8 项，超出部分显示"+N"）。
  - 单测：断言堆叠模式下第 k 层填充区域的底边，等于前 k−1 层累加值换算后的像素位置。
- **D6 值域**：按 H10 实现，并替换 scatter、line、bar、combo、histogram 中现有的值域计算。单测覆盖：全正、全负、跨零、单点、全部相等。
- **D7 默认标题**：按 H5 实现；静态版式中标题的字号和位置沿用现有 `text.title` 的样式。
- **D8 treemap**：按 H11 重写。单测：
  - 每个矩形的面积与目标面积的相对误差不超过 0.5%；
  - 全部矩形面积之和等于画布面积（误差不超过 0.5%）；
  - `sample-treemap.csv` 在 1200×675 下，叶子矩形的平均长宽比不超过 3。
- **D9 formula**：按 H12 实现。

### 4.3 版面检查器（H6、H7）

- 新增 `chart-core/src/lint.ts`，并从 `chart-core` 的 index 中导出。CLI 的 `renderChart` 和 `compose` 在生成 Scene 后调用它，按 H7 写入 warnings。
- 新增测试 `test/layout/lint.test.ts`，覆盖以下组合：
  - `examples/basic` 中每个视图的主样例 × {light, dark} × {1200×675, 600×360}；
  - 5 个场景包中的每张图，按 pack.json 的 spec 渲染，尺寸 1200×675；
  - 每个 compose 文件中的每个面板，按面板的实际尺寸。
  - **error 必须为 0**；warn 输出汇总，但不判失败。
- 豁免文件 `test/layout/allowlist.json`：每一条必须写明视图、样例、问题类型和理由。本期结束时应该为空；如果确实需要豁免，在 IMPLEMENTATION_NOTES 中逐条说明。
- 先做检查器、后做修复：M2d.1 先让检查器跑起来，记录当前的 error 数作为基线，再在 M2d.2 中把它降到 0。

### 4.4 交互测试（D10）

新增 `test/visual/interaction.spec.ts`，在 Playwright 中针对单图页和组合页运行：

| 用例 | 断言 |
|---|---|
| 悬停提示（全部 SVG 视图的主样例） | 在 `#chart-box` 内按 12×8 的网格移动鼠标，至少有一个点能让 `#tooltip` 可见（`display` 不为 none，`textContent` 非空），并且浮层完整位于视口内 |
| 移出隐藏 | 鼠标移出 `#chart-box` 后，`#tooltip` 隐藏 |
| 图例切换（有图例的视图） | 点击第一个图例项后，该项带上 `hidden` 状态，`window.__VIRTA__.modelHash` 不变，但 SVG 内容发生变化；再点一次恢复原状 |
| 状态恢复 | 切换变体和排序后，复制 URL 用新页面打开，选中状态和 SVG 与切换后一致 |
| 组合页悬停 | 每个面板都至少有一个点能让提示框可见 |
| 组合页联动 | 点击某个面板的一个数据点后，至少有一个其他面板的 `panels[i].modelHash` 发生变化；清除筛选后恢复 |
| 3D 视图 | 拖拽旋转期间提示框隐藏，拖拽结束后悬停能再次出现提示框 |

- **先写测试、后修**：在 M2d.0 中，悬停提示和组合页悬停两个用例应该失败，并且失败原因与 D1、D2 对应。

### 4.5 CI（D11，H14）

- 按 H14 修改 `ci.yml` 和 `release.yml`。镜像从 `ubuntu-latest` 改为 `ubuntu-24.04` 后，视觉基线需要重拍，与 H13 的人工确认合并在一起做，只确认一次。

### 4.6 Agent 实测评估（D12，H15）

**目录**：`scripts/agent-eval/`，包含 `tasks.json`（下面的任务集）、`prepare.ts`、`check.ts` 和 `README.md`（执行规程）。

- `prepare.ts`：为每个任务在系统临时目录下创建独立的工作目录，复制该任务需要的数据文件，写入 `TASK.md`（只包含任务描述）。
- `check.ts`：读取每个任务目录中由 Agent 保存的 `receipts/*.json`（也就是 virta 输出的回执），按下表的验收条件逐条判定，输出 `results.json`，字段包括 task、pass、checks[]、retries。

**执行规程**：
1. 维护者在本机全局安装当前版本的 `virta`，执行 `virta skill install` 安装技能。
2. 用一个新的 Agent 会话，工作目录设为 `prepare.ts` 生成的根目录。这个会话不能访问仓库。
3. 给它的指令固定为："依次完成每个子目录中 `TASK.md` 描述的任务。每次调用 virta 都加 `--json`，并把回执保存为该目录下的 `receipts/<序号>.json`。"
4. 跑完后执行 `check.ts`。
5. 维护者对每个任务的最终图片给出"适合 / 不适合发出"的判断，写进 `results.json` 的 `human` 字段。

指标：

- **首次成功率**：第一条 render 或 compose 回执就满足全部验收条件的任务占比；
- **最终成功率**；
- **平均重试次数**：回执数减 1；
- **人工可发出率**。

**任务集**（由主导会话编写，实施 Agent 只负责把下表原样写进 `tasks.json`，不得改动任务描述或验收条件）：

| # | 数据 | 任务描述（写进 TASK.md） | 验收条件（check.ts 依据回执判定） |
|---|---|---|---|
| A01 | `retail/monthly_sales.csv` | 按渠道看 2024–2025 年月度销售额的走势，判断销售从什么时候开始承压，出一张能直接发到群里的 PNG。 | `view ∈ {line, combo}`；`spec.text.title` 非空；有 png 文件 |
| A02 | `retail/category_tree.csv` | 展示各品类、二级品类、系列的销售额构成，要能看出哪条品类线贡献最大。导出 HTML 和 PNG。 | `view ∈ {sunburst, treemap}`；有 html 和 png |
| A03 | `retail/funnel_jul_aug.csv` | 7 月和 8 月的转化漏斗分别在哪一步流失最多？出一张图对比两个月。 | `view = funnel`；`variant = multi`，或者 `spec.facet` 按月份分面 |
| A04 | `retail/traffic_paths.csv` | 用户从哪些入口一路流向下单和支付？出一张流向图。 | `view = sankey` |
| A05 | `retail/profit_bridge.csv` | 利润从毛利到期末净利是怎么一步步变化的？ | `view = bar` 且 `variant = waterfall` |
| A06 | `retail/store_hours.csv` | 门店一周内哪天、几点客流最高？ | `view = heatmap` |
| A07 | `saas/cohort_retention.csv` | 看看各月注册的新用户，后续每期的留存表现如何，哪一批最差。 | `view = cohort` |
| A08 | `quality/daily_defect_rate.csv` | 每日不良率有没有出现失控点？请画质量控制图。 | `view = control` |
| A09 | `delivery/plan.csv` | 画出项目计划和任务依赖，以 2026-11-05 作为报告日，标出今天的位置。 | `view = gantt`；回执中的 `time.asOf` 以 `2026-11-05` 开头 |
| A10 | `finance/budget_vs_actual.csv` | 各部门的预算执行情况如何？要同时看到实际、预算和好坏区间。 | `view = bullet` |
| A11 | A01、A03、A04 的数据 | 把月度销售走势、转化漏斗、流量路径这三张图拼成一个仪表盘 HTML。 | `command = compose`；`ok = true`；panels 数量为 3；有 html 文件 |
| A12 | `basic/sample-multi.csv` | 以"城市"为横轴，按业务线分组画柱状图。注意：文件里的列名可能和描述不完全一致。 | 最终回执 `ok = true` 且 `view = bar`；允许中途出现 MISSING_COLUMN 等失败回执，但最终必须成功（考察 Agent 能否利用错误提示自行纠正） |

- **真实数据试点**：用户提供研发截止日报的真实数据后，按同样的规程另外跑一次。**真实数据和它的结果都不得入库**（R9），只把指标数字写进 IMPLEMENTATION_NOTES。

---

## 5. 测试新增一览

| 层 | 新增 |
|---|---|
| 单元 | `tooltip.ts`（边界翻转、转义）、`paddedDomain`（5 种情况）、`squarify`（面积误差、总和、长宽比）、堆叠面积底边、`lintScene`（四类问题各有正例和反例）、轴刻度稀疏、旋转、截断的选择、标题兜底链 |
| 版面 | `test/layout/lint.test.ts`（§4.3） |
| Playwright | `interaction.spec.ts`（§4.4）；重拍视觉基线（H13） |
| e2e | 回执中出现 `TITLE_MISSING`；用一个刻意构造的拥挤样例触发 `LAYOUT_TEXT_OVERLAP`，并检查 details 结构 |
| 规范 | 每个 pack chart 都必须有 `spec.text.title` |
| 评估 | `scripts/agent-eval/check.ts` 用两组人工构造的回执做自测（一组全部通过、一组全部失败），保证判定逻辑本身是对的 |

---

## 6. 里程碑

每个里程碑的结束条件与 2b、2c 相同：DoD 通过 → 更新 IMPLEMENTATION_NOTES → 以 R9 身份本地提交 → fast-forward push → `gh run watch` 确认 CI。

### M2d.0 先写会失败的测试

- [ ] 编写 `interaction.spec.ts`；确认悬停提示和组合页悬停两个用例失败，并且失败原因对应 D1、D2。
- [ ] 为 D8 的 squarify 单测、D6 的 `paddedDomain` 单测、D5 的堆叠底边单测写锚点，用 `it.fails` 标记。

**DoD**：上述锚点全部确认复现，其余测试保持全绿。

### M2d.1 交互修复与版面检查器

- [ ] 完成 §4.1，即 H1–H3 的全部内容。
- [ ] 完成 §4.3 的检查器和测试，记录首次运行的 error 基线（按视图统计）；回执接入 H7 的告警码；写 ADR-0016。

**DoD**：`interaction.spec.ts` 全部通过；`lint.test.ts` 能运行（此时暂时允许 error，但要记录基线数量）；`npm run typecheck && npm test && npm run test:e2e` 通过。

### M2d.2 呈现质量

- [ ] 完成 §4.2，D3–D9 全部修完。
- [ ] `lint.test.ts` 的 error 降到 0，豁免文件为空；M2d.0 的锚点全部转为普通断言。
- [ ] 修复 D13（no-leak 测试偶发失败），把根因写进 IMPLEMENTATION_NOTES。

**DoD**：`npm run typecheck && npm test && npm run test:e2e && npm run test:perf && npm run packs:check` 通过；`lint.test.ts` 中 error 为 0。

### M2d.3 CI 与视觉基线

- [ ] 按 H14 修改 CI。
- [ ] 生成缩略图总览：全部视图 × {light, dark}，加上 5 个场景包的仪表盘首屏和整页截图。放在仓库外的维护者本机目录，**不入库**。然后**停下来等维护者确认**。
- [ ] 维护者确认后，用 `workflow_dispatch update_snapshots=true` 在 `ubuntu-24.04` 上重拍基线，取回后提交。

**DoD**：CI 全绿（包括视觉回归和三平台 dist）；IMPLEMENTATION_NOTES 中记录了维护者的确认结论。

### M2d.4 Agent 实测基线与 v0.2.0

- [ ] 实现 `scripts/agent-eval/`（§4.6），以及 check.ts 的自测。
- [ ] 打 `v0.2.0-rc.1`，安装后按规程跑评估。Agent 会话由维护者发起，实施 Agent 不扮演被测 Agent。把指标写进 IMPLEMENTATION_NOTES。
- [ ] 如果评估中发现阻断性问题（某个任务因为 virta 的缺陷无法完成），先修复再进入下一步；如果只是技能文档写得不清楚，就改 SKILL.md。
- [ ] 更新 CHANGELOG，打 `v0.2.0`。正式版由用户确认后再打，沿用 U2c-3。

**DoD**：Release `v0.2.0` 存在；评估基线（4 项指标、12 个任务的逐项结果）已经记录。

---

## 7. 风险

| 风险 | 对策 |
|---|---|
| 版面检查器误报太多，变成噪声 | 阈值（重叠面积 15%、超出 2px、对比度 3:1）写成常量，并配有正例和反例单测；第一次运行时先看分布，再决定是否需要调整，调整要写进 ADR-0016 |
| 标签避让导致标签被隐藏，信息变少 | 只隐藏低优先级的标签，信息在 tooltip 中保留；版面检查之外，再由维护者在 H13 的人工确认中把关 |
| 改了 DOM 结构，影响打印、全屏或 3D 拖拽 | §4.1 中的"要先核实"清单；`interaction.spec.ts` 覆盖 3D；打印沿用 2b 的 C12 测试 |
| 重拍基线时把新问题一起锁进去 | H13 人工确认，实施 Agent 不得自行接受 |
| Agent 评估结果受被测 Agent 所用模型影响 | 在 IMPLEMENTATION_NOTES 中记录模型和工具名称、版本；Phase 3 复测时用同一配置 |

---

## 8. 需用户确认

| # | 事项 | 默认建议 | 时机 |
|---|---|---|---|
| U2d-1 | M2d.3 中视觉基线的人工确认由谁来做 | 由主导会话看缩略图总览给出结论，有疑问的截图再交给用户 | M2d.3 |
| U2d-2 | Agent 评估中被测会话用哪个 Agent 和模型 | 用团队成员最常用的那一个；用户指定 | M2d.4 前 |
| U2d-3 | 是否提供研发截止日报的真实数据做试点 | 提供；数据和结果都不入库 | M2d.4 前 |
