import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx tests/e2e/harness.ts",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
