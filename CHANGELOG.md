# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 semver 0.x：
回执结构和 CLI 参数的不兼容变更升 minor，并写入 "Breaking" 小节。

## [0.2.0-rc.1] - 2026-11-09

Phase 2d 发布候选（prerelease）：交互修复、呈现质量与 Agent 实测基线工具。
正式版内容以 `## [0.2.0]` 一节为准。

### Fixed

- 交互页悬停提示框不显示：`#chart-box` 内拆分 `#chart-stage`/`#tooltip`，
  渲染写入不再清掉浮层；组合页新增悬停提示（与单图页共用 tooltip 模块）
- 标签重叠：桑基/饼图/散点/折线端点/控制限值等数据标签统一接入 `placeLabels` 避让；
  坐标轴刻度按实测宽度等距稀疏 → 旋转 −45° → 截断
- 坐标轴值域不再越过零界（新增 `paddedDomain`，按视图族选 include/clamp/free）
- treemap `squarify` 算法修正（面积按原始矩形计算）；堆叠面积系列配色与
  堆叠底边双重换算修复；组合页 ≥2 系列面板新增紧凑图例；formula 字号自适应
- 面板与静态标题兜底链（`spec.text.title` → 契约中文视图名，永不显示 chart id）；
  场景包 46 张图补齐中文标题；静态导出缺标题时回执新增 `TITLE_MISSING`（info）
- CI 视觉回归固定 `ubuntu-24.04`；`actions/checkout@v7.0.1`、`setup-node@v7.1.0`

### Added

- 回执新增版面检查告警 `LAYOUT_TEXT_OVERLAP` / `LAYOUT_TEXT_CLIPPED` /
  `LAYOUT_LOW_CONTRAST`（均为 warn，ADR-0016），details 含问题样本
- 交互行为 Playwright 用例（悬停提示/图例切换/状态恢复/组合页联动/3D 拖拽）
- `scripts/agent-eval/`：Agent 实测任务集 A01–A12、环境准备与回执判定器
  （仓库开发工具，不进 dist 产物）

## [0.1.0-rc.1] - 2026-11-07

Phase 2c 发布演练候选（prerelease）。功能内容与下方 0.1.0 一致，
用于验证 GitHub Release tarball 的分发与安装链路。

## [0.1.0] - 2026-11-07

首个面向团队分发的成品版本：tarball 自包含，`npm i -g <tarball>` 后 `virta`/`vt` 即可用，
运行依赖仅 `@resvg/resvg-js`、`papaparse`、`read-excel-file` 三个。

### Added

- CLI：`list` / `schema` / `inspect` / `validate` / `render` / `compose` / `demo` / `preview` / `guide`，
  35 个视图，HTML/SVG/PNG 导出，组合仪表盘
- `virta --version | -v | version`，`--json` 输出 envelope
- `virta doctor`：环境自检（Node/resvg/运行期脚本/字体/CJK 字形/临时目录写入）
- `virta skill install --dir <dir>` / `virta skill path`：Agent 技能安装
- 内置资源：`@samples/` 样例前缀、`virta demo <pack>` 场景包（与 cwd 无关）
- 回执 `version` 字段；`guide --json` 附带 `version` 与 `mode`

### Known limitations

- 地图视图未实现（预留）
- PNG 导出中文依赖系统 CJK 字体；Linux 缺字体时 `doctor` 报 warn，安装 `fonts-noto-cjk` 或用 `--font-file`
- `gallery` 仅在源码仓库内可用（dist 模式报 INPUT_NOT_FOUND）
