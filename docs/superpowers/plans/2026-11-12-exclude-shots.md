# Excluding Shots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users leave mishit shots out of the plot, averages, counts and comparisons, from the selected-shot card or the shot table's "Edit shots" mode. Excluded rows stay greyed in the table, and every exclusion can be undone.

**Architecture:** The reducer gets one new piece of state: a set of exclusion keys (`${file.sha256}:${sourceRow}`). The store turns it into shot ids and two lists. `visibleShots` (included shots in the club/file filter) is what every existing surface already reads, so they respect exclusions without changes of their own. `tableShots` (the filter including excluded shots) feeds the table and selection. Pure helpers live in `@fsa/analytics`. The UI work covers the card, table, filter bar and Inspector, plus a shared file badge.

**Tech Stack:** React 19, TypeScript, TanStack Table v9 alpha (`useTable`, features API), Base UI `Popover`, `sonner` toasts, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-exclude-shots-design.md`. Read it before any task. Its *Behaviour* section is the source of truth for copy and rules.

## Global Constraints

- Nothing is persisted. Exclusions live in the in-memory store only, and no localStorage/IndexedDB is used.
- The CSV and the parsed `Shot` objects are never changed. Excluding only changes which shots the app uses.
- Exclusion key = `` `${sha256}:${sourceRow}` `` of the shot's source file, not the shot id.
- Outside "Edit shots" mode, clicking a table row only selects. It never changes exclusion.
- File badges (`F{ordinal}`) appear only when `workingSet.files.length >= 2`.
- Every "Include all" shows a sonner toast `` `${n} shots included` `` (`1 shot included` for one) with an **Undo** action, duration 6000 ms. The pattern is the existing Clear toast in `apps/web/src/pages/LoadPage.tsx`.
- The "Exclude shot" button is never `variant="primary"`.
- UI copy, verbatim: `Exclude shot`, `Include shot`, `Excluded`, `Edit shots`, `Editing shots`, `Done`, `Include all`, `Use`, `` `${n} excluded` ``, `` `${used} used · ${excluded} excluded` ``, `` `All ${n} shots here are excluded` ``, `This shot is excluded. It isn't in your averages or comparisons.`, `Include it again`.
- Run unit tests with `npx vitest run <path>` from the repo root. Typecheck with `npm run typecheck`.

## Review Focus

1. **Same shot number in two files.** The two fixture files can both have "Shot 3". Their rows, card titles and picker options must differ by badge. Test in Task 3.
2. **Clicking a Use switch.** The click (or Space on it) must not also select the row or reach the row's Enter/Space handler. Test in Task 5.
3. **Excluding every shot of the filtered club.** The empty message appears, the club chip stays with count 0, and the card and table remain. Test in Task 4 and Task 6.
4. **Remove a file on the Load page, add it back, Analyze.** The exclusions come back (new `fileKey`, same sha256). Test in Task 2.
5. **Changing the club/file filter while an excluded shot is selected.** The selection survives if the shot is still in the table's set. Test in Task 2.

---

### Task 1: Analytics helpers for exclusions

**Files:**
- Modify: `packages/analytics/src/workingSet.ts`
- Test: `packages/analytics/src/workingSet.test.ts`

**Interfaces:**
- Produces (exported from `@fsa/analytics`):
  - `exclusionKey(sha256: string, sourceRow: number): string`. Returns `` `${sha256}:${sourceRow}` ``.
  - `excludedShotIds(ws: WorkingSet, excluded: ReadonlySet<string>): Set<string>`. The ids of the shots in `ws` whose key is in `excluded`. A file's sha256 comes from `ws.files` via `shot.fileId`.
  - `clubCounts(shots: readonly Shot[], excludedIds: ReadonlySet<string> = new Set()): { club: string; count: number }[]`. Every club in `shots` appears, in first-appearance order, with `count` = its **included** shots (it can be 0).
  - `stepAround(selectedId: string | null, ordered: readonly Shot[], excludedIds: ReadonlySet<string>, delta: 1 | -1): string | null`. `ordered` is the table order and includes excluded shots. It returns the nearest **included** shot strictly after (delta 1) or before (−1) the selected one. If there is none in that direction, it returns the selected id unchanged when that shot is included, and otherwise the nearest included shot in the other direction. If the selection is null or unknown, it returns the first included shot. If no shot is included, it returns null. This replaces how the reducer uses `stepSelection`; keep `stepSelection` exported as it is.
  - `nextAfterExclude(id: string, ordered: readonly Shot[], excludedIds: ReadonlySet<string>): string | null`. `excludedIds` already contains `id`. It returns the next included shot after `id`, else the previous one, else null.

