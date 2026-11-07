# <img src=x onerror="window.__xss=1">

正文段落含 "><svg onload="window.__xss=2"> 注入，以及 `代码段 <img src=x onerror="window.__xss=3">`。

| 列A | 列B |
|---|---|
| <img src=x onerror="window.__xss=4"> | 正常 |
| "><svg onload="window.__xss=5"> | 正常 |

[恶意链接](javascript:window.__xss=6) 与 [正常链接](https://example.com)

- 列表项 <img src=x onerror="window.__xss=7">
