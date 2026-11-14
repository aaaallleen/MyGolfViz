# Local App Step 3 — Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Progression** page in the local app. It shows one club across sessions as a dashboard of tiles. The user can add, remove and reorder tiles and set target ranges, and these are saved in SQLite.

**Architecture:**
- **Backend:** three small read/write surfaces on tables that already exist since `0001_initial`: shots across sessions, settings and target ranges. **No schema change and no migration.**
- **Statistics:** pure TypeScript in `@fsa/analytics` (`progression.ts`). The backend computes nothing.
- **Charts:** hand-built SVG components in `@fsa/visualizations`, like `DispersionPlot`. No chart library.
- **Page:** `apps/web/src/local/progression/`. It is lazy-loaded from `LocalRoutes`, so the public build never reaches it.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 (pytest), React 19 + React Router 8 (Vitest + Testing Library), SVG, Playwright (`e2e-local`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-local-app-design.md`. §8 is the source of truth; also read §5 (`settings`, `target_ranges`), §6 (`GET /shots`, settings, target ranges), §7.1 (save-and-roll-back), §7.2 (nav) and §14. Where this plan marks something **(plan's call)**, the spec left it open.

## Global Constraints

- **Public build unchanged.** `npm run ci:public` stays green on every commit, and `scripts/verify-public-build.mjs` is not edited. Progression code is reached only through `LocalRoutes` (already a local-only lazy import). `npm run ci:local` stays green too.
- **Never 0 for missing.** Statistics use non-null values only. A null stays null, and a session with no values for a metric draws no point (a gap in the line) and shows `Not measured` in its details (`NOT_MEASURED` from `@fsa/domain`).
- **Outliers are flagged, never removed.** Excluded shots leave the numbers only when the user picks "Stock shots only", and the screen always says which choice is active.
- **Neutral wording.** Changes are an arrow, a signed value and a unit: `↑ +4.2 yd`, `↓ −1.3°`, `→ 0.0 yd`. Use U+2212 for minus. Colours carry no judgement. Only variation tiles add `more consistent` / `less consistent`, plus the caption `Lower = more consistent`. Draw no trend lines and make no significance claims.
- **Units and formatting.** Use canonical units from `fieldDef(key)` (yd, mph, rpm, °, in, ft). Display values with `formatMeasurement` / `measurementParts` from `@fsa/domain`. Direction words (L/R, up/down…) come from there too.
- **Target-relative signs.** Lateral, launch H, curve, path etc. keep the CSV sign: right +, left −. There is no mirroring for left-handed sessions.
- **Few shots.** `FEW_SHOTS = 5`: a session with `n < 5` values for a metric is drawn hollow and labelled `few shots`.
- **Copy, verbatim:**
  - Nav item: `Progression` (between `Sessions` and the + button).
  - Page title: `Progression`.
  - Shots switch: `All shots` / `Stock shots only`.
  - Scope line: `All {n} shots`, or `All 1 shot` when n is 1. Stock: `Stock shots only · {k} excluded left out`.
  - Sessions control label `Sessions`, with options `Last 3`, `Last 6`, `Last 10`, `Last 20`, `All`, `Choose…`.
  - Band toggle, label `Band`: `P25–P75` / `P10–P90`.
  - Buttons: `Add tile`, `Reset to default`, `Set target range`, `Clear`, `Save`, `Apply`.
  - Tile buttons: `Move {title} earlier`, `Move {title} later`, `Remove {title}`. These are aria-labels on icon buttons.
  - Change line: `{arrow} {signed value}{unit} since S{k}`. With no earlier value: `First session shown`.
  - `few shots` · `Lower = more consistent` · `Impact not measured: {k} of {n}` · `{p}% in range`.
  - Toasts: `Couldn't save the dashboard`, `Couldn't save the target range`.
  - Empty states:
    - No sessions: title `No sessions yet` with a `Load Session CSV` link to `/import`.
    - No tiles: `No tiles on the dashboard` with an `Add tile` button.
    - Load failure: `Couldn't load your sessions` with `Retry`.
- **Commands:**
  - TS: `npx vitest run <path>`, `npm run typecheck`.
  - Python: `uv run --project apps/api pytest apps/api/tests -q`.
  - After any API change: `npm run api:types`. `test_openapi_fresh.py` fails until you do.
  - Node 24: prefix with `PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH`.
  - Port 5173 belongs to the owner's Vite; don't touch it. `e2e-local` uses 8799.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Club names with spaces or a slash** (`7 Iron`, `Gap Wedge`, a hypothetical `50/08 Wedge`). Club identity is the exact CSV string, so it must round-trip through `GET /shots?club=` and target ranges. That is why target ranges take the club in the body, not the path (Task 1 test `test_target_range_club_with_slash`).
2. **A session whose shots for the club are all excluded**, with "Stock shots only" on. It must still appear as a point position (S-label kept) with no value and `n 0`, not vanish and renumber the others. The test is in Task 2 (`seriesForMetric keeps empty sessions`).
3. **Impact data missing for some shots** (`-` in the CSV → null). It is left out of every impact number and counted (`Impact not measured: 3 of 12`). It is never a centred strike. A shot with only one of the two axes is also "not measured". The test is in Task 2.
4. **A saved layout that no longer parses** (an older or edited value, an unknown tile id, duplicates). Load what is valid. Fall back to the default only when the value is missing or not a list. An empty list is a valid "no tiles" layout. The test is in Task 4.
5. **Saving fails** (backend stopped). The tile change and target range roll back on screen with the toast; nothing pretends it saved. Tests are in Tasks 6 and 7.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/src/mygolfviz_api/routers/library.py` (new) | `GET /shots`, settings, target ranges |
| `apps/api/src/mygolfviz_api/schemas.py` | `LibraryShot`, `SettingIn/Out`, `TargetRangeIn/Out` |
| `apps/api/tests/test_library.py` (new) | pytest for the above |
| `apps/web/src/local/{openapi.json,api-types.ts,api.ts,api.test.ts}` | regenerated types + client functions |
| `packages/analytics/src/progression.ts` (+ test) | quantiles, per-session stats, ordering, mishit, impact, gapping, change |
| `packages/visualizations/src/{TrendChart,GappingChart,ImpactHeatmap}.tsx` (+ tests) | the three SVG charts |
| `apps/web/src/local/progression/tiles.ts` (+ test) | tile catalogue, default layout, layout parsing and moves |
| `apps/web/src/local/progression/scope.ts` (+ test) | scope type, parsing, choosing sessions |
| `apps/web/src/local/progression/ProgressionPage.tsx` (+ test) | data loading, scope bar, grid |
| `apps/web/src/local/progression/MetricTile.tsx`, `TileDetails.tsx`, `TargetRangeForm.tsx` | standard / accuracy / variation tiles |
| `apps/web/src/local/progression/SpecialTiles.tsx` | mishit, speed & smash, impact, gapping |
| `apps/web/src/local/progression/progression.css` | page styles (imported by the page) |
| `apps/web/src/mode.ts`, `apps/web/src/local/LocalRoutes.tsx` | nav item and route |
| `e2e-local/progression.spec.ts` (new), `e2e-local/helpers.ts` | end-to-end |
| `docs/design/README.md` | binding decisions for Progression |

---

### Task 1: Backend — shots across sessions, settings, target ranges

**Files:**
- Create: `apps/api/src/mygolfviz_api/routers/library.py`, `apps/api/tests/test_library.py`
- Modify: `apps/api/src/mygolfviz_api/schemas.py`, `apps/api/src/mygolfviz_api/app.py` (include the router), `apps/web/src/local/openapi.json`, `apps/web/src/local/api-types.ts` (both regenerated), `apps/web/src/local/api.ts`, `apps/web/src/local/api.test.ts`

**Interfaces:**
- Produces (HTTP, all under `/api/v1`, behind the existing token/Host checks):
  - `GET /shots?club=<str>&session_ids=<id>&session_ids=<id>…` → `LibraryShot[]`.
    - `LibraryShot = {id, sessionId, importId, sourceRow, shotLabel, club, m, excluded}`, with no `raw`.
    - Both params are optional. `club` matches exactly. Unknown session ids are ignored.
    - Order: session `date`, session `created_at`, import `ordinal`, `source_row`.
    - `excluded` uses the session's exclusions keyed by `(session_id, sha256, source_row)`, as in `list_shots`.
  - `GET /settings/{key}` → `{key, value, updatedAt}`, or 404 when unset.
  - `PUT /settings/{key}` with body `{value: <any JSON>}` → the same shape.
    - The key must match `^[a-z][a-z0-9_.-]{0,63}$`, else 422.
    - The value's JSON encoding must be at most 65536 bytes, else 422.
  - `GET /target-ranges?club=<str>` → `TargetRangeOut[]`; `club` is optional (omitted returns all).
    - `TargetRangeOut = {id, club, metric, low, high, updatedAt}`.
  - `PUT /target-ranges` with body `{club, metric, low, high}` upserts on (club, metric) and returns `TargetRangeOut` (200). It returns 422 when:
    - `club` is empty after trimming or longer than 100 characters;
    - `metric` is not one of the 27 measurement keys (`Measurements.model_fields`);
    - both `low` and `high` are null;
    - either is non-finite;
    - `low > high`.
  - `DELETE /target-ranges/{id}` → 204, or 404.
  - **(plan's call)** The spec's table writes `/target-ranges/{club}/{metric}`. A club in a path segment breaks on `/` (Starlette matches the decoded path), so the club goes in the body and deletion goes by id.
- Produces (TS, `apps/web/src/local/api.ts`):
  - Types: `LibraryShot`, `TargetRange` (= `S['TargetRangeOut']`), `TargetRangeIn`.
  - `listLibraryShots(opts: { club?: string; sessionIds?: string[] }): Promise<LibraryShot[]>`, which repeats `session_ids` and omits empty params.
  - `getSetting<T>(key: string): Promise<T | null>`, which resolves `null` on 404 and rethrows other errors.
  - `putSetting(key: string, value: unknown): Promise<void>`.
  - `listTargetRanges(club?: string): Promise<TargetRange[]>`.
  - `putTargetRange(body: TargetRangeIn): Promise<TargetRange>`.
  - `deleteTargetRange(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing pytest tests in `apps/api/tests/test_library.py`.** Seed with the `post_import`/`payload`/`entry` helpers from `test_imports.py` (import them). Create sessions with explicit dates. Tests:
  - `test_shots_across_sessions_in_session_order`:
    - Session "Later" dated `2026-11-07` holds `FlightScope Golf Session Sept 19 2022.csv` (18 Driver).
    - Session "Earlier" dated `2026-10-01` holds `FlightScope Golf Session.csv` (20 Driver among 105).
    - `GET /shots?club=Driver` returns 38 rows. The first 20 have `sessionId` = Earlier and the last 18 = Later.
    - Every row has `importId`, `m` with 27 keys, no `raw` key, and `excluded` false.
  - `test_shots_filter_by_sessions_and_unknown_ids_ignored`: `session_ids=[Later, "nope"]` returns 18 rows.
  - `test_shots_report_exclusions`: exclude 2 Driver shots in Later via `PATCH /sessions/{id}/exclusions`. Exactly those 2 rows have `excluded` true.
  - `test_shots_without_club_param_returns_all_clubs`: Earlier alone gives 105 rows.
  - `test_settings_roundtrip_and_404`:
    - GET `progression.layout` is 404 at first.
    - PUT `{"value": {"tiles": ["carry"]}}` then GET returns that value and an `updatedAt`.
    - A second PUT overwrites it.
  - `test_settings_rejects_bad_key_and_large_value`: key `Bad Key` gives 422; a value of 70000 bytes gives 422.
  - `test_target_ranges_upsert_list_delete`:
    - PUT Driver/carry 230–250, then PUT again 235–250; the list for `club=Driver` has 1 row with low 235.
    - PUT 7 Iron/carry; the unfiltered list has 2 rows.
    - DELETE by id gives 204, then 404.
  - `test_target_range_validation`: each of these gives 422:
    - metric `banana`;
    - both bounds null;
    - `low > high`;
    - club `"  "`.
    - One-sided `{low: 230, high: null}` succeeds.
  - `test_target_range_club_with_slash`: club `50/08 Wedge` round-trips through PUT and `GET ?club=50/08 Wedge`.
  - `test_library_routes_need_token`: `anon` client gets 401 on `/api/v1/shots`, `/api/v1/settings/x`, `/api/v1/target-ranges`.
- [ ] **Step 2: Run them and see them fail.** `uv run --project apps/api pytest apps/api/tests/test_library.py -q` should fail with 404s.
- [ ] **Step 3: Implement `routers/library.py` and the schemas.** Follow `routers/shots.py`: `session_scope(request.app.state.engine)`, `utc_now()`, ids via `uuid4`. Measurement keys come from `schemas.Measurements.model_fields`. Include the router in `app.py`.
- [ ] **Step 4: Run the API suite.** `npm run api:test` should be all green, including `test_migration_safety` (no model change).
- [ ] **Step 5: Regenerate the types and add the client functions.**
  - Run `npm run api:types`, then add the `api.ts` functions above.
  - Extend `api.test.ts` (it stubs `fetch`):
    - `listLibraryShots({club:'7 Iron', sessionIds:['a','b']})` requests `/api/v1/shots?club=7+Iron&session_ids=a&session_ids=b`, or the `%20` form; assert with `URLSearchParams`.
    - `getSetting` resolves `null` on 404 and throws `ApiError` on 500.
- [ ] **Step 6: Verify.** `npx vitest run apps/web/src/local/api.test.ts`, `npm run typecheck` and `npm run api:test` all pass.
- [ ] **Step 7: Commit** with `feat(api): shots across sessions, settings and target ranges for Progression`.

---

### Task 2: Progression statistics in `@fsa/analytics`

**Files:**
- Create: `packages/analytics/src/progression.ts`, `packages/analytics/src/progression.test.ts`
- Modify: `packages/analytics/src/index.ts` (`export * from './progression'`)

**Interfaces:**
- Consumes: `Measurements`, `MeasurementKey` from `@fsa/domain`.
- Produces:
  ```ts
  export const FEW_SHOTS = 5;
  export interface Range { low: number | null; high: number | null }
  export interface MetricStats {
    n: number; missing: number; total: number;
    median: number | null; mean: number | null; sd: number | null;      // sd: population (÷n), null when n < 2 — same as summarize()
    p10: number | null; p25: number | null; p75: number | null; p90: number | null; iqr: number | null;
    outliers: number;                                                  // outside [P25 − 1.5·IQR, P75 + 1.5·IQR]; 0 when n < 4
    inRange: { count: number; pct: number } | null;                    // null when no range or n = 0; bounds inclusive; pct 0–100
    few: boolean;                                                      // n < FEW_SHOTS
  }
  export function quantile(sorted: readonly number[], p: number): number | null; // linear interpolation between closest ranks (type 7 / numpy default / Excel PERCENTILE.INC)
  export function metricStats(values: readonly (number | null)[], range?: Range | null): MetricStats;

  export interface ProgressionSession { id: string; date: string; createdAt: string }
  export function orderSessions<T extends ProgressionSession>(sessions: readonly T[]): T[]; // date asc, then createdAt asc, then id
  export interface ProgressionShot { id: string; sessionId: string; club: string | null; m: Measurements; excluded: boolean }
  export type ShotsChoice = 'all' | 'stock';
  /** One entry per session, in the given order, even when it has no shots for the metric. `abs` uses |value| (accuracy tiles). */
  export function seriesForMetric(sessionIds: readonly string[], shots: readonly ProgressionShot[], key: MeasurementKey,
    opts: { shots: ShotsChoice; abs?: boolean; range?: Range | null }): MetricStats[];
  export function mishitFrequency(sessionIds: readonly string[], shots: readonly ProgressionShot[]): ({ excluded: number; total: number; rate: number } | null)[]; // ignores ShotsChoice; null when total = 0
  export function change(values: readonly (number | null)[]): { delta: number; since: number } | null; // last non-null vs the previous non-null; since = 0-based index of that previous session
  export interface ImpactSessionStats { measured: number; total: number; meanDistance: number | null; sdDistance: number | null; sdLateral: number | null; sdVertical: number | null }
  export function impactStats(sessionIds: readonly string[], shots: readonly ProgressionShot[], choice: ShotsChoice): ImpactSessionStats[];
  export const HEATMAP = { lateral: [-1.5, 1.5], vertical: [-1, 1], cell: 0.5 } as const; // inches; 6 columns × 4 rows
  export function impactHeatmap(shots: readonly ProgressionShot[], choice: ShotsChoice): { counts: number[][]; measured: number; total: number }; // counts[row][col], row 0 = highest, col 0 = most heel (−lateral); out-of-range values clamp into the edge cell
  export interface GapRow { club: string; median: number; p25: number; p75: number; n: number; few: boolean; gapToNext: number | null; overlapsNext: boolean }
  export function clubGapping(shots: readonly ProgressionShot[], choice: ShotsChoice): GapRow[]; // carry; clubs with no carry values left out; sorted by median desc; "next" = the next shorter club; overlapsNext when this p25 < next p75
  ```
- "Stock" means `!shot.excluded`. "Impact measured" means both `impactLateral` and `impactVertical` are non-null. Distance from centre is `√(lat² + vert²)`.

- [ ] **Step 1: Write the failing tests in `progression.test.ts`:**
  - `quantile`:
    - `[1..10]` gives P10 `1.9`, P25 `3.25`, P50 `5.5`, P75 `7.75` and P90 `9.1`.
    - `[]` gives `null`; `[4]` gives `4` for any p.
  - `metricStats`:
    - `[2,4,4,4,5,5,7,9]` gives mean 5 and sd 2.
    - `[1..10, 100]` gives median 6, iqr 5 and outliers 1.
    - `[null,1,null,3]` gives n 2, missing 2, total 4, median 2, and few true.
    - With range `{3,7}` over `[1..10]`, inRange is `{count:5,pct:50}`. One-sided `{low:8,high:null}` gives `{count:3,pct:30}`. With no range, inRange is `null`.
  - `orderSessions`: dates `2026-11-07` (createdAt T10), `2026-10-01`, `2026-11-07` (createdAt T09) sort in the order 2nd, 3rd, 1st.
  - `seriesForMetric`:
    - It keeps empty sessions: 3 session ids where the middle one's only shots are excluded. With `stock`, the result has length 3 and the middle has `n 0, median null`. With `all`, the middle has `n > 0`.
    - `abs: true` on lateral `[-3, 1, 2]` gives median 2.
    - Only shots of the given session ids count.
  - `mishitFrequency`: 2 excluded of 8 gives `{excluded:2,total:8,rate:0.25}`. A session with no shots gives `null`.
  - `change`: `[230, null, 240]` gives `{delta:10, since:0}`; `[230]` gives `null`.
  - `impactStats`:
    - Of 4 shots, one has `impactLateral` null, one has both null, and two are measured at (0.3,0.4) and (0,0).
    - Expect measured 2, total 4 and meanDistance 0.25.
    - A centred (0,0) shot counts as a real strike; the null ones are never centred.
  - `impactHeatmap`:
    - (0.6, 0.2) lands in row 1, col 4. (−2, −3) clamps to row 3, col 0.
    - Unmeasured shots are not counted in `counts` but are in `total`.
  - `clubGapping`:
    - Driver `[240,250,260]` with 3 Wood `[220,230,245]`: Driver first, gapToNext `20`, overlapsNext `false` (Driver p25 245 vs 3 Wood p75 237.5).
    - Driver `[235,250,260]` with 3 Wood `[220,240,250]`: overlapsNext `true` (242.5 < 245), gapToNext `10`.
    - The last row (7 Iron `[150,151,152]`) has gapToNext `null`.
    - A club with only null carry is absent.
- [ ] **Step 2: Run and see them fail.** `npx vitest run packages/analytics/src/progression.test.ts` fails because there is no module.
- [ ] **Step 3: Implement `progression.ts`.** Reuse the population-SD convention of `summarize`. Don't import the DOM or React.
- [ ] **Step 4: Run.** The test file passes, and so does `npx vitest run packages/analytics`.
- [ ] **Step 5: Commit** with `feat(analytics): progression statistics`.

---

### Task 3: Charts — `TrendChart`, `GappingChart`, `ImpactHeatmap`

**Files:**
- Create: `packages/visualizations/src/TrendChart.tsx`, `GappingChart.tsx`, `ImpactHeatmap.tsx`, and a test for each (`*.test.tsx`)
- Modify: `packages/visualizations/src/index.ts` (export the three components and their props types)

**Interfaces:**
- Consumes: `niceTicks`, `linear` (`scale.ts`); colours and fonts from `theme.ts`; `HEATMAP` from `@fsa/analytics`.
- Produces:
  ```ts
  export interface TrendSeries {
    name: string; color: string;
    values: readonly (number | null)[];             // one per session; null = gap (line breaks, no point)
    bands?: readonly ([number, number] | null)[];   // shaded low–high per session
    few?: readonly boolean[];                       // true → hollow point
  }
  export interface TrendChartProps {
    title: string;                                  // accessible name of the <svg role="img">
    sessions: readonly { label: string; tooltip: string }[]; // label "S1"…; tooltip "S3 · Range practice · 7 Nov 2026 · n 34"
    series: readonly TrendSeries[];
    target?: Range | null;                          // shaded band across the plot; open side runs to the plot edge
    formatTick: (v: number) => string;
    height?: number;                                // default 160; width is 100% via viewBox 0 0 360 height
    zeroLine?: boolean;                             // draw y = 0 when in range (signed metrics)
  }
  export interface GappingChartProps { rows: readonly GapRow[]; formatValue: (v: number) => string }
  export interface ImpactHeatmapProps { counts: readonly (readonly number[])[]; title: string }
  ```
- `TrendChart` behaviour:
  - The x axis is categorical: S-labels evenly spaced.
  - The y domain covers the values, bands and finite target bounds, padded 5%, with `niceTicks(…, 4)`.
  - Each non-null point is a `<circle>` with a `<title>` holding the session tooltip and the formatted value, which is the hover detail of §8.1.
  - A few-shot point has `fill="none"` and a stroke of the series colour.
  - Bands are a `<path>` at the series colour, opacity 0.18. The target is a `<rect>` with `data-testid="target-band"`.
- `GappingChart`: one row per club, top to bottom as given.
  - Each row has a P25–P75 bar and a median tick, then the label `{club} · {median}`.
  - Between rows it shows the gap text (e.g. `20.0 yd gap`), or `overlaps` when `overlapsNext`.
  - A few-shot row's bar is outlined, not filled.
- `ImpactHeatmap`: a grid drawn from `counts`. Cell opacity is `count / max`; empty cells get only an outline. Each cell carries its count as text when it is above 0.
  - Edge labels: `Heel` left, `Toe` right, `High` top, `Low` bottom.
  - It is not mirrored for handedness, because the data is already toe/heel.

- [ ] **Step 1: Write the failing tests:**
  - `TrendChart`:
    - 3 sessions with values `[1, null, 3]` render 2 circles, and there is no `M…L` segment across the gap: assert two separate path subpaths, or one `M` per run.
    - `few:[true,false,false]` gives the first circle `fill="none"`.
    - `getByTitle(/S3 · Range practice/)` exists.
    - `target={low:2,high:null}` renders `getByTestId('target-band')`.
    - `getByRole('img', {name: 'Carry'})`.
  - `GappingChart`: 2 rows render both club labels. `overlapsNext` true shows `overlaps`; otherwise it shows the formatted gap.
  - `ImpactHeatmap`: `counts` with a single 3 renders text `3`, and the four edge labels exist.
- [ ] **Step 2: Run and see them fail.** `npx vitest run packages/visualizations/src/TrendChart.test.tsx packages/visualizations/src/GappingChart.test.tsx packages/visualizations/src/ImpactHeatmap.test.tsx`
- [ ] **Step 3: Implement.** Match the visual language of `DispersionPlot`: `GRID` lines, `MUTED` tick text, `FONT`, and tabular numbers.
- [ ] **Step 4: Run.** The tests pass, and so does `npm run typecheck`.
- [ ] **Step 5: Commit** with `feat(viz): trend, gapping and impact heatmap charts`.

---

### Task 4: Tile catalogue, layout and scope (pure)

**Files:**
- Create: `apps/web/src/local/progression/tiles.ts`, `tiles.test.ts`, `scope.ts`, `scope.test.ts`

**Interfaces:**
- Produces (`tiles.ts`):
  ```ts
  export type Category = 'distance' | 'accuracy' | 'consistency' | 'delivery' | 'flight' | 'strike';
  export const CATEGORIES: readonly { id: Category; title: string; question: string }[];
    // titles/questions verbatim from spec §8.3 table: 'Distance' / 'Are distances improving and becoming more predictable?', …
  export type TileKind = 'metric' | 'accuracy' | 'variation' | 'mishit' | 'speedSmash' | 'impact' | 'gapping';
  export interface TileDef { id: TileId; title: string; category: Category; kind: TileKind; metric?: MeasurementKey }
  export const TILES: readonly TileDef[];
  export type TileId = (typeof TILES)[number]['id'];  // or an explicit union
  export const DEFAULT_LAYOUT: readonly TileId[] = ['carry', 'carry-sd', 'lateral', 'ftp', 'spin', 'speed-smash', 'impact', 'mishit'];
  export function parseLayout(value: unknown): TileId[];      // {tiles: unknown[]} → known ids, first occurrence kept; missing/not-a-list → DEFAULT_LAYOUT copy; [] stays []
  export function moveTile(layout: readonly TileId[], id: TileId, delta: -1 | 1): TileId[]; // no-op at the ends
  export const LAYOUT_KEY = 'progression.layout';             // stored value: { tiles: TileId[] }
  ```
  The 25 tiles, as `id → title (kind, metric)`, in this order:
  - **distance:**
    - `carry` → `Carry` (metric, carry)
    - `total` → `Total` (metric, total)
    - `roll` → `Roll` (metric, roll)
    - `gapping` → `Club gapping` (gapping)
  - **accuracy:**
    - `lateral` → `Lateral (landing)` (accuracy, lateral)
    - `launchH` → `Launch direction (H)` (accuracy, launchH)
    - `curve` → `Curve distance` (accuracy, curve)
  - **consistency:**
    - `carry-sd` → `Carry variation (SD)` (variation, carry)
    - `lateral-sd` → `Direction variation (lateral SD)` (variation, lateral)
    - `mishit` → `Mishit frequency` (mishit)
  - **delivery** (all metric tiles):
    - `clubPath` → `Club path`
    - `ftp` → `Face to path`
    - `ftt` → `Face to target`
    - `aoa` → `Attack angle`
    - `lowPoint` → `Low point`
  - **flight** (all metric tiles):
    - `spin` → `Spin`
    - `spinAxis` → `Spin axis`
    - `launchV` → `Launch angle (V)`
    - `height` → `Apex (height)`
    - `descentV` → `Descent angle`
  - **strike:**
    - `speed-smash` → `Speed & smash` (speedSmash)
    - `smash` → `Smash` (metric, smash)
    - `ballSpeed` → `Ball speed` (metric, ballSpeed)
    - `spinLoft` → `Spin loft` (metric, spinLoft)
    - `impact` → `Impact location` (impact)
- Produces (`scope.ts`):
  ```ts
  export type SessionsChoice = 3 | 6 | 10 | 20 | 'all';
  export interface Scope { club: string | null; last: SessionsChoice; picked: string[] | null; shots: ShotsChoice; band: 'iqr' | 'p10p90' }
  export const DEFAULT_SCOPE: Scope = { club: null, last: 6, picked: null, shots: 'all', band: 'iqr' };
  export const SCOPE_KEY = 'progression.scope';
  export function parseScope(value: unknown): Scope;           // field by field; invalid field → its default
  export function clubsInLibrary(rows: readonly SessionRow[]): { club: string; shots: number }[]; // most shots first, ties by compareClubs
  export function resolveClub(scope: Scope, rows: readonly SessionRow[]): string | null; // saved club if any session has it, else the club with most shots, else null
  /** Sessions shown for the club tiles: picked ∩ sessions with the club (when picked is non-empty after that), else the last N with the club; ordered by orderSessions. */
  export function sessionsForClub(rows: readonly SessionRow[], club: string, scope: Scope): SessionRow[];
  /** Sessions for Club gapping: picked when set, else the last N sessions of any club. */
  export function sessionsForGapping(rows: readonly SessionRow[], scope: Scope): SessionRow[];
  export function scopeLine(shots: readonly { excluded: boolean }[], choice: ShotsChoice): string; // copy from Global Constraints
  ```
- **(plan's call)** Changing the club clears `picked`, so a hand-picked set always belongs to one club. The tiles form one flat ordered grid. Each tile shows its category name as a small eyebrow. The `Add tile` menu groups the tiles not yet on the dashboard by category, with the category's question under each heading.

- [ ] **Step 1: Write the failing tests:**
  - `TILES` has 25 entries with unique ids, and every `metric` is in `MEASUREMENT_KEYS`.
  - `DEFAULT_LAYOUT` ids all exist.
  - `parseLayout`:
    - `undefined` and `{tiles:'x'}` give the default.
    - `{tiles:[]}` gives `[]`.
    - `{tiles:['spin','nope','spin','carry']}` gives `['spin','carry']`.
  - `moveTile`: earlier/later and both no-op ends.
  - `parseScope({club:7, last:4, shots:'stock'})` gives `club null, last 6, shots 'stock'`.
  - `sessionsForClub`:
    - 8 sessions, Driver in 7 of them, `last 6` gives the 6 most recent Driver sessions, oldest first.
    - `picked` naming one session without Driver plus two with Driver gives those two.
  - `sessionsForGapping` ignores the club.
  - `scopeLine`:
    - `([{excluded:false}], 'all')` gives `All 1 shot`.
    - 214 shots with 23 excluded, `stock`, gives `Stock shots only · 23 excluded left out`.
- [ ] **Step 2: Run and see them fail.** `npx vitest run apps/web/src/local/progression`
- [ ] **Step 3: Implement.** Use `orderSessions` from `@fsa/analytics` and `compareClubs` from `@fsa/domain`.
- [ ] **Step 4: Run.** The tests pass and typecheck is clean.
- [ ] **Step 5: Commit** with `feat(web): progression tile catalogue, layout and scope`.

---

### Task 5: Progression page, nav and standard tiles

**Files:**
- Create: `apps/web/src/local/progression/ProgressionPage.tsx`, `ProgressionPage.test.tsx`, `MetricTile.tsx`, `TileDetails.tsx`, `progression.css`
- Modify: `apps/web/src/mode.ts` (`LOCAL_NAV`: insert `{ to: '/progression', label: 'Progression' }` after Sessions), `apps/web/src/local/LocalRoutes.tsx` (route `/progression` → `lazy(() => import('./progression/ProgressionPage'))` in a `Suspense`), `apps/web/src/layout/Nav.test.tsx` (expects the new item)

**Interfaces:**
- Consumes: Task 1 `api` functions; Task 2 statistics; Task 3 `TrendChart`; Task 4 `TILES`, `parseLayout`, `parseScope`, `resolveClub`, `sessionsForClub`, `scopeLine`.
- Produces:
  - `export default function ProgressionPage()`.
  - `MetricTile` props: `{ def: TileDef; sessions: SessionRow[]; shots: LibraryShot[]; scope: Scope; range: TargetRange | null; controls: ReactNode }`.
  - `controls` is the move/remove buttons slot that Task 6 fills. In this task it is empty.
- `LibraryShot.m` is typed as a plain object by the generated types. Convert once with `toProgressionShot(s: LibraryShot): ProgressionShot` in `ProgressionPage.tsx`, casting `m` to `Measurements`.
- Page load:
  1. Fetch these in parallel: `listSessions()`, `getSetting(LAYOUT_KEY)`, `getSetting(SCOPE_KEY)` and `listTargetRanges()`.
  2. Resolve the club, then call `listLibraryShots({club, sessionIds})` for the shown sessions. Refetch when the club or sessions change.
  3. Ignore stale responses (the `live` flag pattern of `LibraryPage`).
- Scope bar, saved to `SCOPE_KEY` on change:
  - `Club` select, using `SelectField` over `clubsInLibrary` (e.g. `Driver · 38 shots`).
  - `Sessions` select. `Choose…` opens a checklist of sessions with that club, newest first, showing date, name and n. `Apply` requires at least one session.
  - `SegmentedControl` for `All shots` / `Stock shots only` and for `Band`. The band toggle sits on the dashboard and applies to every tile (plan's call; the spec only says "a toggle").
  - The scope line next to the controls.
- Tiles, in layout order. The grid uses `repeat(auto-fill, minmax(340px, 1fr))`.
  - **metric**:
    - eyebrow (category title), then the title;
    - headline: the latest session's median (`formatMeasurement`), with the change line from `change()` and the `formatChange` helper in this file;
    - a `TrendChart` of medians with the band choice (P25–P75 or P10–P90) and `zeroLine` for `signedLR` metrics;
    - a `TileDetails` expander (`<details><summary>Details</summary>`).
  - **accuracy**:
    - the same tile on |value| (`abs: true`);
    - the signed median is a second series named `Bias (signed median)`, and the details carry a signed-median column.
  - **variation**:
    - plots `sd` per session, with no band;
    - the headline is the latest SD;
    - the change line has the `more consistent` / `less consistent` suffix, and the caption reads `Lower = more consistent`.
  - The other kinds render a placeholder card with the title until Task 7.
- `TileDetails`:
  - A table with one row per session: `S`, session name, date, n, missing, total, median, mean, SD, P25–P75, P10–P90, potential outliers, and `% in range` when a range is set.
  - A few-shot row has `few shots` in its n cell.
- `formatChange(key, delta)`:
  - `measurementParts`' unit, without the direction word, and the field's decimals.
  - Arrow `↑` for > 0, `↓` for < 0 and `→` when it rounds to 0. Signed number with `+` or U+2212.
- Hover tooltips come from `TrendChart` `<title>`: `S{i} · {name} · {formatSessionDate(date)} · n {n}`, plus `· few shots` when few.

- [ ] **Step 1: Write the failing tests** in `ProgressionPage.test.tsx`. Mock `../api` as `ImportsPanel.test.tsx` does, with three sessions (Driver in 2) and their shots.
  - It renders `Progression` and the 8 default tile titles. The `Carry` tile shows the latest median and a change line `↑ +… yd since S1`.
  - Switching to `Stock shots only` updates the scope line and calls `putSetting('progression.scope', …)` with `shots:'stock'`.
  - Changing the club calls `listLibraryShots` with the new club.
  - A session whose Driver shots are all excluded still shows as `S1` under `Stock shots only`, with the details row `n 0` (Review Focus 2).
  - No sessions renders `No sessions yet`. A rejected `listSessions` renders `Couldn't load your sessions` and `Retry` refetches.
  - `formatChange('carry', 4.24)` gives `↑ +4.2 yd`; `formatChange('clubPath', -1.26)` gives `↓ −1.3°`; `formatChange('carry', 0.04)` gives `→ 0.0 yd`.
  - In `Nav.test.tsx`, local nav order is `Sessions`, `Progression`, then the + button.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Styles go in `progression.css`, imported by the page, using the tokens in `packages/ui/src/tokens.css`. Below 820 px the grid becomes one column.
- [ ] **Step 4: Verify.** The page test and `npx vitest run apps/web` pass, and so does `npm run typecheck`. `npm run build:public && npm run verify:public` passes, and `grep -r "Progression" apps/web/dist` finds nothing.
- [ ] **Step 5: Commit** with `feat(web): Progression page with metric, accuracy and variation tiles`.

---

### Task 6: Editing the dashboard and target ranges

**Files:**
- Create: `apps/web/src/local/progression/TargetRangeForm.tsx`, `AddTileMenu.tsx`, `ProgressionEditing.test.tsx`
- Modify: `ProgressionPage.tsx`, `MetricTile.tsx`, `progression.css`

**Interfaces:**
- Consumes: `moveTile`, `parseLayout`, `LAYOUT_KEY`, `DEFAULT_LAYOUT`; `putSetting`, `putTargetRange`, `deleteTargetRange`.
- Layout editing:
  - Each tile's `controls` holds `Move {title} earlier`, `Move {title} later` and `Remove {title}`.
  - Above the grid: `Add tile` (a menu grouped by category, listing only the tiles not on the dashboard) and `Reset to default`.
  - Every change updates the screen at once and PUTs `{tiles}`. The page keeps the last layout the server confirmed. On failure it restores that layout and shows the toast `Couldn't save the dashboard`. Only the newest change is in flight; a newer change supersedes an older pending one.
  - An empty layout shows the `No tiles on the dashboard` empty state with `Add tile`.
- Target ranges, on metric and accuracy tiles only:
  - `Set target range` opens `TargetRangeForm`: Low and High number inputs in the metric's canonical unit, plus `Save`, `Clear` (when a range exists) and Cancel.
  - Validation: at least one bound, `low ≤ high`, and on accuracy tiles both ≥ 0 (they apply to |value|). Errors show inline and nothing is sent.
  - `Save` → `putTargetRange({club, metric, low, high})`; `Clear` → `deleteTargetRange(id)`. Both are optimistic, with rollback and the toast `Couldn't save the target range`.
  - With a range set:
    - the chart shows `target`;
    - the headline adds `{p}% in range` for the latest session;
    - the details show `% in range` per session.

- [ ] **Step 1: Write the failing tests** in `ProgressionEditing.test.tsx`:
  - Remove `Spin`: it disappears and `putSetting` is called with `tiles` without `spin`.
  - When `putSetting` rejects, `Spin` comes back and `toast.error('Couldn't save the dashboard')` is called (Review Focus 5).
  - `Move Carry later` swaps the first two tiles.
  - `Add tile` lists `Total` under `Distance` and adding it appends it.
  - `Reset to default` restores the 8 tiles.
  - A target range:
    - Saving 230–250 on Carry calls `putTargetRange`, then the target band and a `% in range` headline appear.
    - `low 260, high 250` shows an inline error and makes no call.
    - Lateral (accuracy) with `low −5` shows an inline error.
    - A rejected `putTargetRange` removes the band and toasts.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** The tests pass and `npm run typecheck` is clean.
- [ ] **Step 5: Commit** with `feat(web): add, remove, reorder Progression tiles and set target ranges`.

---

### Task 7: Special tiles — mishit, speed & smash, impact, gapping

**Files:**
- Create: `apps/web/src/local/progression/SpecialTiles.tsx`, `SpecialTiles.test.tsx`
- Modify: `ProgressionPage.tsx` (replace the Task 5 placeholders; Club gapping fetches its own shots), `progression.css`

**Interfaces:**
- Consumes: `mishitFrequency`, `seriesForMetric`, `impactStats`, `impactHeatmap`, `clubGapping` (Task 2); `TrendChart`, `GappingChart`, `ImpactHeatmap` (Task 3); `sessionsForGapping` (Task 4).
- **Mishit frequency:**
  - A `TrendChart` of `rate × 100` (%). The headline is the latest `excluded of total` (e.g. `2 of 18 · 11%`).
  - The caption is `A mishit is a shot you excluded.` It ignores the Shots switch; the tile says `All shots` under the title.
- **Speed & smash:**
  - One `TrendChart` with two series: `Club speed` (`CLUB` colour) and `Ball speed` (`BALL` colour), as medians with no bands.
  - Below it, a second, shorter `TrendChart` (height 90) for the `Smash` median.
  - The headline is `{club} → {ball} mph · smash {x.xx}` for the latest session.
- **Impact location:**
  - An `ImpactHeatmap` with a `Sessions` select: `All shown sessions` or one `S{i} · {name}`.
  - A `TrendChart` of `meanDistance` per session, titled `Distance from face centre`.
  - Details have per session: measured k of n, mean distance, SD of distance, SD lateral and SD vertical.
  - The line `Impact not measured: {k} of {n}` (for the heatmap's selection) is always shown when k > 0.
- **Club gapping:**
  - Ignores the club picker. It loads `listLibraryShots({sessionIds: sessionsForGapping(...)})` (all clubs).
  - It uses `clubGapping` with the Shots switch, shown as `GappingChart`.
  - The subtitle is `Median carry · last {N} sessions of any club` or `Median carry · {k} chosen sessions`.

- [ ] **Step 1: Write the failing tests** in `SpecialTiles.test.tsx`:
  - Mishit with 2 of 8 excluded in the latest session shows `2 of 8 · 25%`. Switching to stock does not change it.
  - Speed & smash shows both series names and `smash 1.48` for medians club 100 and ball 148.
  - Impact with 12 shots, 3 of them without impact (one with only lateral), shows `Impact not measured: 3 of 12`, and the heatmap total counts are 9 (Review Focus 3).
  - Gapping calls `listLibraryShots` without `club`, and shows `Driver` above `7 Iron` and the gap text.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** At ≥ 1100 px the impact and gapping tiles may span two grid columns (plan's call).
- [ ] **Step 4: Verify.** The tests pass, `npx vitest run` is green across the repo, and `npm run typecheck` is clean.
- [ ] **Step 5: Commit** with `feat(web): mishit, speed & smash, impact and gapping tiles`.

---

### Task 8: End-to-end, docs and the full check

**Files:**
- Create: `e2e-local/progression.spec.ts`
- Modify: `e2e-local/helpers.ts`, `docs/design/README.md`

**Interfaces:**
- Produces: `withClub(from: CsvFile, club: string, name: string): CsvFile` in `helpers.ts`. It rewrites every data row's `Club` cell to `club`, which makes the file's bytes, and so its hash, unique.
  - The e2e database is shared by every spec in the run, so this spec uses its own club names (`E2E Driver`, `E2E 7 Iron`) and never assumes an empty library.

- [ ] **Step 1: Write `e2e-local/progression.spec.ts`:**
  1. Import `withClub(FIXTURES[0], 'E2E Driver', 'P1.csv')` into a new session `Progression A` dated `2026-10-01`. Import `withClub(FIXTURES[2], 'E2E Driver', 'P2.csv')` into `Progression B` dated `2026-11-01`. Use the existing helpers for the import flow. Then exclude 2 shots in B on its Shot Inspector.
  2. Open `Progression` from the nav. Choose the club `E2E Driver`, then click `Reset to default`.
     - The 8 default tile titles are visible.
     - The scope line reads `All 123 shots` (18 + 105). Compute it from the fixtures in the test rather than hard-coding it.
  3. Switch to `Stock shots only`. The scope line reads `Stock shots only · 2 excluded left out`, and the Mishit tile still shows `2 of 105`.
  4. Remove `Spin`, add `Roll`, and set the Carry target range to 100–300. Reload: `Spin` is absent, `Roll` is present, `% in range` is shown, and `Stock shots only` is still selected.
  5. Club gapping lists `E2E Driver`.
  6. No CSP violations (`trackCspViolations`).
- [ ] **Step 2: Run.** `npm run e2e:local` passes, including the existing specs.
- [ ] **Step 3: Docs.** Add a `Progression` item to `docs/design/README.md` "Binding decisions". It records:
  - a flat tile grid with category eyebrows;
  - the band toggle;
  - the 5-shot "few shots" threshold;
  - the target range on |value| for accuracy tiles;
  - club-in-body target ranges;
  - that changing the club clears a hand-picked set.
- [ ] **Step 4: Full check.**
  - `npm run ci:public` and `npm run ci:local` are green.
  - `npm run e2e:desktop` is green, since the nav changed.
  - Then open the app with `npm run local` on a scratch data dir (`MYGOLFVIZ_DATA_DIR=$(mktemp -d)`, never the owner's folder) and check the page at 1280 px and at 820 px.
- [ ] **Step 5: Commit** with `test(e2e): Progression across two sessions; document Progression decisions`.
