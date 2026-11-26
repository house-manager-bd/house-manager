import { defineConfig, devices } from "@playwright/test";

// F12: end-to-end tests (docs/testing/F12.md section 6 and SETUP.md 8.11).
// They run against a site that is already running: `npm run dev` on a
// laptop, or a Vercel preview through E2E_BASE_URL. They never start a server.
export default defineConfig({
  testDir: "./e2e",
  // The request-to-tenancy test is one long story; the steps depend on each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    locale: "en-GB",
    timezoneId: "Asia/Dhaka",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    // Optional: use an installed Chrome or Chromium instead of `npx playwright install chromium`.
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
