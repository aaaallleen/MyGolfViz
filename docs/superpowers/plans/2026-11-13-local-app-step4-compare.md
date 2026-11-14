# Local App step 4 — Compare two shots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-mode `/compare` page that overlays two saved shots on the same diagrams and lists every metric's change, reachable from a **Compare** nav tab and from a **Compare…** button in the Shot Inspector.

**Architecture:** One new endpoint (`GET /api/v1/shots/{id}`) resolves a shot id to the shot, its session and its import. The page reads `?a=&b=` from the URL, resolves each id independently, and draws both shots with the existing `TrajectoryPlot` and `DispersionPlot` (plus one new small SVG, `DeliveryOverlay`). A pure `compareShots` function in `@fsa/analytics` builds the "What changed" rows. Everything new lives under `apps/web/src/local/compare/` behind the existing lazy local routes, so the public bundle doesn't change.

**Tech Stack:** FastAPI + SQLAlchemy + pytest; React 19, React Router 8, `@base-ui/react` Dialog, Vitest + Testing Library; Playwright (`e2e-local`).

**Spec:** `docs/superpowers/specs/2026-11-13-local-app-design.md` §9 (also §6 `GET /shots/{id}`, §7.2 routes, §14 tests). Layout reference: `.superpowers/brainstorm/38828-1794556679/content/compare-layouts.html`, option **B**.

## Global Constraints

- Local mode only in v1. `npm run ci:public` stays green and `scripts/verify-public-build.mjs` passes unchanged; no compare code, `/compare` string or API client may reach the public bundle (guard shared code with `import.meta.env.VITE_APP_MODE === 'local'`).
- No second copy of any chart: reuse `TrajectoryPlot` and `DispersionPlot`; extend them with props instead of forking.
- A missing measurement is never shown or drawn as 0. Missing value cells use `<Missing />` from `@fsa/ui`; Δ for a row with a missing side reads `n/a` and sorts last.
- No good/bad colouring anywhere on the page (no green/red, no "better/worse").
- Colours: shot **A** = `#EAF0EC` (existing `INK`), shot **B** = `#C08CFF` (purple). Export them as `COMPARE_A` / `COMPARE_B` from `packages/visualizations/src/theme.ts`.
- Δ is **A − B**, shown signed with U+2212 for minus and the unit, no arrow, no L/R word (e.g. `+3.9°`, `−570 rpm`, `0 rpm`).
- Comparisons are not saved; the URL `/compare?a=<shotId>&b=<shotId>` (either may be absent) is the whole state. Every state (none, A, B, both) reloads and works with Back.
- Layout: two columns (diagrams left, table right) at ≥ 1024 px; one column at 820 px with no horizontal scroll.
- API changes: run `npm run api:types` and commit `apps/web/src/local/openapi.json` + `api-types.ts`. No schema change (no migration).
- Node commands need `PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH`. Python tests: `uv run --project apps/api pytest apps/api/tests -q`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning (builder's calls)

- **"What changed" scale:** a fixed per-metric typical spread (`COMPARE_SCALE`, Task 2). Rows sort by `|Δ| / scale`, biggest first, ties in `FIELD_DEFS` order. All 27 measurements are listed, altitude included.
- **Compare tab memory:** a module-level variable in the renderer (one per window, gone on quit) holds the last `?a=&b=` shown. A nav click (React Router navigation type `PUSH`) to bare `/compare` replaces the URL with the remembered one. Reaching bare `/compare` by Back/Forward or reload (`POP`) shows the empty page, so Back never gets trapped.
- **Inspector entry:** the Compare… link carries router state `{ pickB: true }`. The page opens B's picker once and then clears that state with a `replace` navigation, so a reload doesn't reopen it.
- **Picker:** a `@base-ui/react/dialog` modal with three native selects (Session, Club, Shot) and **Choose** / **Cancel**. Sessions are newest first (date desc, then created desc). Clubs are in bag order (`compareClubs`). The A picker defaults to the newest session and its first club; the B picker defaults to A's session and club (falling back to A's defaults when A is empty or gone). Shot options read `Shot 7 · 248.3 yd · 104.2 mph`, plus `F2 ` before `Shot` when the session has 2+ files, plus ` (excluded)` for an excluded shot. Missing carry or club speed shows `–`.
- **Header:** each slot label shows `A` or `B`, the club, `Shot N`, the session name and the session date (`formatSessionDate`), with its own **Change shot…** button. One **Swap** button sits between them (it swaps `a` and `b` in the URL). It shows only when both are set.
- **Shared formatting:** `formatDelta` is added to `apps/web/src/local/progression/format.ts`, beside `formatChange`, and Compare imports it from there.

