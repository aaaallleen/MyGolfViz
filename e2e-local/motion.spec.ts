// The interface's motion in a real browser: popups, dialogs, buttons and expanders run their transitions, Progression
// moves tiles in a view transition, and reduced motion drops the movement. Transitions are recorded as they start
// (`transitionrun`), so the checks don't depend on catching one mid-flight. The database is shared by every spec, so
// this one uses its own club and session names.
import { expect, test, type Page } from '@playwright/test';
import { cspViolations, FIXTURES, importInto, signIn, trackCspViolations, withClub } from './helpers';

test.beforeEach(async ({ page }) => {
  await trackCspViolations(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __runs: string[]; __viewTransitions: number };
    w.__runs = [];
    w.__viewTransitions = 0;
    document.addEventListener(
      'transitionrun',
      (e) => {
        const t = e.target as Element;
        const cls = typeof t.className === 'string' ? t.className : '';
        w.__runs.push(`${cls} ${e.propertyName}${e.pseudoElement}`);
      },
      true,
    );
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
        w.__viewTransitions++;
        return start(arg);
      }) as typeof document.startViewTransition;
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(cspViolations(page)).toEqual([]);
});

/** The transitions that started since the last call, as "<class list> <property><pseudo-element>". */
const takeRuns = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __runs: string[] };
    const runs = w.__runs;
    w.__runs = [];
    return runs;
  });
/** Waits for the transitions to start, then takes the ones on elements with `cls`. */
async function runsOn(page: Page, cls: string): Promise<string[]> {
  await page.waitForTimeout(250);
  return (await takeRuns(page)).filter((r) => r.split(' ').includes(cls)).map((r) => r.split(' ').at(-1)!);
}
/**
 * Opens the `<details>` matching `selector` by clicking its summary and samples its content's height each frame.
 * Chromium sends no transition events for ::details-content, so an in-between height is the evidence it animated.
 */
const opensSmoothly = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      new Promise<boolean>((resolve) => {
        const d = document.querySelector(sel) as HTMLDetailsElement;
        const heights: number[] = [];
        const t0 = performance.now();
        d.querySelector('summary')!.click();
        const tick = () => {
          heights.push(parseFloat(getComputedStyle(d, '::details-content').height));
          if (performance.now() - t0 < 400) requestAnimationFrame(tick);
          else resolve(heights.some((h) => h > 1 && h < heights.at(-1)! - 1));
        };
        requestAnimationFrame(tick);
      }),
    selector,
  );
const viewTransitions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __viewTransitions: number }).__viewTransitions);

test('popups, dialogs, buttons, expanders and Progression tiles animate; reduced motion drops the movement', async ({ page }) => {
  await signIn(page);
  await importInto(page, [withClub(FIXTURES[0], 'E2E Motion', 'Motion.csv')], { newName: 'Motion', date: '2031-03-03' });
  await page.getByRole('link', { name: 'Open session' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Motion' })).toBeVisible();
  await page.waitForTimeout(300);
  await takeRuns(page);

  // A popover grows out of its button, and shrinks back into it.
  const columns = page.locator('.shots-table__columns-btn');
  await columns.click();
  expect(await runsOn(page, 'column-menu')).toEqual(expect.arrayContaining(['opacity', 'transform']));
  await page.keyboard.press('Escape');
  expect(await runsOn(page, 'column-menu')).toEqual(expect.arrayContaining(['opacity', 'transform']));
  await expect(page.locator('.column-menu')).toHaveCount(0);

  // A pressed button scales down a little.
  const box = (await columns.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => columns.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.locator('.column-menu')).toHaveCount(0);

  // All measurements opens to its full height smoothly.
  await page.evaluate(() => {
    location.hash = location.hash.replace(/(\/sessions\/[^/?]+).*/, '$1/inspect');
  });
  await page.locator('.all-measurements > summary').waitFor();
  expect(await opensSmoothly(page, '.all-measurements')).toBe(true);

  // A menu grows out of its button; a dialog fades and grows in and out.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for Motion' }).first().click();
  expect(await runsOn(page, 'lib-menu')).toEqual(expect.arrayContaining(['opacity', 'transform']));
  await page.getByRole('menuitem', { name: 'Delete session' }).click();
  expect(await runsOn(page, 'dialog')).toEqual(expect.arrayContaining(['opacity', 'transform']));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  // Progression: moving a tile runs a view transition, and a tile's Details opens smoothly.
  await page.getByRole('link', { name: 'Progression', exact: true }).click();
  const scope = page.getByRole('region', { name: 'Scope' });
  const club = scope.getByLabel('Club', { exact: true });
  const motionClub = (await club.locator('option', { hasText: /^E2E Motion · / }).first().textContent())!;
  await club.selectOption({ label: motionClub });
  const firstTile = page.getByRole('article').first();
  const title = (await firstTile.getByRole('heading', { level: 2 }).textContent())!;
  await page.getByRole('button', { name: `Move ${title} later` }).click();
  await expect.poll(() => viewTransitions(page)).toBe(1);
  await expect(page.getByRole('article').nth(1).getByRole('heading', { level: 2 })).toHaveText(title);
  await page.getByRole('button', { name: `Move ${title} earlier` }).click();
  await expect(page.getByRole('article').first().getByRole('heading', { level: 2 })).toHaveText(title);
  expect(await opensSmoothly(page, '.prog-tile .prog-details')).toBe(true);

  // Reduced motion: tiles move at once, and popups only fade.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const before = await viewTransitions(page);
  await page.getByRole('button', { name: `Move ${title} later` }).click();
  await expect(page.getByRole('article').nth(1).getByRole('heading', { level: 2 })).toHaveText(title);
  await page.getByRole('button', { name: `Move ${title} earlier` }).click();
  await expect(page.getByRole('article').first().getByRole('heading', { level: 2 })).toHaveText(title);
  expect(await viewTransitions(page)).toBe(before);
  await takeRuns(page);
  await page.getByRole('button', { name: 'Add tile' }).click();
  expect(await runsOn(page, 'lib-menu')).toEqual(['opacity']);
  await page.keyboard.press('Escape');
});
