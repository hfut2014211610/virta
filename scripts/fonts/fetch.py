#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""字体下载（已获授权）：官方来源 → scripts/fonts/.cache/（gitignore）。

- Fraunces：google/fonts 仓库 ofl/fraunces/ 可变字体 TTF + OFL.txt（记录 main 分支 commit）。
- JetBrains Mono：JetBrains/JetBrainsMono 最新 Release 压缩包，取 fonts/ttf/JetBrainsMono-Regular.ttf + OFL.txt。
- 每个文件计算 SHA-256，连同来源 URL / Release-commit / 下载日期写入 packages/design-system/fonts/SOURCE.md。

用法：python scripts/fonts/fetch.py
"""
import hashlib
import json
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CACHE = REPO / "scripts" / "fonts" / ".cache"
FONTS = REPO / "packages" / "design-system" / "fonts"

FRAUNCES_TTF_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
FRAUNCES_OFL_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt"
JBM_ZIP_URL_TPL = "https://github.com/JetBrains/JetBrainsMono/releases/download/{tag}/JetBrainsMono-{ver}.zip"
JBM_LATEST = "https://github.com/JetBrains/JetBrainsMono/releases/latest"

UA = {"User-Agent": "virta-font-fetch/1.0"}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def fetch(url: str, dest: Path) -> None:
    print(f"  GET {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:
        f.write(r.read())


def head_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "ls-remote", "https://github.com/google/fonts.git", "refs/heads/main"],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout.strip()
        return out.split()[0] if out else "unknown"
    except Exception:
        return "unknown"


def jbm_latest_tag() -> str:
    req = urllib.request.Request(JBM_LATEST, headers=UA, method="HEAD")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.url.rstrip("/").rsplit("/", 1)[-1]


def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    FONTS.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date().isoformat()
    records = []

    print("[1/4] resolve refs")
    gf_commit = head_commit()
    tag = jbm_latest_tag()
    ver = tag.lstrip("v")
    print(f"  google/fonts main = {gf_commit}")
    print(f"  JetBrainsMono latest = {tag}")

    print("[2/4] download Fraunces")
    fr_ttf = CACHE / "Fraunces[SOFT,WONK,opsz,wght].ttf"
    fr_ofl = CACHE / "OFL-Fraunces.txt"
    if not fr_ttf.exists():
        fetch(FRAUNCES_TTF_URL, fr_ttf)
    if not fr_ofl.exists():
        fetch(FRAUNCES_OFL_URL, fr_ofl)
    records.append({
        "name": "Fraunces (variable font)",
        "file": fr_ttf.name,
        "url": FRAUNCES_TTF_URL,
        "ref": f"google/fonts main @ {gf_commit}",
        "license_url": FRAUNCES_OFL_URL,
        "license": "SIL Open Font License 1.1",
        "downloaded": today,
        "sha256": sha256(fr_ttf),
    })
    records.append({
        "name": "Fraunces OFL.txt",
        "file": fr_ofl.name,
        "url": FRAUNCES_OFL_URL,
        "ref": f"google/fonts main @ {gf_commit}",
        "downloaded": today,
        "sha256": sha256(fr_ofl),
    })

    print("[3/4] download JetBrainsMono release")
    zpath = CACHE / f"JetBrainsMono-{ver}.zip"
    if not zpath.exists():
        fetch(JBM_ZIP_URL_TPL.format(tag=tag, ver=ver), zpath)
    records.append({
        "name": "JetBrains Mono release archive",
        "file": zpath.name,
        "url": JBM_ZIP_URL_TPL.format(tag=tag, ver=ver),
        "ref": f"JetBrains/JetBrainsMono {tag}",
        "license": "SIL Open Font License 1.1",
        "downloaded": today,
        "sha256": sha256(zpath),
    })

    print("[4/4] extract ttf + ofl")
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
        ttf_name = next(n for n in names if n.endswith("fonts/ttf/JetBrainsMono-Regular.ttf"))
        ofl_name = next(n for n in names if n.endswith("OFL.txt"))
        jbm_ttf = CACHE / "JetBrainsMono-Regular.ttf"
        jbm_ofl = CACHE / "OFL-JetBrainsMono.txt"
        jbm_ttf.write_bytes(z.read(ttf_name))
        jbm_ofl.write_bytes(z.read(ofl_name))
    records.append({
        "name": "JetBrainsMono-Regular.ttf (extracted)",
        "file": jbm_ttf.name,
        "url": f"{zpath.name}!{ttf_name}",
        "ref": f"JetBrains/JetBrainsMono {tag}",
        "downloaded": today,
        "sha256": sha256(jbm_ttf),
    })

    (CACHE / "manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# 字体来源（SOURCE.md）",
        "",
        "> 由 `scripts/fonts/fetch.py` 生成。子集 TTF（本目录 *.ttf）均从下列原始文件派生；",
        "> 授权为 SIL OFL 1.1：需保留版权声明、不得单独售卖字体。OFL 文本见 OFL-Fraunces.txt / OFL-JetBrainsMono.txt。",
        "",
        "| 文件 | 来源 | 版本/引用 | 下载日期 | SHA-256 |",
        "|---|---|---|---|---|",
    ]
    for r in records:
        lines.append(f"| {r['file']} | {r['url']} | {r['ref']} | {r['downloaded']} | `{r['sha256']}` |")
    lines += [
        "",
        "## 衍生文件",
        "",
        "| 文件 | 派生自 | 处理 |",
        "|---|---|---|",
        "| fraunces-light.ttf | Fraunces VF | instancer opsz=72,wght=300,SOFT=0,WONK=0 + 子集 |",
        "| fraunces-medium.ttf | Fraunces VF | instancer opsz=72,wght=500,SOFT=0,WONK=0 + 子集 |",
        "| jetbrains-mono-regular.ttf | JetBrainsMono-Regular.ttf | 子集 |",
        "",
        "子集范围与保留特性见 `scripts/fonts/subset.py`；字宽表 `metrics.json` 由 `scripts/fonts/metrics.py` 从子集 TTF 导出。",
        "",
    ]
    (FONTS / "SOURCE.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{len(records)} files cached -> {CACHE}")
    print(f"SOURCE.md -> {FONTS / 'SOURCE.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
