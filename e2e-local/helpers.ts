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

/** Whether a CSV line is a shot: the `Shot` cell is a number. Summary rows (`Avg`, `Dev`) are not. */
const isShotRow = (cells: string[], shotAt: number) => /^\d+$/.test((cells[shotAt] ?? '').trim());

/** The number of shots in a fixture: its data rows, without summary rows. */
export function shotCount(from: CsvFile): number {
  const [header, ...rows] = from.buffer.toString('utf8').split(/\r?\n/);
  const shotAt = header!.split(',').findIndex((h) => h.trim().toLowerCase() === 'shot');
  return rows.filter((l) => l.trim() !== '' && isShotRow(l.split(','), shotAt)).length;
}

/**
 * The same export with every shot's `Club` cell set to `club`, under a new name. Header and summary rows are
 * kept as they are. The bytes, and so the hash, differ from every other file.
 */
export function withClub(from: CsvFile, club: string, name: string): CsvFile {
  const [header, ...rows] = from.buffer.toString('utf8').split(/\r?\n/);
  const cols = header!.split(',').map((h) => h.trim().toLowerCase());
  const clubAt = cols.indexOf('club');
  const shotAt = cols.indexOf('shot');
  if (clubAt < 0 || shotAt < 0) throw new Error('fixture has no Club or Shot column');
  const out = rows.map((line) => {
    const cells = line.split(',');
    if (!isShotRow(cells, shotAt)) return line;
    cells[clubAt] = club;
    return cells.join(',');
  });
  return { name: basename(name), mimeType: 'text/csv', buffer: Buffer.from([header, ...out].join('\n')) };
}

const csp = new WeakMap<Page, string[]>();

/**
 * Records every Content-Security-Policy violation of the page, across navigations and reloads: the browser
 * event is reported to Node through a binding, and console messages about the policy are collected too.
 */
export async function trackCspViolations(page: Page): Promise<void> {
  const found: string[] = [];
  csp.set(page, found);
  await page.exposeBinding('__cspReport', (_source, report: string) => void found.push(report));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspReport: (r: string) => void }).__cspReport(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) found.push(`console: ${m.text()}`);
  });
}

/** The violations seen so far on `page`. */
export const cspViolations = (page: Page): string[] => csp.get(page) ?? [];

/** Signs in with the test token: the backend sets the cookie and sends the browser to the library. */
export async function signIn(page: Page): Promise<void> {
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
  // The page's file input, not the header's + button, which has the same name.
  await page.getByRole('main').getByLabel('Load Session CSV', { exact: true }).setInputFiles(files);
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
