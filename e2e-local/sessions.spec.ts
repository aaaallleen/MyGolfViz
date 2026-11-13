// The step 1 "done when" scenario of the Local App, against the real backend and a fresh data folder.
// Restarting the backend is covered by pytest: apps/api/tests/test_sessions.py::test_everything_survives_backend_restart.
// Here a full page reload, with only the cookie to go on, shows that everything on the session page comes back from
// the server and not from the tab.
import { expect, test, type Page } from '@playwright/test';
import { cspViolations, cut, fileNames, FIXTURES, importInto, resultSummary, signIn } from './helpers';

const filesPanel = (page: Page) => page.getByRole('region', { name: 'Files' });

/** Waits for the next successful response to `method` on an API path matching `path`. */
const apiOk = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

test('create, append, remove, exclude, restart-proof', async ({ page }) => {
  const [a, b, c] = FIXTURES;
  const extra1 = cut(a, 8, 'Range A extra 1.csv');
  const extra2 = cut(b, 10, 'Range A extra 2.csv');
  await signIn(page);

  // Three files in one go into a new session.
  await importInto(page, [a, b, c], { newName: 'Range A', date: '2026-11-01' });
  await expect(resultSummary(page)).toHaveText(/^3 files added · \d+ shots added · 0 skipped · 0 not imported$/);
  await page.getByRole('link', { name: 'Open session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Range A' })).toBeVisible();
  await expect(fileNames(page)).toHaveText([a.name, b.name, c.name]);

  // Two more from the Files panel. One file already in the session is staged again and is skipped.
  await filesPanel(page).getByRole('link', { name: 'Load Session CSV' }).click();
  await importInto(page, [extra1, extra2, a], { existing: 'Range A' }, async () => {
    await expect(page.getByRole('list', { name: 'Duplicate check' }).getByRole('listitem')).toHaveText([
      `${a.name}Already in this session — will be skipped`,
    ]);
  });
  await expect(resultSummary(page)).toHaveText(/^2 files added · \d+ shots added · 1 skipped · 0 not imported$/);
  await page.getByRole('link', { name: 'Open session' }).click();
  await expect(fileNames(page)).toHaveText([a.name, b.name, c.name, extra1.name, extra2.name]);
  await expect(filesPanel(page).locator('.file-badge')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5']);

  // Remove F2.
  await page.getByRole('button', { name: `Remove file ${b.name}` }).click();
  const removed = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.ok());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove file' }).click();
  await removed;
  await expect(fileNames(page)).toHaveText([a.name, c.name, extra1.name, extra2.name]);

  // Change the file order: the last file moves up one place.
  const reordered = apiOk(page, 'PATCH', /\/imports\/order$/);
  await page.getByRole('button', { name: `Move up ${extra2.name}` }).click();
  await reordered;
  const order = [a.name, c.name, extra2.name, extra1.name];
  await expect(fileNames(page)).toHaveText(order);

  // Exclude one shot.
  await page.locator('tr[data-shot-id]').first().click();
  const excluded = apiOk(page, 'PATCH', /\/exclusions$/);
  await page.getByRole('button', { name: 'Exclude shot' }).click();
  await excluded;
  await expect(page.getByRole('button', { name: '1 excluded' })).toBeVisible();
  const shotsBefore = await page.getByRole('heading', { level: 2, name: /^Averages/ }).textContent();

  // Add a note; details are saved 400 ms after the last change.
  await page.getByRole('button', { name: 'Edit details' }).click();
  const noted = apiOk(page, 'PATCH', /\/sessions\/[^/]+$/);
  await page.getByLabel('Notes').fill('Windy, range balls');
  await noted;
  await page.getByRole('button', { name: 'Done' }).click();

  // A full reload empties the tab; all of this comes back from the server, authorised by the cookie alone.
  const fetched = apiOk(page, 'GET', /^\/api\/v1\/sessions\/[^/]+$/);
  await page.reload();
  await fetched;
  await expect(page.getByRole('heading', { level: 1, name: 'Range A' })).toBeVisible();
  await expect(page.locator('.overview__meta')).toContainText('1 Nov 2026');
  await expect(page.locator('.overview__meta')).toContainText('4 source files');
  await expect(page.locator('.overview__notes')).toHaveText('Windy, range balls');
  await expect(page.getByRole('button', { name: '1 excluded' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^Averages/ })).toHaveText(shotsBefore ?? '');
  await expect(fileNames(page)).toHaveText(order);
  await expect(filesPanel(page).locator('.file-badge')).toHaveText(['F1', 'F2', 'F3', 'F4']);

  // The library lists it with the same date and file count.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Range A', exact: true }) });
  await expect(row).toContainText('1 Nov 2026');
  await expect(row.getByRole('cell').nth(3)).toHaveText('4');

  // The backend's Content-Security-Policy never blocked anything the app does.
  expect(await cspViolations(page)).toEqual([]);
});

test('library calendar shows the session on its date', async ({ page }) => {
  // Fix "today" so the calendar opens on the month that holds the session.
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'));
  await signIn(page);
  await importInto(page, [cut(FIXTURES[2], 12, 'Calendar day.csv')], { newName: 'Calendar day', date: '2026-11-05' });
  await expect(resultSummary(page)).toHaveText(/^1 files added · 12 shots added · 0 skipped · 0 not imported$/);

  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'November 2026' })).toBeVisible();

  // The session sits in the cell of 5 November, and that day's panel opens it.
  const cell = page.locator('.lib-day').filter({ has: page.getByRole('button', { name: 'Thursday 5 November', exact: true }) });
  await expect(cell.getByRole('link')).toHaveText(/^Calendar day12 shots · 1 file$/);
  await expect(page.locator('.lib-day').filter({ has: page.getByRole('button', { name: 'Friday 6 November', exact: true }) }).getByRole('link')).toHaveCount(0);
  await cell.getByRole('button', { name: 'Thursday 5 November', exact: true }).click();
  await page.getByRole('link', { name: 'Open Calendar day' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar day' })).toBeVisible();
  await expect(page.locator('.overview__meta')).toContainText('5 Nov 2026');
});

test('cross-session duplicate asks before importing', async ({ page }) => {
  const one = cut(FIXTURES[2], 5, 'Shared one.csv');
  const two = cut(FIXTURES[2], 7, 'Shared two.csv');
  await signIn(page);
  await importInto(page, [one, two], { newName: 'Dup source', date: '2026-10-01' });
  await expect(resultSummary(page)).toHaveText(/^2 files added · 12 shots added · 0 skipped · 0 not imported$/);

  // Both files are already in "Dup source": each one asks first. Accept one only.
  await importInto(page, [one, two], { newName: 'Dup target', date: '2026-10-02' }, async () => {
    const checks = page.getByRole('list', { name: 'Duplicate check' }).getByRole('listitem');
    await expect(checks).toHaveText([`${one.name}Also in “Dup source”Import anyway`, `${two.name}Also in “Dup source”Import anyway`]);
    await checks.filter({ hasText: two.name }).getByRole('checkbox', { name: 'Import anyway' }).check();
  });
  await expect(resultSummary(page)).toHaveText(/^1 files added · 7 shots added · 0 skipped · 1 not imported$/);
  const results = page.getByRole('list', { name: 'Files' }).getByRole('listitem');
  await expect(results.filter({ hasText: one.name })).toContainText('Also in another session — not imported');
  await expect(results.filter({ hasText: two.name })).toContainText('Imported · 7 shots');

  await page.getByRole('link', { name: 'Open session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dup target' })).toBeVisible();
  await expect(fileNames(page)).toHaveText([two.name]);
});
