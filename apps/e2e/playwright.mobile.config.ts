import { defineConfig, devices } from "@playwright/test";

const workspace = "../..";
const productionBaseUrl = process.env.MOBILE_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: /marketplace\.spec\.ts/,
  grep: /mobile buyer experience/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: productionBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: productionBaseUrl
    ? undefined
    : [
        {
          command: "pnpm --filter @marketplace/api start",
          cwd: workspace,
          url: "http://127.0.0.1:4012/api/health",
          reuseExistingServer: true,
          timeout: 180_000,
        },
        {
          command: "cd apps/buyer-web && env NODE_OPTIONS= NEXT_PUBLIC_API_URL=http://127.0.0.1:4012/api ../../node_modules/.bin/next dev --webpack --port 3001",
          cwd: workspace,
          url: "http://127.0.0.1:3001",
          reuseExistingServer: true,
          timeout: 180_000,
        },
      ],
});
