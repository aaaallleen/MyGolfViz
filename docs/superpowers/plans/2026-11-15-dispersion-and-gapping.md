# Dispersion over time and the Gapping tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 1 SD / Every shot ellipse choice everywhere ellipses are drawn, a Progression tile showing each session's dispersion, and a local-only Gapping tab with a stock yardage table and a consistency score ± confidence.

**Architecture:** All maths in `packages/analytics` (ellipse kinds, per-session dispersion, gapping rows, consistency score), drawing in `packages/visualizations` (a new fitted-window `SpreadPlot`; the existing `DispersionPlot` for Gapping), pages in `apps/web`. The ellipse choice lives in the shared store (so the public session page has it in memory) and the local app saves it with the existing settings API. No backend or schema change.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, Playwright (`e2e-local`), npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-15-dispersion-and-gapping-design.md`

## Global Constraints

- Node: prefix commands with `PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH`. Unit tests: `npm test -- <path>`; types: `npm run typecheck`.
- Never `git add -A`; add the files you changed. Leave `.agents/`, `.claude/`, `Desktop_design.md`, `skills-lock.json` untracked. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Missing values are never 0: no lateral → no dot and not in any ellipse; no carry → not in carry stats.
- Ellipse kinds: `EllipseKind = 'sd1' | 'all'`. Control label **Ellipse**, options **1 SD** (`sd1`) and **Every shot** (`all`). Default `sd1`. One shared preference.
- Settings keys: `ellipse.kind` (`'sd1' | 'all'`), `gapping.scope` (`GappingScope`), and `view: 'side' | 'overlaid'` (default `'side'`) inside the existing `progression.scope`.
- Copy (exact):
  - Session page Every shot caption: `Every-shot ellipse per club · the 1σ ellipse's shape, enlarged until every shot is inside · observed: {n} of {n} shots inside. Cross: each club's mean landing.{missing}` (`{missing}` is the existing " Clubs with fewer than 3 shots have no ellipse." suffix). The 1 SD caption is unchanged.
  - Tile: title `Dispersion by session`; View options `Side by side` / `Overlaid`; per session `{w} × {d} yd` and, for 1 SD only, `{k} of {n} inside`; under 3 shots `Needs 3 shots for an ellipse`; Overlaid over 8 sessions `Overlaid shows the latest 8 of {N} sessions`.
  - Gapping: nav and `<h1>` `Gapping`; `Based on` options `Selected session…`, `Latest session`, `Last 3 sessions`, `Last 10 sessions`, `All time`; picker label `Session`; `Shots` options `All shots` / `Stock only`.
  - Gapping line: `{basis} · {n} shots` plus ` · {k} excluded left out` when Stock only, where `{basis}` is `Each club's last 3 sessions`, `Each club's last 10 sessions`, `All time`, or the session's date (`formatSessionDate`) for Latest/Selected.
  - Table headers: `Club`, `Stock carry`, `Total`, `Short – long`, `Left – right`, `Gap to next`, `Consistency`, `Shots`. Flags `overlaps {club}` and `hole`. Score cell `73 ± 14`; under 6 shots `—` + `few shots`. Shots cell `title`: `{n} shots from {k} sessions, {first} – {last}` (one session: `{n} shots from {date}`).
  - Table caption: `Consistency scores how tight a club's landings are, distance and direction together, against its carry: 100 is a 3% spread, 0 is 15%. The ± is how much the score could still move; it shrinks as you hit more shots. Needs more than 5 shots.`
  - Empty states: no sessions → title `No saved sessions yet`, body `Load a session CSV to see your gapping.`; no club with carry → `None of these shots have carry values.`
- Score constants: `SCORE_BEST_PCT = 3`, `SCORE_WORST_PCT = 15`, `SCORE_MIN_SHOTS = 6`, `HOLE_FACTOR = 1.75`.
- Public build: no Gapping route, nav item or code; the existing `verify:public` check (`/api/` forbidden) and the Nav test catch leaks.

## Review Focus

