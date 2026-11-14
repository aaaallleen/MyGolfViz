// The Compare page against the real backend: pick two shots from the tab, from the Shot Inspector, reload,
// Back, a deleted shot, and the tab's memory. The database is shared by every spec in the run, so this file
// uses its own club, session names and dates (2031-03, later than any other spec), and its tests run in order
// on the sessions the first one imports. The last test deletes one of them.
import { expect, test, type Page } from '@playwright/test';
import { cspViolations, FIXTURES, importInto, signIn, trackCspViolations, withClub } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await trackCspViolations(page);
});

test.afterEach(async ({ page }) => {
  expect(cspViolations(page)).toEqual([]);
});

const CLUB = 'E2E Compare Driver';
const LATER = 'Compare Later';
const EARLIER = 'Compare Earlier';
const HINT = 'Pick two shots to see what changed';

type Slot = 'A' | 'B' | 'C' | 'D';
const picker = (page: Page, slot: Slot) => page.getByRole('dialog', { name: `Choose shot ${slot}` });
const label = (page: Page, slot: Slot) => page.getByText(new RegExp(`^${slot} · ${CLUB} · Shot \\d+ · `));

/** Picks the first shot of the dialog's current session and club. */
async function chooseFirstShot(page: Page, slot: Slot) {
  const dialog = picker(page, slot);
  const shot = dialog.getByLabel('Shot', { exact: true });
  await expect(shot.getByRole('option')).not.toHaveCount(1); // "Choose a shot" plus the loaded shots
  await shot.selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Choose' }).click();
  await expect(dialog).toBeHidden();
}

/** From the empty Compare tab: A from Later, B from Earlier. Returns the URL with both ids. */
async function pickBoth(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByText(HINT)).toBeVisible();

  await page.getByRole('button', { name: 'Choose shot…' }).first().click();
  const a = picker(page, 'A');
  await expect(a.getByLabel('Session', { exact: true }).locator('option:checked')).toHaveText(new RegExp(`^${LATER}`));
  await expect(a.getByLabel('Club', { exact: true }).locator('option:checked')).toHaveText(CLUB);
  await chooseFirstShot(page, 'A');
  await expect(page).toHaveURL(/#\/compare\?a=[^&]+$/);
  await expect(label(page, 'A')).toBeVisible();

  await page.getByRole('button', { name: 'Choose shot…' }).click();
  const b = picker(page, 'B');
  await expect(b.getByLabel('Session', { exact: true }).locator('option:checked')).toHaveText(new RegExp(`^${LATER}`));
  await expect(b.getByLabel('Club', { exact: true }).locator('option:checked')).toHaveText(CLUB);
  const session = b.getByLabel('Session', { exact: true });
  await session.selectOption(await session.getByRole('option', { name: new RegExp(`^${EARLIER}`) }).getAttribute('value'));
  await chooseFirstShot(page, 'B');
  await expect(page).toHaveURL(/#\/compare\?a=[^&]+&b=[^&]+$/);
  return page.url();
}

test('from the Compare tab: empty → pick A → pick B', async ({ page }) => {
  await signIn(page);
  await importInto(page, [withClub(FIXTURES[0], CLUB, 'Compare1.csv')], { newName: LATER, date: '2031-03-02' });
  await importInto(page, [withClub(FIXTURES[2], CLUB, 'Compare2.csv')], { newName: EARLIER, date: '2031-03-01' });

  await pickBoth(page);
  await expect(label(page, 'B')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Swap' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('What changed from A')).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(27);
});

test('reload keeps both shots, and Back returns to only A', async ({ page }) => {
  await signIn(page);
  await pickBoth(page);

  await page.reload();
  await expect(label(page, 'A')).toBeVisible();
  await expect(label(page, 'B')).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(27);

  await page.goBack();
  await expect(page).toHaveURL(/#\/compare\?a=[^&]+$/);
  await expect(label(page, 'A')).toBeVisible();
  await expect(label(page, 'B')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose shot…' })).toBeVisible();
});

test('from the Shot Inspector: A filled in, B\'s picker open', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: LATER, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: LATER })).toBeVisible();
  await page.locator('tr[data-shot-id]').first().click();
  const id = await page.locator('tr[data-shot-id]').first().getAttribute('data-shot-id');
  await page.getByRole('link', { name: 'Open shot inspector →' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Shot \d+ · / })).toBeVisible();
  // The Compare… link looks like the Exclude shot button beside it: same height, no underline.
  const compare = page.getByRole('link', { name: 'Compare…' });
  const exclude = page.getByRole('button', { name: 'Exclude shot' });
  expect((await compare.boundingBox())!.height).toBe((await exclude.boundingBox())!.height);
  await expect(compare).toHaveCSS('text-decoration-line', 'none');
  await compare.click();

  await expect(page).toHaveURL(new RegExp(`#/compare\\?a=${id}$`));
  const b = picker(page, 'B');
  await expect(b).toBeVisible();
  await expect(b.getByLabel('Session', { exact: true }).locator('option:checked')).toHaveText(new RegExp(`^${LATER}`));
  await expect(label(page, 'A')).toBeVisible();
});

test('the Compare tab reopens the last comparison', async ({ page }) => {
  await signIn(page);
  const url = await pickBoth(page);

  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(label(page, 'B')).toBeVisible();
});

test('Add shot adds C and D, measured from the baseline A; removing C moves D up', async ({ page }) => {
  await signIn(page);
  const url = await pickBoth(page);
  const table = page.getByRole('table');
  await expect(page.getByText('Baseline', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: '+ Add shot' }).click();
  // An added shot starts from the baseline's session and club.
  await expect(picker(page, 'C').getByLabel('Session', { exact: true }).locator('option:checked')).toHaveText(new RegExp(`^${LATER}`));
  await chooseFirstShot(page, 'C');
  await expect(page).toHaveURL(/#\/compare\?a=[^&]+&b=[^&]+&c=[^&]+$/);
  expect(page.url().startsWith(`${url}&c=`)).toBe(true);
  await expect(label(page, 'C')).toBeVisible();

  await page.getByRole('button', { name: '+ Add shot' }).click();
  await chooseFirstShot(page, 'D');
  await expect(label(page, 'D')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add shot' })).toHaveCount(0);
  await expect(table.locator('thead th')).toHaveText(['Metric', 'A Baseline', 'B', 'C', 'D']);
  await expect(page.getByRole('img', { name: /^Side-view trajectories/ }).locator('path[data-shot-id]')).toHaveCount(4);

  // Reload keeps all four.
  await page.reload();
  await expect(label(page, 'D')).toBeVisible();

  await page.getByRole('button', { name: 'Remove shot C' }).click();
  await expect(page).toHaveURL(/#\/compare\?a=[^&]+&b=[^&]+&c=[^&]+$/);
  await expect(label(page, 'D')).toHaveCount(0);
  await expect(table.locator('thead th')).toHaveText(['Metric', 'A Baseline', 'B', 'C']);
  await expect(page.getByRole('button', { name: '+ Add shot' })).toBeVisible();
});

test('a deleted shot\'s slot says it\'s gone', async ({ page }) => {
  await signIn(page);
  const url = await pickBoth(page);

  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: `Actions for ${EARLIER}` }).click();
  await page.getByRole('menuitem', { name: 'Delete session' }).click();
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.ok());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete session' }).click();
  await deleted;
  await expect(page.getByRole('link', { name: EARLIER, exact: true })).toHaveCount(0);

  await page.goto(url);
  await expect(page.getByText('That shot is no longer in your library')).toBeVisible();
  await expect(label(page, 'A')).toBeVisible();
});
