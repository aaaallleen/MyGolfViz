import { defineConfig } from '@playwright/test';

// End-to-end tests for the Mac app: the development build (`electron apps/desktop`), or the packaged app when
// MYGOLFVIZ_DESKTOP_EXECUTABLE is set. Each test gets a fresh data folder and starts its own app and backend.
// One worker, because every test opens a window and runs a backend of its own.
export default defineConfig({
  testDir: 'e2e-desktop',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 30_000 },
});
