# ADR-0013 交互页 HTML 安全：转义约定与 CSP 纵深防御

> 状态：已采纳 · 2026-11-07 · 依据 `docs/plan/PHASE_2B.md` §2 C5/C6、§4.1（缺陷 B1）

## 背景

审查实测：图例 chip、tooltip、数据明细表、组合页筛选 chip 把数据文本直接拼进 `innerHTML`，
`xss-label.csv` 可触发 `alert`。静态 SVG/PNG 与页面文本节点不受影响，漏洞仅在运行期 DOM 注入。

## 决策

### 1. 转义约定（C5）

- 新增 `viewer/src/safe-html.ts`（同构、无 node:* 依赖）导出：
  - `html\`…\`` 模板标签：插值默认 `escHtml` 转义；数组插值逐项转义后拼接；
  - `raw(s)`：标记可信 HTML。合法来源仅限 `toSVG(...)`（Scene 渲染产物）、
    `inlineHtml(...)`（docmd 行内渲染，已转义 + 链接协议白名单）以及 `html`` 自身产物；
  - `escHtml`、`safeColor`：颜色值白名单（`#hex` / `rgb()` / `oklch()`），
    其余回退 `transparent`，防止 `style="background:${color}"` 注入。
- 改写四处 sink：`runtime.ts`（图例 chip 改 DOM+textContent、tooltip、buildTable）、
  `runtime-compose.ts`（筛选 chip 改 textContent）；`flow-doc.ts`、`flow-table.ts` 全部走 `html``。
  能用 `textContent` / `replaceChildren` 的地方优先用 DOM API。
- 静态检查 `test/security/no-raw-innerhtml.test.ts`：扫描 `packages/viewer/src/**/*.ts`，
  `innerHTML =` / `insertAdjacentHTML(` 右侧必须是 `html\``、`raw(toSVG(` 或
  `raw(inlineHtml(` 三种形式之一；豁免登记在 `innerhtml-allowlist.txt`（当前为空，空字符串
  清空已改用 `replaceChildren()` 而非豁免项）。同文件检查 `eval` / `new Function`
  （源码与 esbuild 产物）、页面模板无内联 `on*=` 属性。

### 2. CSP 纵深防御（C6）

`singleFileHtml` / `composeHtml` 在 `<head>` 写入：

```
default-src 'none'; script-src 'sha256-<payload脚本>' 'sha256-<运行期bundle>';
style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'
```

- 哈希用 `node:crypto` 在拼接 HTML 的同一处、对最终内联脚本字符串计算（`cspMeta`），
  保证哈希与内容永远一致。
- 没有 `'unsafe-inline'` 时内联事件处理器（`onerror=`）被浏览器直接拦截——即使将来某个
  sink 漏了转义，注入脚本也执行不了；`connect-src 'none'` 在浏览器层面强制离线（R3）。
- Playwright 验证：注入 `<img onerror>` 后 `window.__xss` 仍为 undefined 且 console 出现
  CSP 违规日志；合法运行期脚本因哈希匹配正常执行（页面照常渲染）。

### 3. 语料与回归

- `examples/edge-cases/`：`xss-label.csv`（两种载荷形式）、`xss-column.csv`（列名）、
  `xss-series.csv`（系列名）、`xss-value.csv`（单元格）、`xss-link.csv`（链接列含
  `javascript:` 与 `<img>`）、`xss-doc.md`（Markdown 标题/表格/链接）、`xss-compose.json`。
- `test/visual/xss.spec.ts`：全 35 视图 + 组合页，注册 `dialog` 监听、悬停命中区、
  点击图例，断言无 dialog、`window.__xss` undefined、无 `<img>` DOM 节点、无 `on*` 属性。
- 画廊 XSS 卡片改名「转义演示」，保留作转义生效的演示。

## 后果

- 数据驱动的文本在任何 DOM sink 中都不可能成为可执行节点；CSP 作为独立第二道防线。
- `safe-html.ts` 不引入依赖；页面模板哈希用 node:crypto 只在 Node 侧（CLI）执行，
  浏览器 bundle 只含 `html`/`raw`/`escHtml`/`safeColor`。