## Review Focus

1. **A shot without the inputs a diagram needs** (no carry/apex/launch/descent, no club path or face angle): that shot's line is left out with a note naming it ("Shot B has no trajectory data"), the other shot is still drawn, nothing is drawn at 0. Pinned in Task 3 and Task 6.
2. **A stale or malformed id** (`?a=nope`, `?a=` empty, the shot's import was removed): `nope` shows "That shot is no longer in your library" in its slot while the other slot still works; empty counts as absent. Pinned in Task 1 and Task 6.
3. **Out-of-order responses:** changing A while the previous A request is still in flight must not let the old answer overwrite the new one. Pinned in Task 6.
4. **Back/Forward and reload:** pick A then B, Back shows the A-only state; Back to bare `/compare` doesn't bounce to the remembered comparison. Pinned in Task 6.
5. **Two different clubs** (Driver 250 yd vs wedge 90 yd): both views share one distance axis that fits the longer shot, so neither is clipped, and the table still lists every metric. Pinned in Task 6.

---

### Task 1: `GET /api/v1/shots/{id}` and the client call

**Files:**
- Modify: `apps/api/src/mygolfviz_api/schemas.py` (add `ShotDetail`)
- Modify: `apps/api/src/mygolfviz_api/queries.py` (add `shot_out`)
- Modify: `apps/api/src/mygolfviz_api/routers/shots.py` (use `shot_out` in `list_shots`)
- Modify: `apps/api/src/mygolfviz_api/routers/library.py` (new route)
- Modify: `apps/web/src/local/api.ts`, `apps/web/src/local/api.test.ts`
- Regenerate: `apps/web/src/local/openapi.json`, `apps/web/src/local/api-types.ts`
- Test: `apps/api/tests/test_library.py`

**Interfaces:**
- Produces (Python): `class ShotDetail(CamelModel): shot: ShotOut; session: SessionRow; import_: ImportRow = Field(alias="import")`, serialised as `{ "shot", "session", "import" }`. `def shot_out(s: models.Shot, excluded: bool) -> ShotOut` in `queries.py`.
- Produces (TS): `export type ShotDetail = S['ShotDetail']` and `export async function getShot(id: string): Promise<ShotDetail | null>` (null on 404, other errors throw, like `getSetting`).

- [ ] **Step 1: Write the failing tests** in `test_library.py` (reuse `_seed`):
  - `test_shot_detail_returns_shot_session_and_import`: take `rows[0]` from `GET /shots?club=Driver&session_ids=[later]`; `GET /api/v1/shots/{id}` → 200; `body["shot"]["id"] == id`, `len(body["shot"]["m"]) == 27`, `"raw" in body["shot"]`, `body["session"]["id"] == later`, `body["session"]["name"] == "Later"`, `body["import"]["id"] == rows[0]["importId"]`, `body["shot"]["excluded"] is False`.
  - `test_shot_detail_reports_exclusion`: exclude that shot via `PATCH /sessions/{later}/exclusions` → detail has `excluded is True`.
  - `test_shot_detail_unknown_id_is_404`: `GET /api/v1/shots/nope` → 404.
  - `test_shot_detail_gone_after_import_removed`: `DELETE /imports/{importId}` → the shot's detail is 404.
- [ ] **Step 2: Run** `uv run --project apps/api pytest apps/api/tests/test_library.py -q`. Expected: the 4 new tests FAIL (404/405 on the route).
- [ ] **Step 3: Implement.** Add `shot_out` and switch `list_shots` to it (no behaviour change). Add `@router.get("/shots/{shot_id}", response_model=ShotDetail)` to `library.py`: load the shot, its import and session (404 `not_found()` if any is missing); `excluded` = an `Exclusion` row exists for `(session.id, import.sha256, shot.source_row)`; build with `session_row`, `import_row`, `shot_out`. Return with `response_model_by_alias=True` so the key is `import`.
- [ ] **Step 4: Run** the Python suite. Expected: all PASS (including `test_openapi_fresh.py` after Step 5).
- [ ] **Step 5: Regenerate the types** with `npm run api:types`, then add `getShot` + the `ShotDetail` type to `api.ts`. Add to `api.test.ts`: `getShot resolves null on 404` and `getShot returns the body on 200` (same fetch-mock pattern as the `getSetting` tests). Run `npx vitest run apps/web/src/local/api.test.ts` and `npm run api:types:check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(api): GET /shots/{id} returns a shot with its session and import`.

### Task 2: `compareShots` in `@fsa/analytics`

**Files:**
- Create: `packages/analytics/src/compare.ts`, `packages/analytics/src/compare.test.ts`
- Modify: `packages/analytics/src/index.ts` (`export * from './compare'`)

**Interfaces:**
- Produces:
  ```ts
  export const COMPARE_SCALE: Readonly<Record<MeasurementKey, number>>;
  export interface CompareRow { key: MeasurementKey; a: number | null; b: number | null; delta: number | null; score: number | null }
  export function compareShots(a: Measurements, b: Measurements): CompareRow[];
  ```
  `delta = a − b` and `score = |delta| / COMPARE_SCALE[key]` when both are finite, otherwise both `null`. Sort by `score` desc, null scores last; ties and the null block both keep `FIELD_DEFS` order. One row per `MEASUREMENT_KEYS` entry (27).

`COMPARE_SCALE` values (typical shot-to-shot spread for one club): ballSpeed 3, clubSpeed 2, smash 0.03, carry 8, total 10, roll 5, swingH 2, spin 400, height 8, flightTime 0.4, aoa 1.5, spinLoft 2, swingV 2, spinAxis 3, lateral 8, ftp 1.5, ftt 1.5, dynamicLoft 2, clubPath 2, launchH 2, launchV 1.5, lowPoint 2, descentV 3, curve 6, impactLateral 0.3, impactVertical 0.3, altitude 200.

- [ ] **Step 1: Write the failing tests** (build `Measurements` with every key `null`, then set a few):
  - `returns one row per measurement`: `compareShots(m, m).length === 27`.
  - `delta is A minus B`: a.spin 2410, b.spin 2980 → spin row `delta === -570`.
  - `sorts by change relative to the metric's scale`: a.spin 2410 / b.spin 2980 (score 1.425), a.carry 248 / b.carry 236 (1.5), a.clubPath 2.1 / b.clubPath −1.8 (1.95) → first three keys `['clubPath', 'carry', 'spin']`.
  - `a missing side gives n/a and sorts last`: a.impactLateral 0.31, b.impactLateral null → row `delta === null && score === null`, and it comes after every row with a score.
  - `rows without a score keep field order`: all null → keys equal `MEASUREMENT_KEYS`.
  - `zero change is a real row`: a.carry = b.carry = 200 → `delta === 0`, `score === 0`, sorted before the null rows.
  - `has a positive scale for every key`: every `MEASUREMENT_KEYS` key has `COMPARE_SCALE[k] > 0`.
- [ ] **Step 2: Run** `npx vitest run packages/analytics/src/compare.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `compare.ts` as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(analytics): compareShots ranks what changed between two shots`.

### Task 3: Overlay-ready diagrams

**Files:**
- Modify: `packages/visualizations/src/theme.ts` (`COMPARE_A = INK`, `COMPARE_B = '#C08CFF'`)
- Modify: `packages/visualizations/src/TrajectoryPlot.tsx`, `TrajectoryPlot.test.tsx`
- Modify: `packages/visualizations/src/DispersionPlot.tsx`, `DispersionPlot.test.tsx`
- Create: `packages/visualizations/src/DeliveryOverlay.tsx`, `DeliveryOverlay.test.tsx`
- Modify: `packages/visualizations/src/index.ts` (export `DeliveryOverlay`, `DeliveryOverlayProps`, `COMPARE_A`, `COMPARE_B`)

**Interfaces:**
- `TrajectoryPlotProps` and `DispersionPlotProps` gain `allOn?: boolean`: "Draw every group at full emphasis (Compare's two shots)". When true, every group uses the `'on'` level of its existing opacity tables. Default false leaves today's output byte-identical.
- `TrajectoryPlotProps` gains `endLabels?: boolean`: when true, each curve gets its carry (`Math.round(p3[0])`) as a small text in its group colour at the landing point.
- Produces:
  ```ts
  export interface DeliveryShot { id: string; label: string; color: string; clubPath: number | null; ftt: number | null }
  export interface DeliveryOverlayProps { shots: DeliveryShot[]; width?: number }
  export function DeliveryOverlay(props: DeliveryOverlayProps): JSX.Element;
  ```
  A top view: dashed vertical target line; per shot, a club-path line from the bottom centre at `clubPath` degrees (right +), and a short face segment centred on the path's middle, drawn perpendicular to the face direction `ftt` (right +). Each has a `data-shot-id`, the colour and a text label `${label} path ${formatMeasurement('clubPath', v)}`. A shot with `clubPath === null` draws no path; one with `ftt === null` draws no face. Under the SVG, one `<p>` per shot missing either: `${label} has no club path data` / `${label} has no face angle data`. `role="img"` with an aria-label listing each drawn path and face.

- [ ] **Step 1: Write the failing tests:**
  - TrajectoryPlot `allOn draws every group at full strength`: two groups, `allOn` → each group's `<g>` has `stroke-opacity="0.9"`; without `allOn` → `0.4` (existing behaviour).
  - TrajectoryPlot `endLabels shows each carry`: curve with `p3[0] = 248.4` → text `248` present.
  - DispersionPlot `allOn draws every dot at full strength`: two one-point groups → dots have the `'on'` opacity (0.95).
  - DeliveryOverlay `draws a path and face per shot`: shots A (2.1, 1.0) and B (−1.8, −0.5) → 2 `[data-kind="path"]` and 2 `[data-kind="face"]`; text `A path 2.1° R` and `B path 1.8° L`.
  - DeliveryOverlay `a positive path leans right`: A path 5 → the path's top x > the bottom x.
  - DeliveryOverlay `missing values are left out, not drawn at 0`: B clubPath null → only 1 path; text `B has no club path data`.
- [ ] **Step 2: Run** `npx vitest run packages/visualizations/src/TrajectoryPlot.test.tsx packages/visualizations/src/DispersionPlot.test.tsx packages/visualizations/src/DeliveryOverlay.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the props and `DeliveryOverlay` (styled with `SURFACE`, `GRID`, `MUTED`, `FONT` from `theme.ts`; the viewBox defaults to 360 × 300).
- [ ] **Step 4: Run** the same command plus `npx vitest run packages/visualizations`. Expected: PASS, existing snapshots and tests unchanged.
- [ ] **Step 5: Commit** `feat(viz): overlay props for trajectory and landing views, and a delivery top view`.

### Task 4: Compare URL, memory and shot helpers

**Files:**
- Create: `apps/web/src/local/toShot.ts` (moved out of `sessionToWorkingSet.ts`), `apps/web/src/local/toShot.test.ts`
- Modify: `apps/web/src/local/sessionToWorkingSet.ts` (use `toShot`)
- Create: `apps/web/src/local/compare/compareState.ts`, `compareState.test.ts`
- Modify: `apps/web/src/local/progression/format.ts` (+ `formatDelta`), and its test file (create `format.test.ts` beside it if none exists)

**Interfaces:**
- `export function toShot(s: ShotOut): Shot`: the exact per-shot mapping `sessionToWorkingSet` does today (club null → `'Unknown club'`).
- `compareState.ts`:
  ```ts
  export interface ComparePair { a: string | null; b: string | null }
  export function readPair(search: URLSearchParams): ComparePair;   // empty or whitespace value → null
  export function pairSearch(p: ComparePair): string;               // '' | '?a=x' | '?b=y' | '?a=x&b=y', ids URI-encoded
  export function rememberPair(p: ComparePair): void;               // stores, or clears when both null
  export function rememberedPair(): ComparePair | null;
  export function sessionsNewestFirst<T extends { date: string; createdAt: string }>(rows: readonly T[]): T[];
  export function shotPickLabel(s: Shot, fileOrdinal: number | undefined, fileCount: number, excluded: boolean): string;
  ```
  `shotPickLabel` gives `Shot 7 · 248.3 yd · 104.2 mph`, with `F2 ` before `Shot` when `fileCount >= 2` and ` (excluded)` at the end; a missing carry or club speed shows `MISSING_MARK`. Use `formatMeasurement` for the numbers.
- `export function formatDelta(key: MeasurementKey, delta: number): string`: `+3.9°`, `−570 rpm`, and zero (after rounding to the field's decimals) shows unsigned, e.g. `0.0 yd`.

- [ ] **Step 1: Write the failing tests:**
  - `toShot`: one `ShotOut` with `club: null` → `club === 'Unknown club'`, `fileId === importId`, `m` passed through. The existing `sessionToWorkingSet.test.ts` stays green unchanged.
  - `readPair`: `?a=x&b=y` → `{a:'x', b:'y'}`; `?a=&b=y` → `{a:null, b:'y'}`; `?a=%20` → `{a:null, b:null}`.
  - `pairSearch`: `{a:'x',b:null}` → `?a=x`; `{a:null,b:null}` → `''`; `{a:'a b',b:'c'}` → `?a=a%20b&b=c`.
  - `rememberPair` / `rememberedPair`: remember `{a:'x',b:null}` → returns it; remember both null → returns null.
  - `sessionsNewestFirst`: dates `2026-10-01`, `2026-11-07`, and `2026-11-07` with a later `createdAt` → that last one first, then the other 11-07, then 10-01.
  - `shotPickLabel`: one file → `Shot 7 · 248.3 yd · 104.2 mph`; 2 files, ordinal 2, excluded → `F2 Shot 7 · 248.3 yd · 104.2 mph (excluded)`; carry null → contains `· – ·`.
  - `formatDelta`: (`spin`, −570) → `−570 rpm`; (`clubPath`, 3.9) → `+3.9°`; (`carry`, 0.04) → `0.0 yd`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local/toShot.test.ts apps/web/src/local/compare apps/web/src/local/progression/format.test.ts apps/web/src/local/sessionToWorkingSet.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): compare URL state and shot helpers`.

### Task 5: `ShotPicker` dialog

**Files:**
- Create: `apps/web/src/local/compare/ShotPicker.tsx`, `ShotPicker.test.tsx`
- Create: `apps/web/src/local/compare/compare.css` (picker and page styles; imported by `ComparePage` in Task 6 and by `ShotPicker`)

**Interfaces:**
- Consumes: `listSessions`, `getSession`, `getShots` (`api.ts`); `toShot`, `sessionsNewestFirst`, `shotPickLabel` (Task 4).
- Produces:
  ```ts
  export interface ShotPickerProps {
    slot: 'A' | 'B';
    open: boolean;
    onOpenChange(open: boolean): void;
    /** Starting session and club; null picks the newest session and its first club. */
    initial: { sessionId: string; club: string } | null;
    onPick(shotId: string): void;
  }
  export function ShotPicker(props: ShotPickerProps): JSX.Element;
  ```
  The dialog title is `Choose shot ${slot}`. It has three labelled native selects, **Session** (`${name} · ${formatSessionDate(date)}`), **Club** (from the session's `clubs`, bag order) and **Shot** (placeholder option `Choose a shot`, then `shotPickLabel` for that club's shots in file order). Changing the session resets the club to the session's first club (or keeps it when the new session has it) and clears the shot. **Choose** is disabled until a shot is chosen; it calls `onPick(id)` and closes. An `initial.sessionId` not in the list falls back to the newest session. With no sessions it shows "No saved sessions yet" and a link to `/import`. A failed load shows "Couldn't load your sessions" with **Retry**.

- [ ] **Step 1: Write the failing tests** (mock `../api` with two sessions: "Later" 2026-11-07 with clubs Driver 2 / 7 Iron 1 and two files; "Earlier" 2026-10-01 with Driver 1):
  - `defaults to the newest session and its first club`: open with `initial: null` → Session select shows "Later", Club shows "Driver".
  - `starts from the given session and club`: `initial: {sessionId: earlierId, club: 'Driver'}` → Session "Earlier".
  - `lists shots with file badge, carry, club speed and excluded mark`: Later/Driver → options include `F1 Shot 1 · 250.0 yd · 110.0 mph` and `F2 Shot 1 · 240.0 yd · 108.0 mph (excluded)`.
  - `Choose is disabled until a shot is picked, then reports it`: choose a shot → click **Choose** → `onPick` called with that shot's id, and `onOpenChange(false)`.
  - `changing session keeps the club if it has one`: Later/7 Iron → switch to Earlier → Club "Driver" (Earlier has no 7 Iron), shot reset to `Choose a shot`.
  - `unknown initial session falls back to the newest`.
  - `no sessions shows the import link`.
  - `a failed load offers Retry`: first `listSessions` rejects → "Couldn't load your sessions"; Retry → sessions appear.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local/compare/ShotPicker.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with `@base-ui/react/dialog` (`Dialog.Root` controlled by `open`/`onOpenChange`, `Dialog.Portal`, `Dialog.Backdrop`, `Dialog.Popup`, `Dialog.Title`, `Dialog.Close` for Cancel). Ignore late responses after the session changes (keep a request counter in a ref).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): shot picker for Compare (session → club → shot)`.

### Task 6: Compare page, nav tab and route

**Files:**
- Create: `apps/web/src/local/compare/ComparePage.tsx`, `ComparePage.test.tsx`
- Create: `apps/web/src/local/compare/WhatChanged.tsx`, `WhatChanged.test.tsx`
- Create: `apps/web/src/local/compare/CompareDiagrams.tsx`
- Modify: `apps/web/src/local/compare/compare.css`
- Modify: `apps/web/src/mode.ts` (`LOCAL_NAV`: `{ to: '/compare', label: 'Compare' }` between Progression and Load Session CSV)
- Modify: `apps/web/src/layout/Nav.test.tsx` (local nav reads Sessions · Progression · Compare)
- Modify: `apps/web/src/local/LocalRoutes.tsx` (lazy `ComparePage` at `/compare`, same pattern as Progression)

**Interfaces:**
- Consumes: `getShot` (Task 1), `compareShots` (Task 2), `TrajectoryPlot`/`DispersionPlot` with `allOn`, `DeliveryOverlay`, `COMPARE_A`/`COMPARE_B`, `trajectoryCurve`, `dispersionStats`, `patternXMax` (Task 3 and existing), `readPair`/`pairSearch`/`rememberPair`/`rememberedPair`/`toShot` (Task 4), `formatDelta` (Task 4), `ShotPicker` (Task 5).
- `WhatChanged({ a: Shot, b: Shot })`: a table captioned `What changed · B → A`, columns Metric, B, A, Δ, one row per `compareShots(a.m, b.m)` row in its order. The metric label is `fieldDef(key).label`, the value cells use `formatMeasurement` (`<Missing />` when null), and Δ uses `formatDelta` or `n/a`. A note under it: `Sorted by size of change · missing values are never shown as 0`.
- `CompareDiagrams({ a: Shot, b: Shot })`: a side-view `TrajectoryPlot` (`groups` = A and B as `{ club: 'A' | 'B', color, curves }`, `allOn`, `endLabels`), a carry-mode `DispersionPlot` (`allOn`, one point each, `onSelect` no-op, `labelFor` → `Shot A`/`Shot B`), and `DeliveryOverlay`. Both distance views share `xMax = patternXMax(max of both carries)`. A shot without a trajectory curve gets the note `Shot ${slot} has no trajectory data`, and one without lateral+carry gets `Shot ${slot} has no landing position`.
- `ComparePage` (default export):
  - It reads the pair from `useSearchParams`. Each non-null id is resolved with `getShot`, with a per-slot request counter so a stale answer is dropped. A slot is `loading | found(ShotDetail) | missing | error`. `missing` reads "That shot is no longer in your library" plus **Choose shot…**; `error` reads "Couldn't load that shot" with **Retry**.
  - With neither set it shows two empty slots, each with **Choose shot…**, and the hint "Pick two shots to see what changed".
  - A found slot shows the label `A · Driver · Shot 7 · Range practice · 7 Nov 2026` (plus ` · excluded` when excluded) and **Change shot…**. **Swap** shows when both are found.
  - Diagrams and the table appear only when both are found. Two columns at ≥ 1024 px, one below.
  - Picking navigates (push) to `pairSearch` with that slot replaced. Swap pushes the swapped pair.
  - On every render with a non-empty pair it calls `rememberPair(pair)`. A slot that resolves `missing` is dropped from the remembered pair.
  - On mount at bare `/compare` with `useNavigationType() === 'PUSH'` and a `rememberedPair()`, it navigates with `replace` to it.
  - When `location.state?.pickB` is set, it opens B's picker (initial = A's session and club once A resolves) and replaces the state with `null`.
  - The B picker's `initial` is A's session and club when A is found; the A picker's `initial` is B's when B is found and A is empty, otherwise null.

- [ ] **Step 1: Write the failing tests.** In `WhatChanged.test.tsx`:
  - `lists every metric with B, A and the change`: 27 body rows; the spin row reads `2,980 rpm`, `2,410 rpm`, `−570 rpm`.
  - `missing values say n/a and sort last`: B impactLateral null → that row's Δ `n/a`, and it's below every row with a number.
  - `no good/bad colouring`: no cell has a class matching `/up|down|good|bad/`.

  In `ComparePage.test.tsx` (MemoryRouter + `Routes`, `../api` mocked; `getShot` resolves fixtures `A` Driver 248 yd from "Later", `B` 7 Iron 160 yd from "Earlier", and null for `gone`):
  - `empty page offers two pickers and the hint`.
  - `only A shows its label and B's Choose shot…`, with no table.
  - `both show labels, diagrams and the table`: two `svg[role="img"]` distance views, plus the caption `What changed · B → A`.
  - `swap exchanges a and b in the URL`.
  - `a shot that no longer exists leaves its slot empty and keeps the other`: `?a=gone&b=B` → "That shot is no longer in your library" and B's label.
  - `empty id counts as absent`: `?a=&b=B` → A slot shows **Choose shot…** with no "no longer" text.
  - `a stale answer doesn't overwrite a newer one` (Review Focus 3): `getShot('A1')` deferred, navigate to `?a=A2`, resolve A2 then A1 → label shows A2's shot.
  - `different clubs share one distance axis` (Review Focus 5): A carry 248, B carry 90 → the trajectory's largest x tick label ≥ 248 and both curves are present.
  - `a shot without trajectory data is noted, the other still drawn` (Review Focus 1): B has no `height` → text `Shot B has no trajectory data`, and one `path[data-shot-id]` in the side view.
  - `nav click restores the last comparison, Back does not` (Review Focus 4): render `?a=A&b=B`, then push bare `/compare` → URL becomes `?a=A&b=B`; separately, render the history `['/compare', '/compare?a=A']`, go Back (POP) → empty page stays.
  - `arriving from the Inspector opens B's picker`: initial entry `{ pathname: '/compare', search: '?a=A', state: { pickB: true } }` → the dialog `Choose shot B` is open with Session "Later" and Club "Driver".
  - In `Nav.test.tsx`: the local nav links are `Sessions`, `Progression`, `Compare`, then the add button.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local/compare apps/web/src/layout/Nav.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the components, nav entry and route.
