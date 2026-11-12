import { expect, test } from '@playwright/test';
import { FIXTURES } from './helpers';

test('the split pages download at startup, so the app still works after going offline', async ({ page, context }) => {
  const scripts: string[] = [];
  page.on('response', (r) => { if (r.url().endsWith('.js')) scripts.push(new URL(r.url()).pathname.split('/').pop()!); });
  await page.goto('./#/load');
  await page.waitForLoadState('networkidle');
  // The entry file plus the Overview and Inspector files, fetched before either page is opened.
  expect(scripts.length, `scripts fetched at startup: ${scripts.join(', ')}`).toBeGreaterThanOrEqual(3);

  await context.setOffline(true);
  await page.getByLabel('Load Session CSV', { exact: true }).setInputFiles(FIXTURES);
  await page.getByRole('button', { name: 'Analyze files' }).click();
  await expect(page.getByText('In this browser only')).toBeVisible();
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  await expect(page.getByText('Ball data', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
