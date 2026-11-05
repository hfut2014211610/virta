// 依赖方向强制检查（NEXT_PHASE.md §3.2）：解析各包 package.json 的 dependencies，
// 只允许声明"上方的包"。第三方运行时依赖同时对照 ADR-0007 白名单。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const PACKAGES = join(ROOT, "packages");

// §3.2 依赖图：每个包允许依赖的包集合（含传递可用的上层包，逐包显式列出）
const ALLOWED: Record<string, string[]> = {
  "@virta/contracts": [],
  "@virta/design-system": ["@virta/contracts"],
  "@virta/data-engine": ["@virta/contracts"],
  "@virta/chart-core": ["@virta/contracts", "@virta/design-system"],
  "@virta/chart-skin": ["@virta/contracts", "@virta/design-system", "@virta/chart-core"],
  "@virta/charts": ["@virta/contracts", "@virta/design-system", "@virta/chart-core", "@virta/chart-skin"],
  "@virta/viewer": [
    "@virta/contracts", "@virta/design-system", "@virta/chart-core",
    "@virta/chart-skin", "@virta/charts", "@virta/data-engine",
  ],
  "virta": [
    "@virta/contracts", "@virta/design-system", "@virta/chart-core",
    "@virta/chart-skin", "@virta/charts", "@virta/data-engine", "@virta/viewer",
  ],
};

// ADR-0007 第三方运行时白名单（devDependencies 不受此限）
const RUNTIME_ALLOWLIST = new Set(["papaparse", "read-excel-file", "@resvg/resvg-js"]);

const pkgs = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(PACKAGES, d.name, "package.json")))
  .map((d) => d.name);

describe("包依赖方向（§3.2）", () => {
  it("所有包都在依赖图中有声明", () => {
    const names = pkgs.map((d) => JSON.parse(readFileSync(join(PACKAGES, d, "package.json"), "utf8")).name as string);
    for (const n of names) expect(ALLOWED, `未登记的包: ${n}`).toHaveProperty(n);
  });

  for (const dir of pkgs) {
    it(`${dir} 的 dependencies 不越界`, () => {
      const pj = JSON.parse(readFileSync(join(PACKAGES, dir, "package.json"), "utf8"));
      const deps = Object.keys(pj.dependencies ?? {});
      const allowed = new Set([...(ALLOWED[pj.name] ?? []), ...RUNTIME_ALLOWLIST]);
      for (const d of deps) {
        expect(allowed.has(d), `${pj.name} 不允许依赖 ${d}`).toBe(true);
      }
    });
  }
});
