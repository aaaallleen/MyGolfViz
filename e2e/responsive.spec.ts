import { expect, test, type Locator, type Page } from '@playwright/test';
import { FIXTURES, loadAndAnalyze } from './helpers';

const SCREENS = 'test-results/screens';

async function shot(page: Page, route: string, width: number): Promise<void> {
  await page.screenshot({ path: `${SCREENS}/${route}-${width}.png`, fullPage: true });
}

async function noOverflow(page: Page, what: string): Promise<void> {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(m.scroll, `${what}: scrollWidth ${m.scroll} > innerWidth ${m.inner}`).toBeLessThanOrEqual(m.inner);
}

async function goInspector(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Shot Inspector', exact: true }).click();
  await expect(page.getByText('Ball data', { exact: true })).toBeVisible();
}

type TabId = 'impact' | '3d' | '2d';
const TAB_IDS: TabId[] = ['impact', '3d', '2d'];

/** Tabs are addressed by id: the phone shows short labels (Impact, 3D, 2D). */
async function openTab(page: Page, id: TabId): Promise<void> {
  await page.locator(`#tab-${id}`).click();
  await expect(page.locator(`#tab-${id}`)).toHaveAttribute('aria-selected', 'true');
}

async function fitsViewport(loc: Locator, what: string): Promise<void> {
  const inner = await loc.page().evaluate(() => window.innerWidth);
  const box = await loc.boundingBox();
  expect(box, `${what} has a box`).not.toBeNull();
  expect(box!.x, `${what} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what} right edge`).toBeLessThanOrEqual(inner);
}

async function stageFiles(page: Page): Promise<void> {
  await page.goto('./#/load');
  await page.getByLabel('Load Session CSV', { exact: true }).setInputFiles(FIXTURES);
  await expect(page.getByRole('button', { name: 'Analyze files' })).toBeEnabled();
}

/** Visible interactive controls shorter than 44px, described for the failure message. */
async function shortControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = 'button, select, [role="tab"], nav a, label:has(input[type="checkbox"])';
    const bad: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) bad.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} "${(el.textContent ?? '').trim().slice(0, 30)}" h=${r.height.toFixed(1)}`);
    }
    return bad;
  });
}

for (const [width, height, hasTouch] of [[390, 844, true], [820, 1180, false], [1440, 900, false]] as const) {
  test.describe(`no overflow @${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch });

    test('no horizontal body overflow on Load (files staged), Overview, and Inspector (Ball data plus Face impact, 3D reconstruction, 2D reconstruction)', async ({ page }) => {
      await stageFiles(page);
      await noOverflow(page, 'load');
      await shot(page, 'load', width);
      await page.getByRole('button', { name: 'Analyze files' }).click();
      await expect(page.getByText('In this browser only')).toBeVisible();
      await noOverflow(page, 'overview');
      await shot(page, 'overview', width);
      await goInspector(page);
      await noOverflow(page, 'inspector ball data');
      await shot(page, 'inspector', width);
      for (const tab of TAB_IDS) {
        await openTab(page, tab);
        await noOverflow(page, `inspector ${tab}`);
        await shot(page, `inspector-${tab}`, width);
      }
    });
  });
}

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('every visible button, select, [role=tab], nav link and checkbox label is at least 44px tall', async ({ page }) => {
    await stageFiles(page);
    expect(await shortControls(page), 'load').toEqual([]);
    await shot(page, 'load-touch-targets', 390);
    await page.getByRole('button', { name: 'Analyze files' }).click();
    await expect(page.getByText('In this browser only')).toBeVisible();
    expect(await shortControls(page), 'overview').toEqual([]);
    await goInspector(page);
    expect(await shortControls(page), 'inspector ball data').toEqual([]);
    for (const tab of TAB_IDS) {
      await openTab(page, tab);
      expect(await shortControls(page), `inspector ${tab}`).toEqual([]);
    }
    await shot(page, 'inspector-touch-targets', 390);
  });

  test('cards replace the table, KPI tiles pair up, one 2D pane at a time, viewers fit the width', async ({ page }) => {
    await loadAndAnalyze(page);
    await expect(page.locator('.shots-cards')).toBeVisible();
    await expect(page.locator('.shots-table')).toBeHidden();
    const kpis = page.locator('.kpi-grid > *');
    const a = (await kpis.nth(0).boundingBox())!;
    const b = (await kpis.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y), 'first two KPI tiles share a row').toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);

    await goInspector(page);
    await fitsViewport(page.locator('.ball-data svg[aria-label*="3D ball flight"]'), 'ball-flight viewer');
    await fitsViewport(page.locator('.ball-data .fsa-spin-ball svg'), 'Ball data sphere');
    await openTab(page, '3d');
    await fitsViewport(page.locator('.club-data svg[aria-label^="3D club replay"]'), 'club 3D svg');
    await openTab(page, '2d');
    const visible = [];
    for (const c of ['.delivery-top', '.delivery-side', '.delivery-spin']) {
      if (await page.locator(c).first().isVisible()) visible.push(c);
    }
    expect(visible, 'exactly one 2D pane visible').toHaveLength(1);
    await shot(page, 'inspector-2d-layout', 390);
  });

  test('touch: tapping a shot card selects it; tapping Next shot advances the position text', async ({ page }) => {
    await loadAndAnalyze(page);
    const cards = page.locator('.shots-cards .shot-card');
    await cards.nth(3).tap();
    await expect(cards.nth(3)).toHaveAttribute('aria-current', 'true');
    const pos = page.locator('.selected-card .panel__note');
    await expect(pos).toHaveText(/^4 of /);
    await page.getByRole('button', { name: 'Next shot' }).tap();
    await expect(pos).toHaveText(/^5 of /);
    await expect(cards.nth(4)).toHaveAttribute('aria-current', 'true');
    await shot(page, 'overview-tap', 390);
  });
});

