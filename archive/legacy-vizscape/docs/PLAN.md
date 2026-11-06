# vizscape · 快速可视化 CLI — 初步计划（Rev 1）

> 版本: v0.1.2 · 状态: 批次 B/C 完成（批次 A 图表扩展进行中）· 最后更新: 2026-11-04
> 目录: `<repo>/legacy-vizscape`

## 1. 定名：Vizscape（取意）

- **viz** = visual（可视化）
- **scape** = landscape（风景、画卷）
- 合起来：把数据「绘」成风景卷轴
- 典故呼应：用「**摩诘**」作注脚 —— 唐人王维「诗中有画，画中有诗」，以诗入画亦为可视化之旨；山水画卷的原意即把抽象山川摊进一纸之上
- CLI：`vizscape render …`；备选名：`baize`（白泽 · 晓万物）、`shenzhu`（神照，下期候选，不在今期）

## 2. 已定决策（Rev 1）

| # | 决策 | 内容 |
|---|---|---|
| 1 | 第一模板 | 柱状图（表格最常见） |
| 2 | 输入 | **CSV / JSON / Excel 三者全支持**（Excel 依赖 openpyxl，缺少时 CLI 给出安装提示，不静默失败） |
| 3 | 主题 | **双套可切换**：浅色纸面（Meridian） / 暗色观测站（Pulse），同一模板出两套，`--theme light|dark` + 页面内开关 |
| 4 | 工具名 | **vizscape**（旧 `vizkit` 仅作草案目录保留，不再使用） |

## 3. 目录结构

```
vizscape/
  docs/PLAN.md
  vizscape.py         # CLI 瘦壳入口（sys.path 引导 → vizlib.cli:main）
  vizlib/
    core.py           # 共享解析与工具：别名表、read_raw、数值解析、质量骨架、模板替换、日期解析
    charts/           # 每图族一模块：数据 → 模型 → 表格/质量 → 渲染 + CONTRACT 输入契约
      __init__.py     # REGISTRY：模板名 → 模块（TEMPLATE_IDS / render / SUMMARY_KEYS / CONTRACT）
      barline.py / scatter.py / scatter3d.py / line3d.py / pie.py / pie3d.py / bullet.py / funnel.py / radar.py
      treemap.py / gantt.py / fishbone.py / heatmap.py / sankey.py / boxplot.py / sunburst.py
    cli.py            # 命令路由：list / render / inspect / schema / preview / build-manifest
  docmd.py            # 批次 B：.md / .txt 解析 + 指标抽取 + 文档识别报告
  docrender.py        # 批次 B：报告页 HTML 渲染
  templates/
    bar-basic/
      manifest.json
      template.html   # 双主题：CSS 变量切换，data-theme
    line-basic/       # 折线图（批次 A）
    bar-matrix/       # 3D 矩阵（批次 A）
    bullet/           # 子弹图（批次 A 扩展）
    report-basic/     # 文档报告页（批次 B/C）
    …（每图族一个目录，共 20 模板 / 16 图族）
  preview/index.html  # 模板画廊（按图表族分组，静态）
  examples/
    sample.csv / sample.json / sample.xlsx / sample-line.csv / …
    sample-report.md / sample-note.txt   # 批次 B/C 样例
  out/                # 生成产物
```

## 4. 数据批次

| 批次 | 输入 | 状态 |
|---|---|---|
| A 表格 | CSV / JSON / Excel → 柱状图 / 折线图 / **3D 折线** / 3D 矩阵 / 子弹图 / 散点图 / **3D 散点** / 占比图 / **3D 分层饼** / 漏斗图 / 雷达图 / 树状图 / 甘特图 / 鱼骨图 / 热力图 / 桑基图 / 箱线图 / 旭日图 / **动态表·多维透视**（双主题） | **进行中** |
| B Markdown | `.md` → 报告页：目录 + 正文 + 关键指标 + 文档识别报告 | **完成** |
| C 文字 | `.txt` 纯文本 → 同一 `report-basic` 模板 | **完成** |
| D 混合 | 多类输入（表格 + 文本）→ 组合报告（正文 + 内嵌图表） | **搁置**（定义已定，先把 A/B/C 原子类型打磨完整再引申） |

### 批次 B/C 交付

- `docmd.py`：Markdown 块解析（标题/段落/列表/表格/引用/代码/链接/图片）、指标三路抽取（显式标签 `名称：数值单位`、推断 `名称 数值单位`、表格单元格）、文档识别报告
- `docrender.py`：KPI 卡片（标注识别方式与来源句）、目录、章节篇幅、正文、指标明细表、识别报告
- `templates/report-basic/`：双主题单文件离线产物，图片不加载（占位），链接协议校验
- CLI：`render --view report`、`inspect` 对 `.md/.txt` 走 `profile_doc`、`--json` 输出 `sections/metrics` 字段
- 样例：`examples/sample-report.md`（22 指标）、`examples/sample-note.txt`（3 指标）
- 规则：`docs/TEXT_REPORT.md`

## 5. 工作流门禁

1. **实现与视觉评审**：跑出 `out/bar-basic.html`，双主题各截一张比对
2. **真实数据带入**：用你的真实表格重跑，核对字段映射
3. **固化**：CONTRACT.md + README 落版

## 6. 开工清单（批次 A）

- [x] `vizscape.py`：`list / render / preview / build-manifest`（另有 `inspect` 识别推荐、`schema` 输入契约）
- [x] 架构拆分：`vizscape.py` 瘦壳 → `vizlib/core.py`（共享解析）+ `vizlib/charts/*.py`（每图族一模块）+ `vizlib/cli.py`（路由）
- [x] Agent 契约：`vizscape schema` 列出全部图族必需列；`vizscape schema <view|模板>` 输出完整 JSON 契约（列/别名/推断规则/示例/命令）
- [x] 解析器：csv / json / xlsx（openpyxl，缺失时提示安装）
- [x] 模板：`templates/bar-basic/`（manifest + 双主题 HTML，纯 Canvas/SVG 不引 CDN）
- [x] 预览页：`preview/index.html`（画廊 + 双主题切换联动）
- [x] 示例：csv / json / xlsx 三份 + 产物 `out/bar-basic.html`
- [x] `build-manifest`：汇总 5 个模板到 `preview/manifest.json`（`--check` 校验、`--json` 输出）

## 7. 评审要点

- 双主题切换是否干净（同一份数据，两个味道）
- Excel 解析在缺 openpyxl 时是否友好提示
- 产物 HTML 是否离线可开
