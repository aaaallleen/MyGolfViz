// The Gapping tab and the dispersion controls against the real backend: stock yardages from two clubs, the
// Based on choices, the Ellipse choice that is saved and shared with the session page, and the Progression
// Dispersion by session tile. The database is shared by every spec in the run, so this file uses its own clubs,
// session names and dates (2033-05, later than any other spec), never assumes its clubs are the only rows, and
// its tests run in order on the sessions the first one imports.
import { expect, test, type Page } from '@playwright/test';
import { cspViolations, FIXTURES, importInto, signIn, trackCspViolations, withClub } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await trackCspViolations(page);
});

test.afterEach(async ({ page }) => {
  expect(cspViolations(page)).toEqual([]);
});

const DRIVER = 'E2E Gap Driver';
const IRON = 'E2E Gap 7 Iron';
const LATER = 'Gap Later';
const EARLIER = 'Gap Earlier';

const row = (page: Page, club: string) => page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: club, exact: true }) });
const apiOk = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

async function openGapping(page: Page) {
  await page.getByRole('link', { name: 'Gapping', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Gapping' })).toBeVisible();
}

test('Gapping lists both clubs with stock carry, longest first, and a consistency score', async ({ page }) => {
  await signIn(page);
  await importInto(page, [withClub(FIXTURES[0], DRIVER, 'Gap1.csv')], { newName: LATER, date: '2033-05-02' });
  await importInto(page, [withClub(FIXTURES[1], IRON, 'Gap2.csv')], { newName: EARLIER, date: '2033-05-01' });

  await openGapping(page);
  await expect(row(page, DRIVER)).toBeVisible();
  await expect(row(page, IRON)).toBeVisible();
  // Other specs' clubs are in the table too, so check the order of the whole column rather than the first row.
  const carries = (await page.locator('.gapping-table tbody tr td:nth-child(2)').allTextContents()).map((t) => {
    expect(t).toMatch(/^[\d,]+ yd$/);
    return Number(t.replace(/[^\d]/g, ''));
  });
  expect(carries).toEqual([...carries].sort((a, b) => b - a));
  await expect(row(page, DRIVER).locator('td').first()).toHaveText(/^\d+ yd$/);
  await expect(row(page, DRIVER).locator('td').nth(5)).toHaveText(/^\d+ ± \d+$/);
});

test('Based on: Latest session, then Selected session…', async ({ page }) => {
  await signIn(page);
  await openGapping(page);
  const basis = page.getByLabel('Based on', { exact: true });

  await basis.selectOption({ label: 'Latest session' });
  await expect(row(page, DRIVER)).toBeVisible();
  await expect(row(page, IRON)).toHaveCount(0);

  await basis.selectOption({ label: 'Selected session…' });
  const session = page.getByLabel('Session', { exact: true });
  await session.selectOption(await session.getByRole('option', { name: new RegExp(`${EARLIER}$`) }).getAttribute('value'));
  await expect(row(page, IRON)).toBeVisible();
  await expect(row(page, DRIVER)).toHaveCount(0);
});

test('Ellipse: Every shot is saved, and the session page shows it too', async ({ page }) => {
  await signIn(page);
  await openGapping(page);
  const ellipse = page.getByRole('group', { name: 'Ellipse' });
  const saved = apiOk(page, 'PUT', /\/settings\/ellipse\.kind$/);
  await ellipse.getByRole('button', { name: 'Every shot' }).click();
  await saved;
  await expect(ellipse.getByRole('button', { name: 'Every shot' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Gapping' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ellipse' }).getByRole('button', { name: 'Every shot' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('link', { name: LATER, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: LATER })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ellipse' }).getByRole('button', { name: 'Every shot' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/^Every-shot ellipse per club/)).toBeVisible();
});

test('Progression: Dispersion by session, Overlaid, shows the legend table', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Progression', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Progression' })).toBeVisible();
  const scope = page.getByRole('region', { name: 'Scope' });
  const club = scope.getByLabel('Club', { exact: true });
  await club.selectOption(await club.getByRole('option', { name: new RegExp(`^${DRIVER} · `) }).getAttribute('value'));

  const tile = page.getByRole('article', { name: 'Dispersion by session', exact: true });
  if (!(await tile.isVisible())) {
    const saved = apiOk(page, 'PUT', /\/settings\/progression\.layout$/);
    await page.getByRole('button', { name: 'Add tile' }).click();
    await page.getByRole('menuitem', { name: 'Dispersion by session', exact: true }).click();
    await saved;
  }
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: 'Overlaid' }).click();
  await expect(tile.getByRole('columnheader', { name: 'Session' })).toBeVisible();
  await expect(tile.getByRole('columnheader', { name: 'Width' })).toBeVisible();
  await expect(tile.getByRole('columnheader', { name: 'Depth' })).toBeVisible();
  await expect(tile.getByRole('img', { name: 'Dispersion, sessions overlaid' })).toBeVisible();
});
