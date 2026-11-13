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

/** Tabs are addressed by data-tab-id: the phone shows short labels (Impact, 3D, 2D). */
async function openTab(page: Page, id: TabId): Promise<void> {
  const tab = page.locator(`[role="tab"][data-tab-id="${id}"]`);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  // The outgoing panel stays mounted (hidden) until its exit transition completes; wait for it to go.
  await expect(page.locator('[role="tabpanel"]')).toHaveCount(1);
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

    test('no horizontal body overflow on Load (files staged), Overview, and Inspector (Ball data plus Face impact, 3D, 2D reconstruction)', async ({ page }) => {
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

    test('headline tiles keep their text inside the box, including a measured Impact', async ({ page }) => {
      await stageFiles(page);
      await page.getByRole('button', { name: 'Analyze files' }).click();
      await expect(page.getByText('In this browser only')).toBeVisible();
      await goInspector(page);
      const tiles = page.locator('.head-tiles');
      for (let i = 0; i < 60 && !/\bin (toe|heel|centered)\b/.test(await tiles.innerText()); i++) {
        await page.getByRole('button', { name: 'Next shot' }).first().click();
      }
      await expect(tiles).toContainText(/in (toe|heel|centered)/);
      const spill = await tiles.locator(':scope > *').evaluateAll((els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
      expect(spill, 'tiles whose content is wider than the box').toEqual([]);
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

  test('the full shot table scrolls inside its box with Shot pinned, KPI tiles pair up, club views show one large view with three thumbnails below it, viewers fit the width', async ({ page }) => {
    await loadAndAnalyze(page);
    const box = page.locator('.shots-table');
    await expect(box).toBeVisible();
    const m = await box.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw, 'all columns: wider than the phone, scrolls sideways inside its box').toBeGreaterThan(m.cw);
    await box.evaluate((el) => { el.scrollLeft = 600; el.scrollTop = 400; });
    const boxBox = (await box.boundingBox())!;
    const shotHead = (await page.locator('.shots-table thead th[data-col="shot"]').boundingBox())!;
    expect(Math.abs(shotHead.x - boxBox.x), 'Shot column stays at the left edge').toBeLessThan(2);
    expect(Math.abs(shotHead.y - boxBox.y) < 40, 'header rows stay at the top').toBe(true);
    await noOverflow(page, 'overview 390 with the full table');
    const kpis = page.locator('.kpi-grid > *');
    const a = (await kpis.nth(0).boundingBox())!;
    const b = (await kpis.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y), 'first two KPI tiles share a row').toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);

    await goInspector(page);
    await fitsViewport(page.locator('.ball-data svg[aria-label*="3D ball flight"]'), 'ball-flight viewer');
    await fitsViewport(page.locator('.ball-data .fsa-spin-ball svg'), 'Ball data sphere');
    for (const id of ['3d', '2d'] as const) {
      await openTab(page, id);
      const large = page.locator('.club-data .view-gallery__large');
      await fitsViewport(page.locator('.club-data .view-gallery__large canvas'), `${id} large view`);
      const thumbs = page.locator('.club-data .view-gallery__thumbs button');
      await expect(thumbs).toHaveCount(3);
      const lb = (await large.boundingBox())!;
      for (const t of await thumbs.all()) {
        await expect(t).toBeVisible();
        expect((await t.boundingBox())!.y, `${id} thumbnails sit below the large view on a phone`).toBeGreaterThanOrEqual(lb.y + lb.height - 1);
      }
    }
    await shot(page, 'inspector-2d-layout', 390);
  });

  test('touch: only the draggable 3D reconstruction captures swipes; every fixed view lets the page scroll', async ({ page }) => {
    await loadAndAnalyze(page);
    await goInspector(page);
    const touch = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).touchAction);
    await openTab(page, '3d');
    expect(await touch('.club-data .view-gallery__large canvas')).not.toBe('none');
    expect(await touch('.club-data .view-gallery__thumbs canvas')).not.toBe('none');
    await page.getByRole('button', { name: '3D reconstruction', exact: true }).click();
    expect(await touch('.club-data .club-views__recon canvas')).toBe('none');
    await openTab(page, '2d');
    expect(await touch('.club-data .view-gallery__large canvas')).not.toBe('none');
    expect(await touch('.club-data .view-gallery__thumbs canvas')).not.toBe('none');
  });

  test('touch: tapping a table row selects it; tapping Next shot advances the position text', async ({ page }) => {
    await loadAndAnalyze(page);
    const rows = page.locator('.shots-table tr[data-shot-id]');
    await rows.nth(3).locator('td[data-col="shot"]').tap();
    await expect(rows.nth(3)).toHaveAttribute('aria-current', 'true');
    const pos = page.locator('.selected-card .panel__note');
    await expect(pos).toHaveText(/^4 of /);
    await page.getByRole('button', { name: 'Next shot' }).tap();
    await expect(pos).toHaveText(/^5 of /);
    await expect(rows.nth(4)).toHaveAttribute('aria-current', 'true');
    await shot(page, 'overview-tap', 390);
  });
});

