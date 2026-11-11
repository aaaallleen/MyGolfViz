# FlightScope Analytics — Cloud Viewer (C0–C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public, browser-only Cloud Viewer: load one or more Mevo Gen 2 CSV exports, analyze them as one temporary in-memory working set with user-entered session details, and explore dispersion, 2D delivery, spin, face impact and an illustrative 3D replay on desktop, iPad and iPhone. It deploys to GitHub Pages.

**Architecture:** This is an npm-workspaces monorepo with one React + TypeScript app (`apps/web`, Vite, `VITE_APP_MODE=public`) and shared source-only TS packages: `domain` (field semantics), `csv-parser`, `analytics`, `visualizations` (custom React SVG) and `ui` (primitives + tokens). All data lives in a React store in tab memory. No network, storage or backend code exists in this plan. The Local App (FastAPI/SQLite, milestones L1/L2) gets a later plan that reuses these packages unchanged.

**Tech Stack:** Node 24, npm workspaces, TypeScript (strict), React, React Router (HashRouter), Vite, PapaParse, Vitest + Testing Library (jsdom), Playwright (Chromium), `@fontsource/inter` + `@fontsource/space-grotesk`, and GitHub Actions → GitHub Pages. Install the current stable version of each; the lockfile pins them.

**Spec:** `docs/spec/engineering-spec-v0.4.md` (text of `FlightScope Analytics Engineering Spec v0.4.docx`). Design: `docs/design/README.md` + `docs/design/frames/*.html` (unpacked from `FlightScope Analytics UI Claude Code.html`). Test data: `fixtures/flightscope/` (copied from `Demo_csv/` in Task 1).

## Global Constraints

- One repo; one React app in `apps/web`; shared code only in `packages/{domain,csv-parser,analytics,visualizations,ui}`; golden fixtures in `fixtures/flightscope/`. Package names: `@fsa/domain`, `@fsa/csv-parser`, `@fsa/analytics`, `@fsa/visualizations`, `@fsa/ui`, `@fsa/web`.
- Shared packages never import `apps/web`, a network client (`fetch`, `XMLHttpRequest`), or browser storage (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `navigator.serviceWorker`).
- The visible entry action is exactly **"Load Session CSV"**. The file input accepts multiple files (`multiple`, `accept=".csv,text/csv"`).
- Cloud navigation is exactly, in order: "Load Session CSV", "Overview", "Shot Inspector", "Help / Get Local Version". No "Save session", saved-session library, calendar or history routes or buttons (in-memory session details are allowed; see below).
- CSV file names are untrusted labels. Never derive a session name, date, time, grouping or identity from them. File identity in the working set = SHA-256 of the raw bytes.
- Session details (name, date, notes, handedness) follow the design: the user types them in, and they're shown as in frames 04/05. In cloud mode they live only in tab memory and are cleared with the analysis. They are never prefilled from file names or CSV contents. Defaults: name `''` (displayed as "Untitled session"), date `null` (displayed as "No date set"), notes `''`, handedness `'right'` ("Right-handed").
- Public mode: no backend calls, no request that carries CSV bytes or shot values, and no user data in localStorage, sessionStorage, IndexedDB, cookies or service-worker caches. "Clear analysis" drops all references. A refresh starts empty.
- Copy rule: never claim the browser or OS instantly erases RAM.
- `-`, blank and `N/A` → `null`, never `0`. Every statistic shows its non-null count, e.g. "n 32 of 34".
- Directions: right positive, left negative (`"8.1 R"` → `8.1`, `"6 L"` → `-6`). The CSV may separate number and letter with U+00A0 (non-breaking space). `Lateral (yds)` does this.
- `Avg` / `Dev` rows are excluded from shots and kept as summary rows.
- `Time (s)` is ball flight duration. It is never a timestamp. Shot order is file ordinal, then CSV row. No cross-file chronology.
- Statistics use population SD (÷ n), which matches the export's own `Dev` rows. SD is `null` when n < 2. The ellipse is `null` when n < 3.
- Average lateral error = mean |lateral|. Other spread measures carry explicit labels.
- 1σ ellipse copy states ~39% *expected* coverage under a bivariate-normal model, plus the observed count. It never says the ellipse "holds 39% of shots".
- Spin loft is shown only as the measured CSV value. It is never computed from dynamic loft − attack angle.
- Face impact is shown in inches, as the CSV reports it. `Lateral Impact`: positive = toward the toe, negative = toward the heel, 0 = centered (confirmed by the product owner). `Vertical Impact`: positive = high. The face is drawn face-on as in frames 05/08: for a right-handed golfer the toe is on the viewer's left and the heel on the right; left-handed is mirrored.
- Low point: negative = behind the ball, positive = ahead of the ball (target side). All 128 fixture shots with both values agree with the attack-angle sign.
- Dispersion modes (exact labels):

  | Mode | X | Y | Panel title | Interpretation note |
  |---|---|---|---|---|
  | Carry | Lateral landing | Carry distance | "Landing dispersion · top view" | "Actual reported landing position" |
  | Total | Lateral landing | Total distance | "Total Distance vs. Landing Offset" | "Hybrid plot, not actual resting position" |

  The phrase "Total Dispersion" never appears.
- The 3D reconstruction is illustrative geometry built from impact measurements. It always shows the banner "Illustrative reconstruction" with "The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion." The replay timeline shows phase names (Downswing, Impact, Ball flight, Landing), never seconds.
- Every value is labelled as one of: measured, derived, illustrative, unavailable. Legend copy (exact): "Measured · from the CSV", "Derived · calculated from measured values", "Illustrative · drawn for orientation", "Unavailable · not in the CSV".
- Missing values display as **"Not measured"**.
- Layout: at 390 px, no horizontal body overflow and every control ≥ 44 px tall. Target widths are 1440 / 820 / 390. Visual language comes from the `docs/design/README.md` tokens. The "Binding decisions" there are part of this spec.
- Routing: `HashRouter`. Vite `base` = `process.env.PAGES_BASE ?? '/'`. Public build: `vite build --mode public` with `apps/web/.env.public` containing `VITE_APP_MODE=public`.
- Run every command under Node 24 (`.nvmrc`). Agent shells here inherit a PATH that puts Node 18 first, so start every shell command with `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH";` and check that `node --version` prints v24.
- Commits are authored as `Allen Lu <lu.allen.0119@gmail.com>` (repo-local git config, set once at setup; never change it). Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **CSVs re-saved by Excel/Numbers.** A UTF-8 BOM, CRLF line endings, Windows-1252 bytes (`°` = 0xB0) or quoted fields must produce the same shots as the original. Tests: Task 4.
2. **Files that aren't Mevo shot exports.** An empty file, a header-only file, a file with only Avg/Dev rows, an unrelated CSV, or a row with a wrong cell count must each get an explicit per-file status, never crash, and never be analyzed. Tests: Task 4, Task 13.
3. **Newer or edited exports.** Columns are found by header name, not position. Reordered, metric (`Carry (m)`) or unknown-unit (`(furlongs)`) columns are converted or dropped with a warning, never mis-scaled. Tests: Task 4.
4. **Filters that shrink the data.** If the selected shot is filtered out, it moves to the first visible shot. A filter with zero shots shows an empty state. With n < 3 there is no ellipse; with n < 2 there is no SD. Tests: Task 5, Task 6, Task 14.
5. **Duplicate and look-alike files.** The same bytes under two names are flagged as a duplicate. The same name with different bytes is not. Names never decide identity. Tests: Task 6, Task 13.

---

### Task 1: Workspace scaffold, fixtures, dependency-direction guard

