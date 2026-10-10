import { defineConfig, devices } from "@playwright/test";

const backendURL = process.env.STA_BACKEND_URL ?? "http://localhost:8000";
const frontendURL = process.env.STA_FRONTEND_URL ?? "http://localhost:5173";

const backend = new URL(backendURL);
const frontend = new URL(frontendURL);
const video = process.env.STA_E2E_VIDEO === "on" ? "on" : "retain-on-failure";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  testDir: ".",
  testIgnore: ["**/with-data/**", "**/auth-refresh.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  // The suite shares this machine with other users' load; occasional slow
  // renders/round-trips time out even when the app is healthy. Retries are
  // safe here: the backend recreates its test database per run and every
  // fixture name is unique per test.
  retries: 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: frontendURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video,
  },
  webServer: [
    {
      command: `uv run --directory ../.. --package sta sta serve -c appconfig-postgis.json --http ${backend.host} --testing`,
      url: backendURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `STA_BACKEND_URL=${backendURL} STA_CONFIG_PATH=../../distributions/full/frontend/sta.config.ts npm --prefix ../../core/frontend run dev -- --host ${frontend.hostname} --port ${frontend.port}`,
      url: `${frontendURL}/login`,
      reuseExistingServer: !process.env.CI,
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