test.describe('tablet 820', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("inspector tabs visible; dispersion 'Target' label visible; camera control and both club galleries fit without overflow", async ({ page }) => {
    await loadAndAnalyze(page);
    await expect(page.locator('.fsa-dispersion svg text', { hasText: 'Target' }).first()).toBeVisible();
    await shot(page, 'overview-tablet', 820);
    await goInspector(page);
    for (const name of ['Face impact', '3D', '2D reconstruction']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    const camera = page.getByRole('group', { name: 'Camera angle' });
    await expect(camera).toBeVisible();
    await fitsViewport(camera, 'camera control');
    for (const id of ['3d', '2d'] as const) {
      await openTab(page, id);
      await fitsViewport(page.locator('.club-data .view-gallery'), `${id} club gallery`);
      const lb = (await page.locator('.club-data .view-gallery__large').boundingBox())!;
      const tb = (await page.locator('.club-data .view-gallery__thumbs button').first().boundingBox())!;
      expect(tb.x, `${id} thumbnails sit right of the large view`).toBeGreaterThanOrEqual(lb.x + lb.width - 1);
    }
    await noOverflow(page, 'inspector 820');
  });
});

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('table visible and not clipped; top view sits directly above the side view, same width, with the Clubs table beside them', async ({ page }) => {
    await loadAndAnalyze(page);
    const table = page.locator('.shots-table');
    await expect(table).toBeVisible();
    // The header rows stay pinned while the table scrolls down inside its box.
    const head = page.locator('.shots-table thead th[data-col="carry"]');
    const before = (await head.boundingBox())!;
    await table.evaluate((el) => { el.scrollTop = 500; });
    const after = (await head.boundingBox())!;
    expect(Math.abs(after.y - before.y), 'column names stay in view').toBeLessThan(2);
    await noOverflow(page, 'overview 1440');
    const d = (await page.locator('.fsa-dispersion svg').first().boundingBox())!;
    const t = (await page.locator('.fsa-trajectory svg').first().boundingBox())!;
    const c = (await page.locator('.club-table').first().boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(d.y + d.height - 1);
    expect(Math.abs(t.x - d.x)).toBeLessThan(1);
    expect(Math.abs(t.width - d.width)).toBeLessThan(1);
    expect(c.x).toBeGreaterThan(d.x + d.width - 1);
    expect(c.y).toBeLessThan(d.y + d.height);
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

for (const width of [1440, 1920] as const) {
  test.describe(`wide ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('narrow pages (Load Session CSV, Help / Get Local Version) are centered, as in frame 02 (max-width 880, margin 0 auto)', async ({ page }) => {
      for (const [route, selector] of [['load', '.load-page'], ['help', '.help']] as const) {
        await page.goto(`./#/${route}`);
        const box = (await page.locator(selector).boundingBox())!;
        const right = width - (box.x + box.width);
        expect(Math.abs(box.x - right), `#/${route} ${selector}: left gap ${box.x}, right gap ${right}`).toBeLessThanOrEqual(1);
        await shot(page, `${route}-centered`, width);
      }
    });
  });
}

test.describe('club views render @1280', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('3D tab draws a non-blank WebGL picture and swaps views; dragging works only in 3D reconstruction, where it enables Reset view', async ({ page }) => {
    await loadAndAnalyze(page);
    await goInspector(page);
    await openTab(page, '3d');
    const panel = page.getByRole('tabpanel', { name: '3D', exact: true });
    const name = panel.locator('.view-gallery__large .view-gallery__name');
    await expect(name).toHaveText('Face-on');
    const canvas = panel.locator('.view-gallery__large canvas');
    const colours = (c: typeof canvas) => c.evaluate((el: HTMLCanvasElement) => {
      const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return seen.size;
    });
    await expect.poll(() => colours(canvas), { message: 'distinct colours in the large view' }).toBeGreaterThan(8);
    // Idle, with Play paused: the gallery must not keep redrawing.
    const idleDraws = await page.evaluate(async () => {
      let n = 0;
      const orig = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof orig>) { n++; return orig.apply(this, args); } as typeof orig;
      await new Promise((r) => setTimeout(r, 1000));
      CanvasRenderingContext2D.prototype.drawImage = orig;
      return n;
    });
    expect(idleDraws, 'drawImage calls in 1 s of idle').toBeLessThan(5);
    await panel.getByRole('button', { name: 'Show Top view' }).click();
    await expect(name).toHaveText('Top');
    await expect(panel.getByRole('button', { name: 'Show Face-on view' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reset view' })).toHaveCount(0);

    await panel.getByRole('button', { name: '3D reconstruction', exact: true }).click();
    const recon = panel.getByRole('region', { name: '3D reconstruction' });
    const rc = recon.locator('canvas');
    await expect.poll(() => colours(rc), { message: 'distinct colours in the reconstruction' }).toBeGreaterThan(8);
    const reset = recon.getByRole('button', { name: 'Reset view' });
    await expect(reset).toBeDisabled();
    const box = (await rc.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 - 50, { steps: 8 });
    await page.mouse.up();
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(reset).toBeDisabled();
    await shot(page, 'inspector-3d-views', 1280);
  });
});
