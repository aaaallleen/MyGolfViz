// Two deliberate choices keep the plot-point counts exact. The baseline is read after a shot is selected, because the
// selected shot is drawn with aria-current and never matches the plain-point selector. In Edit shots the last Use switch
// that is on is turned off, since the first one on is the selected shot and turning it off would not change the count.
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES, loadAndAnalyze } from './helpers';

async function shotCount(page: Page): Promise<number> {
  const text = await page.getByRole('heading', { level: 2, name: /^Averages/ }).textContent();
  return Number(/(\d+) shots$/.exec(text ?? '')![1]);
}

const points = (page: Page) => page.locator('.fsa-dispersion circle[data-shot-id]:not([aria-current])');

test('exclude from the card, Edit shots and the Inspector; include from the Inspector', async ({ page }) => {
  await loadAndAnalyze(page, FIXTURES.slice(0, 2));
  const n = await shotCount(page);

  // Exclude the selected shot from the card. Count the plot with a shot selected, since the selected
  // shot is drawn separately (aria-current) and never counts as a plain point.
  await page.locator('tr[data-shot-id]').first().click();
  await expect(page.getByRole('button', { name: 'Exclude shot' })).toBeVisible();
  const plotted = await points(page).count();
  await page.getByRole('button', { name: 'Exclude shot' }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Averages.* ${n - 1} shots$`) })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 excluded' })).toBeVisible();
  await expect.poll(() => points(page).count()).toBe(plotted - 1);

  // Exclude another with a Use switch in Edit shots mode. The first one on is the shot the card advanced to, drawn as
  // the selected point, so turning it off would not change the plain-point count; turn off the last one instead.
  await page.getByRole('button', { name: 'Edit shots' }).click();
  await page.getByRole('switch', { checked: true }).last().uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Averages.* ${n - 2} shots$`) })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 excluded' })).toBeVisible();
  await expect(page.locator('tr[data-shot-id].is-excluded')).toHaveCount(2);
  await expect.poll(() => points(page).count()).toBe(plotted - 2);

  // Open an excluded shot on purpose, then include it again from the Inspector.
  await page.getByRole('button', { name: '2 excluded' }).click();
  await page.locator('.excluded-menu__pick').first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  await expect(page.getByText('This shot is excluded.')).toBeVisible();
  await page.getByRole('button', { name: 'Include it again' }).click();
  await expect(page.getByText('This shot is excluded.')).toHaveCount(0);

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Averages.* ${n - 1} shots$`) })).toBeVisible();
  await expect.poll(() => points(page).count()).toBe(plotted - 1);

  // Exclude the open shot from the Inspector header: it moves on to another shot, without the excluded banner.
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  const title = await page.getByRole('heading', { level: 1 }).textContent();
  await page.getByRole('button', { name: 'Exclude shot' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(title ?? '');
  await expect(page.getByText('This shot is excluded.')).toHaveCount(0);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Averages.* ${n - 2} shots$`) })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 excluded' })).toBeVisible();
});
