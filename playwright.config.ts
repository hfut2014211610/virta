import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/visual",
  snapshotPathTemplate: "snapshots/{testFilePath}/{arg}{ext}",
  use: {
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
});
