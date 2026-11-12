import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

const dir = resolve(import.meta.dirname, '../fixtures/flightscope');

export const FIXTURES = [
  'FlightScope Golf Session Sept 19 2022.csv',
  'FlightScope Golf Session Sept 19.csv',
  'FlightScope Golf Session.csv',
].map((name) => resolve(dir, name));

/** Opens the Load page, stages the files and analyzes them; ends on the Overview. */
export async function loadAndAnalyze(page: Page, files: string[] = FIXTURES): Promise<void> {
  await page.goto('./#/load');
  await page.getByLabel('Load Session CSV', { exact: true }).setInputFiles(files);
  const analyze = page.getByRole('button', { name: 'Analyze files' });
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(page.getByText('In this browser only')).toBeVisible();
}