1. A mishit with Every shot: one far shot must still be inside (Mahalanobis max on the edge, not just under it) — floating-point must not leave it outside. → Task 1 test `every point is inside, the farthest on the edge`.
2. Clearing or loading a session must not reset the Ellipse choice back to 1 SD. → Task 3 reducer tests.
3. A Selected session that was deleted since it was saved → fall back to Latest session, never an empty page. → Task 6 `parseGappingScope`/page test.
4. A club only hit in old sessions under Last 3 still appears, from its own last 3; a club in no session of the basis doesn't. → Task 2 `gappingSessions` tests.
5. The local ellipse preference must not overwrite the saved value with the default before it has loaded. → Task 3 `useEllipsePreference` test.

---

### Task 1: Ellipse kinds and per-session dispersion (analytics)

**Files:**
- Modify: `packages/analytics/src/dispersion.ts`, `packages/analytics/src/progression.ts`
- Modify: `packages/visualizations/src/DispersionPlot.test.tsx:19` (fixture gains `halfX`, `halfY`)
- Test: `packages/analytics/src/dispersion.test.ts`, `packages/analytics/src/progression.test.ts`

**Interfaces:**
- Produces:
  - `export type EllipseKind = 'sd1' | 'all'`
  - `Ellipse` gains `halfX: number; halfY: number` — half the ellipse's lateral width and distance depth (k·SDx, k·SDy, population SDs; k = Mahalanobis radius: 1 for `sd1`).
  - `DispersionStats` gains `kind: EllipseKind`.
  - `dispersionStats(shots: readonly { id: string; m: Measurements }[], mode: LandingMode, kind: EllipseKind = 'sd1'): DispersionStats`
  - `dispersionByClub(shots: readonly Shot[], mode: LandingMode, kind: EllipseKind = 'sd1'): ClubDispersion[]`
  - `dispersionBySession(sessionIds: readonly string[], shots: readonly ProgressionShot[], choice: ShotsChoice, kind: EllipseKind): { sessionId: string; stats: DispersionStats }[]` (carry mode, one entry per id in order, uses the existing `pick`/`bySession`).

- [ ] **Step 1: Write the failing tests** in `dispersion.test.ts`:

```ts
test('1 SD is unchanged and its half extents are the SDs', () => {
  const d = dispersionStats(fixtureShots(SEPT_19_2022), 'carry');
  expect(d.kind).toBe('sd1');
  expect(d.ellipse!.rx).toBeCloseTo(39.672, 3);
  expect(d.ellipse!.halfX).toBeCloseTo(d.sdX!, 9);
  expect(d.ellipse!.halfY).toBeCloseTo(d.sdY!, 9);
});
test('every point is inside, the farthest on the edge', () => {
  const shots = synth([[-1, 150], [1, 152], [0, 148], [2, 151], [-30, 120]]);
  const d = dispersionStats(shots, 'carry', 'all');
  expect(d.observedInside).toBe(5);
  const one = dispersionStats(shots, 'carry', 'sd1');
  const k = d.ellipse!.rx / one.ellipse!.rx;
  expect(d.ellipse!.ry / one.ellipse!.ry).toBeCloseTo(k, 9);   // same shape, scaled
  expect(d.ellipse!.angleDeg).toBeCloseTo(one.ellipse!.angleDeg, 9);
  expect(d.ellipse!.halfX).toBeCloseTo(k * one.sdX!, 9);
});
test('Every shot with fewer than 3 points has no ellipse', () => {
  expect(dispersionStats(synth([[0, 150], [1, 151]]), 'carry', 'all').ellipse).toBeNull();
});
```

and in `progression.test.ts`: `dispersionBySession(['a','b'], shots, 'stock', 'sd1')` returns two entries in id order, leaves excluded shots out under `'stock'`, and an id with no shots gives `stats.points` `[]` and `ellipse` `null`.

- [ ] **Step 2: Run** `npm test -- packages/analytics` — expect FAIL (`kind`/`halfX` undefined, `dispersionBySession` not exported).

