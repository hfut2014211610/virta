#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导出子集字体的字宽表 → packages/design-system/fonts/metrics.json。

每字体记录 unitsPerEm 与各码位 advance width（原始单位，消费端除以 unitsPerEm 得 em 宽度），
供 chart-core 的确定性 measureText（D9）使用；浏览器与 Node 共用同一份数据。

用法：python scripts/fonts/metrics.py（先跑 subset.py）
"""
import json
from pathlib import Path

from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parent.parent.parent
FONTS = REPO / "packages" / "design-system" / "fonts"

FONTS_MAP = {
    "display-light": "fraunces-light.ttf",
    "display-medium": "fraunces-medium.ttf",
    "mono": "jetbrains-mono-regular.ttf",
}


def widths(path: Path):
    font = TTFont(path)
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()
    return upem, {str(cp): round(hmtx[glyph][0], 1) for cp, glyph in sorted(cmap.items())}


def main() -> int:
    out = {}
    for key, name in FONTS_MAP.items():
        p = FONTS / name
        if not p.exists():
            raise SystemExit(f"missing {p}; run subset.py first")
        upem, w = widths(p)
        out[key] = {"file": name, "unitsPerEm": upem, "widths": w}
        print(f"  {key}: upem={upem} glyphs={len(w)}")
    dest = FONTS / "metrics.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"-> {dest} ({dest.stat().st_size/1024:.1f}KB)")
    return 0


if __name__ == "__main__":
    main()
