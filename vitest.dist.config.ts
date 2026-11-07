import { defineConfig } from "vitest/config";

// dist 冒烟（PHASE_2C §5 T1/T3）：前置条件是已经执行 npm run build。
// npm pack + 仓库外安装耗时较长，超时给足。
export default defineConfig({
  test: {
    include: ["test/dist/**/*.test.ts"],
    pool: "threads",
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