- [ ] **Step 3: Implement.** For `'all'`, k² = the largest Mahalanobis d² among the points, then multiply by `1 + 1e-9` so the farthest point counts as inside; rx = √(k²·λ1), ry = √(k²·λ2), halfX = √(k²·sxx), halfY = √(k²·syy). `observedInside` counts d² ≤ k² (so it is n for `'all'`). Update the `DispersionPlot.test.tsx` fixture ellipse with `halfX: 10, halfY: 10` and its stats with `kind: 'sd1'`.

- [ ] **Step 4: Run** `npm test -- packages/analytics packages/visualizations && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(analytics): Every shot ellipse and per-session dispersion`.

---

### Task 2: Gapping rows and the consistency score (analytics)

**Files:**
- Create: `packages/analytics/src/gapping.ts`, `packages/analytics/src/gapping.test.ts`
- Modify: `packages/analytics/src/index.ts` (export it)

**Interfaces:**
- Consumes: Task 1 `dispersionStats(…, 'carry', kind)`, `EllipseKind`; existing `orderSessions`, `ProgressionShot`, `ShotsChoice`, `quantile`, `FEW_SHOTS`.
- Produces:
  - `export type GappingBasis = 'session' | 'latest' | 'last3' | 'last10' | 'all'`
  - `export interface GappingSession { id: string; date: string; createdAt: string; clubs: readonly { club: string; count: number }[] }`
  - `gappingSessions(sessions: readonly GappingSession[], basis: GappingBasis, sessionId: string | null): Map<string, string[]>` — club → its session ids, oldest first. `session`: the session `sessionId` (falls back to the latest when unknown/null); `latest`: newest session overall; `last3`/`last10`: each club's own last N sessions with count > 0; `all`: every session with the club. Clubs with count 0 are skipped.
  - `shotsForGapping(shots: readonly ProgressionShot[], perClub: ReadonlyMap<string, readonly string[]>, choice: ShotsChoice): ProgressionShot[]` — keeps a shot when its club's list includes its `sessionId`; `'stock'` drops excluded.
  - `export interface ConsistencyScore { score: number; plusMinus: number; n: number }` and `consistencyScore(points: readonly { x: number; y: number }[], stockCarry: number): ConsistencyScore | null` (x lateral, y carry; null when n < `SCORE_MIN_SHOTS` or stockCarry ≤ 0).
  - `export interface GappingRow { club: string; stockCarry: number; total: number | null; n: number; few: boolean; sessionIds: string[]; dispersion: DispersionStats; shortLong: [number, number] | null; leftRight: [number, number] | null; gapToNext: number | null; overlapsNext: string | null; hole: boolean; consistency: ConsistencyScore | null }`
  - `gappingTable(shots: readonly ProgressionShot[], kind: EllipseKind): GappingRow[]` — clubs with ≥ 1 carry value, sorted by `stockCarry` desc, then club name.
  - Constants `SCORE_BEST_PCT`, `SCORE_WORST_PCT`, `SCORE_MIN_SHOTS`, `HOLE_FACTOR` (values in Global Constraints).

- [ ] **Step 1: Write the failing tests** (`gapping.test.ts`):