- [ ] **Step 4: Run** the same command, then `npm test` (the full Vitest suite). Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Compare page with overlaid diagrams and what changed`.

### Task 7: Compare… in the Shot Inspector

**Files:**
- Modify: `apps/web/src/paths.ts` (`compare: string | null`, local `'/compare'`, public `null`)
- Modify: `apps/web/src/components/ShotHeader.tsx`
- Modify: `apps/web/src/pages/InspectorPage.test.tsx` (public: no Compare…)
- Modify: `apps/web/src/local/SessionRoute.test.tsx` (local: Compare… link)

**Interfaces:**
- `AppPaths.compare: string | null`. In the local branch it's `'/compare'` whether or not a session is open. In the public branch it's `null`, so the string `/compare` exists only inside the local branch Vite removes from the public build.
- `ShotHeader` renders, when `paths.compare` is non-null, a `<Link className="fsa-btn fsa-btn--secondary fsa-touch" to={{ pathname: paths.compare, search: `?a=${encodeURIComponent(shot.id)}` }} state={{ pickB: true }}>Compare…</Link>` in the title row after the Exclude button / Excluded tag.

- [ ] **Step 1: Write the failing tests:**
  - Local (`SessionRoute.test.tsx`, inspect page): the link `Compare…` has `href` `/compare?a=<shot id>`.
  - Public (`InspectorPage.test.tsx`): no element with the name `Compare…`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local/SessionRoute.test.tsx apps/web/src/pages/InspectorPage.test.tsx`. Expected: the local test FAILS, the public one passes.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests, then `npm run ci:public` (it includes `verify-public-build`) and `grep -c '/compare' apps/web/dist/assets/*.js` (expected: no matches). Expected: green.