- [ ] **Step 1: Write failing tests** in `workingSet.test.ts`. Reuse the existing `mk` and the `D1, I1, D2, I2` shots. Build `ws` with `files: [{ id: 'f1', sha256: 'aaa', ordinal: 1, … }, { id: 'f2', sha256: 'bbb', ordinal: 2, … }]`.

```ts
test('exclusionKey and excludedShotIds map content keys to shot ids', () => {
  expect(exclusionKey('aaa', 2)).toBe('aaa:2');
  expect([...excludedShotIds(wsF, new Set(['aaa:2', 'bbb:3', 'zzz:9']))]).toEqual(['D1', 'I2']);
});
test('clubCounts counts included shots and keeps a club whose shots are all excluded', () => {
  expect(clubCounts(shots, new Set(['D1', 'D2']))).toEqual([{ club: 'Driver', count: 0 }, { club: '7 Iron', count: 2 }]);
});
test('stepAround skips excluded shots and steps off an excluded selection', () => {
  const ord = displayOrder(shots); // D1, D2, I1, I2
  const ex = new Set(['D2']);
  expect(stepAround('D1', ord, ex, 1)).toBe('I1');
  expect(stepAround('I1', ord, ex, -1)).toBe('D1');
  expect(stepAround('D2', ord, ex, 1)).toBe('I1');   // from an excluded shot
  expect(stepAround('D2', ord, ex, -1)).toBe('D1');
  expect(stepAround('I2', ord, ex, 1)).toBe('I2');   // clamps at the end
  expect(stepAround(null, ord, new Set(['D1']), 1)).toBe('D2');
  expect(stepAround('D1', ord, new Set(['D1', 'D2', 'I1', 'I2']), 1)).toBeNull();
});
test('nextAfterExclude: next included, else previous, else null', () => {
  const ord = displayOrder(shots);
  expect(nextAfterExclude('D2', ord, new Set(['D2']))).toBe('I1');
  expect(nextAfterExclude('I2', ord, new Set(['I2']))).toBe('I1');
  expect(nextAfterExclude('D1', ord, new Set(['D1', 'D2', 'I1', 'I2']))).toBeNull();
});
```

The existing `clubCounts` test (no second argument) must still pass unchanged.

- [ ] **Step 2: Run** `npx vitest run packages/analytics/src/workingSet.test.ts`. Expected: FAIL (functions not exported).
- [ ] **Step 3: Implement** the five functions in `workingSet.ts` with the signatures above.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm run typecheck` passes.
- [ ] **Step 5: Commit** `feat(analytics): exclusion keys, included-only club counts, stepping around excluded shots`.

---

### Task 2: Store and reducer — exclusion state, lists, selection rules

**Files:**
- Modify: `apps/web/src/state/reducer.ts`, `apps/web/src/state/store.tsx`
- Test: `apps/web/src/reducer.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces:
  - `StoreState.excluded: ReadonlySet<string>` (exclusion keys). `initialState.excluded = new Set()`.
  - `visibleOf(state: Pick<StoreState, 'workingSet' | 'filters' | 'excluded'>): Shot[]`. These are the included shots in the filter, in display order. All current callers pass the larger state, so they still compile.
  - `tableOf(state: Pick<StoreState, 'workingSet' | 'filters'>): Shot[]`. This is every shot in the filter, in display order, excluded ones included.
  - New actions:
    - `{ type: 'setExcluded'; id: string; excluded: boolean }`. The selection does not change.
    - `{ type: 'excludeAndAdvance'; id: string }`. Excludes the shot. If `id === selectedId`, the selection becomes `nextAfterExclude(id, tableOf, excludedIds)`.
    - `{ type: 'includeShots'; ids: readonly string[] }`. Removes those shots' keys.
    - `{ type: 'setExcludedKeys'; excluded: ReadonlySet<string> }`. Used by undo.
    - `{ type: 'reveal'; id: string }`. If the shot is outside the filter: when `filters.club !== null && filters.club !== shot.club`, set the club to `shot.club`, and when `filters.fileId !== null && filters.fileId !== shot.fileId`, set the file to `null`. Then select `id`.
  - Changed reducer rules:
    - `analyze` keeps `excluded`.
    - `clear` still returns `initialState`, so `excluded` is emptied too.
    - `withFilters` keeps the selection while the id is in `tableOf(next)`, not `visibleOf`.
    - `step` uses `stepAround(selectedId, tableOf(state), excludedIds, delta)`.
    - `setClub(club)` still selects `visibleOf(next)[0]` (the first *included* shot).
  - `WorkingSetApi` additions:
    - `tableShots: Shot[]`
    - `excludedIds: ReadonlySet<string>`, which holds the shot ids of every excluded shot in the session (not just the filter). Memoise it on `[workingSet, excluded]`.
    - `setExcluded(id: string, excluded: boolean): void`
    - `excludeAndAdvance(id: string): void`
    - `reveal(id: string): void`
    - `includeAll(scope: 'session' | 'filter'): { count: number; undo: () => void } | null`. Returns null when nothing in scope is excluded. `'filter'` covers the excluded shots in `tableShots`. Undo dispatches `setExcludedKeys(before)` only if `latest.current.excluded` is still the exact set object the include produced. Otherwise it does nothing.
  - `visibleShots` is now `visibleOf({ workingSet, filters, excluded })`, memoised on those three.

