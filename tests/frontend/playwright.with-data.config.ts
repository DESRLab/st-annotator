import { defineConfig, devices } from "@playwright/test";

const backendURL = process.env.STA_BACKEND_URL ?? "http://localhost:8000";
const frontendURL = process.env.STA_FRONTEND_URL ?? "http://localhost:5173";

const backend = new URL(backendURL);
const frontend = new URL(frontendURL);
const video = process.env.STA_E2E_VIDEO === "on" ? "on" : "retain-on-failure";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  testDir: "./with-data",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  // The suite shares this machine with other users' load; timing-sensitive
  // canvas gestures occasionally exceed their waits, and the browser connection
  // occasionally drops mid-suite, even when the app is healthy. Tests that
  // persist mutations to the shared fixture database opt out via
  // `test.describe.configure({ retries: 0 })`; every other test is read-only or
  // local-only, so retrying it cannot corrupt shared state.
  retries: 2,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-with-data", open: "never" }],
  ],
  use: {
    baseURL: frontendURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video,
  },
  // Reuse is disabled for both servers: this suite depends on a freshly
  // seeded fixture backend and a frontend built with VITE_STA_E2E_PROBE.
  // Reusing a pre-existing server (allowed when not in CI) could silently
  // lack the seeded pointer-target labels and/or the probe, making the
  // pointer-routing scenarios fail despite this config declaring those
  // prerequisites. Starting fresh guarantees both; free the ports (or point
  // STA_BACKEND_URL / STA_FRONTEND_URL at free ones) if a stale server is up.
  webServer: [
    {
      command: `uv run --directory ../backend --package sta-integration-tests python ../frontend/serve_e2e_fixture.py --http ${backend.host}`,
      url: backendURL,
      reuseExistingServer: false,
      timeout: 300_000,
      // The fixture removes its generated scans and mesh during ASGI
      // shutdown. Playwright otherwise kills web servers immediately, which
      // bypasses both Uvicorn's lifespan shutdown and Python cleanup blocks.
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
    },
    {
      // VITE_STA_E2E_PROBE enables the read-only editor projection probe
      // (window.__STA_E2E_PROBE__) used by the e2e helpers; only this
      // fixture-backed config sets it.
      command: `STA_BACKEND_URL=${backendURL} STA_CONFIG_PATH=../../distributions/full/frontend/sta.config.ts VITE_STA_E2E_PROBE=1 npm --prefix ../../core/frontend run dev -- --host ${frontend.hostname} --port ${frontend.port}`,
      url: `${frontendURL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
