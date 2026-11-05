import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    exclude: ["test/e2e/**", "test/perf/**", "**/node_modules/**"],
  },
});