- [ ] **Step 1: Write failing tests** in `reducer.test.tsx`, using the existing `stage()` (two files):
  - `test('excluded shots leave visibleOf but stay in tableOf; analyze keeps them; clear empties them')`. Exclude shot X. `visibleOf(s)` no longer has X, and `tableOf(s)` still does. A second `stage` + `analyze` still excludes X. `reducer(s, {type:'clear'})` equals `initialState`.
  - `test('removing a file and adding it back keeps its exclusions')` (Review Focus 4). Exclude a shot of file b. Then `removeStaged` b, `stage` b again (the new key from `makeKey`), and `analyze`. The shot with the same `sourceRow` in the re-added file is not in `visibleOf`.
  - `test('excludeAndAdvance moves the selection to the next included shot; setExcluded keeps it')`.
  - `test('step from an excluded selection goes to the nearest included shot each way')`.
  - `test('a filter change keeps an excluded selection while it is still in the table')` (Review Focus 5). Select an excluded Driver shot, set the file filter to that shot's file, and check the selection is unchanged. Then set the club to a different club, and check the selection becomes that club's first included shot (existing `setClub` rule).
  - `test('reveal widens the filter to show the shot')`. With club = the other club and file = the other file, `reveal(id)` sets the club to the shot's club, the file to null, and `selectedId` to `id`.
  - Store-level test (`renderHook` with `WorkingSetProvider`, as the existing file does): `test('includeAll returns a count and an undo that only works if nothing changed since')`. Exclude 2 shots, `includeAll('session')` → `{count: 2}`, and undo brings back 2. Then exclude, `includeAll`, exclude another shot, and undo: the excluded set is unchanged by the undo. `includeAll('filter')` with a club filter only includes that club's shots.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/reducer.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the state, actions and API above in `reducer.ts` and `store.tsx`.
- [ ] **Step 4: Run** `npx vitest run apps/web/src` and `npm run typecheck`. Expected: all PASS, existing tests included.
- [ ] **Step 5: Commit** `feat(state): exclusion set keyed by file content, included/table lists, selection rules`.

---

### Task 3: File badge and shot option labels

**Files:**
- Create: `apps/web/src/components/FileBadge.tsx`, `apps/web/src/components/FileBadge.test.tsx`
- Modify: `apps/web/src/components/shotLabel.ts`, `apps/web/src/styles/app.css`

**Interfaces:**
- Produces:
  - `FileBadge({ shot, files }: { shot: Shot; files: readonly SourceFile[] }): JSX.Element | null`. Renders nothing when `files.length < 2`. Otherwise it renders `<span className="file-badge file-badge--{ordinal}" title={rowTitle(shot, files)}>F{ordinal}</span>`, using `rowTitle` from `ShotTable.tsx` (move `rowTitle` into `shotLabel.ts` and re-export it from `ShotTable.tsx` so its existing imports keep working).
  - `shotOptionLabel(s: Shot, files: readonly SourceFile[]): string`. Returns `` `${club} · ${badge}shot ${label} · ${carry}` ``, where `badge` is `` `F${ordinal} ` `` when there are 2+ files and `''` otherwise. `carry` uses `formatMeasurement('carry', …)` or `MISSING_MARK`. This replaces the inline option text in `SelectedShotCard.tsx` and `ShotHeader.tsx` (Tasks 4 and 7 switch to it).
  - CSS: `.file-badge` is a small rounded token with a distinct colour per ordinal (the builder picks the colours, using `tokens.css` variables if they fit). `.visually-hidden` is the standard screen-reader-only class (needed by Task 4).
