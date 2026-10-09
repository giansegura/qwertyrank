import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm db:migrate && pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Playwright merges it with process.env. Cloudflare test keys (spec 4a §2.2): the invisible widget
    // always passes and `siteverify` always accepts. The site key is fixed at build time.
    env: {
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000BB",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