```ts
// 8, 20 and 50 shots: lateral ±a and carry 160±b alternating, so sample SDs are exactly 8 and 6, median carry 160.
function spreadShots(n: number) {
  const a = 8 * Math.sqrt((n - 1) / n), b = 6 * Math.sqrt((n - 1) / n);
  return Array.from({ length: n }, (_, i) => ({ x: i % 2 ? a : -a, y: 160 + (i % 4 < 2 ? b : -b) }));
}
test('the worked example: 73 ± 14 / ± 8 / ± 5', () => {
  expect(consistencyScore(spreadShots(8), 160)).toMatchObject({ n: 8 });
  expect(consistencyScore(spreadShots(8), 160)!.score).toBeCloseTo(72.917, 2);
  expect(consistencyScore(spreadShots(8), 160)!.plusMinus).toBeCloseTo(13.92, 2);
  expect(Math.round(consistencyScore(spreadShots(20), 160)!.plusMinus)).toBe(8);
  expect(Math.round(consistencyScore(spreadShots(50), 160)!.plusMinus)).toBe(5);
});
test('needs more than 5 shots', () => {
  expect(consistencyScore(spreadShots(8).slice(0, 5), 160)).toBeNull();
});
test('clamps to 0–100', () => { /* tiny spread → score 100; huge spread → 0; plusMinus still finite */ });
```

  Sample SDs (n − 1): `spread% = 100·√(SDcarry² + SDlat²)/stockCarry`, `score = clamp(100·(15 − spread%)/12, 0, 100)`, `plusMinus = (100/12)·spread%/√(2(n − 1))`.

  `gappingSessions`: with sessions s1…s5 (oldest→newest) where `4 Hybrid` is only in s1–s2, `last3` gives `7 Iron` → [s3,s4,s5] and `4 Hybrid` → [s1,s2]; `latest` gives every club of s5 only; `session` with an unknown id behaves like `latest`.

  `gappingTable`: three clubs with carries around 160, 150 and 120 → sorted desc, `gapToNext` 10 and 30 and `null`; a club with a shot missing carry counts only its carry shots in `n`; `overlapsNext` set to the next club's name when its short edge (`shortLong[0]`) < the next club's long edge, and it changes between `'sd1'` and `'all'` on the same shots; `hole` true for a gap ≥ 1.75 × the median of positive gaps and false with fewer than 3 positive gaps; a club with 2 shots has `shortLong` `null`, `overlapsNext` `null`, `consistency` `null`, `few` true; `sessionIds` lists the distinct sessions, oldest first by appearance.