**Files:**
- Create: `package.json`, `.nvmrc` (`24`), `.gitignore`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/{domain,csv-parser,analytics,visualizations,ui}/package.json`, each with `src/index.ts` (`export {}`)
- Create: `apps/web/{package.json,index.html,vite.config.ts,.env.public,src/main.tsx,src/App.tsx}`
- Create: `fixtures/flightscope/` — byte-for-byte copies of the three `Demo_csv/*.csv`, original names kept
- Test: `tests/repo.test.ts`

**Interfaces:**
- Produces: the root scripts `test` (`vitest run`), `typecheck` (`tsc --noEmit -p tsconfig.json`), `dev` (`npm run dev -w @fsa/web`, = `vite --mode public`) and `build:public` (`npm run build:public -w @fsa/web`, = `vite build --mode public`). Workspace packages are source-only: `"type":"module"`, `"main"` and `"types"` both `"src/index.ts"`.
- Produces: `vitest.config.ts` projects. `packages/domain`, `packages/csv-parser`, `packages/analytics` and `tests/` run in `node`. `packages/ui`, `packages/visualizations` and `apps/web` run in `jsdom` with `@testing-library/jest-dom` setup. Test files match `**/*.test.{ts,tsx}`.
- Produces: `fixtures/flightscope/` with `FlightScope Golf Session Sept 19 2022.csv`, `FlightScope Golf Session Sept 19.csv` and `FlightScope Golf Session.csv`.

- [ ] **Step 1: Write the failing test** `tests/repo.test.ts`

```ts
const FIXTURE_SHA256 = {
  'FlightScope Golf Session Sept 19 2022.csv': 'bb1cb2f252566342c034f6d9f6b3541894e7ccef1f0cd36ae82fd5ffd2975cdb',
  'FlightScope Golf Session Sept 19.csv':      'd84e6080c57fd31690c06465ea8d72ae7de93dda5a89bc14ced8498a8e4b2b95',
  'FlightScope Golf Session.csv':              'a879724ea351be55d638bd78a731f297929adba7113a0460caed46830203b797',
};
test('fixtures are byte-identical copies of the demo exports', ...)            // sha256 of each file in fixtures/flightscope equals the map
test.each(['domain','csv-parser','analytics','visualizations','ui'])('%s exposes src/index.ts', ...)
test('shared packages never import the app, network clients or browser storage', ...)
// scan packages/*/src/**/*.{ts,tsx} excluding *.test.*; expect zero matches for each of:
// /from\s+['"][^'"]*apps\//, /from\s+['"]@fsa\/web/, /\bfetch\s*\(/, /XMLHttpRequest/,
// /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.serviceWorker/
```

- [ ] **Step 2: Run it.** `npx vitest run tests/repo.test.ts`. Expected: FAIL (no fixtures, no packages; with no Vitest installed yet, the command itself fails, which counts as the red state).

- [ ] **Step 3: Create the scaffold.** Use the files above. Root `package.json`: `"private": true`, `"workspaces": ["apps/*","packages/*"]`, `"engines": {"node": ">=24"}`. TS: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, and the root `tsconfig.json` includes `apps/web/src`, `packages/*/src`, `tests`, `scripts` and `e2e`. `apps/web/vite.config.ts`: `@vitejs/plugin-react`, `base: process.env.PAGES_BASE ?? '/'`, `build.modulePreload: { polyfill: false }`. `App.tsx` renders `<h1>FlightScope Analytics</h1>`. Copy fixtures with `cp -p`. `.gitignore` covers: `.DS_Store`, `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `.superpowers/`, `Demo_csv/`, `*.docx`, and `FlightScope Analytics UI Claude Code.html` (the originals stay on disk; `docs/` holds the extracted copies). Install: react, react-dom, react-router, papaparse, @fontsource/inter, @fontsource/space-grotesk; dev: typescript, vite, @vitejs/plugin-react, vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @types/react, @types/react-dom, @types/papaparse, @types/node.

- [ ] **Step 4: Run the checks.** `npm test` → PASS (all repo tests). `npm run typecheck` → exit 0. `npm run build:public` → `apps/web/dist/index.html` exists.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore: scaffold npm workspace, fixtures and dependency guard"`

---

### Task 2: Field semantics — `@fsa/domain`

**Files:**
- Create: `packages/domain/src/{types.ts,fields.ts,units.ts,format.ts,clubs.ts,session.ts,index.ts}`
- Test: `packages/domain/src/{fields,units,format,clubs,session}.test.ts`

**Interfaces:**
- Produces (all exported from `@fsa/domain`):

```ts
export type MeasurementKey = 'ballSpeed'|'clubSpeed'|'smash'|'carry'|'total'|'roll'|'swingH'|'spin'|'height'
  |'flightTime'|'aoa'|'spinLoft'|'swingV'|'spinAxis'|'lateral'|'ftp'|'ftt'|'dynamicLoft'|'clubPath'
  |'launchH'|'launchV'|'lowPoint'|'descentV'|'curve'|'impactLateral'|'impactVertical'|'altitude';
export type Unit = 'mph'|'yd'|'rpm'|'ft'|'in'|'deg'|'s'|'none';
export type ValueKind = 'number'|'signedLR'|'feetInches';
export type Direction = 'LR'|'updown'|'toeheel'|'highlow'|'aheadbehind'|null;
export type FieldGroup = 'ball'|'club'|'impact'|'environment';
export interface FieldDef { key: MeasurementKey; names: readonly string[]; unit: Unit; kind: ValueKind;
  label: string; group: FieldGroup; decimals: number; direction: Direction }
export const FIELD_DEFS: readonly FieldDef[];            // 27 entries, Mevo Gen 2 column order
export const MEASUREMENT_KEYS: readonly MeasurementKey[];
export function fieldDef(key: MeasurementKey): FieldDef;
export type TextKey = 'club'|'shotLabel'|'shotType'|'mode'|'location';
export type HeaderClass =
  | { type: 'measurement'; def: FieldDef; sourceUnit: string | null }
  | { type: 'text'; key: TextKey } | { type: 'unknown' };
export function splitHeader(header: string): { name: string; unit: string | null };
export function classifyHeader(header: string): HeaderClass;
export function toCanonical(value: number, sourceUnit: string | null, canonical: Unit): number | null;
export type Measurements = Record<MeasurementKey, number | null>;
export type Provenance = 'measured'|'derived'|'illustrative'|'unavailable';
export type QualityFlag = 'no_measurements'|'check_face_to_path'|'check_smash';
export interface SourceFile { id: string; name: string; ordinal: number; sha256: string; byteLength: number; parserVersion: string }
export interface Shot { id: string; fileId: string; sourceRow: number; shotLabel: string | null; club: string;
  shotType: string | null; mode: string | null; location: string | null; m: Measurements;
  raw: Record<string, string>; flags: QualityFlag[] }
export interface WorkingSet { files: SourceFile[]; shots: Shot[] }
export type Vec3 = [number, number, number];   // yards or unit vectors: x lateral (right +), y downrange (target +), z up
export const IMPACT_CONVENTION: { readonly lateralPositive: 'toe'; readonly verticalPositive: 'high'; readonly verified: true };
export const NOT_MEASURED = 'Not measured';
export type Handedness = 'right' | 'left';
export interface SessionDetails { name: string; date: string | null /* 'YYYY-MM-DD', user-entered */; notes: string; handedness: Handedness }
export const DEFAULT_SESSION_DETAILS: SessionDetails;   // { name: '', date: null, notes: '', handedness: 'right' }
export function sessionTitle(d: SessionDetails): string;          // trimmed name, or 'Untitled session'
export function formatSessionDate(date: string | null): string;   // '2026-11-07' → '7 Nov 2026 (set by you)'; null → 'No date set'
export function handednessLabel(h: Handedness): string;           // 'Right-handed' | 'Left-handed'
export function formatMeasurement(key: MeasurementKey, value: number | null): string;
export function formatImpact(lateral: number | null, vertical: number | null): string;
export type ClubCategory = 'driver'|'wood'|'iron';
export function clubCategory(club: string): ClubCategory;
```

- FIELD_DEFS data. Each entry is: key — names — unit — kind — label — group — decimals — direction. `LR` direction on a `number` kind means a signed plain number displayed with R/L.

| key | names (case-insensitive) | unit | kind | label | group | dec | dir |
|---|---|---|---|---|---|---|---|
| ballSpeed | ball, ball speed | mph | number | Ball speed | ball | 1 | – |
| clubSpeed | club, club speed | mph | number | Club speed | club | 1 | – |
| smash | smash, smash factor | none | number | Smash factor | club | 2 | – |
| carry | carry, carry distance | yd | number | Carry | ball | 1 | – |
| total | total, total distance | yd | number | Total | ball | 1 | – |
| roll | roll | yd | number | Roll | ball | 1 | – |
| swingH | swing h, swing plane h, h-plane | deg | signedLR | H-plane | club | 1 | LR |
| spin | spin, total spin, spin rate | rpm | number | Spin | ball | 0 | – |
| height | height, apex, max height | ft | number | Apex height | ball | 1 | – |
| flightTime | time, flight time | s | number | Flight time | ball | 1 | – |
| aoa | aoa, angle of attack, attack angle | deg | number | Attack angle | club | 1 | updown |
| spinLoft | spin loft | deg | number | Spin loft | club | 1 | – |
| swingV | swing v, swing plane v, v-plane | deg | number | V-plane | club | 1 | – |
| spinAxis | spin axis | deg | signedLR | Spin axis | ball | 1 | LR |
| lateral | lateral, lateral landing | yd | signedLR | Lateral | ball | 1 | LR |
| ftp | ftp, face to path | deg | signedLR | Face to path | club | 1 | LR |
| ftt | ftt, face to target | deg | signedLR | Face to target | club | 1 | LR |
| dynamicLoft | dynamic loft | deg | number | Dynamic loft | club | 1 | – |
| clubPath | club path | deg | signedLR | Club path | club | 1 | LR |
| launchH | launch h, horizontal launch, launch direction | deg | signedLR | Launch H | ball | 1 | LR |
| launchV | launch v, vertical launch, launch angle | deg | number | Launch V | ball | 1 | – |
| lowPoint | low point | in | feetInches | Low point | club | 1 | aheadbehind |
| descentV | descentv, descent v, descent angle | deg | number | Descent angle | ball | 1 | – |
| curve | curve dist, curve | yd | number | Curve | ball | 1 | LR |
| impactLateral | lateral impact, impact lateral | in | number | Lateral impact | impact | 2 | toeheel |
| impactVertical | vertical impact, impact vertical | in | number | Vertical impact | impact | 2 | highlow |
| altitude | altitude | ft | number | Altitude | environment | 1 | – |

- Text names: club `club`; shotLabel `shot`, `shot #`, `shot number`; shotType `shot type`; mode `mode`; location `location`.
- `classifyHeader` rule: trim the header, collapse whitespace and compare case-insensitively. If the header has no unit, try text fields first, then measurements. If it has a unit, try measurements only. This keeps `club` (the club name) apart from `Club (mph)`.
- Source-unit tokens (lower-cased) and factors to canonical:
  - yd: `yds`, `yd`, `yards` = 1; `m`, `meters`, `metres` = 1.0936133
  - mph: `mph` = 1; `km/h`, `kph` = 0.6213712; `m/s` = 2.2369363
  - ft: `ft`, `feet` = 1; `m` = 3.2808399
  - in: `in`, `inch`, `inches`, `ftin` = 1; `mm` = 1/25.4; `cm` = 1/2.54
  - deg: `°`, `deg`, `degrees` = 1
  - rpm: `rpm` = 1
  - s: `s`, `sec`, `seconds` = 1
  - none: only a `null` unit
  - Anything else → `null`. A `null` unit for a non-`none` canonical unit also → `null`.

- [ ] **Step 1: Write the failing tests**

```ts
// fields.test.ts
test.each([
  ['club', { type: 'text', key: 'club' }],
  ['Club (mph)', { type: 'measurement', key: 'clubSpeed', sourceUnit: 'mph' }],
  ['Smash', { type: 'measurement', key: 'smash', sourceUnit: null }],
  ['Shot Type', { type: 'text', key: 'shotType' }],
  ['Low Point (ftin)', { type: 'measurement', key: 'lowPoint', sourceUnit: 'ftin' }],
  ['Swing H (°)', { type: 'measurement', key: 'swingH', sourceUnit: '°' }],
  ['  carry   (YDS) ', { type: 'measurement', key: 'carry', sourceUnit: 'YDS' }],
  ['Wind (mph)', { type: 'unknown' }],
])('classifyHeader(%j)', ...)  // compare def.key for measurements
test('all 32 headers of the Sept 19 2022 fixture classify: 27 measurements + 5 text, none unknown', ...)
test('FIELD_DEFS has 27 unique keys equal to MEASUREMENT_KEYS', ...)
// units.test.ts
test.each([[100,'m','yd',109.3613],[160,'km/h','mph',99.4194],[25.4,'mm','in',1],[10,'yds','yd',10],
  [5,'°','deg',5],[1.25,null,'none',1.25],[5,'furlongs','yd',null],[5,null,'rpm',null]])('toCanonical(%d,%j,%s)', ...) // toBeCloseTo(…, 4)
// format.test.ts
test.each([['clubPath',3.1,'3.1° R'],['clubPath',-0.8,'0.8° L'],['clubPath',0,'0.0°'],['aoa',2.6,'2.6° up'],
  ['aoa',-1.3,'1.3° down'],['lateral',-44.7,'44.7 yd L'],['spin',2540,'2,540 rpm'],['carry',251.3,'251.3 yd'],
  ['smash',1.456,'1.46'],['impactLateral',0.62,'0.62 in toe'],['impactLateral',-0.47,'0.47 in heel'],
  ['impactVertical',-0.4,'0.40 in low'],['impactLateral',0,'0.00 in centered'],['lowPoint',-2.9,'2.9 in behind'],
  ['lowPoint',1.5,'1.5 in ahead'],['flightTime',7.6,'7.6 s'],['carry',null,'Not measured']])(...)
test("formatImpact(0.62, 0.44) === '0.62 in toe · 0.44 in high'; formatImpact(null, 0.44) === 'Not measured'", ...)
test('IMPACT_CONVENTION is toe/high, verified true', ...)
test("sessionTitle: '' and '   ' → 'Untitled session'; ' Range day ' → 'Range day'", ...)
test("formatSessionDate('2026-11-07') → '7 Nov 2026 (set by you)' in every time zone; null → 'No date set'", ...)  // run with TZ offsets via Intl timeZone 'UTC'
test("handednessLabel('right') → 'Right-handed'; 'left' → 'Left-handed'", ...)
// clubs.test.ts
test.each([['Driver','driver'],['3 Wood','wood'],['4 Hybrid','wood'],['5W','wood'],['7 Iron','iron'],
  ['Pitching Wedge','iron'],['Gap Wedge','iron'],['Unknown club','iron']])('clubCategory(%s)', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/domain`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the Interfaces block. Formatting: `abs(value)` with `decimals` places and en-US thousands separators when `direction` is set; signed otherwise. Unit suffix: `°` attaches directly, `none` adds nothing, other units add ` <unit>`. Direction suffix: LR ` R`/` L`; updown ` up`/` down`; toeheel ` toe`/` heel` (positive = toe, per `IMPACT_CONVENTION`), with ` centered` at 0; highlow ` high`/` low`; aheadbehind ` ahead`/` behind`. Every other direction has no suffix at 0. `formatSessionDate` parses the parts and formats with `Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'})` on `Date.UTC(y, m−1, d)`, so the day never shifts. `clubCategory`: `/driver|\b1w\b/i` → driver; `/wood|hybrid|\b\d+\s?[wh]\b/i` → wood; else iron.
- [ ] **Step 4: Run.** `npx vitest run packages/domain` → PASS. `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit.** `git add packages/domain && git commit -m "feat(domain): canonical field semantics, units and formatting"`

---

### Task 3: Cell normalization — `@fsa/csv-parser/cells`

**Files:**
- Create: `packages/csv-parser/src/cells.ts`
- Test: `packages/csv-parser/src/cells.test.ts`

**Interfaces:**
- Consumes: `FieldDef`, `toCanonical`, `fieldDef` from `@fsa/domain`.
- Produces:

```ts
export type CellResult = { ok: true; value: number | null } | { ok: false; reason: 'invalid_value' | 'unrecognized_unit' };
export function parseCell(raw: string, def: FieldDef, sourceUnit: string | null): CellResult;
export function normalizeText(raw: string): string | null;   // NBSP/U+202F→space, trim; '', '-', '—', 'N/A' (any case) → null
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = fieldDef;
test.each([
  ['8.1 R', d('clubPath'), '°', 8.1], ['6 L', d('ftp'), '°', -6], ['10.4 R', d('lateral'), 'yds', 10.4],
  ['44.7 L', d('lateral'), 'yds', -44.7], ['0', d('clubPath'), '°', 0], ['-1.3', d('aoa'), '°', -1.3],
  ['5162', d('spin'), 'rpm', 5162], ['2,540', d('spin'), 'rpm', 2540], ['55.8 ft', d('altitude'), 'ft', 55.8],
  ['17 m', d('altitude'), 'm', 55.774], ['1.5″', d('lowPoint'), 'ftin', 1.5], ['-2.9″', d('lowPoint'), 'ftin', -2.9],
  ['0″', d('lowPoint'), 'ftin', 0], ["1' 2.5″", d('lowPoint'), 'ftin', 14.5], ["-1' 0.5″", d('lowPoint'), 'ftin', -12.5],
  ['1.5"', d('lowPoint'), 'ftin', 1.5], ['100', d('carry'), 'm', 109.361], ['1.38', d('impactLateral'), 'in', 1.38],
])('parseCell(%j) → %d', ...)                       // toBeCloseTo(expected, 3)
test.each(['-', '', '  ', 'N/A', 'n/a', ' - '])('%j is null, never 0, for every field', ...)  // loop FIELD_DEFS
test.each([['3.2', d('clubPath'), '°'], ['8.1 X', d('clubPath'), '°'], ['abc', d('spin'), 'rpm'], ['1.2.3', d('carry'), 'yds']])
  ('%j is invalid_value', ...)
