#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vizscape · CLI 入口（瘦壳）。

实现已拆分到 vizlib/ 包：
  vizlib/core.py      共享解析与工具（别名、read_raw、质量骨架、模板替换）
  vizlib/charts/*.py  每个图族一个模块：数据 → 模型 → 表格/质量 → 渲染，附 CONTRACT
  vizlib/cli.py       命令路由（list / render / inspect / schema / preview / build-manifest）
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vizlib.cli import main

if __name__ == "__main__":
    main()
