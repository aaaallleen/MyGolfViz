import { expect, test, type Page } from '@playwright/test';
import { loadAndAnalyze } from './helpers';

const ORIGIN = 'http://localhost:4173';

async function playBriefly(page: Page, scope = page.locator('body')) {
  await scope.getByRole('button', { name: 'Play replay' }).first().click();
  await expect(scope.getByRole('button', { name: 'Pause replay' }).first()).toBeVisible();
  await scope.getByRole('button', { name: 'Pause replay' }).first().click();
  await expect(scope.getByRole('button', { name: 'Play replay' }).first()).toBeVisible();
}

test('three CSVs analyze as one temporary working set', async ({ page }) => {
  await loadAndAnalyze(page);
  await expect(page.getByText('3 source files')).toBeVisible();
  await expect(page.getByText('133 shots', { exact: true })).toBeVisible();
  await expect(page.getByText('In this browser only')).toBeVisible();
});

test('no request leaves the origin, uses a non-GET method, carries a body, or targets /api/', async ({ page }) => {
  const violations: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const u = new URL(url);
    if (u.origin !== ORIGIN) violations.push(`cross-origin ${req.method()} ${url}`);
    if (req.method() !== 'GET') violations.push(`non-GET ${req.method()} ${url}`);
    if (req.postData() !== null) violations.push(`body ${url}`);
    if (u.pathname.includes('/api/')) violations.push(`api ${url}`);
  });
  page.on('websocket', (ws) => violations.push(`websocket ${ws.url()}`));

  await loadAndAnalyze(page);
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  await expect(page.getByText('Ball data', { exact: true })).toBeVisible();
  await playBriefly(page, page.locator('.ball-data'));

  const clubData = page.locator('.club-data');
  await page.getByRole('tab', { name: 'Face impact' }).click();
  await expect(page.getByRole('tab', { name: 'Face impact' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '2D reconstruction' }).click();
  await expect(page.getByRole('tab', { name: '2D reconstruction' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '3D', exact: true }).click();
  await expect(page.getByText('Illustrative reconstruction')).toBeVisible();
  await playBriefly(page, clubData);

  expect(violations).toEqual([]);
});

test('no durable storage', async ({ page, context }) => {
  await loadAndAnalyze(page);
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  await expect(page.getByText('Ball data', { exact: true })).toBeVisible();
  const state = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: (await indexedDB.databases()).length,
    sw: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(state).toEqual({ local: 0, session: 0, cookie: '', idb: 0, sw: 0 });
  expect(await context.cookies()).toEqual([]);
});

test("'Clear analysis' and reload leave nothing behind", async ({ page }) => {
  await loadAndAnalyze(page);
  await page.getByRole('link', { name: 'Load Session CSV' }).click();
  await page.getByRole('button', { name: 'Clear analysis' }).click();
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByText('No analysis yet')).toBeVisible();

  await loadAndAnalyze(page);
  await page.getByRole('link', { name: 'Load Session CSV' }).click();
  await page.getByLabel('Session name').fill('Range day');
  await page.getByRole('button', { name: 'Analyze files' }).click();
  await expect(page.getByRole('heading', { name: 'Range day' })).toBeVisible();

  await page.reload();
  await page.goto('./#/overview');
  await expect(page.getByText('No analysis yet')).toBeVisible();
  await page.goto('./#/load');
  await expect(page.getByLabel('Session name')).toHaveValue('');
});

test('subpath: direct navigation and refresh work; every asset is under /fsa-e2e/', async ({ page }) => {
  const paths: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin === ORIGIN) paths.push(u.pathname);
  });
  await page.goto('./#/help');
  await expect(page.getByRole('heading', { name: 'Get the local version' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Get the local version' })).toBeVisible();
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => !p.startsWith('/fsa-e2e/'))).toEqual([]);
});