test("parseCell('100', carry, 'furlongs') → { ok: false, reason: 'unrecognized_unit' }", ...)
test("normalizeText: ' Driver ' → 'Driver'; 'N/A' → null; '-' → null; 'Push/Slice' → 'Push/Slice'", ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/csv-parser/src/cells.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `parseCell`. Normalize whitespace (U+00A0/U+202F → space, trim). The null tokens return `{ok:true,value:null}`. Then parse by kind:
  - `signedLR`: `^(\d+(\.\d+)?)\s*([LR])$` (case-insensitive) or bare `0`/`0.0`. A bare non-zero number is invalid because its sign convention is unknown.
  - `number`: `^[+-]?\d+(\.\d+)?$` or `^\d{1,3}(,\d{3})+(\.\d+)?$`, optionally followed by a space and a unit token equal to `sourceUnit` (case-insensitive).
  - `feetInches`: `X″`/`X"` → inches, `F'` → F×12, `F' I″` → F×12+I with the sign applied to the whole value, bare number → inches.
  - Then convert with `toCanonical`. A `null` result → `unrecognized_unit`.
- [ ] **Step 4: Run.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add packages/csv-parser && git commit -m "feat(csv-parser): normalize directional, unit-suffixed and feet-inch cells"`

---

### Task 4: File parser and golden fixtures — `@fsa/csv-parser`

**Files:**
- Create: `packages/csv-parser/src/{decode.ts,hash.ts,parse.ts,index.ts}`
- Create: `fixtures/flightscope/expected/{FlightScope Golf Session Sept 19 2022,FlightScope Golf Session Sept 19,FlightScope Golf Session}.expected.json`, `fixtures/flightscope/README.md` (documents the expectation format for the future Python parity tests)
- Test: `packages/csv-parser/src/{parse,decode,golden}.test.ts`

**Interfaces:**
- Consumes: Task 2 domain types and `classifyHeader`; Task 3 `parseCell`, `normalizeText`.
- Produces:

```ts
export const PARSER_VERSION = '1.0.0';
export type ParsedShot = Omit<Shot, 'id' | 'fileId'>;
export interface SummaryRow { club: string; kind: 'Avg' | 'Dev'; sourceRow: number; raw: Record<string, string> }
export interface ColumnReport { headers: string[]; recognized: MeasurementKey[]; text: TextKey[]; missing: MeasurementKey[]; unrecognized: string[] }
export type WarningCode = 'missing_column'|'unrecognized_column'|'unrecognized_unit'|'duplicate_column'
  |'invalid_value'|'row_length_mismatch'|'relationship_check'|'no_measurements'|'decoded_as_windows_1252';
export interface ParseWarning { code: WarningCode; message: string; row?: number; column?: string }
export type ParseErrorCode = 'empty_file' | 'not_flightscope_export' | 'no_shots';
export interface ParseResult { fileName: string; parserVersion: string; ok: boolean;
  error: { code: ParseErrorCode; message: string } | null; shots: ParsedShot[]; summaryRows: SummaryRow[];
  columns: ColumnReport; warnings: ParseWarning[] }
export function parseFlightScopeCsv(text: string, fileName: string): ParseResult;
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' };
export function sha256Hex(bytes: Uint8Array): Promise<string>;   // globalThis.crypto.subtle
export * from './cells';
```

- Parsing rules:
  - PapaParse with `header: false`. Strip a leading U+FEFF.
  - `sourceRow` is the 1-based record number. The header is record 1. Blank records are skipped but still counted.
  - Header classification uses `classifyHeader`. The first occurrence of a duplicate wins (`duplicate_column`). An unknown header gives `unrecognized_column` and stays in `raw`. A unit that `toCanonical` rejects gives `unrecognized_unit`; that column goes to `unrecognized` and its key goes to `missing`. Each absent FIELD_DEF key gives one `missing_column` warning.
  - If there is no `club` column or zero recognized measurements, the result is `ok:false`, `not_flightscope_export`.
  - A record whose cell count differs from the header's is skipped with `row_length_mismatch`.
  - A record whose `club` or `shotLabel` text equals `Avg`/`Dev` (case-insensitive) becomes a `SummaryRow`.
  - An empty club becomes `'Unknown club'`.
  - An invalid cell → `null` plus an `invalid_value` warning naming the row, column and raw text.
  - If every non-`environment` measurement is null, the shot gets flag `no_measurements` and a warning.
  - Soft checks:
    - |ftp − (ftt − clubPath)| > 0.15 → flag `check_face_to_path`
    - |smash − ballSpeed/clubSpeed| > 0.01 → flag `check_smash`
    - Each flagged shot gets a `relationship_check` warning. Do **not** check spin loft or roll; they legitimately differ.
  - Errors: whitespace-only text → `empty_file`; zero shots (header-only, or only Avg/Dev) → `no_shots`.
  - `fileName` is copied to the result and never used otherwise.
  - `decodeCsvBytes`: `TextDecoder('utf-8', {fatal:true})`. If that throws, decode as `windows-1252`; the caller adds `decoded_as_windows_1252`.
- Golden expectations JSON shape (one file per fixture):

```json
{ "file": "…csv", "sha256": "…", "parserVersion": "1.0.0", "columnCount": 32, "shotCount": 16, "summaryRowCount": 2,
  "summaryRows": [{"club":"Driver","kind":"Avg","sourceRow":18}, …], "clubs": {"Driver": 16},
  "nonNullCounts": {"clubPath": 14, "impactLateral": 3}, "missingColumns": [], "unrecognizedColumns": [],
  "flags": {"no_measurements": [], "check_face_to_path": [], "check_smash": []},
  "shots": [{"sourceRow": 2, "shotLabel": "1", "club": "Driver", "shotType": "Straight", "mode": "Outdoor", "location": "View", "m": {…}}] }
```

  Values to write (taken from the CSVs; `m` lists only the keys shown, except Sept 19 2022 row 2, which lists all 27):
  - **Sept 19 2022:**
    - Counts: 16 shots, 2 summary rows (Avg 18, Dev 19), clubs `{Driver:16}`, nonNull `{clubPath:14, impactLateral:3}`.
    - Row 2, all 27 keys: ballSpeed 142.5, clubSpeed 113.5, smash 1.25, carry 198.9, total 199.5, roll 0.6, swingH 7, spin 5162, height 149.7, flightTime 7.6, aoa -1.3, spinLoft 28.3, swingV 50.5, spinAxis 1, lateral 10.4, ftp 0.5, ftt 8.6, dynamicLoft 27, clubPath 8.1, launchH 2.2, launchV 19.1, lowPoint 1.5, descentV 54.6, curve 2.6, impactLateral null, impactVertical null, altitude 55.8.
    - Row 15 (Shot 14): swingH, aoa, spinLoft, swingV, ftp, ftt, dynamicLoft, clubPath all null; lowPoint 0; launchH 8.9.
    - Row 16 (Shot 15): spinAxis -45, lateral -44.7, ftp -13.8, ftt -4.1, clubPath 9.6, launchH -0.3, lowPoint -4.7, curve -44, impactLateral 0.23, impactVertical 0.84.
  - **Sept 19:**
    - Counts: 26 shots, 6 summary rows (rows 5/6, 24/25, 32/33), clubs `{"4 Hybrid":3,"7 Iron":17,"8 Iron":6}`, nonNull `{clubPath:26, impactLateral:22}`.
    - Row 2: impactLateral null.
    - Row 4: impactLateral 0.62, impactVertical 0.44, spinAxis -42.4, lateral -46.9.
  - **Session:**
    - Counts: 91 shots, 14 summary rows (20/21, 29/30, 53/54, 64/65, 73/74, 87/88, 105/106), clubs `{Driver:18,"6 Iron":7,"7 Iron":22,"8 Iron":9,"9 Iron":7,"Pitching Wedge":12,"Gap Wedge":16}`, nonNull `{clubPath:89, impactLateral:79}`, flags.no_measurements `[78]`.
    - Row 78: club "Pitching Wedge", shotLabel "4", all 26 non-environment keys null, altitude 55.8, mode null, location "View".
  - All three: columnCount 32, no missing or unrecognized columns, check flags empty.

- [ ] **Step 1: Write the failing tests**

```ts
// golden.test.ts — for each expected.json: parse the fixture (decodeCsvBytes + parseFlightScopeCsv) and assert
//   ok, columns.headers.length, shots.length, summaryRows (club/kind/sourceRow), club counts, nonNullCounts,
//   missing/unrecognized, flags (sourceRows per flag), every listed shot field (toBeCloseTo 6 for numbers; null exact),
//   and sha256Hex(bytes) === expected.sha256
// parse.test.ts
test('BOM + CRLF re-save yields identical shots and summary rows', ...)        // '﻿' + text.replace(/\n/g,'\r\n')
test('quoted cells parse: "2,540" spin and "Driver" club', ...)
test('columns are matched by name: swapping Carry and Spin columns keeps row 2 carry 198.9, spin 5162', ...)
test("'Carry (m)' converts: a cell '100' becomes 109.361 yd", ...)
test("'Carry (furlongs)' is dropped: carry null on every shot, warning unrecognized_unit, columns.missing includes 'carry'", ...)
test("unknown column 'Wind (mph)' warns unrecognized_column and keeps raw['Wind (mph)']", ...)
test('a 31-cell row is skipped with row_length_mismatch and the other 15 shots parse', ...)
test.each([['', 'empty_file'], ['  \n ', 'empty_file'], ['name,email\nA,b', 'not_flightscope_export'],
  [HEADER_ONLY, 'no_shots'], [ONLY_AVG_DEV, 'no_shots']])('invalid input %# → %s', ...)   // ok false, shots []
test('file name never changes parsing: same text under two names gives equal results apart from fileName', ...)
test('an FTP row off by 1° from FTT − path gets check_face_to_path; spin loft ≠ DL − AOA is NOT flagged', ...)
// decode.test.ts
test("UTF-8 fixture decodes as 'utf-8' and keeps '°' and '″'", ...)
test("bytes with 0xB0 for '°' decode as 'windows-1252' to '°'", ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/csv-parser`. Expected: FAIL (`parseFlightScopeCsv` not exported).
- [ ] **Step 3: Implement** using the Interfaces and rules above. Write the three `.expected.json` files by hand from the values listed. Do not generate them from the parser under test.
- [ ] **Step 4: Run.** `npx vitest run packages/csv-parser` → PASS. `npm test` → PASS.
- [ ] **Step 5: Commit.** `git add packages/csv-parser fixtures && git commit -m "feat(csv-parser): parse Mevo Gen 2 exports with golden fixture expectations"`

---

### Task 5: Statistics, dispersion and derived geometry — `@fsa/analytics`

**Files:**
- Create: `packages/analytics/src/{summary.ts,dispersion.ts,spin.ts,trajectory.ts,index.ts}`, `packages/analytics/test/fixtureShots.ts`
- Test: `packages/analytics/src/{summary,dispersion,spin,trajectory}.test.ts`

**Interfaces:**
- Consumes: `Shot`, `MeasurementKey` (domain). Tests use `@fsa/csv-parser` (devDependency). `fixtureShots(name)` maps `ParsedShot` to `Shot` with `fileId 'f1'` and `id 'f1:<sourceRow>'`.
- Produces:

```ts
export interface Summary { n: number; of: number; mean: number|null; sd: number|null; min: number|null; max: number|null }
export function summarize(values: readonly (number | null)[]): Summary;     // population SD; sd null when n < 2
export type HeadlineKey = 'carry'|'total'|'ballSpeed'|'clubSpeed'|'smash'|'spin'|'lateral'|'clubPath';
export const HEADLINE_KEYS: readonly HeadlineKey[];                           // exactly this order
export function headlineMetrics(shots: readonly Shot[]): Record<HeadlineKey, Summary>;
export type LandingMode = 'carry' | 'total';
export interface DispersionPoint { shotId: string; x: number; y: number }   // x lateral yd (right +), y carry|total yd
export interface Ellipse { cx: number; cy: number; rx: number; ry: number; angleDeg: number } // 1σ; rx = major semi-axis; angle from +x toward +y, (-90, 90]
export interface DispersionStats { mode: LandingMode; points: DispersionPoint[]; excluded: number;
  centroid: { x: number; y: number } | null; meanAbsLateral: number | null; sdX: number | null; sdY: number | null;
  ellipse: Ellipse | null; observedInside: number; expectedCoverage: number }
export const EXPECTED_1SIGMA_COVERAGE: number;                                // 1 - Math.exp(-0.5)
export function dispersionStats(shots: readonly Shot[], mode: LandingMode): DispersionStats;
export function spinComponents(spin: number|null, axisDeg: number|null): { backspin: number|null; sidespin: number|null };
export function spinAxisVector(axisDeg: number): Vec3;   // (cos a, 0, −sin a): backspin axis points right; positive (R) tilt dips the right end
export interface TrajectoryCurve { shotId: string; p0: [number,number]; p1: [number,number]; p2: [number,number]; p3: [number,number] } // yards
export function trajectoryCurve(shot: Shot): TrajectoryCurve | null;
```

- Ellipse: population covariance of (x, y). Semi-axes are √eigenvalues. `null` when there are fewer than 3 points or the determinant is ≤ 1e-9. `observedInside` counts points with Mahalanobis d² ≤ 1.
- Trajectory (illustrative): carry c, height h = height_ft/3, launch L, descent D.
  - p0 = (0,0), p3 = (c,0), p1 = (k·c·cos L, k·c·sin L), p2 = (c − k·c·cos D, k·c·sin D).
  - The curve's y is linear in k, so k = h / max_t y(t) evaluated at k = 1 (sample t at 1,000 steps).
  - `null` if c, height, L or D is null.

- [ ] **Step 1: Write the failing tests**

```ts
test('summarize([1,2,null,3]) → n 3, of 4, mean 2, sd 0.8165, min 1, max 3', ...)
test('summarize([null,null]) → n 0, mean/sd/min/max null; summarize([5]) → sd null', ...)
test('headlineMetrics(Sept 19 2022): carry mean 201.406 sd 38.550 n16/16; clubPath mean 8.429 n14/16; lateral mean 35.219; spin mean 3344.875; smash mean 1.297', ...) // toBeCloseTo(…,3)
test('matches the export’s own Avg/Dev rows for every club in all three fixtures', ...)
//   for carry,total,ballSpeed,clubSpeed,lateral,clubPath: |mean−Avg| ≤ 0.1 and |sd−Dev| ≤ 0.1; smash ≤ 0.01; spin ≤ 1
//   (parse the summary rows' raw cells with parseCell)
test("dispersionStats(Sept 19 2022,'carry'): 16 points, excluded 0, centroid (35.219, 201.406), meanAbsLateral 42.294, sdX 33.815, sdY 38.550, ellipse rx 39.672 ry 32.492 angle 65.7, observedInside 6, expectedCoverage 0.3935", ...) // angle ±0.05, others ±0.001
test("dispersionStats(Sept 19 2022,'total'): centroid y 211.931, rx 38.930, ry 32.350, angle 62.96, observedInside 6", ...)
test('synthetic (−1,0),(1,0),(0,−2),(0,2): rx √2, ry √0.5, angle 90', ...)
test('fewer than 3 points or collinear points → ellipse null; all-null lateral → points [], centroid null, excluded = shots.length', ...)
test('spinComponents(3000,10) → backspin 2954.42, sidespin 520.94; (3000,−10) → sidespin −520.94; (null,10) → nulls', ...)
test('spinAxisVector(0) → (1,0,0); (10) → (0.98481, 0, −0.17365); cross(spinAxisVector(10), (0,1,0)).x > 0, so a positive axis curves the ball right', ...)
test('trajectoryCurve(Sept 19 2022 row 2): p3 = (198.9,0); peak y within 1% of 49.9; start tangent 19.1°; end tangent 54.6°', ...)
test('trajectoryCurve returns null when descentV is null', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/analytics`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces block.
- [ ] **Step 4: Run.** `npx vitest run packages/analytics` → PASS.
- [ ] **Step 5: Commit.** `git add packages/analytics && git commit -m "feat(analytics): summaries, dispersion ellipse, spin components, trajectory curve"`

---

### Task 6: Working-set operations (filters, order, selection, staging)

**Files:**
- Create: `packages/analytics/src/workingSet.ts` (exported from the index), `apps/web/src/state/staging.ts`
- Test: `packages/analytics/src/workingSet.test.ts`, `apps/web/src/state/staging.test.ts`

**Interfaces:**
- Consumes: `Shot`, `SourceFile`, `WorkingSet` (domain); `ParseResult`, `PARSER_VERSION` (csv-parser).
- Produces (`@fsa/analytics`):

```ts
export interface Filters { club: string | null; fileId: string | null }
export function filterShots(ws: WorkingSet, f: Filters): Shot[];               // keeps canonical order
export function displayOrder(shots: readonly Shot[]): Shot[];                  // stable group-by-club, first-appearance order
export function clubCounts(shots: readonly Shot[]): { club: string; count: number }[]; // first-appearance order
export function reconcileSelection(selectedId: string | null, visible: readonly Shot[]): string | null;
export function stepSelection(selectedId: string | null, visible: readonly Shot[], delta: 1 | -1): string | null;
export function selectionPosition(selectedId: string | null, visible: readonly Shot[]): { index: number; total: number } | null; // index 1-based
```

- Produces (`apps/web/src/state/staging.ts`):

```ts
export interface IncomingFile { name: string; byteLength: number; sha256: string; parse: ParseResult }
export interface PreviewFile extends IncomingFile { key: string; duplicateOf: string | null; include: boolean }
export function stageFiles(existing: readonly PreviewFile[], incoming: readonly IncomingFile[], makeKey: () => string): PreviewFile[];
export function buildWorkingSet(staged: readonly PreviewFile[]): WorkingSet;
```

- Rules:
  - `stageFiles` appends. A file whose sha256 matches an earlier staged file gets `duplicateOf` = that file's key and `include:false`. Invalid parses get `include:false`. Everything else gets `include:true`.
  - `buildWorkingSet` uses included `ok` files in staged order. `ordinal` runs 1..n, `id` = key, and `parserVersion` is copied. Shot `id` = `${key}:${sourceRow}`. Shots are ordered by ordinal, then sourceRow.
  - `reconcileSelection` keeps a visible id, else returns the first visible id, else `null`.
  - `stepSelection` moves within `visible` and clamps at the ends without wrapping. An id that isn't visible yields the first visible id.

- [ ] **Step 1: Write the failing tests**

```ts
// workingSet.test.ts (synthetic shots D1,I1,D2,I2 in canonical order; files f1,f2)
test('filterShots by club and by fileId keeps canonical order', ...)
test('displayOrder groups by club in first-appearance order: D1,D2,I1,I2', ...)
test('clubCounts → [{Driver,2},{7 Iron,2}]', ...)
test('reconcileSelection: keeps visible id; filtered-out id → first visible; empty → null', ...)
test('stepSelection: next/prev, clamps at both ends, unknown id → first', ...)
test('selectionPosition(D2 in [D1,D2,I1,I2]) → {index:2,total:4}; null when not visible', ...)
// staging.test.ts (parse the three fixtures for real)
test('same bytes under two names: second is duplicateOf first, include false', ...)
test('same name with different bytes is not a duplicate', ...)
test('invalid parse is staged with include false', ...)
test('buildWorkingSet of the three fixtures in order [Sept 19 2022, Sept 19, Session]: ordinals 1..3, 133 shots, ids "<key>:<row>", first shot row 2 of file 1, last shot row 104 of file 3', ...)
test('excluded or duplicate files contribute no shots', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/analytics/src/workingSet.test.ts apps/web/src/state/staging.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces block (`WorkingSet` already comes from `@fsa/domain`, Task 2).
- [ ] **Step 4: Run.** Same command → PASS. `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit.** `git add packages apps && git commit -m "feat: working-set staging, filters, display order and selection"`

---

### Task 7: UI primitives and design tokens — `@fsa/ui`

**Files:**
- Create: `packages/ui/src/{tokens.css,fonts.ts,Button.tsx,SegmentedControl.tsx,FilterChip.tsx,SelectField.tsx,KpiTile.tsx,Provenance.tsx,Tabs.tsx,EmptyState.tsx,index.ts}`
- Test: `packages/ui/src/primitives.test.tsx`

**Interfaces:**
- Consumes: `Provenance`, `NOT_MEASURED` (domain).
- Produces:

```tsx
Button(props: ButtonHTMLAttributes & { variant?: 'primary' | 'secondary' | 'ghost' })
SegmentedControl<T extends string>(props: { label: string; options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange(v: T): void })
FilterChip(props: { pressed: boolean; label: string; count: number; onClick(): void })
SelectField(props: { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void })
KpiTile(props: { label: string; value: string | null; unit?: string; sub?: string; accent: 'ball' | 'club' | 'neutral' })
ProvenanceTag(props: { kind: Provenance }); ProvenanceLegend(): JSX.Element
Tabs(props: { label: string; tabs: { id: string; label: string }[]; active: string; onChange(id: string): void })
EmptyState(props: { title: string; body: string; action?: ReactNode })
```

- `tokens.css` defines the variables from the `docs/design/README.md` token table plus `--touch-target: 44px`. Interactive roots carry class `fsa-touch` (`min-height: var(--touch-target)`). `fonts.ts` imports the `@fontsource` Inter 400/500/600 and Space Grotesk 600 CSS so the fonts are bundled, not fetched from Google.

- [ ] **Step 1: Write the failing tests**

```tsx
test('SegmentedControl: role=group named by label; selected option aria-pressed=true; click calls onChange(value)', ...)
test("FilterChip renders 'Driver' and '34' with aria-pressed", ...)
test("KpiTile with value null shows 'Not measured' and no unit; shows sub '± 9.8 · n 34'", ...)
test('ProvenanceLegend lists exactly the four legend strings from Global Constraints', ...)
test('Tabs: role=tablist, active tab aria-selected; ArrowRight activates next, ArrowLeft from first wraps to last', ...)
test('SelectField input is reachable via getByLabelText(label)', ...)
test('Button, SegmentedControl options, FilterChip, SelectField and tabs carry class fsa-touch', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match the control styling in frames 04 and 05: pill chips, segmented track `--surface-sunken`, KPI tiles with accent label colour.
- [ ] **Step 4: Run.** `npx vitest run packages/ui` → PASS.
- [ ] **Step 5: Commit.** `git add packages/ui && git commit -m "feat(ui): design tokens, self-hosted fonts and accessible primitives"`

---

### Task 8: Dispersion and trajectory plots — `@fsa/visualizations`

**Files:**
- Create: `packages/visualizations/src/{scale.ts,DispersionPlot.tsx,TrajectoryPlot.tsx,index.ts}`
- Test: `packages/visualizations/src/{scale,DispersionPlot,TrajectoryPlot}.test.tsx`

**Interfaces:**
- Consumes: `DispersionStats`, `LandingMode`, `TrajectoryCurve` (analytics); `ProvenanceTag` (ui).
- Produces:

```tsx
export function niceTicks(min: number, max: number, maxCount: number): number[];
DispersionPlot(props: { stats: DispersionStats; selectedId: string | null; onSelect(shotId: string): void; labelFor(shotId: string): string })
TrajectoryPlot(props: { curves: TrajectoryCurve[]; selectedId: string | null })
```

- `niceTicks`: rawStep = (max−min)/maxCount; step = the smallest of {1, 2, 2.5, 5, 10}×10^⌊log10 rawStep⌋ that is ≥ rawStep; ticks are the multiples of step within [min, max].
- Dispersion SVG (viewBox like frame 04, 560×440):
  - x is symmetric about the target line (±max(|x|)·1.1, minimum ±10 yd). Positive lateral is drawn right of the target line; larger y is drawn higher.
  - X tick labels read `20 L`, `Target`, `20 R`. Axis titles: `Lateral landing (yd) · right positive` and `Carry distance (yd)` / `Total distance (yd)`.
  - Points: `<circle data-shot-id>`, clickable. The selected point is larger with `aria-current="true"`.
  - Centroid cross and ellipse appear only when non-null.
  - Each mode shows its interpretation note from the Global Constraints table: carry "Actual reported landing position", total "Hybrid plot, not actual resting position".
  - The SVG `aria-label` names the selected shot: `labelFor(id)` + `lands at {y} yards, {|x|} yards {left|right}`.
- Trajectory SVG: one cubic `<path>` per curve; the selected one has `data-selected="true"` and is drawn last. Header tag: `Illustrative` + "Drawn from launch angle, apex height, descent angle and carry".
- Empty states: "No shots with both lateral and {carry|total} values" and "No shots with launch, apex, descent and carry".

- [ ] **Step 1: Write the failing tests**

```tsx
test('niceTicks(0,100,5) → [0,20,40,60,80,100]; (−30,30,4) → [−20,0,20]; (193.6,255.4,4) → [200,220,240]', ...)
test('one circle per point; clicking a point calls onSelect with its id', ...)
test('selected point has aria-current=true; svg aria-label mentions the selected shot', ...)
test('positive x is drawn right of the target line; larger y has smaller cy', ...)
test("x tick labels use L/R and the centre reads 'Target'", ...)
test('ellipse rendered iff stats.ellipse non-null; centroid cross iff centroid non-null', ...)
test("carry mode: 'Carry distance (yd)' and 'Actual reported landing position'; total mode: 'Total distance (yd)' and 'Hybrid plot, not actual resting position'; neither contains 'Total Dispersion'", ...)
test('empty points render the empty message, no circles', ...)
test('TrajectoryPlot: one path per curve, selected path has data-selected, Illustrative tag present', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/visualizations`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run packages/visualizations` → PASS.
- [ ] **Step 5: Commit.** `git add packages/visualizations && git commit -m "feat(visualizations): linked dispersion plot and illustrative trajectory"`

---

### Task 9: Delivery, spin and face-impact diagrams — `@fsa/visualizations`

**Files:**
- Create: `packages/visualizations/src/{HorizontalDelivery.tsx,VerticalDelivery.tsx,SpinBall.tsx,FaceImpact.tsx,faceOutlines.ts}`
- Test: `packages/visualizations/src/diagrams.test.tsx`

**Interfaces:**
- Consumes: `formatMeasurement`, `IMPACT_CONVENTION`, `ClubCategory`, `Handedness`, `Vec3`, `NOT_MEASURED` (domain); `spinComponents`, `spinAxisVector` (analytics); `ProvenanceTag` (ui).
- Produces:

```tsx
HorizontalDeliveryDiagram(props: { clubPath: number|null; faceToTarget: number|null; faceToPath: number|null; launchH: number|null; exaggerate: 1 | 4 })
VerticalDeliveryDiagram(props: { aoa: number|null; dynamicLoft: number|null; launchV: number|null; spinLoft: number|null; exaggerate: 1 | 2; lowPoint?: number|null })
SpinBallDiagram(props: { spin: number|null; spinAxis: number|null })   // owns its play/pause state; paused initially
export const SPIN_DISPLAY_SLOWDOWN = 50;
FaceImpactDiagram(props: { category: ClubCategory; handedness: Handedness; selected: { x: number; y: number } | null; others: { x: number; y: number }[]; showOthers: boolean })
```

- Every drawn element carries `data-role`:
  - top view: `target-line`, `club-path`, `face`, `launch`
  - side view: `ground`, `attack`, `loft`, `launch`
  - face impact: `selected-impact`, `other-impact`
- A null angle draws no element; its row in the value list reads "<label> · Not measured". If all inputs are null, the panel says "Club delivery not measured for this shot".
- Top view is drawn like the "Top view · face to path" diagram in frame 06. Side view and the ×2 toggle follow frame 07.
- With `exaggerate: 2` or `4`, drawn angles are multiplied. The label "Angles ×2" / "Angles ×4" appears, and the value texts stay true.
- When `lowPoint` is given (frame 06 "Side view · everything"), draw the dashed club arc and a "Low point" marker at that distance: negative = behind the ball, positive = ahead. When `lowPoint` is null, draw no marker. The club-head silhouette is tagged `Illustrative` ("Club head is a generic profile, drawn for orientation only").
- Spin loft shows only the measured value ("Spin loft · as reported 12.3°"). It is never computed.
- Spinning ball (`SpinBallDiagram`, used by the inspector's "Ball data" section):
  - A shaded sphere drawn orthographically from behind the ball, yawed ψ = 30°. Screen-right = (cos ψ, −sin ψ, 0), screen-up = ẑ, depth = (sin ψ, cos ψ, 0), where positive depth is away from the viewer. viewBox 320×320, radius 110 at the centre.
  - `data-role` elements:
    - `ball`
    - `spin-axis`: a line through the centre along ±`spinAxisVector(spinAxis)`, extended to 1.35R and labelled with `formatMeasurement('spinAxis', …)`
    - `spin-ring`: the great circle perpendicular to the axis; front half solid, back half dashed
    - `spin-arrow`: arrowheads on the ring pointing along the projected ω × p
    - 12 × `surface-mark`: dots fixed on the ball surface; marks with depth > 0 are faded
  - "Play rotation" / "Pause rotation" button. While playing, the marks rotate about the axis at (spin / 60) / `SPIN_DISPLAY_SLOWDOWN` rev/s. Label: "Rotation shown 50× slower than measured".
  - Captions: "Viewed from behind the ball · axis tilted right = ball curves right"; the drawing is tagged `Illustrative`.
  - Readouts: "Total spin" and "Spin axis" (measured), then "Backspin ≈" and "Sidespin ≈" tagged `Derived`.
  - Missing data:
    - Axis null → no axis, ring or arrows; "Spin axis · Not measured".
    - Spin null → play disabled; "Total spin · Not measured".
    - Either null → no derived rows.
    - Both null → "Ball spin not measured for this shot".
- Face impact:
  - Outlines in `faceOutlines.ts` follow frame 08: driver, wood/hybrid (shallower), and iron (hosel at heel).
  - Scale: 1 in = 40 px, with a 0.5 in grid labelled "Grid 0.5 in".
  - Face-on orientation (frames 05/08): right-handed → "Toe" on the left, "Heel" on the right, so a positive lateral impact plots left of centre. Left-handed mirrors this. Positive vertical plots above centre.
  - Draw no selected marker when `selected` is null. Draw other dots only when `showOthers` is true.

- [ ] **Step 1: Write the failing tests**

```tsx
test("top view (3.1, 1.4, −1.7, 1.9): all four roles drawn; labels '3.1° R','1.4° R','1.7° L','1.9° R'; club-path leans right", ...)
test("top view with clubPath null: no club-path element, text 'Club path · Not measured', no '0.0°' anywhere", ...)
test("top view all null: 'Club delivery not measured for this shot' and only target-line drawn", ...)
test("side view (2.6, 14.9, 12.8, 12.3): labels 'Attack angle 2.6° up','Dynamic loft 14.9°','Launch angle 12.8°','12.3°' as reported", ...)
test("side view spinLoft null with aoa/loft present: 'Spin loft · Not measured' and no 12.3 or 12.4 in the text", ...)
test("exaggerate 2 doubles the attack line's drawn angle, shows 'Angles ×2', labels unchanged; top view exaggerate 4 shows 'Angles ×4'", ...)
test("side view lowPoint −2.9 puts the 'Low point' marker behind the ball (left of it in the drawing); null draws no marker", ...)
test("spin ball (3000, 10): 'Total spin 3,000 rpm', 'Spin axis 10.0° R'; 'Backspin ≈ 2,954 rpm' and 'Sidespin ≈ 521 rpm R' tagged Derived", ...)
test('spin axis +10: the screen-right end of spin-axis is lower (larger y) than the left end; −10 reverses it; 0 → equal y (±0.5)', ...)
test('axis 0: the spin-arrow at the top of the ring points screen-right (projected ω × p for backspin)', ...)
test("'Play rotation' moves surface marks under fake timers/rAF and shows 'Rotation shown 50× slower than measured'", ...)
test("axis null → no spin-axis or spin-ring, 'Spin axis · Not measured', no derived rows; both null → 'Ball spin not measured for this shot'", ...)
test('face impact: selected marker present with selected; absent with null; other dots iff showOthers', ...)
test('face impact right-handed: Toe label x < Heel label x and selected {x:0.62} plots left of centre; left-handed mirrors both', ...)
test('face impact: positive y plots above centre; data-category matches category; no provisional note', ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/visualizations/src/diagrams.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run packages/visualizations` → PASS.
- [ ] **Step 5: Commit.** `git add packages/visualizations && git commit -m "feat(visualizations): 2D delivery, spinning ball and face impact diagrams"`

---

### Task 10: 3D replay geometry and camera projection

**Files:**
- Create: `packages/analytics/src/replay.ts` (exported from the index), `packages/visualizations/src/camera.ts`
- Test: `packages/analytics/src/replay.test.ts`, `packages/visualizations/src/camera.test.ts`

**Interfaces:**
- Consumes: `Shot`, `Handedness`, `Vec3` (domain); `trajectoryCurve` (Task 5).
- Produces:

```ts
// @fsa/analytics — scene coordinates in yards: x lateral (right +), y downrange (target +), z up; ball at origin
// Vec3 comes from @fsa/domain (Task 2)
export const CLUB_ARC_RADIUS_YD = 1.7;
export interface ReplayScene { shotId: string; handedness: Handedness;
  plane: { u: Vec3; w: Vec3; vPlaneDeg: number } | null;   // null when swingH or swingV is null
  clubArc: Vec3[] | null; impactIndex: number;              // 41 points; clubArc[impactIndex] is the ball
  faceDirection: Vec3 | null;                               // null when ftt is null
  ballFlight: Vec3[] | null; landing: Vec3 | null }         // 61 points; null when carry, lateral, launchH, height, launchV or descentV is null
export function buildReplayScene(shot: Shot, handedness: Handedness): ReplayScene;
export type ReplayPhase = 'Downswing' | 'Impact' | 'Ball flight' | 'Landing';
export function replayPhase(progress: number): ReplayPhase;  // [0,0.30) Downswing · [0.30,0.34) Impact · [0.34,0.95) Ball flight · [0.95,1] Landing
export function replayFrame(scene: ReplayScene, progress: number): { clubHead: Vec3 | null; ball: Vec3 };
// @fsa/visualizations
export type CameraPreset = 'dtl' | 'perspective' | 'side' | 'top';
export interface Camera { eye: Vec3; target: Vec3; up: Vec3; focal: number }
export function cameraFor(preset: CameraPreset, scene: ReplayScene, viewportWidth: number): Camera;
export function projectPoint(p: Vec3, cam: Camera, viewport: { width: number; height: number }): { x: number; y: number; depth: number } | null;
```

- Swing plane and club arc (H = swingH, V = swingV, A = aoa, R = `CLUB_ARC_RADIUS_YD`):
  - u = (sin H, cos H, 0) is the swing direction.
  - s = (−cos H, sin H, 0) is the golfer's side for a right-hander; negate it for a left-hander.
  - w = cos V·s + sin V·ẑ.
  - θb = asin(clamp(sin A / sin V, −1, 1)); centre c = R(cos θb·w − sin θb·u).
  - p(θ) = c + R(−cos θ·w + sin θ·u), sampled at 41 evenly spaced θ from θb − 100° to θb + 60°. `impactIndex` is the sample at θb (index 25).
  - If A is null, use θb = 0.
- Face direction: (sin ftt, cos ftt, 0).
- Ball flight:
  - Landing = (lat, √max(carry² − lat², 0), 0).
  - Ground track: quadratic Bézier from the origin through control Q = (tan(launchH)·Yl/2, Yl/2) to the landing, where Yl is the landing y.
  - Height z(t) is the y of Task 5's `trajectoryCurve` at the same t. Sample 61 t values evenly over [0, 1].
- `replayFrame`:
  - Downswing: interpolates the club head from `clubArc[0]` to `clubArc[impactIndex]`; ball at the origin.
  - Impact: club head at the origin.
  - Ball flight: club head at the last arc point; ball interpolated along `ballFlight`.
  - Landing: ball at `landing`.
- Camera presets (yards; g = −1 for right-handed, +1 for left-handed; Y = landing y, or 60 without a flight). `focal` = 0.9 × viewport width.

  | preset | eye | target | up |
  |---|---|---|---|
  | dtl | (0.6g, −4, 1.7) | (0, 0.5Y, 0) | ẑ |
  | perspective | (4g, −3, 2.5) | (0, 8, 0.5) | ẑ |
  | side | (−6g, 0.5, 1.0) | (0, 0.5, 0.8) | ẑ |
  | top | (0, 1, 8) | (0, 1, 0) | (0, 1, 0) |

- `projectPoint`: f = normalize(target − eye), r = normalize(f × up), v = r × f, d = p − eye, depth = d·f. Return `null` when depth ≤ 0.05; otherwise x = W/2 + focal(d·r)/depth and y = H/2 − focal(d·v)/depth.

- [ ] **Step 1: Write the failing tests** (Sept 19 2022 row 2: swingH 7, swingV 50.5, aoa −1.3, ftt 8.6, carry 198.9, lateral 10.4, launchH 2.2, height 149.7, launchV 19.1, descentV 54.6)

```ts
test('clubArc has 41 points and clubArc[impactIndex] is the origin (±1e-9)', ...)
test('every arc point lies in the swing plane: |p · (u × w)| < 1e-9', ...)
test('unit tangent at impact has vertical component sin(−1.3°) = −0.02269 (±1e-6)', ...)
test('right-handed w.x < 0, left-handed w.x > 0; arc start is behind the ball (y < 0) and up the plane (z > 0.5)', ...)
test('swingV null → plane and clubArc null, ballFlight still built', ...)
test('ballFlight: 61 points, starts at origin, ends at landing (10.4, 198.628, 0) ±1e-3, peak z within 1% of 49.9, first-segment heading 2.2° ±0.5°', ...)
test('carry null → ballFlight and landing null', ...)
test.each([[0,'Downswing'],[0.29,'Downswing'],[0.3,'Impact'],[0.33,'Impact'],[0.34,'Ball flight'],[0.94,'Ball flight'],[0.95,'Landing'],[1,'Landing']])('replayPhase(%d)', ...)
test('replayFrame: 0 → clubArc[0]; 0.3 → club head and ball at origin; 1 → ball at landing', ...)
// camera.test.ts
test('projectPoint(cam.target) is the viewport centre for every preset', ...)
test('a point along the camera right vector projects right of centre; a point above the target projects above centre (non-top presets)', ...)
test('a point behind the eye returns null', ...)
test("cameraFor('dtl') eye.x < 0 right-handed and > 0 left-handed; top camera up is (0,1,0)", ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/analytics/src/replay.test.ts packages/visualizations/src/camera.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces block. Use plain TS vector helpers; no 3D library.
- [ ] **Step 4: Run.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add packages && git commit -m "feat: illustrative 3D replay geometry and camera projection"`

---

### Task 11: Shot replay component (3D reconstruction)

**Files:**
- Create: `packages/visualizations/src/ShotReplay3D.tsx` (exported from the index)
- Test: `packages/visualizations/src/ShotReplay3D.test.tsx`

**Interfaces:**
- Consumes: `ReplayScene`, `replayPhase`, `replayFrame` (Task 10 analytics); `cameraFor`, `projectPoint`, `CameraPreset` (Task 10 visualizations); `SegmentedControl`, `ProvenanceTag` (Task 7); `formatMeasurement` (Task 2).
- Produces: `ShotReplay3D(props: { scene: ReplayScene; aoa: number | null; vPlane: number | null })`. It owns its UI state: camera `perspective`, progress 0.30, paused, speed 0.5×, loop on, and the show toggles below. Drawn elements carry `data-role`: `target-line`, `v-plane`, `club-arc`, `club-head`, `ball`, `ball-flight`, `face-direction`, `aoa-label`.

- Layout (frame 06 "Shot replay"):
  - Header "Shot replay" with the "Camera angle" segmented control: DTL, Perspective, Side, Top.
  - The illustrative banner from Global Constraints, with a `ProvenanceTag kind="illustrative"`.
  - SVG `viewBox="0 0 800 480"`, `width="100%"`:
    - ground grid and dashed target line labelled "Target line"
    - translucent V-plane quad labelled "V-plane {formatted}"
    - club arc: solid up to impact, dashed after
    - club head and shaft at the current frame
    - ball and dashed ball flight
    - "Attack angle {formatted}" label
    - corner texts "{DTL|Perspective|Side|Top} camera" and the current phase name
  - Controls:
    - "Step back one frame" / "Play replay" (becomes "Pause replay" while playing) / "Step forward one frame"; a step is 0.02.
    - Range input "Replay position" (0–100) with phase labels Downswing, Impact, Ball flight, Landing.
    - "Speed" select: 0.25×, 0.5×, 1×.
    - "Loop" checkbox.
  - "Show" fieldset: V-plane ✓, Club arc ✓, Angle of attack ✓, Face direction ☐, Ball flight ✓.
- Playback uses `requestAnimationFrame`: one full pass takes 4 s ÷ speed. Loop wraps to 0; otherwise playback stops at 1. Nothing autoplays.
- With `scene.plane` null: no plane or arc, and the note "Club delivery not measured for this shot — showing ball flight only". With `ballFlight` null: no flight, and the note "Ball flight not measured for this shot".

- [ ] **Step 1: Write the failing tests**

```tsx
test('banner shows "Illustrative reconstruction" and the not-captured-swing sentence; no text in the svg matches /\\d+(\\.\\d+)?\\s?s\\b/', ...)
test("camera buttons: Perspective pressed by default; clicking Top shows 'Top camera'", ...)
test('Show toggles: V-plane off removes [data-role=v-plane]; Face direction is off by default and on adds [data-role=face-direction]', ...)
test("slider 0 → 'Downswing', 32 → 'Impact', 60 → 'Ball flight', 100 → 'Landing'; at 100 the ball sits at the projected landing", ...)
test("Play toggles aria-label to 'Pause replay' and advances progress under fake timers/rAF", ...)
test("plane null → no v-plane or club-arc, note 'Club delivery not measured for this shot — showing ball flight only'", ...)
test("V-plane label reads 'V-plane 50.5°' and attack label 'Attack angle 1.3° down' for Sept 19 2022 row 2", ...)
```

- [ ] **Step 2: Run.** `npx vitest run packages/visualizations/src/ShotReplay3D.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run packages/visualizations` → PASS.
- [ ] **Step 5: Commit.** `git add packages/visualizations && git commit -m "feat(visualizations): illustrative 3D shot replay"`

---

### Task 12: App shell — mode, routes, store, Help and privacy notice

**Files:**
- Create: `apps/web/src/{mode.ts,routes.tsx,state/store.tsx,state/reducer.ts,layout/AppShell.tsx,layout/Nav.tsx,components/PrivacyNotice.tsx,components/NoAnalysis.tsx,pages/HelpPage.tsx,styles/app.css}`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/main.tsx` (import `@fsa/ui` tokens + fonts and `app.css`)
- Test: `apps/web/src/{mode,shell,reducer}.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`SessionDetails`, `DEFAULT_SESSION_DETAILS`); Task 6 (`stageFiles`, `buildWorkingSet`, `Filters`, `filterShots`, `displayOrder`, `reconcileSelection`, `stepSelection`); Task 4 (`decodeCsvBytes`, `sha256Hex`, `parseFlightScopeCsv`); Task 7 primitives.
- Produces:

```ts
export type AppMode = 'public';
export function readAppMode(value: string | undefined): AppMode;  // else throws Error(`Unsupported VITE_APP_MODE: ${value}. This build supports: public`)
export const PUBLIC_NAV: readonly { to: string; label: string }[]; // '/' Load Session CSV, '/overview' Overview, '/inspect' Shot Inspector, '/help' Help / Get Local Version
export const REPO_URL: string;                                     // import.meta.env.VITE_REPO_URL ?? 'https://github.com/'
export type InspectorTab = 'impact' | '3d' | '2d';                // default '2d'
export interface StoreState { staged: PreviewFile[]; workingSet: WorkingSet | null; details: SessionDetails; filters: Filters;
  selectedId: string | null; landingMode: LandingMode; inspectorTab: InspectorTab; busy: boolean }
export const initialState: StoreState;
export function reducer(state: StoreState, action: Action): StoreState;   // pure; Action is a discriminated union
export function WorkingSetProvider(props: { children: ReactNode; initial?: StoreState }): JSX.Element;
export function AppRoutes(): JSX.Element;   // <AppShell> + <Routes>, no router: App = HashRouter + WorkingSetProvider + AppRoutes; tests wrap in MemoryRouter
export function useWorkingSet(): StoreState & { visibleShots: Shot[];    // displayOrder(filterShots(ws, filters))
  addFiles(files: readonly File[]): Promise<void>; setInclude(key: string, include: boolean): void; removeStaged(key: string): void;
  analyze(): void; clear(): void; setDetails(patch: Partial<SessionDetails>): void; setClub(club: string | null): void; setFile(fileId: string | null): void;
  select(id: string): void; step(delta: 1 | -1): void; setLandingMode(m: LandingMode): void; setInspectorTab(t: InspectorTab): void };
```

- Reducer rules:
  - `analyze` builds the working set from `staged`, resets filters to all, and selects the first visible shot.
  - A filter change runs `reconcileSelection`.
  - `clear` returns `initialState` (no staged files, no working set, `DEFAULT_SESSION_DETAILS`).
  - `analyze` keeps the current `details`; nothing ever writes `details` except `setDetails`.
- `addFiles` reads `file.arrayBuffer()`, decodes, hashes, parses and calls `stageFiles`. It adds the `decoded_as_windows_1252` warning when applicable.
- Routes (HashRouter): `/` Load page (a placeholder until Task 13), `/overview`, `/inspect`, `/help`, and `*` → `<Navigate to="/" />`. Overview and Inspector show `NoAnalysis` when `workingSet` is null: title "No analysis yet", body "Load one or more FlightScope CSV exports to see this view.", action button "Load Session CSV" → `/`.
- Nav: header with the brand (frame 04 mark + "FlightScope Analytics") and `PUBLIC_NAV`. "Load Session CSV" is styled as the primary button. Below 640 px, the nav becomes a fixed bottom tab bar with 44 px+ targets (frame 11).
- Exact copy:
  - `PrivacyNotice`: "Browser-only analysis. Your CSV files are read and analyzed in this tab. Nothing is uploaded, saved or sent anywhere. Refreshing or closing the page ends the analysis."
  - Help page:
    - the `PrivacyNotice`
    - "This viewer is stateless: it keeps no copy of your files once the page is refreshed or closed. While the page is open, the data lives only in this tab's memory."
    - a link "Want saved history? Run Local App" → `${REPO_URL}#local-app`
    - short sections on what the CSV columns mean, the impact sign convention (lateral: + toe, − heel, 0 centered; vertical: + high), the dispersion modes table, and the fact that the 3D replay is illustrative

- [ ] **Step 1: Write the failing tests**

```tsx
test("readAppMode('public') → 'public'; readAppMode('local') and undefined throw the exact message", ...)
test('nav renders exactly the four PUBLIC_NAV labels in order; no text matches /save|session library|history|calendar/i', ...)
test("unknown hash route redirects to the Load page; '#/overview' with no data shows 'No analysis yet' + 'Load Session CSV'", ...)
test("Help shows the stateless copy and a link 'Want saved history? Run Local App' to REPO_URL#local-app", ...)
test('reducer: analyze selects first visible; setClub to another club moves selection to that club’s first shot; clear → initialState', ...)
test("reducer: setDetails({name:'Range day', date:'2026-11-07'}) survives analyze and filter changes; clear resets to DEFAULT_SESSION_DETAILS", ...)
test('store.addFiles with the Sept 19 2022 fixture File stages one ready file with 16 shots', ...)
```

- [ ] **Step 2: Run.** `npx vitest run apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run apps/web` → PASS. `npm run build:public` → exit 0.
- [ ] **Step 5: Commit.** `git add apps/web && git commit -m "feat(web): public-mode shell, hash routes, in-memory store, help and privacy copy"`

---

### Task 13: Load Session CSV — pick, preview, analyze, clear

**Files:**
- Create: `apps/web/src/pages/LoadPage.tsx`, `apps/web/src/components/{FileDropZone.tsx,PreviewList.tsx,PreviewRow.tsx,SessionDetailsForm.tsx}`
- Modify: `apps/web/src/routes.tsx` (mount LoadPage at `/`)
- Test: `apps/web/src/pages/LoadPage.test.tsx`

**Interfaces:**
- Consumes: `useWorkingSet` (Task 12); `PreviewFile` (Task 6); `fieldDef(...).label` for missing-column names; `SessionDetails` (Task 2); `SegmentedControl` (Task 7).
- Produces: the route `/` UI that Task 16/17 e2e tests drive:
  - `input[type=file]` labelled "Load Session CSV"
  - buttons "Load Session CSV", "Add files", "Analyze files", "Clear analysis"
  - per-file checkbox labelled "Include {file name}"
  - fields "Session name", "Date", "Notes", and the "Golfer" segmented control (Right-handed / Left-handed)
- Produces: `SessionDetailsForm(props: { value: SessionDetails; onChange(patch: Partial<SessionDetails>): void })` for reuse by Task 14's "Edit details".

- Layout (frame 02):
  - H1 "Load Session CSV", the primary button, a drop zone ("or drop one or more .csv files here"), `PrivacyNotice`, and the unobtrusive link "Want saved history? Run Local App".
  - Where frame 02 has its "Add to" block, show a "Session details" block (`SessionDetailsForm` bound to the store):
    - "Session name" (placeholder "Untitled session"), "Date" (`<input type="date">`), "Notes" (textarea), "Golfer" (Right-handed default).
    - Helper text: "Set by you. File names and CSV contents are never used for the name or date. Kept in this tab only."
    - All fields are optional.
- Preview rows:
  - Ready: name, "{n} shots · {k} summary rows excluded", "Missing columns: {labels}" when any, "{w} warnings" with a `<details>` listing each warning's message, row and column.
  - Duplicate: "Byte-identical to {other name} · not included", with an unchecked "Include {name}" box.
  - Invalid: "Cannot analyze: {error.message}" in `--danger`, with the checkbox disabled.
- Footer: "{f} files · {n} shots ready" (included files only), "Analyze files" (disabled when n = 0), "Clear analysis".
- Analyze → `navigate('/overview')`. Clear → empty list, focus on the "Load Session CSV" button.

- [ ] **Step 1: Write the failing tests** (Files built from `fixtures/flightscope` bytes via `node:fs`)

```tsx
test('file input has multiple and accept including .csv', ...)
test("uploading the three fixtures shows '16 shots · 2 summary rows excluded', '26 shots · 6 summary rows excluded', '91 shots · 14 summary rows excluded' and footer '3 files · 133 shots ready'", ...)
test("Sept 19 2022 bytes as a.csv and b.csv: b shows 'Byte-identical to a.csv · not included'; footer '1 file · 16 shots ready'; ticking 'Include b.csv' → '2 files · 32 shots ready'", ...)
test("'name,email\\nA,b' shows 'Cannot analyze:' and a disabled checkbox; footer excludes it", ...)
test("a fixture with the two impact columns removed shows 'Missing columns: Lateral impact, Vertical impact'", ...)
test("'Analyze files' navigates to /overview with 133 shots in the store", ...)
test("'Clear analysis' empties the list and disables 'Analyze files'", ...)
test("after uploading the dated fixtures, 'Session name' and 'Date' are still empty and 'Right-handed' is pressed", ...)
test("typing 'Range day' and 2026-11-07 then Analyze → store.details {name:'Range day', date:'2026-11-07', handedness:'right'}", ...)
test("'Clear analysis' also resets the session details fields", ...)
```

- [ ] **Step 2: Run.** `npx vitest run apps/web/src/pages/LoadPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pluralize counts in all copy: "1 file", "1 shot", "2 files", "16 shots".
- [ ] **Step 4: Run.** `npx vitest run apps/web` → PASS.
- [ ] **Step 5: Commit.** `git add apps/web && git commit -m "feat(web): Load Session CSV preview with duplicate and invalid-file handling"`

---

### Task 14: Overview — filters, KPIs, dispersion, trajectory, linked shot table

**Files:**
- Create: `apps/web/src/pages/OverviewPage.tsx`, `apps/web/src/components/{FilterBar.tsx,KpiGrid.tsx,DispersionPanel.tsx,TrajectoryPanel.tsx,SelectedShotCard.tsx,ShotTable.tsx,ShotCards.tsx}`, `apps/web/src/test/renderWithData.tsx`
- Test: `apps/web/src/pages/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 5, 6, 8, 12, 13 (`sessionTitle`, `formatSessionDate`, `useWorkingSet`, `headlineMetrics`, `HEADLINE_KEYS`, `dispersionStats`, `trajectoryCurve`, `clubCounts`, `selectionPosition`, `DispersionPlot`, `TrajectoryPlot`, `SessionDetailsForm`).
- Produces: `renderWithData(fixtures: string[], opts?: { route?: string; details?: Partial<SessionDetails> }): RenderResult & { store(): StoreState }`. It parses the named fixtures in order, stages them, analyzes, and renders `<MemoryRouter initialEntries={[route ?? '/overview']}><WorkingSetProvider initial={…}><AppRoutes/></WorkingSetProvider></MemoryRouter>`. Task 15 uses it. Shot table rows: `tr[data-shot-id]`, class `shots-table`; phone cards: class `shots-cards`.

- Layout (frame 04; phone frame 11; tablet frame 09):
  - Session header as in frame 04, without the "Sessions /" breadcrumb (cloud has no library):
    - H1 = `sessionTitle(details)`.
    - Meta line: `formatSessionDate(details.date)` · "{f} source files" · "{n} shots" · the distinct non-null `mode` values joined by ", " (e.g. "Outdoor") · a chip "In this browser only".
    - Notes paragraph when notes are non-empty.
    - Button "Edit details" opens `SessionDetailsForm` inline with "Done". Edits apply live to the store. There is no "Append CSV files" or "Manage or remove files"; the Load page covers both.
  - Filter bar: club chips ("All {n}" + `clubCounts` within the current file filter) and the "Source file" select. Options: "All files · {n} shots", then "File {ordinal} · {name} · {count}".
  - "Averages · {club or All clubs}[ · File {k}] · {n} shots", followed by KPI tiles in `HEADLINE_KEYS` order. Labels: Carry, Total, Ball speed, Club speed, Smash factor, Spin, Mean lateral, Club path. Ball metrics use `ball` accent, club metrics `club`. Sub: "± {sd} · n {n}" when n = of, else "± {sd} · n {n} of {of}"; omit "± …" when sd is null.
  - Dispersion panel: the H2 is the mode's panel title from the Global Constraints table ("Landing dispersion · top view" / "Total Distance vs. Landing Offset"), with a Carry/Total segmented control. `dl` with "Average lateral error", "{Carry|Total} SD", "Lateral SD", "Mean position". Caption: "1σ covariance ellipse · about 39% expected coverage if shots were bivariate normal · observed: {k} of {n} shots inside. Cross: mean landing." With no ellipse: "Ellipse needs at least 3 shots with lateral and {carry|total} values."
  - Trajectory panel, then the selected-shot card. The card has Prev/Next ("Previous shot"/"Next shot"), a "Choose shot" select (option "{club} · shot {label} · {carry}"), "{i} of {n}", 8 values like frame 04 (Impact uses `formatImpact`), and a link "Open shot inspector" → `/inspect`.
  - "Shots" table: columns Shot, Club, Ball mph, Launch, Spin, Carry, Total, Lateral, Club mph, Smash, Path, Face to path, Impact (in).
    - With All clubs, rows are grouped by club (rowgroup header "{club} · {n} shots").
    - Each row: `tabIndex=0`, `aria-selected`, `title="File {ordinal} · {name} · CSV row {sourceRow}"`. Click/Enter/Space selects.
    - All filtered rows are shown (no pagination). Footer: "“Not measured” means the CSV held no value; it is never treated as zero".
  - `ShotCards` (phone): the same rows as compact cards. CSS shows `.shots-cards` and hides `.shots-table` below 640 px, and the reverse above.
  - Zero visible shots → "No shots match these filters" + button "Show all clubs".

- [ ] **Step 1: Write the failing tests** (fixtures in order: Sept 19 2022, Sept 19, Session)

```tsx
test("no details set: h1 'Untitled session', meta 'No date set', '3 source files', '133 shots', 'Outdoor', 'In this browser only'; no h1/h2 contains 'Sept' or '2022'", ...)
test("details {name:'Range day', date:'2026-11-07', notes:'Shallowing AoA'}: h1 'Range day', meta '7 Nov 2026 (set by you)', notes paragraph shown", ...)
test("'Edit details' → changing Session name to 'Wedges' updates the h1 immediately", ...)
test("dispersion H2 is 'Landing dispersion · top view'; switching to Total shows 'Total Distance vs. Landing Offset' and 'Total SD'; 'Total Dispersion' never appears", ...)
test("club chips in order: All 133, Driver 34, 4 Hybrid 3, 7 Iron 39, 8 Iron 15, 6 Iron 7, 9 Iron 7, Pitching Wedge 12, Gap Wedge 16", ...)
test("Driver chip → 'Averages · Driver · 34 shots'; Club path tile sub ends 'n 32 of 34'; Carry tile 'n 34'", ...)
test("All clubs: Carry tile 'n 132 of 133' (the all-null Pitching Wedge row is excluded, not zero)", ...)
test("source select lists 'File 1 · FlightScope Golf Session Sept 19 2022.csv · 16'; choosing it with Driver → caption 'observed: 6 of 16 shots inside'", ...)
test('clicking a dispersion point selects that shot: card and table row (aria-selected) follow', ...)
test("Enter on a focused table row selects it; 'Next shot' follows display order within filters; position text '2 of 34'", ...)
test("File 1 Shot 14 row shows 'Not measured' in Path and Face to path cells", ...)
test("table row title 'File 1 · FlightScope Golf Session Sept 19 2022.csv · CSV row 15' for File 1 Shot 14", ...)
test("Driver + File 2 (no Driver shots) → 'No shots match these filters'; 'Show all clubs' sets club to All and shows File 2's 26 shots", ...)
test('a 2-shot filter shows no ellipse and the needs-3-shots caption', ...)    // use a synthetic 2-row CSV
test('both .shots-table and .shots-cards render the same shot ids', ...)
```

- [ ] **Step 2: Run.** `npx vitest run apps/web/src/pages/OverviewPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run apps/web` → PASS.
- [ ] **Step 5: Commit.** `git add apps/web && git commit -m "feat(web): overview with filters, KPIs, dispersion, trajectory and linked shot table"`

---

### Task 15: Shot Inspector — face impact, 3D reconstruction, 2D reconstruction

**Files:**
- Create: `apps/web/src/pages/InspectorPage.tsx`, `apps/web/src/components/{ShotHeader.tsx,HeadTiles.tsx,BallDataPanel.tsx,ImpactTab.tsx,Replay3DTab.tsx,Reconstruction2DTab.tsx,AllMeasurements.tsx}`
- Modify: `apps/web/src/routes.tsx`
- Test: `apps/web/src/pages/InspectorPage.test.tsx`

**Interfaces:**
- Consumes: `renderWithData` (Task 14); `useWorkingSet`, `InspectorTab` (Task 12); Task 9 diagrams; `ShotReplay3D` (Task 11); `buildReplayScene` (Task 10); `summarize`, `spinComponents` (Task 5); `clubCategory`, `formatImpact`, `FIELD_DEFS`, `formatMeasurement`, `sessionTitle`, `handednessLabel` (Task 2); `Tabs`, `SegmentedControl`, `ProvenanceLegend`, `ProvenanceTag`, `KpiTile` (Task 7).
- Produces: route `/inspect`.
  - Tabs, in this order: "Face impact" (`impact`), "3D reconstruction" (`3d`), "2D reconstruction" (`2d`). Below 640 px the labels shorten to "Impact" / "3D" / "2D" (frame 12).
  - 2D diagrams carry class `delivery-top` / `delivery-side`.

- Layout (frames 05, 06, 07, 10, 12):
  - Breadcrumb "{sessionTitle} / Shot {label}", where the title links to `/overview`.
  - H1 "Shot {shotLabel ?? sourceRow} · {club}".
  - Meta chips: "File {ordinal} · {name}", "CSV row {sourceRow}", the shot's mode (e.g. "Outdoor"), and `handednessLabel(details.handedness)` (e.g. "Right-handed"). The handedness chip is a button that opens a small Right-handed / Left-handed choice and calls `setDetails`.
  - Prev/Next, the "Choose shot" select (option "{club} · shot {label} · {carry}"), "{i} of {n}", and "Back to overview".
  - Head tiles: Carry, Spin, Club path, Face to path, Attack angle, Impact.
  - **Ball data** section: a single view with no tabs, placed between the head tiles and Club data.
    - The header label "Ball data" has an orange (`--ball`) dot, mirroring frame 06's "Club data" label with its blue dot.
    - Left: `SpinBallDiagram` with its spin readouts.
    - Right: readout groups, each value tagged measured, or "Not measured" when null:
      - "Launch": Ball speed, Launch V, Launch H
      - "Flight": Carry, Total, Apex height, Lateral, Descent angle, Curve, Flight time
    - Below 640 px the sphere stacks above the readouts, two per row.
  - **Club data** section: the label "Club data" (blue dot) and the tabs as above. Tab state lives in the store, so it survives navigation.
  - `ProvenanceLegend` and `AllMeasurements` sit below the Club data section on every tab.
- Face impact tab (frames 05, 10):
  - Heading "Face impact · {Driver|Wood/hybrid|Iron} face".
  - `FaceImpactDiagram` with `handedness = details.handedness`.
  - `others` = other visible shots of the same club with both impact values; "Show session impacts" toggle (default on).
  - Stats: "Shots with impact data {k} of {N}", "Average strike" (derived, `formatImpact` of the means), "Spread" (derived, "± {sdX} · ± {sdY} in").
  - When the selected shot lacks impact: "Impact not measured for this shot" and "CSV row {r} has no impact values. No marker is drawn and nothing is estimated."
- 3D reconstruction tab (frame 06):
  - `ShotReplay3D` with `buildReplayScene(shot, details.handedness)`.
  - Below it: "Top view · face to path" (`HorizontalDeliveryDiagram exaggerate={4}`) and "Side view · everything" (`VerticalDeliveryDiagram exaggerate={2} lowPoint={m.lowPoint}`).
  - These sit side by side at ≥ 1024 px and stack below that.
- 2D reconstruction tab (frame 07):
  - "Impact geometry · side view" (`VerticalDeliveryDiagram`) with the "True scale" / "Exaggerated ×2" toggle.
  - "Measured angles" list.
  - "Against session average": dynamic loft, launch and attack angle vs the mean over visible shots of the same club, as "{label} {value} vs {mean}", with the note "{club} averages from {n} of {N} shots that have club data."
  - Then "Impact geometry · top view" (`HorizontalDeliveryDiagram exaggerate={1}`); spec §7.2 requires both delivery views. Ball spin is in the Ball data section, not here.
  - Below 640 px a "Side view / Top view" segmented control shows one diagram at a time; the other gets class `is-hidden-phone`.
- `AllMeasurements`: `<details>` with summary "All measurements · {k} of 27 available".
  - Rows: every FIELD_DEF label → `formatMeasurement`, tagged `measured` or `unavailable`. Then derived Backspin/Sidespin tagged `derived`, then Shot type, Mode, Location.
  - Quality flags in plain words: no_measurements → "No ball or club measurements in this row"; check_face_to_path → "Face to path differs from face-to-target minus club path beyond rounding"; check_smash → "Smash factor differs from ball speed ÷ club speed beyond rounding".

- [ ] **Step 1: Write the failing tests** (fixtures in order: Sept 19 2022, Sept 19, Session; select via store)

```tsx
test("tabs read 'Face impact', '3D reconstruction', '2D reconstruction' in that order; '2D reconstruction' is selected by default", ...)
test("'Ball data' section precedes the 'Club data' tablist in DOM order and stays rendered on all three tabs", ...)
test("File 1 Shot 1 Ball data: 'Total spin 5,162 rpm', 'Spin axis 1.0° R', derived 'Backspin ≈ 5,161 rpm' and 'Sidespin ≈ 90 rpm R'; 'Launch V 19.1°', 'Flight time 7.6 s'", ...)
test("Session row 78 Ball data: 'Ball spin not measured for this shot' and every Launch/Flight readout 'Not measured'", ...)
test("File 1 Shot 15: h1 'Shot 15 · Driver', chips 'File 1 · FlightScope Golf Session Sept 19 2022.csv', 'CSV row 16', 'Outdoor', 'Right-handed'; Impact tile '0.23 in toe · 0.84 in high'", ...)
test("breadcrumb shows 'Untitled session / Shot 15'; with details.name 'Range day' it shows 'Range day / Shot 15'", ...)
test("choosing Left-handed from the chip sets details.handedness 'left' and mirrors the face drawing (Toe label moves right of Heel)", ...)
test('switching tabs keeps selectedId, club filter and file filter unchanged', ...)
test("File 1 Shot 14, 2D tab: top view 'Club path · Not measured', 'Face to target · Not measured', 'Face to path · Not measured' and launch 8.9° R; side view 'Spin loft · Not measured'; no '0.0°' in the panel", ...)
test("File 1 Shot 14, 3D tab: replay shows the illustrative banner; swingV is null so 'Club delivery not measured for this shot — showing ball flight only'", ...)
test("File 1 Shot 2, 3D tab: 'Top view · face to path' shows 'Angles ×4'; 'Side view · everything' shows a 'Low point' marker", ...)
test("File 1 + Driver, Shot 1, Face impact: 'Impact not measured for this shot', no selected-impact marker, 3 other-impact dots, 'Shots with impact data 3 of 16'", ...)
test("club Driver, all files: Next from File 1 Shot 16 goes to chips 'File 3 · FlightScope Golf Session.csv', 'CSV row 2'", ...)
test("Session row 78 (Pitching Wedge shot 4): 'All measurements · 1 of 27 available' and 'No ball or club measurements in this row'", ...)
test("All measurements labels Time as 'Flight time'", ...)
test('2D tab below-640 control: Side/Top segmented control toggles is-hidden-phone between .delivery-side and .delivery-top', ...)
```

- [ ] **Step 2: Run.** `npx vitest run apps/web/src/pages/InspectorPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `npx vitest run apps/web` → PASS. `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit.** `git add apps/web && git commit -m "feat(web): shot inspector with face impact, 3D and 2D reconstruction tabs"`

---

### Task 16: Public-build privacy and subpath verification

**Files:**
- Create: `scripts/verify-public-build.mjs`, `scripts/verify-public-build.test.ts`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/privacy.spec.ts`
- Modify: root `package.json` scripts, `vitest.config.ts` (include `scripts/` in the node project)

**Interfaces:**
- Produces:
  - `verifyPublicBuild(distDir: string): { ok: boolean; problems: string[] }` (exported). The CLI `node scripts/verify-public-build.mjs apps/web/dist` prints the problems and exits 1 on failure.
  - Scripts: `verify:public`, `build:e2e` (`PAGES_BASE=/fsa-e2e/ npm run build:public`), `preview:e2e` (`PAGES_BASE=/fsa-e2e/ npm run preview -w @fsa/web -- --port 4173 --strictPort`), `e2e` (`playwright test`), `ci:public` (`npm run typecheck && npm test && npm run build:public && npm run verify:public && npm run e2e`).
  - `e2e/helpers.ts`: `FIXTURES` (absolute paths, in order Sept 19 2022, Sept 19, Session) and `loadAndAnalyze(page, files = FIXTURES)`.
- `verifyPublicBuild` rules:
  - `index.html` exists.
  - No file with extension `.csv .py .sqlite .sqlite3 .db .env`.
  - No `.js/.html/.css` file contains `/api/`, `localStorage`, `sessionStorage`, `indexedDB`, `serviceWorker`, `document.cookie` or `sendBeacon`.
  - `index.html` has no `src`/`href` starting with `http://`, `https://` or `//`.
- Playwright: Chromium, `baseURL: 'http://localhost:4173/fsa-e2e/'`, webServer `npm run build:e2e && npm run preview:e2e`, `testDir: 'e2e'`.

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/verify-public-build.test.ts (temp dirs)
test('clean dist passes', ...); test("a js file with 'localStorage.setItem' fails naming the file", ...)
test('a .csv in dist fails', ...); test('index.html with https:// script src fails', ...)
// e2e/privacy.spec.ts
test("three CSVs analyze as one temporary working set → overview meta shows '3 source files', '133 shots' and 'In this browser only'", ...)
test('no request leaves the origin, uses a non-GET method, carries a body, or targets /api/', ...)  // page.on('request') across load, analyze, overview, and all three inspector tabs including 3D replay playback
test('no durable storage: localStorage/sessionStorage length 0, document.cookie empty, indexedDB.databases() [], serviceWorker registrations [], context.cookies() []', ...)
test("'Clear analysis' then /#/overview shows 'No analysis yet'; analyze again with Session name 'Range day' then reload → 'No analysis yet' and the Load page's 'Session name' field is empty", ...)
test("direct navigation to /fsa-e2e/#/help and refresh both show 'Want saved history? Run Local App'; every asset URL starts with /fsa-e2e/", ...)
```

- [ ] **Step 2: Run.** `npx vitest run scripts && npx playwright install chromium && npm run e2e`. Expected: FAIL (script and config missing).
- [ ] **Step 3: Implement.** Give `apps/web/index.html` an icon link served under the base (an SVG in `apps/web/public/`) so the browser never requests `/favicon.ico` from the origin root. If a third-party dependency trips a forbidden string, report it (DONE_WITH_CONCERNS) instead of weakening the rule.
- [ ] **Step 4: Run.** `npm run ci:public` → every stage passes; Playwright reports 5 passed.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "test: public build privacy, storage and subpath verification"`

---

### Task 17: Responsive acceptance, GitHub Pages workflow, README

**Files:**
- Create: `e2e/responsive.spec.ts`, `.github/workflows/pages.yml`, `README.md`
- Modify: `apps/web/src/styles/app.css` and component styles as the tests require

**Interfaces:**
- Consumes: `loadAndAnalyze`, `FIXTURES` (Task 16); class names `shots-table`, `shots-cards`, `delivery-top`, `delivery-side`, `is-hidden-phone` (Tasks 14–15).
- Produces: `.github/workflows/pages.yml`:
  - Runs on push to `main` and `workflow_dispatch`; permissions `contents: read, pages: write, id-token: write`; concurrency group `pages`.
  - Build job: checkout; setup-node with `node-version-file: .nvmrc` and npm cache; `npm ci`; `npx playwright install --with-deps chromium`; `npm run ci:public`. Then `npm run build:public` with env `PAGES_BASE: /${{ github.event.repository.name }}/` and `VITE_REPO_URL: ${{ github.server_url }}/${{ github.repository }}`, then `npm run verify:public`, then `actions/upload-pages-artifact` (`path: apps/web/dist`).
  - Deploy job: `actions/deploy-pages`, environment `github-pages`.
  - Use the current major versions of the official actions.
- README sections:
  - What it is
  - Privacy (the Cloud mode guarantees in plain words)
  - Use (open the Pages URL → Load Session CSV)
  - Develop (`nvm use`, `npm ci`, `npm run dev`, `npm test`, `npm run e2e`)
  - Deploy (Settings → Pages → Source: GitHub Actions; base path is set automatically)
  - `## Local App` (anchor `#local-app`): FastAPI + SQLite via Docker Compose is planned and not in this release
  - Known limitations: header map validated only against these 2022 Mevo Gen 2 exports; the 3D replay and trajectory are illustrative; the Total dispersion mode is a hybrid plot (total distance vs landing offset), not the resting position

- [ ] **Step 1: Write the failing tests** `e2e/responsive.spec.ts`, for viewports 390×844 (`hasTouch`), 820×1180 and 1440×900:

```ts
test('no horizontal body overflow on Load (files staged), Overview, and Inspector (Face impact, 3D reconstruction, 2D reconstruction)', ...)  // scrollWidth <= innerWidth
test('390: every visible button, select, [role=tab], nav link and checkbox label is ≥ 44px tall', ...)
test('390: .shots-cards visible, .shots-table hidden; first two KPI tiles share a row; on the 2D tab exactly one of .delivery-top/.delivery-side visible; the 3D replay svg and the Ball data sphere fit the viewport width', ...)
test('390 touch: tapping a shot card selects it; tapping Next shot advances the position text', ...)
test("820: inspector tabs visible; dispersion 'Target' label visible; replay camera and Show controls wrap without overflow", ...)
test('1440: .shots-table visible and not clipped (scrollWidth <= clientWidth of its container); dispersion and trajectory panels share a row', ...)
test('1440 keyboard: Tab to a table row + Enter selects it; ArrowRight on the tablist activates the next tab', ...)
// each test saves page.screenshot to test-results/screens/<route>-<width>.png
```

- [ ] **Step 2: Run.** `npx playwright test e2e/responsive.spec.ts`. Expected: FAIL on whatever layout gaps exist; record which assertions failed in the report.
- [ ] **Step 3: Fix layouts** (CSS and markup only; no behavior changes) until the spec passes. Write `pages.yml` and `README.md`.
- [ ] **Step 4: Run.** `npm run ci:public` → all pass. Lint the workflow with `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest` → no output, exit 0.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: responsive acceptance tests, GitHub Pages workflow and README"`
