#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""字体实例化与子集化（依赖 fonttools）。

- Fraunces VF 固定为 opsz=72,wght=300 / opsz=72,wght=500 两个静态实例（SOFT=0,WONK=0）。
- 三字体统一子集：U+0020-007E, U+00A0-00FF, U+2013-2014, U+2018-201D, U+2022, U+2026,
  U+2030, U+2190-2193, U+00D7, U+2212, U+FFE5；保留 kern/tnum/lnum。
- 输出 ≤40KB/个；超限先去掉 U+00A0-00FF 重试。
- 同时把两份 OFL 拷入 packages/design-system/fonts/。

用法：python scripts/fonts/subset.py（先跑 fetch.py）
"""
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

REPO = Path(__file__).resolve().parent.parent.parent
CACHE = REPO / "scripts" / "fonts" / ".cache"
FONTS = REPO / "packages" / "design-system" / "fonts"
SIZE_LIMIT = 40 * 1024

UNICODES_FULL = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100))
    + [0x2013, 0x2014] + list(range(0x2018, 0x201E))
    + [0x2022, 0x2026, 0x2030] + list(range(0x2190, 0x2194))
    + [0x00D7, 0x2212, 0xFFE5]
)
UNICODES_REDUCED = [cp for cp in UNICODES_FULL if not (0xA0 <= cp <= 0xFF)]
KEEP_FEATURES = ["kern", "tnum", "lnum"]


def subset_font(src: Path, dest: Path, unicodes, instance=None) -> int:
    font = TTFont(src)
    if instance:
        font = instancer.instantiateVariableFont(font, instance)
    opts = subset.Options()
    opts.layout_features = KEEP_FEATURES
    opts.name_IDs = ["*"]          # 保留 name 表（OFL 要求版权信息）
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ["FFTM"]
    ss = subset.Subsetter(options=opts)
    ss.populate(unicodes=unicodes)
    ss.subset(font)
    font.save(dest)
    return dest.stat().st_size


def produce(name: str, src: Path, instance=None) -> None:
    dest = FONTS / name
    size = subset_font(src, dest, UNICODES_FULL, instance)
    level = "full"
    if size > SIZE_LIMIT:
        size = subset_font(src, dest, UNICODES_REDUCED, instance)
        level = "reduced(no A0-FF)"
    ok = "OK" if size <= SIZE_LIMIT else "OVER LIMIT"
    print(f"  {name}: {size/1024:.1f}KB [{level}] {ok}")
    if size > SIZE_LIMIT:
        raise SystemExit(f"{name} still exceeds 40KB after reduced subset")


def main() -> int:
    FONTS.mkdir(parents=True, exist_ok=True)
    fr = CACHE / "Fraunces[SOFT,WONK,opsz,wght].ttf"
    jbm = CACHE / "JetBrainsMono-Regular.ttf"
    for p in (fr, jbm, CACHE / "OFL-Fraunces.txt", CACHE / "OFL-JetBrainsMono.txt"):
        if not p.exists():
            raise SystemExit(f"missing {p}; run scripts/fonts/fetch.py first")

    print("[1/2] instance + subset")
    produce("fraunces-light.ttf", fr, {"opsz": 72, "wght": 300, "SOFT": 0, "WONK": 0})
    produce("fraunces-medium.ttf", fr, {"opsz": 72, "wght": 500, "SOFT": 0, "WONK": 0})
    produce("jetbrains-mono-regular.ttf", jbm)

    print("[2/2] copy OFL")
    shutil.copyfile(CACHE / "OFL-Fraunces.txt", FONTS / "OFL-Fraunces.txt")
    shutil.copyfile(CACHE / "OFL-JetBrainsMono.txt", FONTS / "OFL-JetBrainsMono.txt")
    print("done ->", FONTS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
