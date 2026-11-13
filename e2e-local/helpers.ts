import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

export type CsvFile = { name: string; mimeType: string; buffer: Buffer };

const dir = resolve(import.meta.dirname, '../fixtures/flightscope');
const read = (name: string): CsvFile => ({ name, mimeType: 'text/csv', buffer: readFileSync(resolve(dir, name)) });

/** The three real exports, as file payloads. */
export const FIXTURES: readonly [CsvFile, CsvFile, CsvFile] = [
  read('FlightScope Golf Session Sept 19 2022.csv'),
  read('FlightScope Golf Session Sept 19.csv'),
  read('FlightScope Golf Session.csv'),
];

/**
 * A different file cut from a real export: its header and first `rows` data rows, under a new name.
 * Its bytes differ from every other file, so it is not a duplicate of anything already imported.
 */
export function cut(from: CsvFile, rows: number, name: string): CsvFile {
  const lines = from.buffer.toString('utf8').split(/\r?\n/);
  return { name: basename(name), mimeType: 'text/csv', buffer: Buffer.from(lines.slice(0, rows + 1).join('\n')) };
}

/** Records every Content-Security-Policy violation the page reports; read them with `cspViolations`. */
export async function trackCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}

export const cspViolations = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

/** Signs in with the test token: the backend sets the cookie and sends the browser to the library. */
export async function signIn(page: Page): Promise<void> {
  await trackCspViolations(page);
  await page.goto('/?token=e2e');
  // An empty library shows its empty state in place of the Sessions heading.
  await expect(page.getByRole('heading', { name: /^(Sessions|No sessions yet)$/ })).toBeVisible();
}

export type Destination = { newName: string; date?: string } | { existing: string };

/**
 * Stages `files` on the import page, picks the destination, runs `beforeImport` (to check or accept duplicate
 * warnings), then imports. Ends on the result page. Stays on the import page if it is already open, so a
 * ?session= link from the Files panel is used as is.
 */
export async function importInto(
  page: Page,
  files: CsvFile[],
  dest: Destination,
  beforeImport?: () => Promise<void>,
): Promise<void> {
  if (!/#\/import(\?|$)/.test(page.url())) await page.goto('/#/import');
  await expect(page.getByRole('heading', { level: 1, name: 'Load Session CSV' })).toBeVisible();
  await page.getByLabel('Load Session CSV', { exact: true }).setInputFiles(files);
  await expect(page.getByText(new RegExp(`^${files.length} files? · \\d+ shots? ready$`))).toBeVisible();

  const name = 'newName' in dest ? dest.newName : dest.existing;
  if ('newName' in dest) {
    await page.getByRole('radio', { name: 'New session' }).check();
    await page.getByLabel('Session name').fill(dest.newName);
    if (dest.date) await page.getByLabel('Date', { exact: true }).fill(dest.date);
  } else {
    await page.getByRole('radio', { name: 'Existing session' }).check();
    const select = page.getByRole('combobox', { name: 'Existing session' });
    // A ?session= link preselects the session; otherwise the select starts on "Choose a session".
    if ((await select.inputValue()) === '') await select.selectOption({ label: dest.existing });
    await expect(select.locator('option:checked')).toHaveText(dest.existing);
  }

  if (beforeImport) await beforeImport();
  await page.getByRole('button', { name: 'Import files' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Imported into “${name}”` })).toBeVisible();
}

/** The import result summary line. */
export const resultSummary = (page: Page) => page.getByText(/files added · \d+ shots added · \d+ skipped · \d+ not imported$/);

/** The file names in the Files panel, top to bottom. */
export const fileNames = (page: Page) => page.locator('.imports-panel__name');
