# 字体来源（SOURCE.md）

> 由 `scripts/fonts/fetch.py` 生成。子集 TTF（本目录 *.ttf）均从下列原始文件派生；
> 授权为 SIL OFL 1.1：需保留版权声明、不得单独售卖字体。OFL 文本见 OFL-Fraunces.txt / OFL-JetBrainsMono.txt。

| 文件 | 来源 | 版本/引用 | 下载日期 | SHA-256 |
|---|---|---|---|---|
| Fraunces[SOFT,WONK,opsz,wght].ttf | https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf | google/fonts main @ bbda7253fc363238b05d97515ca71f8ae49c4fa9 | 2026-11-05 | `177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb` |
| OFL-Fraunces.txt | https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt | google/fonts main @ bbda7253fc363238b05d97515ca71f8ae49c4fa9 | 2026-11-05 | `bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b` |
| JetBrainsMono-2.304.zip | https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip | JetBrains/JetBrainsMono v2.304 | 2026-11-05 | `6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf` |
| JetBrainsMono-Regular.ttf | JetBrainsMono-2.304.zip!fonts/ttf/JetBrainsMono-Regular.ttf | JetBrains/JetBrainsMono v2.304 | 2026-11-05 | `a0bf60ef0f83c5ed4d7a75d45838548b1f6873372dfac88f71804491898d138f` |

## 衍生文件

| 文件 | 派生自 | 处理 |
|---|---|---|
| fraunces-light.ttf | Fraunces VF | instancer opsz=72,wght=300,SOFT=0,WONK=0 + 子集 |
| fraunces-medium.ttf | Fraunces VF | instancer opsz=72,wght=500,SOFT=0,WONK=0 + 子集 |
| jetbrains-mono-regular.ttf | JetBrainsMono-Regular.ttf | 子集 |

子集范围与保留特性见 `scripts/fonts/subset.py`；字宽表 `metrics.json` 由 `scripts/fonts/metrics.py` 从子集 TTF 导出。
