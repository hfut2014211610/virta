# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 semver 0.x：
回执结构和 CLI 参数的不兼容变更升 minor，并写入 "Breaking" 小节。

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
