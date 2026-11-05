// M0.1 视觉对比：对 virta-m0/{base,head}/<name>.html 逐对截图（1280×800, dsf=1），
// PNG 字节相同即判一致；不同的落盘到 virta-m0/shots/{base,head}/ 供人工核对。
// 用法：node scripts/m0-shot-compare.mjs
import { chromium } from "playwright";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.env.VIRTA_M0_ROOT ?? "../virta-m0";
const BASE = `${ROOT}/base`, HEAD = `${ROOT}/head`;
const SHOTS_B = `${ROOT}/shots/base`, SHOTS_H = `${ROOT}/shots/head`;
mkdirSync(SHOTS_B, { recursive: true });
mkdirSync(SHOTS_H, { recursive: true });

const files = readdirSync(BASE).filter((f) => f.endsWith(".html")).sort();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

const same = [], diff = [], err = [];
for (const f of files) {
  try {
    await page.goto(`file:///${BASE}/${f}`);
    await page.waitForTimeout(1800);
    const s1 = await page.screenshot();
    await page.goto(`file:///${HEAD}/${f}`);
    await page.waitForTimeout(1800);
    const s2 = await page.screenshot();
    if (s1.equals(s2)) {
      same.push(f);
    } else {
      diff.push(f);
      writeFileSync(`${SHOTS_B}/${f}.png`, s1);
      writeFileSync(`${SHOTS_H}/${f}.png`, s2);
    }
  } catch (e) {
    err.push(`${f}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
console.log(`total=${files.length} pixel-identical=${same.length} diff=${diff.length} err=${err.length}`);
for (const f of diff) console.log(`DIFF ${f}`);
for (const e of err) console.log(`ERR  ${e}`);