- [ ] **Step 5: Commit** `feat(web): Compare… from any shot in the Shot Inspector`.

### Task 8: End-to-end and docs

**Files:**
- Create: `e2e-local/compare.spec.ts`
- Modify: `docs/design/README.md` (binding decision 9, Compare)

**Interfaces:**
- Consumes: `signIn`, `importInto`, `FIXTURES`, `withClub` from `e2e-local/helpers.ts`. The Sept 19 2022 file has 16 Driver shots, and FlightScope Golf Session.csv has 91 shots (18 Driver).

- [ ] **Step 1: Write the specs** (each test imports into its own fresh sessions):
  - `from the Compare tab: empty → pick A → pick B`: import the two fixtures into "Later" (2026-11-07) and "Earlier" (2026-10-01). Click nav **Compare** → hint "Pick two shots to see what changed". A's **Choose shot…** → Session defaults to "Later"; pick Driver and the first shot → **Choose**. The URL has `a=`. B's **Choose shot…** defaults to Later/Driver; switch to Earlier, pick a shot → URL has both. The table caption `What changed · B → A` is visible with 27 rows.
  - `reload keeps both shots, and Back returns to only A`: after the above, `page.reload()` → both labels are still shown; `page.goBack()` → no B label, and B's **Choose shot…** shows.
  - `from the Shot Inspector: A filled in, B's picker open`: open the session → Shot Inspector → **Compare…** → URL `?a=<id>`, the dialog `Choose shot B` is open with Session "Later".
  - `a deleted shot's slot says it's gone`: with a both-shots URL, delete session "Earlier" from the library, return to that URL → "That shot is no longer in your library" in B's slot and A's label still shown.
  - `the Compare tab reopens the last comparison`: from a both-shots compare, click **Sessions**, then **Compare** → the URL has both ids again.
- [ ] **Step 2: Run** `npm run e2e:local -- e2e-local/compare.spec.ts`. Expected: PASS (fix the app, not the spec, if a step fails because of a real bug).
- [ ] **Step 3: Add binding decision 9** to `docs/design/README.md`: Layout B; A white / B purple; Δ = A − B, signed, no colouring; sort by |Δ| / `COMPARE_SCALE`; the Compare tab remembers the last comparison per window in memory only, nav click restores and Back doesn't; the picker is session → club → shot, newest first, with F-badges for 2+ files.
- [ ] **Step 4: Run** `npm run ci:public` and `npm run ci:local`. Expected: both green.
- [ ] **Step 5: Commit** `test(e2e): Compare from the tab and from the Inspector; docs: binding decision 9`.
