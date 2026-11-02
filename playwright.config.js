import { defineConfig } from "@playwright/test";
const port = Number(process.env.TASKLY_TEST_PORT || 5187);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./test",
  testMatch: "taskly.spec.js",
  fullyParallel: true,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
