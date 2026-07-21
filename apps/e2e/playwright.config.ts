import { defineConfig, devices } from "@playwright/test";

const workspace = "../..";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @marketplace/api start",
      cwd: workspace,
      url: "http://127.0.0.1:4012/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/admin-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/buyer-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3001",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/supplier-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3002",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @marketplace/landing-web start",
      cwd: workspace,
      url: "http://127.0.0.1:3003",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
