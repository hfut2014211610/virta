// ADR-0013 可信 HTML 组装（C5）：数据驱动的文本一律经 escHtml 转义；
// 插值默认转义，只有 raw() 标记的可信输出（toSVG / inlineHtml）原样进入。
// 本模块是同构的（浏览器 bundle 与 Node 共用），不得引入 node:* 依赖。

/** 可信 HTML 片段：raw() 的唯一合法来源是 toSVG / inlineHtml / 已逐项转义的拼接结果。 */
export interface TrustedHtml { readonly html: string }

export const raw = (s: string): TrustedHtml => ({ html: s });

export const escHtml = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const put = (out: string[], v: unknown): void => {
  if (v === null || v === undefined || v === false) return;
  if (typeof v === 'object') { out.push((v as TrustedHtml).html); return; }
  out.push(escHtml(String(v)));
};

/** 模板标签：`html`<b>${name}</b>` —— 插值转义；数组插值逐项转义后拼接；
 *  raw(...) 插值原样输出（调用方对内容负责，仅限 toSVG/inlineHtml/本标签产物）。 */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): string {
  const out: string[] = [];
  strings.forEach((s, i) => {
    out.push(s);
    const v = vals[i];
    if (i < vals.length) Array.isArray(v) ? v.forEach((x) => put(out, x)) : put(out, v);
  });
  return out.join('');
}

/** 颜色值白名单（style 注入防线）：仅 #hex / rgb(a)() / oklch()，其余回退 transparent。 */
export function safeColor(c: unknown): string {
  const s = String(c ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgba?\(\s*[-+\d.]+%?\s*,\s*[-+\d.]+%?\s*,\s*[-+\d.]+%?\s*(?:[,/]\s*[-+\d.]+%?\s*)?\)$/i.test(s)) return s;
  if (/^oklch\(\s*[-+\d.]+%?\s+[-+\d.]+%?\s+[-+\d.]+(?:deg|rad|turn)?\s*(?:\/\s*[-+\d.]+%?\s*)?\)$/i.test(s)) return s;
  return 'transparent';
}