test.describe('tablet 820', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("inspector tabs visible; dispersion 'Target' label visible; camera control and both Show fieldsets wrap without overflow", async ({ page }) => {
    await loadAndAnalyze(page);
    await expect(page.locator('.fsa-dispersion svg text', { hasText: 'Target' }).first()).toBeVisible();
    await shot(page, 'overview-tablet', 820);
    await goInspector(page);
    for (const name of ['Face impact', '3D reconstruction', '2D reconstruction']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
    const camera = page.getByRole('group', { name: 'Camera angle' });
    await expect(camera).toBeVisible();
    await fitsViewport(camera, 'camera control');
    await openTab(page, '3d');
    await fitsViewport(page.locator('.club-data .show-toggles'), '3D Show fieldset');
    await openTab(page, '2d');
    await fitsViewport(page.locator('.club-data .show-toggles'), '2D Show fieldset');
    for (const f of await page.locator('.show-toggles').all()) {
      const m = await f.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
    }
    await noOverflow(page, 'inspector 820');
  });
});

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('table visible and not clipped; dispersion and trajectory panels share a row', async ({ page }) => {
    await loadAndAnalyze(page);
    const table = page.locator('.shots-table');
    await expect(table).toBeVisible();
    await expect(page.locator('.shots-cards')).toBeHidden();
    const m = await table.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw, 'table container scrollWidth').toBeLessThanOrEqual(m.cw);
    const d = (await page.locator('.fsa-dispersion').first().boundingBox())!;
    const t = (await page.locator('.fsa-trajectory').first().boundingBox())!;
    expect(d.y + d.height).toBeGreaterThan(t.y);
    expect(t.y + t.height).toBeGreaterThan(d.y);
    expect(t.x).toBeGreaterThan(d.x + d.width - 1);
    await shot(page, 'overview-table', 1440);
  });

  test('keyboard: Tab to a table row + Enter selects it; ArrowRight on the tablist activates the next tab', async ({ page }) => {
    await loadAndAnalyze(page);
    const note = page.locator('.selected-card .panel__note');
    const before = await note.innerText();
    // Real Tab traversal from the filter bar until a not-yet-selected shot row has focus.
    await page.getByRole('combobox', { name: 'Source file' }).focus();
    let reached: string | null = null;
    for (let i = 0; i < 60 && reached === null; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.matches('.shots-table tr[data-shot-id]') && el.getAttribute('aria-current') !== 'true' ? el.getAttribute('data-shot-id') : null;
      });
    }
    expect(reached, 'Tab reaches an unselected shot row within 60 presses').not.toBeNull();
    await page.keyboard.press('Enter');
    const row = page.locator(`.shots-table tr[data-shot-id="${reached}"]`);
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(note).not.toHaveText(before);
    await shot(page, 'overview-keyboard', 1440);

    await goInspector(page);
    const tabs = page.getByRole('tab');
    const first = tabs.nth(0);
    await openTab(page, 'impact');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toBeFocused();
    await shot(page, 'inspector-keyboard', 1440);
  });
});
