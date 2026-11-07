import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @resvg/resvg-js 的 napi 原生模块在 Windows 的 forks 池下崩溃，统一用 threads 池
    pool: "threads",
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    exclude: ["test/e2e/**", "test/perf/**", "test/dist/**", "**/node_modules/**"],
  },
});
