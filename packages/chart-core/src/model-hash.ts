// ADR-0012 运行期一致性（C4）：model 稳定序列化 + FNV-1a 哈希。
// Node 与浏览器共用同一份实现（无 node:* 依赖）。与画布宽度无关——几何不参与。

/** 稳定序列化：对象键按字典序排序，number 统一 toFixed(6)，忽略 undefined 与函数。 */
function stable(v: unknown, out: string[]): void {
  if (v === null || v === undefined) { out.push('null'); return; }
  const t = typeof v;
  if (t === 'number') { out.push(Number.isFinite(v as number) ? (v as number).toFixed(6) : 'null'); return; }
  if (t === 'string') { out.push(JSON.stringify(v)); return; }
  if (t === 'boolean') { out.push(v ? 'true' : 'false'); return; }
  if (t === 'function' || t === 'symbol' || t === 'bigint') { out.push('null'); return; }
  if (Array.isArray(v)) {
    out.push('[');
    for (let i = 0; i < v.length; i++) { if (i) out.push(','); stable(v[i], out); }
    out.push(']');
    return;
  }
  const o = v as Record<string, unknown>;
  out.push('{');
  const keys = Object.keys(o).sort();
  let first = true;
  for (const k of keys) {
    if (o[k] === undefined || typeof o[k] === 'function') continue;
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(k), ':');
    stable(o[k], out);
  }
  out.push('}');
}

/** FNV-1a 32-bit（UTF-16 码元），十六进制字符串。 */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 图族 model 的内容指纹：两端（Node adaptInput / 浏览器运行期）应当完全相等。 */
export function modelHash(model: unknown): string {
  const parts: string[] = [];
  stable(model, parts);
  return fnv1a(parts.join(''));
}
