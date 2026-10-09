import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./qa/playwright",
  outputDir: "output/playwright",
  reporter: "list",
  workers: 1,
  use: { browserName: "chromium" },
});
