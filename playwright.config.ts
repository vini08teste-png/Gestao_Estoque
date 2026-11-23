import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/test-database";

const baseURL = "http://127.0.0.1:3031";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031",
    url: baseURL + "/login",
    reuseExistingServer: false,
    env: { DATABASE_URL: testDatabaseUrl(), LOCAL_HTTP: "true" },
  },
});
