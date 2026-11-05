// 零依赖 PNG 像素对比：解码两个 PNG，输出差异像素数与包围盒。
// 用法：node scripts/png-diff.mjs a.png b.png
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function decode(path) {
  const buf = readFileSync(path);
  let pos = 8, w = 0, h = 0, bit = 0, ct = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bit = data[8]; ct = data[9]; }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") break;
    pos += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (bit !== 8 || !ch) throw new Error(`unsupported png bit=${bit} ct=${ct}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const dst = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? dst[x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      dst[x] = v;
    }
  }
  return { w, h, ch, data: out };
}

const [a, b] = process.argv.slice(2);
const A = decode(a), B = decode(b);
if (A.w !== B.w || A.h !== B.h || A.ch !== B.ch) { console.log(`size mismatch ${A.w}x${A.h}x${A.ch} vs ${B.w}x${B.h}x${B.ch}`); process.exit(2); }
let n = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, maxD = 0;
for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
  let d = 0;
  for (let c = 0; c < A.ch; c++) d = Math.max(d, Math.abs(A.data[y * A.w * A.ch + x * A.ch + c] - B.data[y * B.w * B.ch + x * B.ch + c]));
  if (d > 8) { n++; maxD = Math.max(maxD, d); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
}
console.log(`${a} vs ${b}: diffPixels(>8)=${n} maxDelta=${maxD}` + (n ? ` bbox=[${minX},${minY}..${maxX},${maxY}]` : ""));
