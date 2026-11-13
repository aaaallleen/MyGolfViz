// The library header's layout in a real browser: the + button in the header and the List / Calendar toggle at the
// right edge, at desktop and narrow widths.
import { expect, test } from '@playwright/test';
import { cut, FIXTURES, importInto, signIn } from './helpers';

test('the + button is small and the List / Calendar toggle sits at the far right', async ({ page }) => {
  await signIn(page);
  await page.goto('/#/import');
  // A file of its own: the local e2e tests share one data folder, and a real export imported here would be a
  // cross-session duplicate for the other tests.
  await importInto(page, [cut(FIXTURES[2], 3, 'Layout check.csv')], { newName: 'Layout check' });

  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#/sessions');
    await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible();

    const add = await page.getByRole('link', { name: 'Load Session CSV' }).boundingBox();
    expect(add!.width).toBeLessThanOrEqual(44);
    expect(add!.height).toBeLessThanOrEqual(44);

    const head = (await page.locator('.library__head').boundingBox())!;
    const list = (await page.locator('.lib-card, .lib-table-wrap').first().boundingBox())!;
    const view = (await page.getByRole('group', { name: 'View' }).boundingBox())!;
    // Flush with the right edge of the header (and of the sessions table below it).
    expect(Math.abs(view.x + view.width - (head.x + head.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(view.x + view.width - (list.x + list.width))).toBeLessThanOrEqual(1);
  }
});