- [ ] **Step 1: Failing tests** in `FileBadge.test.tsx`:
  - With one file, `FileBadge` renders nothing and `shotOptionLabel` has no `F1`.
  - With two files whose shots share `shotLabel '3'` (Review Focus 1), the two badges read `F1` and `F2`, their titles contain `File 1 ·` and `File 2 ·` and `CSV row`, and the two `shotOptionLabel` strings differ.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/components/FileBadge.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component, the helper and the CSS.
- [ ] **Step 4: Run** it again plus `npx vitest run apps/web/src` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): F1/F2 file badges and shared shot option labels`.

---

### Task 4: Selected-shot card and Overview wiring

**Files:**
- Create: `apps/web/src/components/includeAllWithUndo.ts`
- Modify: `apps/web/src/components/SelectedShotCard.tsx`, `apps/web/src/pages/OverviewPage.tsx`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/pages/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: `tableShots`, `excludedIds`, `excludeAndAdvance`, `setExcluded` and `includeAll` (Task 2); `FileBadge` and `shotOptionLabel` (Task 3).
- Produces:
  - `includeAllWithUndo(includeAll: WorkingSetApi['includeAll'], scope: 'session' | 'filter'): void`. Calls it and, when the result isn't null, shows the toast from Global Constraints with `action: { label: 'Undo', onClick: undo }`.
  - New `SelectedShotCard` props: `{ shots: readonly Shot[]; selected: Shot | undefined; excluded: boolean; files: readonly SourceFile[]; onSelect; onStep; onExclude(id: string): void; onInclude(id: string): void; color?: string }`. `selected` can be an excluded shot that isn't in `shots`.
- Card behaviour:
  - The title shows `<FileBadge>` before the shot label.
  - Picker options = `shots` plus `selected` when it's excluded, labelled with `shotOptionLabel`.
  - For an included selection, the footer has a secondary **Exclude shot** button that calls `onExclude`, next to "Open shot inspector →".
  - For an excluded selection, the position note reads `Excluded` (styled as a tag) instead of "N of M", and the button reads **Include shot** and calls `onInclude`.
- Overview behaviour:
  - Pass `selected = tableShots.find(id === selectedId)`, `onExclude = ws.excludeAndAdvance`, and `onInclude = (id) => ws.setExcluded(id, false)`.
  - Add a polite live region `<p role="status" className="visually-hidden">`. After an exclude or include from the card it reads `` `Shot ${label} excluded · ${n} shots used` `` or `` `Shot ${label} included · ${n} shots used` ``, where `n` is the new `visibleShots.length`.
  - The empty-state branch splits:
    - `tableShots.length === 0` keeps today's "No shots match these filters".
    - `visibleShots.length === 0 && tableShots.length > 0` shows the `EmptyState` title `` `All ${tableShots.length} shots here are excluded` ``, with a primary `Include all` action calling `includeAllWithUndo(ws.includeAll, 'filter')`. Below it, the card and the Shots table panel still render, because the empty state replaces only the averages and the plot.
  - The Shots panel footer note becomes `` `${visible} used · ${excluded} excluded · "–" means the CSV held no value; it is never treated as zero` ``, counted over `tableShots`.
- [ ] **Step 1: Failing tests** in `OverviewPage.test.tsx` (use `[F1, F2]` so it runs fast):
  - `test('Exclude shot drops the shot from the averages count and moves the card to the next shot')`. Select a shot from the table, click `Exclude shot`, and check the heading's shot count goes down by 1, the card title shows a different shot, and the live region text matches `/excluded · \d+ shots used/`.
  - `test('an excluded selection shows Excluded and Include shot, which brings it back')`. Use `store().setExcluded` inside `act`, then select it.
  - `test('excluding every shot of the filtered club shows the all-excluded state, keeping the card and table')` (Review Focus 3). Filter to the club with the fewest shots, exclude them all via the store, and check for `All N shots here are excluded`, that the Shots table rows are still present, and that the card is present. Click `Include all`, and check the averages heading comes back.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/pages/OverviewPage.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** `npx vitest run apps/web/src` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(overview): exclude or include a shot from the card; all-excluded state`.

---

### Task 5: Shot table — greyed excluded rows and "Edit shots" mode

