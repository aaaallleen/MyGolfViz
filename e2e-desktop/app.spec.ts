// The Mac app end to end: the real Electron shell, its real backend and a fresh data folder per test.
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { cspViolations, FIXTURES, importInto } from '../e2e-local/helpers';
import {
  appOrigin,
  backendPid,
  expectLibrary,
  isAlive,
  launchApp,
  startLocalBackend,
  stopProcess,
} from './helpers';

let dataDir: string;
let launched: { app: ElectronApplication; page: Page }[];
let localBackend: ChildProcess | null;

/** Launches the app on this test's data folder; afterEach closes it and checks its window's CSP violations. */
async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const opened = await launchApp(dataDir);
  launched.push(opened);
  return opened;
}

const errorTitle = (page: Page, title: string) => page.getByRole('heading', { level: 1, name: title });

test.beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'mygolfviz-desktop-e2e-'));
  launched = [];
  localBackend = null;
});

test.afterEach(async () => {
  try {
    for (const { app } of launched) await app.close();
  } finally {
    if (localBackend) await stopProcess(localBackend);
    await rm(dataDir, { recursive: true, force: true });
  }
  // The app's Content-Security-Policy, and the splash and error pages' own, must never block anything.
  for (const { page } of launched) expect(cspViolations(page)).toEqual([]);
});

test('opens the library and keeps a session across quit and reopen', async () => {
  const first = await launch();
  await expect(first.page.getByRole('heading', { name: 'No sessions yet' })).toBeVisible();
  await expect(first.page.getByRole('link', { name: 'Sessions', exact: true })).toBeVisible();

  await first.page.getByRole('link', { name: 'Load Session CSV' }).first().click();
  await expect(first.page).toHaveURL(/#\/import$/);
  await importInto(first.page, [FIXTURES[0]], { newName: 'Desktop e2e' });

  // Quitting stops the backend.
  const pid = await backendPid(first.app);
  expect(pid).not.toBeNull();
  await first.app.close();
  await expect.poll(() => isAlive(pid!), { timeout: 5000 }).toBe(false);

  const second = await launch();
  await expect(second.page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible();
  await expect(second.page.getByRole('link', { name: 'Desktop e2e' })).toBeVisible();
});

test('backend crash shows the error screen and Restart backend recovers', async () => {
  const { app, page } = await launch();
  await expectLibrary(page);
  const pid = await backendPid(app);
  expect(pid).not.toBeNull();

  process.kill(pid!, 'SIGKILL');
  await expect(errorTitle(page, 'MyGolfViz stopped unexpectedly')).toBeVisible();
  await expect(page.getByText('Your saved sessions are safe. Restart the backend to continue.')).toBeVisible();

  await page.getByRole('button', { name: 'Restart backend' }).click();
  await expectLibrary(page);
  const restarted = await backendPid(app);
  expect(restarted).not.toBeNull();
  expect(restarted).not.toBe(pid);
});

test('already running shows its own message', async () => {
  localBackend = await startLocalBackend(dataDir);
  const { page } = await launch();
  await expect(errorTitle(page, 'MyGolfViz is already running')).toBeVisible();
  await expect(
    page.getByText(
      'Another copy is using your data folder (for example npm run local in a terminal). Quit it, then choose Restart backend.',
    ),
  ).toBeVisible();

  await stopProcess(localBackend);
  await page.getByRole('button', { name: 'Restart backend' }).click();
  await expectLibrary(page);
});

test('navigation stays inside the app', async () => {
  const { app, page } = await launch();
  await expectLibrary(page);
  const origin = await appOrigin(app);
  expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

  // Record what would open in the system browser instead of opening it.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as unknown as { __opened: string[] }).__opened = opened;
    shell.openExternal = async (url: string) => void opened.push(url);
  });
  const openedExternally = () => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);

  // A local file, and another port on the app's own host, are blocked outright. The document itself is asked for
  // its origin and content: when the app cancels a navigation, Playwright is never told that it ended, so its
  // waiting locator checks would wait for that navigation forever.
  const library = page.getByRole('heading', { name: 'No sessions yet' });
  for (const target of ['file:///etc/hosts', 'http://127.0.0.1:1/']) {
    await page.evaluate((url) => {
      location.href = url;
    }, target);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.origin)).toBe(origin);
    expect(await library.isVisible()).toBe(true);
  }

  // Another site opens in the system browser, never in a window of the app.
  await page.evaluate(() => {
    window.open('https://example.com');
  });
  await expect.poll(openedExternally).toEqual(['https://example.com/']);
  expect(app.windows()).toHaveLength(1);
  expect(await page.evaluate(() => location.origin)).toBe(origin);
});