- [ ] **Step 2: Run** `npm test -- packages/analytics/src/gapping.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** in `gapping.ts`. `stockCarry` = median carry (`quantile(sorted, 0.5)`), `total` = median total or null; `dispersion = dispersionStats(clubShots, 'carry', kind)`; `shortLong = [cy − halfY, cy + halfY]`, `leftRight = [cx − halfX, cx + halfX]` from `dispersion.ellipse`. `consistencyScore` takes the shots with both lateral and carry.

- [ ] **Step 4: Run** `npm test -- packages/analytics && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(analytics): gapping rows and consistency score`.

---

### Task 3: The shared Ellipse choice and the session page toggle

**Files:**
- Modify: `apps/web/src/state/reducer.ts`, `apps/web/src/state/store.tsx`, `apps/web/src/components/ShotPatternPanel.tsx`, `apps/web/src/pages/OverviewPage.tsx`, `apps/web/src/local/LocalRoutes.tsx`
- Create: `apps/web/src/local/useEllipsePreference.ts`, `apps/web/src/local/useEllipsePreference.test.tsx`
- Test: `apps/web/src/reducer.test.tsx`, the existing ShotPatternPanel/Overview tests (find with `grep -rl ShotPatternPanel apps/web/src`)

**Interfaces:**
- Consumes: Task 1 `EllipseKind`, `dispersionByClub(shots, mode, kind)`.
- Produces: `StoreState.ellipseKind: EllipseKind` (initial `'sd1'`), action `{ type: 'setEllipseKind'; kind: EllipseKind }`, `WorkingSetApi.setEllipseKind(k: EllipseKind): void`; `ShotPatternPanel` props `ellipseKind: EllipseKind; onEllipseKind(k: EllipseKind): void`; `useEllipsePreference(): void`; `export const ELLIPSE_KEY = 'ellipse.kind'`.

- [ ] **Step 1: Write the failing tests.**
  - Reducer: `setEllipseKind` sets it; after `setEllipseKind('all')`, `clear`, `restore` (with a state holding `'sd1'`) and `loadSession` all leave `ellipseKind` `'all'`.
  - Panel: an `Ellipse` radio group with `1 SD` checked; choosing `Every shot` calls `onEllipseKind('all')`; with `ellipseKind="all"` the caption reads the Every shot copy from Global Constraints (`observed: 5 of 5 shots inside`).
  - `useEllipsePreference`: with `getSetting` resolving `'all'`, the store becomes `'all'` and `putSetting` is not called; after that, `setEllipseKind('sd1')` calls `putSetting('ellipse.kind', 'sd1')`; a stored junk value (`'wide'`) leaves `'sd1'` and saves nothing; while `getSetting` is pending, a change made by the user still wins and is saved (the late answer must not overwrite it).

- [ ] **Step 2: Run** `npm test -- apps/web/src/reducer.test.tsx apps/web/src/local/useEllipsePreference.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement.** `clear` returns `{ ...initialState, ellipseKind: state.ellipseKind }`; `restore` keeps the current `ellipseKind`. The panel puts a second `SegmentedControl` (label `Ellipse`) beside Carry/Total and picks the caption by `groups[0]?.stats.kind`. `OverviewPage` passes `ws.ellipseKind`/`ws.setEllipseKind` and calls `dispersionByClub(shots, ws.landingMode, ws.ellipseKind)`. `useEllipsePreference` loads `ELLIPSE_KEY` once on mount, applies a valid value only if the user hasn't changed the choice yet, then saves each later change (toast `Couldn't save the ellipse choice` on failure); `LocalRoutes` calls it next to `useSessionSync()`.

- [ ] **Step 4: Run** `npm test -- apps/web && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(web): 1 SD / Every shot ellipse on the session page`.

---

### Task 4: `SpreadPlot`, a fitted-window top view

**Files:**
- Create: `packages/visualizations/src/SpreadPlot.tsx`, `packages/visualizations/src/SpreadPlot.test.tsx`
- Modify: `packages/visualizations/src/index.ts`

**Interfaces:**
- Consumes: Task 1 `DispersionStats` (with `ellipse.halfX/halfY`).
- Produces:
  - `export interface SpreadBounds { distMin: number; distMax: number; latMin: number; latMax: number }`
  - `spreadBounds(stats: readonly DispersionStats[], aspect = 0.75): SpreadBounds | null` — covers every point and every ellipse box (centre ± half extents), pads 10% each side, at least 10 yd per axis, then widens the shorter axis about its centre so `(latMax − latMin) = aspect × (distMax − distMin)`; null when there are no points.
  - `SpreadPlot(props: { groups: { key: string; label: string; color: string; stats: DispersionStats }[]; bounds: SpreadBounds; width: number; ariaLabel: string })` — one yard per pixel on both axes (height = width × aspect), distance across, left of target above the line like `DispersionPlot`, a dashed target line when 0 is in range, light grid, then per group: dots, ellipse (`data-testid="ellipse"`, `data-key`), centre cross. No tee, no distance arcs.

- [ ] **Step 1: Write the failing tests:** `spreadBounds` covers an ellipse that reaches past the points (Every shot), respects the 0.75 aspect, returns null for no points; `SpreadPlot` draws one ellipse per group that has one (`[data-testid=ellipse]` count), dots with each group's colour, and the given `aria-label`; two plots given the same bounds and width have the same `viewBox`.

- [ ] **Step 2: Run** `npm test -- packages/visualizations/src/SpreadPlot.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement** (reuse `DispersionPlot`'s ellipse matrix approach and theme colours).

- [ ] **Step 4: Run** `npm test -- packages/visualizations && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(visualizations): SpreadPlot for zoomed dispersion`.

---

### Task 5: Progression tile "Dispersion by session"

**Files:**
- Create: `apps/web/src/local/progression/DispersionTile.tsx`, `apps/web/src/local/progression/DispersionTile.test.tsx`
- Modify: `tiles.ts` (TileId `'dispersion'`, TileKind `'dispersion'`, `t('dispersion', 'Dispersion by session', 'accuracy', 'dispersion')`, appended to `DEFAULT_LAYOUT`), `scope.ts` (`Scope.view`, `DEFAULT_SCOPE.view = 'side'`, `parseScope`), `SpecialTiles.tsx` (case `'dispersion'`, `SpecialTileProps.onScope(next: Scope): void`), `ProgressionPage.tsx` (pass `onScope={changeScope}`), `progression.css`
- Test: `tiles.test.ts`, `scope.test.ts` (update the deep-equal defaults)

**Interfaces:**
- Consumes: Task 1 `dispersionBySession`; Task 3 `useWorkingSet().ellipseKind` / `setEllipseKind`; Task 4 `SpreadPlot`, `spreadBounds`; `CLUB_SERIES`, `formatSessionDate`.
- Produces: `DispersionTile(props: SpecialTileProps)`; `Scope.view: 'side' | 'overlaid'`.

- [ ] **Step 1: Write the failing tests** (`DispersionTile.test.tsx`, store provider + three sessions of made-up shots):
  - Side by side: one plot per session, oldest first (dates in order), each with `{w} × {d} yd` and `{k} of {n} inside`; all plots share one `viewBox`.
  - Choosing `Every shot` in the tile's `Ellipse` control sets the store to `'all'` and hides the `inside` text.
  - Choosing `Overlaid` calls `onScope` with `view: 'overlaid'`; with `view: 'overlaid'` one plot holds one ellipse per session, each session's colour is `CLUB_SERIES[i]`, and a legend table lists session, width and depth.
  - Ten sessions in Overlaid → 8 ellipses and the text `Overlaid shows the latest 8 of 10 sessions`.
  - A session with 2 shots shows its dots and `Needs 3 shots for an ellipse`, and its date line carries ` · few shots` (the page's 0 < n < 5 rule); a session with 6 shots doesn't.
  - `parseScope({})` gives `view: 'side'`; `parseScope({ view: 'x' })` gives `'side'`; `TILES` has `dispersion` in `accuracy`; `DEFAULT_LAYOUT` ends with `'dispersion'`.

- [ ] **Step 2: Run** `npm test -- apps/web/src/local/progression` — expect FAIL.

- [ ] **Step 3: Implement.** The tile uses `TileFrame` (wide: `className="prog-tile--wide"`), controls = existing controls + the two `SegmentedControl`s, body = the plots. Bounds come from `spreadBounds` over every shown session's stats so all plots share a scale; side-by-side plots wrap in a grid (`minmax(150px, 1fr)`).

- [ ] **Step 4: Run** `npm test -- apps/web && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(progression): Dispersion by session tile`.

---

### Task 6: The Gapping tab

**Files:**
- Create: `apps/web/src/local/gapping/GappingPage.tsx`, `GappingTable.tsx`, `gappingScope.ts`, `gapping.css`, and tests `GappingPage.test.tsx`, `gappingScope.test.ts`
- Modify: `apps/web/src/local/LocalRoutes.tsx` (lazy route `/gapping`), `apps/web/src/mode.ts` (`LOCAL_NAV` gains `{ to: '/gapping', label: 'Gapping' }` after Compare), `apps/web/src/paths.ts` (`AppPaths.gapping: string | null`, `'/gapping'` local, `null` public), `apps/web/src/layout/Nav.test.tsx`

**Interfaces:**
- Consumes: Task 2 `gappingSessions`, `shotsForGapping`, `gappingTable`, `GappingRow`, `GappingBasis`; Task 3 store `ellipseKind`; `DispersionPlot`, `patternXMax`, `clubColors`; `api.listSessions`, `api.listLibraryShots`, `api.getSetting`, `api.putSetting`; `toProgressionShot`.
- Produces: `export interface GappingScope { basis: GappingBasis; sessionId: string | null; shots: ShotsChoice }`, `DEFAULT_GAPPING_SCOPE = { basis: 'last3', sessionId: null, shots: 'stock' }`, `GAPPING_KEY = 'gapping.scope'`, `parseGappingScope(value: unknown): GappingScope`.

- [ ] **Step 1: Write the failing tests** (mock `../api` as the Progression tests do):
  - `parseGappingScope` keeps valid fields and defaults junk.
  - The page loads sessions and shots, shows `Based on` with the five options and `Last 3 sessions` selected, `Shots` on `Stock only`, and the line `Each club's last 3 sessions · {n} shots · {k} excluded left out`.
  - Table: headers in the Global Constraints order; a row per club longest first; bold stock carry; `overlaps {club}` and `hole` flags on fixtures built to trigger them; a club with 5 shots shows `—` and `few shots` in Consistency; a club with 3 shots also shows `few shots` in Shots (0 < n < 5); a 6+ shot club shows `{score} ± {pm}` rounded; the Shots cell's `title` text.
  - `Selected session…` shows the `Session` picker (newest first, latest chosen) and the line shows that date; a saved `sessionId` no longer in the library falls back to the latest session.
  - Switching `Ellipse` to `Every shot` changes the store and the Short – long cells.
  - Hovering a row passes that club as `highlightClub` (the plot's ellipse for other clubs gets the faded opacity).
  - Changing a control calls `putSetting('gapping.scope', …)`.
  - Empty states: no sessions; shots without carry.
  - Nav test: local names `['Sessions', 'Progression', 'Compare', 'Gapping', 'Load Session CSV', 'Help']`; public nav has no Gapping.

- [ ] **Step 2: Run** `npm test -- apps/web/src/local/gapping apps/web/src/layout/Nav.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement.** Fetch shots with `listLibraryShots({ sessionIds })` for the union of `gappingSessions` ids (omit `sessionIds` for `all`, like `shotsQueryIds`), keep stale tiles dimmed while reloading like Progression, then `shotsForGapping` → `gappingTable(shots, ellipseKind)`. Plot: `DispersionPlot` mode `carry`, `groups` from each row's `dispersion` with `clubColors(rows.map(r => r.club))`, `xMax = patternXMax(longest carry)`. Rows get `onMouseEnter`/`onFocus` (row `tabIndex={0}`) to set the highlighted club, cleared on leave/blur.

- [ ] **Step 4: Run** `npm test -- apps/web && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `feat(gapping): Gapping tab with stock yardages and consistency`.

---

### Task 7: End-to-end, binding decisions, full CI

**Files:**
- Create: `e2e-local/gapping.spec.ts`
- Modify: `docs/design/README.md` (decision 1 gains the Every shot caption; decision 8 gains the Dispersion by session tile; new decision 10 **Gapping (Local App)** summarising spec §5), `e2e-local/compare.spec.ts` only if the nav change breaks a locator

- [ ] **Step 1: Write the e2e spec** (serial, its own data: clubs `E2E Gap Driver` from `withClub(FIXTURES[0], …, 'Gap1.csv')` and `E2E Gap 7 Iron` from `withClub(FIXTURES[1], …, 'Gap2.csv')`, sessions `Gap Later` 2033-05-02 and `Gap Earlier` 2033-05-01):
  - Open **Gapping** from the nav: both clubs in the table, Driver first, its Stock carry cell matches `/^\d+ yd$/`, Consistency matches `/^\d+ ± \d+$/`.
  - `Based on` → `Latest session`: only the club imported into `Gap Later` remains; `Selected session…` + `Gap Earlier` shows the other.
  - `Ellipse` → `Every shot`, reload: still `Every shot` (saved), and the session page's panel shows `Every shot` checked too.
  - Progression: add the **Dispersion by session** tile for `E2E Gap Driver`, switch to `Overlaid`, see the legend table.

- [ ] **Step 2: Run** `npm run e2e:local` — expect PASS (fix failures in the owning code, not by loosening assertions).

- [ ] **Step 3: Update `docs/design/README.md`** as listed above.

- [ ] **Step 4: Run both CIs** `npm run ci:public && npm run ci:local` — expect both green; record test counts in the commit body.

- [ ] **Step 5: Commit** `test(e2e): gapping and dispersion; design decisions`.