**Files:**
- Modify: `apps/web/src/components/ShotTable.tsx`, `apps/web/src/pages/OverviewPage.tsx` (props), `apps/web/src/styles/app.css`
- Test: `apps/web/src/components/ShotTable.test.tsx` (create)

**Interfaces:**
- Consumes: `FileBadge` (Task 3); `includeAllWithUndo` (Task 4); `tableShots`, `excludedIds` and `setExcluded` (Task 2).
- Produces: new `ShotTable` props `excludedIds: ReadonlySet<string>`, `onSetExcluded(id: string, excluded: boolean): void` and `onIncludeAll(): void`. Overview now passes `shots={tableShots}`, and `onIncludeAll` calls `includeAllWithUndo(ws.includeAll, 'filter')`.
- Behaviour:
  - An excluded row gets `className="is-excluded"` (greyed, with text still at readable contrast) and an `Excluded` tag in the Shot cell after the number.
  - The Shot cell shows `<FileBadge>` before the number.
  - `editing` is local `useState(false)`.
  - The tools row shows an `Edit shots` button. While editing it shows `Include all` and `Done` instead, and the wrapper gets a modifier class (a visible frame) and an `Editing shots` heading or label.
  - While editing, a `use` column is pinned first. It has `enableHiding: false`, is not listed in the Columns menu, and has the header `Use`. Each cell holds `<input type="checkbox" role="switch" checked={!excluded}>` with `aria-label` `` `Use shot ${label}, ${club}, file ${ordinal}` ``. Its `onChange` calls `onSetExcluded(id, !checked)`, and its `onClick`/`onKeyDown` stop propagation so the row neither selects nor runs its key handler.
  - Phones: `PHONE_SIZES` gets a narrow `use` width.
- [ ] **Step 1: Failing tests** in `ShotTable.test.tsx`. Render `ShotTable` directly with shots built from a fixture through `renderWithData`'s store, or with hand-made shots like `workingSet.test.ts`.
  - `test('outside edit mode there are no Use switches and a row click only selects')`. `onSetExcluded` is not called.
  - `test('an excluded row is marked is-excluded with an Excluded tag')`.
  - `test('Edit shots shows a Use switch per row; toggling calls onSetExcluded without selecting the row')` (Review Focus 2). Click the switch, and check `onSetExcluded` was called with `(id, true)` and `onSelect` wasn't. Focus the switch and press Space: `onSelect` is still not called.
  - `test('Include all calls onIncludeAll; Done leaves edit mode')`.
  - `test('two files: rows carry F1/F2 badges')`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/components/ShotTable.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run apps/web/src` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shot-table): greyed excluded rows and an Edit shots mode with Use switches`.

---

### Task 6: Filter bar — included counts and the "N excluded" list

**Files:**
- Create: `apps/web/src/components/ExcludedMenu.tsx`
- Modify: `apps/web/src/components/FilterBar.tsx`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/pages/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: `excludedIds`, `reveal`, `setExcluded` and `includeAll` (Task 2); `FileBadge` (Task 3); `includeAllWithUndo` (Task 4); `clubCounts(shots, excludedIds)` (Task 1).
- Produces: `ExcludedMenu()`, which reads the store itself. FilterBar renders it only when `excludedIds.size > 0`.
- Behaviour:
  - Club chips come from `clubCounts(inFile, excludedIds)`, so a fully excluded club shows `0`. The All chip's count is the included shots in the file.
  - The Source file option counts are unchanged (totals).
  - `ExcludedMenu` is a Base UI `Popover` (styled like the Columns menu) triggered by a chip-styled button reading `` `${n} excluded` ``.
  - The popup lists the excluded shots across the whole session in `displayOrder`. Each row is a button reading `Club · <FileBadge/> Shot N · carry`, which calls `reveal(id)` and closes the popover. Next to it, an `Include` button with `aria-label` `` `Include shot ${label}, ${club}` `` calls `setExcluded(id, false)`.
  - The footer has `Include all`, which calls `includeAllWithUndo(ws.includeAll, 'session')`.
- [ ] **Step 1: Failing tests** in `OverviewPage.test.tsx`:
  - `test('club chips count included shots; a club with every shot excluded keeps a 0 chip')` (Review Focus 3).
  - `test('the N excluded list: picking an entry outside the filter reveals it, Include brings one back, Include all brings back all')`. Exclude one Driver shot and one shot of another club, filter to the other club, open `2 excluded`, and click the Driver entry: the Driver chip is pressed and the card shows that shot as Excluded. Next, `Include` on the other entry: the trigger reads `1 excluded`. Finally `Include all`: the trigger is gone.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/pages/OverviewPage.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run apps/web/src` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(filter-bar): included-only club counts and an N excluded list with undo`.

