#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""golden 导出：对 cases.json 逐条执行 legacy 的 to_*(read_raw(path))，输出 model+quality JSON。

- 从外部 import legacy-vizscape/vizlib，不修改 legacy（R1 冻结）。
- 产物提交进 packages/data-engine/test/golden/，之后 CI 不再需要 Python。
- 用法：npm run golden:dump（仓库根目录执行）。
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
LEGACY = REPO / "legacy-vizscape"
CASES = json.loads((REPO / "scripts" / "golden" / "cases.json").read_text(encoding="utf-8"))["cases"]
OUT_DIR = REPO / "packages" / "data-engine" / "test" / "golden"

sys.path.insert(0, str(LEGACY))

from vizlib.core import read_raw  # noqa: E402
from vizlib import charts  # noqa: E402
import docmd  # noqa: E402


def resolve(fn_name):
    if fn_name == "docmd.build_doc":
        return None  # 特殊处理
    mod_name, attr = fn_name.split(".", 1)
    return getattr(getattr(charts, mod_name), attr)


def default(obj):
    if isinstance(obj, (set, frozenset, tuple)):
        return list(obj)
    return str(obj)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    for case in CASES:
        cid, path, fn_name = case["id"], LEGACY / case["file"], case["fn"]
        try:
            if fn_name == "docmd.build_doc":
                model = docmd.build_doc(path.read_text(encoding="utf-8"), path.stem)
            else:
                model = resolve(fn_name)(read_raw(path))
        except Exception as e:  # noqa: BLE001
            failures.append((cid, f"{type(e).__name__}: {e}"))
            print(f"✗ {cid}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        payload = {"case": cid, "view": case["view"], "file": case["file"], "fn": fn_name, "model": model}
        out = OUT_DIR / f"{cid}.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=1, default=default), encoding="utf-8")
        print(f"✓ {cid} -> {out.relative_to(REPO)}")
    print(f"\n{len(CASES) - len(failures)}/{len(CASES)} cases dumped -> {OUT_DIR.relative_to(REPO)}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
