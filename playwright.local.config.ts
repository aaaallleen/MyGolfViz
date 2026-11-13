import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the Local App: the local build served by the real backend, on a fresh, empty data folder.
// One worker, because every test shares that one database.
export default defineConfig({
  testDir: 'e2e-local',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8799/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npm run build:local && MYGOLFVIZ_TOKEN=e2e MYGOLFVIZ_DATA_DIR=$(mktemp -d) uv run --project apps/api mygolfviz-api --port 8799 --static-dir apps/web/dist-local',
    // The health route needs no token, so it answers as soon as the server is up.
    url: 'http://127.0.0.1:8799/api/v1/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