---

### Task 7: Shot Inspector — opening an excluded shot on purpose

**Files:**
- Modify: `apps/web/src/pages/InspectorPage.tsx`, `apps/web/src/components/ShotHeader.tsx`, `apps/web/src/styles/app.css`
- Test: `apps/web/src/pages/InspectorPage.test.tsx`

**Interfaces:**
- Consumes: `tableShots`, `excludedIds`, `setExcluded` and `includeAll` (Task 2); `shotOptionLabel` (Task 3); `includeAllWithUndo` (Task 4).
- Produces: a new `ShotHeader` prop, `excluded: boolean`.
- Behaviour:
  - `shot = visibleShots.find(selected) ?? (selected id in tableShots and excluded ? that shot : undefined) ?? visibleShots[0]`. The auto-select effect only runs when nothing at all is selected or the selection is no longer in `tableShots`.
  - The comparison lists (`others`, `sameClub`) and the tabs' `visibleShots` stay built from `visibleShots` only. Build the replay scene for an excluded current shot as well (scenes map over `visibleShots` plus the current shot).
  - When `excluded`, the Inspector shows a banner under `ShotHeader` with the spec's copy and an `Include it again` button that calls `setExcluded(shot.id, false)`.
  - In `ShotHeader`, the position text reads `Excluded` instead of "N of M". Its picker uses `shotOptionLabel` and also lists the current shot when it is excluded.
  - If `visibleShots.length === 0 && tableShots.length > 0` and no excluded shot is selected, show `EmptyState` with the title `` `All ${tableShots.length} shots here are excluded` ``, an `Include all` action calling `includeAllWithUndo(ws.includeAll, 'filter')`, and a link back to `/overview`.
- [ ] **Step 1: Failing tests** in `InspectorPage.test.tsx`:
  - `test('an excluded selected shot opens with the excluded banner; ‹ › skip excluded shots')`. Exclude and select a shot via the store, render `/inspect`, and check the banner text and `Excluded` are shown. Click `Next shot`, and check the new selection is included. Click `Previous shot` repeatedly, and check it never lands on the excluded one.
  - `test('Include it again removes the banner')`.
  - `test('with an included shot open, the picker does not list excluded shots')`. Exclude shot X, select another shot Y, render `/inspect`, and check that no `Choose shot` option equals `shotOptionLabel(X, files)`. Task 2's tests already check that `visibleShots` (which feeds the comparison overlays) leaves X out.
  - `test('all shots in the filter excluded: all-excluded empty state with Include all')`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/pages/InspectorPage.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run apps/web/src` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(inspector): open an excluded shot on purpose; comparisons and stepping skip excluded shots`.

---

### Task 8: End-to-end flow

**Files:**
- Create: `e2e/exclude.spec.ts`

**Interfaces:**
- Consumes: `loadAndAnalyze` and `FIXTURES` from `e2e/helpers.ts`.

- [ ] **Step 1: Write the test** `test('exclude from the card and from Edit shots, then include from the Inspector')`:
  - `loadAndAnalyze(page, FIXTURES.slice(0, 2))`, then read the `Averages · … · N shots` heading.
  - Click the first table row, then click `Exclude shot`. The heading shows N−1, and the filter bar shows `1 excluded`.
  - Click `Edit shots`, turn off the first `Use` switch that is still on, then click `Done`. The heading shows N−2, `2 excluded` is shown, and the table has 2 rows with class `is-excluded`.
  - Open `2 excluded`, click the first entry, then go to the Shot Inspector. The banner `This shot is excluded.` shows. Click `Include it again`, return to the Overview, and check the heading shows N−1.
  - Count the dispersion plot's points before and after, and check the count drops by 1 per exclusion. The plot points are `.fsa-dispersion circle[data-shot-id]:not([aria-current])`.
- [ ] **Step 2: Run** `npm run e2e -- e2e/exclude.spec.ts`. The webServer builds first, which takes a few minutes. Expected: PASS. Then run the whole suite with `npm run e2e`. Expected: PASS.
- [ ] **Step 3: Commit** `test(e2e): exclude and include shots across card, Edit shots and Inspector`.
