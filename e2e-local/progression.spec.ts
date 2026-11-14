// The Progression page against the real backend: two sessions of one club, an exclusion, a changed dashboard
// and a target range, all of which must come back after a reload. The database is shared by every spec in the
// run, so this one uses its own club name and never assumes an empty library.
import { expect, test, type Page } from '@playwright/test';
import { cspViolations, FIXTURES, importInto, shotCount, signIn, trackCspViolations, withClub } from './helpers';

test.beforeEach(async ({ page }) => {
  await trackCspViolations(page);
});

test.afterEach(async ({ page }) => {
  expect(cspViolations(page)).toEqual([]);
});

const DEFAULT_TITLES = [
  'Carry',
  'Carry variation (SD)',
  'Lateral (landing)',
  'Face to path',
  'Spin',
  'Speed & smash',
  'Impact location',
  'Mishit frequency',
];

const tile = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });
const apiOk = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

test('Progression across two sessions: scope, mishits, dashboard and target range survive a reload', async ({ page }) => {
  const a = withClub(FIXTURES[0], 'E2E Driver', 'P1.csv');
  const b = withClub(FIXTURES[2], 'E2E Driver', 'P2.csv');
  const nA = shotCount(FIXTURES[0]);
  const nB = shotCount(FIXTURES[2]);
  const total = nA + nB;
  await signIn(page);

  await importInto(page, [a], { newName: 'Progression A', date: '2026-10-01' });
  await importInto(page, [b], { newName: 'Progression B', date: '2026-11-01' });
  await page.getByRole('link', { name: 'Open session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Progression B' })).toBeVisible();

  // Exclude two shots in B.
  for (const [i, label] of ['1 excluded', '2 excluded'].entries()) {
    await page.locator('tr[data-shot-id]').nth(i).click();
    const excluded = apiOk(page, 'PATCH', /\/exclusions$/);
    await page.getByRole('button', { name: 'Exclude shot' }).click();
    await excluded;
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }

  // The page, the club, and the default dashboard.
  await page.getByRole('link', { name: 'Progression', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Progression' })).toBeVisible();
  const scope = page.getByRole('region', { name: 'Scope' });
  await scope.getByLabel('Club', { exact: true }).selectOption({ label: `E2E Driver · ${total} shots` });
  const reset = page.getByRole('button', { name: 'Reset to default' });
  if (await reset.isEnabled()) {
    const saved = apiOk(page, 'PUT', /\/settings\//);
    await reset.click();
    await saved;
  }
  for (const title of DEFAULT_TITLES) await expect(tile(page, title)).toBeVisible();
  await expect(scope.getByText(`All ${total} shots`)).toBeVisible();

  // Stock shots only: the two excluded shots leave the numbers, the Mishit tile still counts them.
  await scope.getByRole('button', { name: 'Stock shots only' }).click();
  await expect(scope.getByText('Stock shots only · 2 excluded left out')).toBeVisible();
  await expect(tile(page, 'Mishit frequency')).toContainText(`2 of ${nB}`);

  // Remove Spin, add Roll, set the Carry target range to 100–300.
  await page.getByRole('button', { name: 'Remove Spin' }).click();
  await expect(tile(page, 'Spin')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add tile' }).click();
  await page.getByRole('menuitem', { name: 'Roll', exact: true }).click();
  await expect(tile(page, 'Roll')).toBeVisible();

  const carry = tile(page, 'Carry');
  await carry.getByRole('button', { name: 'Set target range' }).click();
  await carry.getByLabel('Low').fill('100');
  await carry.getByLabel('High').fill('300');
  const savedRange = apiOk(page, 'PUT', /\/target-ranges/);
  await carry.getByRole('button', { name: 'Save' }).click();
  await savedRange;

  // A reload brings it all back from the server and the tab's own settings.
  await page.reload();
  await expect(tile(page, 'Carry')).toBeVisible();
  await expect(tile(page, 'Spin')).toHaveCount(0);
  await expect(tile(page, 'Roll')).toBeVisible();
  await expect(tile(page, 'Carry').locator('.prog-tile__inrange')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scope' }).getByRole('button', { name: 'Stock shots only' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Club gapping lists the club (add it if the dashboard does not have it).
  await page.getByRole('button', { name: 'Add tile' }).click();
  await page.getByRole('menuitem', { name: 'Club gapping', exact: true }).click();
  await expect(tile(page, 'Club gapping')).toContainText('E2E Driver');
});
