import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    serviceWorkers: "block",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "node tests/browser/start-server.mjs production", wait: { stdout: /Ready on http:\/\/127\.0\.0\.1:3100/ }, timeout: 60000 },
    { command: "node tests/browser/start-server.mjs development-wrapper", wait: { stdout: /Ready on http:\/\/127\.0\.0\.1:3102/ }, timeout: 60000 },
  ],
});
