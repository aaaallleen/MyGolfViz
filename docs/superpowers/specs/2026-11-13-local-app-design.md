# MyGolfViz Local App — design

Date: 2026-11-13 · Status: draft for review

Sources: `FlightScope Analytics Engineering Spec v0.4.docx` (also `docs/spec/engineering-spec-v0.4.md`),
`Desktop_design.md`, the design frames in `docs/design/frames/`, and the brainstorming conversation of
2026-11-12/13. Where this document and those sources disagree, **this document wins** (see §12).

Items marked *(builder's call)* were decided during the write-up, not by the product owner. They can
be changed without asking, as long as the goals and anti-goals still hold.

---

## 1. Why

The public Cloud Viewer (GitHub Pages) is close to done. It only analyses a temporary working set:
refreshing the page loses everything. The owner wants to look back over their range sessions and
answer three questions the viewer can't:

1. **History.** What did I hit in earlier sessions? I want to reopen any of them.
2. **Progression.** For one club, is carry going up, dispersion tightening, spin getting more
   consistent, and so on, across sessions?
3. **What changed.** Given two good shots, usually from different days, what is different about
   spin, launch, trajectory, direction and delivery?

The Local App runs the **same React frontend** in a local mode, adds a Python/FastAPI backend and a
SQLite database, and ships as a **Mac desktop app named MyGolfViz**.

**Who it's for:** the owner, on their own Apple Silicon Mac, first. Other people downloading it is a
nice-to-have: nothing should block it, but v1 doesn't ship signed installers.

**Success:** the owner opens MyGolfViz.app, imports today's CSVs into a session they name, closes the
app, reopens it next week, and finds every session on a list and a calendar. They can see driver
progression across sessions and compare today's best drive with last month's.

## 2. Goals, non-goals, anti-goals

### Goals (first release)

- One React + TypeScript frontend (`apps/web`), built in **public** or **local** mode at compile time.
- Local mode keeps sessions, imports, shots, the original CSV bytes, session details (name, date,
  notes, handedness), shot exclusions and the progression dashboard settings in **SQLite** plus a
  managed folder of original CSVs.
- Session library with **list and calendar** views (frames `00`, `01`).
- Import into a **new or existing session**, chosen explicitly (frames `02`, `03`).
- Remove one import, reorder imports, rename/edit and delete sessions.
- **Progression** dashboard (§7).
- **Compare two shots** (§8).
- **MyGolfViz.app** for Apple Silicon macOS: Electron with the Python backend bundled. No Python,
  Node or Docker install needed.
- Works fully offline.

### Non-goals (first release)

- The public viewer's behaviour or bundle changing in any way (apart from shared-code refactors that
  keep it identical).
- Accounts, cloud sync, FlightScope Cloud integration.
- Windows builds, Intel Mac builds, code signing, notarisation, auto-update, a GitHub Releases
  pipeline. (Don't design these out: no hard-coded Mac-only paths in Python, no Mac-only Python
  dependencies.)
- iPad/phone access over the LAN. The backend binds to loopback only.
- Backup/restore screens. (An automatic database backup before migrations *is* in scope.)
- Automatic mishit detection (§13).
- A Python CSV parser.
- Docker Compose (spec v0.4 §4.3 is replaced by Electron).

### Anti-goals (failure even if it "works")

- The public build ships any API client, persistence code or `/api/` string, or makes any request
  carrying user data. `scripts/verify-public-build.mjs` must still pass unchanged.
- A second copy of any screen, chart or analytics function for local mode.
- A session's name, date or grouping inferred from a filename or CSV contents.
- A missing measurement stored or shown as 0. A missing impact location counted as a centred strike.
- A failed or interrupted import leaves half a file's shots, or an orphaned CSV, or a DB row pointing
  at a missing CSV.
- An app update or restart loses user data.
- Progression quietly drops bad shots and shows the smaller spread as improvement.
- A user has to install Python, Node or anything else to run MyGolfViz.app.

## 3. Constraints and facts about the existing code

- npm workspaces: `apps/web` (`@fsa/web`) and `packages/{analytics,csv-parser,domain,ui,visualizations}`.
  Node ≥ 24. Vite, React 19, React Router 8, Vitest, Playwright.
- `apps/web/src/mode.ts` currently accepts only `VITE_APP_MODE=public`. `PUBLIC_NAV` drives `Nav.tsx`.
- State lives in `apps/web/src/state/{reducer.ts,store.tsx}`: one in-memory `WorkingSet`
  (`files`, `shots`), `SessionDetails`, filters, selection, and `excluded`, a set of
  **exclusion keys `sha256:sourceRow`**.
- The parser (`@fsa/csv-parser`, `PARSER_VERSION = '1.0.0'`) produces `Shot` objects with `m`
  (all 27 `MeasurementKey`s, `number | null`), `raw` (original strings), `flags`, `sourceRow`,
  `shotLabel`, `club`, `shotType`, `mode`, `location`. `SourceFile` carries `sha256`, `byteLength`,
  `ordinal`, `parserVersion`.
- The Mevo Gen 2 export has every metric the progression categories need, including Roll, Low Point,
  Curve Dist, DescentV, Spin Loft and Lateral/Vertical Impact (often `-`).
- `scripts/verify-public-build.mjs` fails the public build if it contains `/api/`, `localStorage`,
  `sessionStorage`, `indexedDB`, `serviceWorker`, `document.cookie` or `sendBeacon`, or `.py`, `.db`,
  `.sqlite` or `.csv` files.
- The app icon is `apps/web/public/icon.svg` (eye golf ball). Design tokens are in `packages/ui/src/tokens.css`
  and `docs/design/README.md`.

## 4. Architecture

```
MyGolfViz.app (Electron, step 2)
├── main process ── spawns ──► mygolfviz-api (PyInstaller binary)
│                                ├── FastAPI  /api/v1/*
│                                ├── serves the local React build at /
│                                └── SQLite + originals/ in the data dir
└── BrowserWindow ──► http://127.0.0.1:<port>/   (same origin as the API)
```

- **One backend process owns the data folder.** It serves both the API and the built local frontend,
  so the UI and the API share an origin (no CORS needed).
- **Step 1 runs without Electron:** `npm run local` (or equivalent) starts the backend; the owner
  opens the printed URL in a normal browser tab. The tab is only the screen; data lives in SQLite.
  For frontend development, Vite's dev server proxies `/api` to the backend *(builder's call)*.
- **A single-instance lock** (lock file in the data folder) stops two backends (say, browser-mode
  and the app) from writing the same database. The second one exits with a clear message.

### 4.1 Repository layout (additions)

```
apps/web/            existing; gains local-mode routes, the API adapter, Library/Progression/Compare pages
apps/api/            NEW  Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, pytest
apps/desktop/        NEW  Electron main + preload (TypeScript), electron-builder config
packages/…           existing shared packages; new pure stats go in @fsa/analytics
```

Python tooling: **uv** with `pyproject.toml` *(builder's call)*. Electron packaging: **electron-builder**.
Python bundling: **PyInstaller** (one-folder build is fine).

### 4.2 Data folder

`~/Library/Application Support/MyGolfViz/` on macOS; use `platformdirs` in Python so Windows works
later. Electron passes the path to the backend; browser mode uses the same default; tests use a temp dir.

```
MyGolfViz/
├── mygolfviz.sqlite3        (+ -wal, -shm)
├── originals/<sha256>.csv   content-addressed original bytes, never modified
├── backups/                 automatic pre-migration copies (keep the last 5)
├── logs/                    rotating backend logs
└── mygolfviz.lock
```

Updating or reinstalling the app never touches this folder.

### 4.3 Security (loopback only)

- Bind `127.0.0.1` only. Reject requests whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>`
  (DNS-rebinding guard).
- **Per-launch token.** The backend generates a random token at startup. Every `/api/v1/*` request
  must carry it. How it reaches the page *(builder's call; suggested)*: the backend prints
  `http://127.0.0.1:<port>/?token=…` (Jupyter-style); the page exchanges it for an HttpOnly,
  SameSite=Strict cookie and strips it from the URL. Electron opens that same URL. `/api/v1/health`
  needs no token.
- Electron: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a restrictive CSP,
  navigation locked to the backend origin, external links opened in the system browser. The preload
  exposes only what's needed (e.g. "open data folder", "open logs", app version).

## 5. Local data model (SQLite)

All ids are UUIDv4 strings. All timestamps are UTC ISO-8601 set by the backend. SQLite runs with WAL,
`foreign_keys=ON` and a busy timeout. Every schema change is an Alembic migration. Before running a
pending migration, the backend copies the database to `backups/` (SQLite online backup API).

| Table | Columns | Notes |
|---|---|---|
| `sessions` | id, name (required, non-empty), date (`YYYY-MM-DD`, **required**), notes, handedness (`right`/`left`), created_at, updated_at | Every session has a date: the one the user picks when creating it, defaulting to the day it's created (§7.6). Never read from filenames or CSV contents. |
| `imports` | id, session_id → sessions (cascade), original_filename, display_name (nullable, user rename), sha256, byte_length, ordinal, parser_version, shot_count, summary_row_count, warnings (JSON), imported_at | Unique (session_id, sha256). `ordinal` is the user-controlled file order within the session. |
| `shots` | id, import_id → imports (cascade), source_row, shot_label, club, shot_type, mode, location, measurements (JSON, all 27 keys, nulls kept), raw (JSON), flags (JSON) | Unique (import_id, source_row). Index on `club`, `import_id`. |
| `exclusions` | session_id → sessions (cascade), sha256, source_row, excluded_at | Primary key (session_id, sha256, source_row). **Not** deleted with an import. |
| `settings` | key, value (JSON), updated_at | Progression dashboard layout etc. |
| `target_ranges` | id, club, metric, low, high, updated_at | Unique (club, metric). `low`/`high` nullable for one-sided ranges. |

- **Originals:** written to `originals/<sha256>.csv`. The same bytes in two sessions share one file.
  A file is deleted only when no import references its hash.
- **Exclusions** are stored per session as `(sha256, source_row)`, the same key the exclude-shots
  design uses (`sha256:sourceRow`). So each session has its own exclusions even if the same file is in
  two sessions, and removing an import then adding the same file back brings its exclusions back, as
  it does in the public viewer *(builder's call, following the exclude-shots design)*. Exclusion rows
  whose file isn't in the session are kept but ignored. The API returns each shot with an `excluded`
  boolean.
- **Club identity across sessions** is the exact `club` string from the CSV (e.g. `Driver`, `7 Iron`)
  *(builder's call)*. Club renaming/merging is future work.
- **Re-parsing** stored originals with a newer parser is supported by the data model
  (`parser_version` + originals + exclusions keyed by `source_row`); the UI for it is future work.

## 6. Local API (`/api/v1`)

JSON unless noted. Pydantic schemas on every request and response. The TypeScript client types are
generated from FastAPI's OpenAPI schema *(builder's call on the generator)*.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Readiness (no token). Returns app + schema version. |
| GET | `/sessions` | Library rows: id, name, date, notes, handedness, shot/file counts, per-club shot counts. |
| POST | `/sessions` | Create (name and date required; notes, handedness optional). |
| GET | `/sessions/{id}` | One session with its imports. |
| PATCH | `/sessions/{id}` | Edit name, date (can be changed, not cleared), notes, handedness. |
| DELETE | `/sessions/{id}` | Delete session, its imports and shots; GC unreferenced originals. |
| GET | `/sessions/{id}/shots` | All shots of the session (excluded ones included, flagged). |
| GET | `/sessions/{id}/imports` | Import history with counts, warnings, order. |
| POST | `/sessions/{id}/imports` | Commit 1+ files (multipart, below). |
| PATCH | `/sessions/{id}/imports/order` | Set the import order (list of import ids). |
| PATCH | `/imports/{id}` | Rename the display name. |
| DELETE | `/imports/{id}` | Remove one import and its shots; GC its original if unreferenced. |
| GET | `/imports/{id}/original` | Download the exact original bytes. |
| PATCH | `/sessions/{id}/exclusions` | Body `{ exclude: [shotId…], include: [shotId…] }`; one transaction. |
| POST | `/imports/check` | Body: list of sha256 (+ optional destination session id). Returns, per hash, which sessions already contain it. No write. |
| GET | `/shots` | Query: `club` (optional; omitted = all clubs), `session_ids` (optional; default all). Shots across sessions, each with its session id, import id and `excluded`; used by Progression. |
| GET | `/shots/{id}` | One shot with its session and import (for Compare). |
| GET/PUT | `/settings/{key}` | E.g. `progression.layout`. |
| GET/PUT/DELETE | `/target-ranges[/{club}/{metric}]` | Per-club target ranges. |

### 6.1 Import contract

The frontend parses with the existing TS parser and shows the preview (frame `02`) before any write.
On confirm it sends, per file: the **original bytes** and the **parser output** (`shots`,
`summaryRows` count, `warnings`, `parserVersion`), plus the destination (existing session id, or a
new session's details to create in the same request).

The backend, for each file **independently**:

1. Recomputes SHA-256 from the received bytes (never trusts a client-sent hash).
2. Validates the parsed payload: Pydantic types; all 27 measurement keys present (number or null,
   finite); `source_row` unique within the file; `parser_version` is one the backend knows; shot count
   > 0.
3. Duplicate check: if the destination already holds this hash → result `skipped_duplicate` (no
   write). If another session holds it → allowed, but only when the request carries
   `accept_cross_session_duplicate: true` for that file (the UI asks first, using `/imports/check`).
4. Writes the original to a temp file in `originals/`, fsyncs, renames to `<sha256>.csv` (skip if it
   already exists with matching bytes).
5. In one DB transaction: inserts the import (next ordinal) and its shots. On failure: rollback, and
   delete the original if this request created it.

Response: per file `imported | skipped_duplicate | invalid` with counts, warnings and reasons, plus the
updated session. A partially successful batch is allowed and shown explicitly (frame `03`). Retrying
the same request can't create duplicate rows (unique (session_id, sha256)).

On startup the backend sweeps leftover temp files and originals that no import references.

## 7. Frontend in local mode

### 7.1 Mode and wiring

- `readAppMode` accepts `public` and `local`. The mode is a compile-time constant so that the bundler
  drops everything local from the public build. Local code (API client, library, progression,
  compare, persistence actions) lives behind `if (APP_MODE === 'local')` / dynamic imports that the
  public build never reaches. `verify-public-build` must keep passing, and the local build gets its
  own check that it *does* contain the API client.
- **Session data access goes through one adapter.** In public mode it's today's in-memory working set.
  In local mode, opening a session loads its imports and shots from the API into the same `WorkingSet`
  shape, so Overview and Shot Inspector work unchanged. Writes (details, exclusions, import
  add/remove/reorder) go to the API and then update the store. TanStack Query (per spec v0.4) is
  fine for the API-backed pages *(builder's call)*.
- Exclusion and details edits save automatically (no Save button). If a write fails, the change is
  rolled back on screen with a toast.

### 7.2 Navigation and routes (local)

Header: logo + **MyGolfViz**, nav **Sessions · Progression**, **Load Session CSV** on the right, Help.
(The frames' *Trends · Clubs* become *Progression*; club gapping lives in Progression.) Routes
*(builder's call on paths)*: `/sessions` (library), `/sessions/:id` (Overview of that session),
`/sessions/:id/inspect`, `/import`, `/progression`, `/compare?a=<shotId>&b=<shotId>`. Local mode can
use history routing (the backend serves `index.html` as a fallback).

### 7.3 Library (frames `00`, `01`)

- **List:** as drawn. Search by name, club or note; sort by session date, shot count or
  name; empty state.
- **Calendar:** as drawn, minus the "No date set" list (every session has a date). Month grid with
  sessions on their date, Today and previous/next month, and a side panel for the selected day.
- Header line "N sessions · N shots · N source files".
- Row/session actions: open, rename/edit details, delete (confirm dialog naming the session and its
  shot count).

### 7.4 Import (frames `02`, `03`)

The existing Load page plus the **"Add to: New session / Existing session"** block from frame `02`.
New session: name required; **date required, pre-filled with today** and editable; notes/handedness
optional. Nothing is pre-filled from filenames.
Existing session: pick from a list. Opened from a session's page, it defaults to that session.

Before confirming, the preview also shows duplicate status from `/imports/check`: "already in this
session — will be skipped" or "also in *Session X* — import anyway?" (per-file checkbox).

After confirming, frame `03`: files added, shots added, files skipped and why, warnings, and a link
to the session.

### 7.5 Session page

Today's Overview and Shot Inspector, loaded from the session, with:

- Session details (name, date, notes, handedness) editable in place and saved.
- Exclusions working exactly as in the exclude-shots design, but saved.
- An **Imports** panel: list in order (file badge F1, F2…, name, shots, imported at, warnings),
  reorder (up/down), rename, download original, remove (confirm; shows how many shots will go).
  Totals and charts recompute from the remaining shots straight away.
- **Load Session CSV** here targets this session by default.

### 7.6 Session dates

- Every local session has a date. Creating a session (in the import flow or from the library) shows a
  date field **pre-filled with today's date**; the user can change it before or after creating.
- The default is the day the session is created in the app, nothing else. Filenames and CSV contents
  are never used. Appending files later doesn't change the date.
- The date can be edited at any time but not removed.
- Public mode is unchanged: its session date stays optional and empty by default.

## 8. Progression

A customizable dashboard showing **one club at a time** across sessions. Calculations are pure
TypeScript in `@fsa/analytics` (no backend analytics), with unit tests.

### 8.1 Scope controls

- **Club** picker (clubs that appear in any session).
- **Sessions:** the last N sessions that contain that club (default 6), or a hand-picked set.
- **Shots: All shots (default) / Stock shots only.** "Stock shots only" leaves out the shots the user
  excluded. The current choice is always shown on screen next to the charts, e.g. "All 214 shots" or
  "Stock shots only · 23 excluded left out".
- **X axis:** sessions in order, S1…Sn (not a calendar scale), by session date ascending; sessions on
  the same date are ordered by creation time. Hover a point to see session name, date and n.

### 8.2 Statistics per metric per session

For each metric, computed over the non-null values only:

- median, mean
- standard deviation, interquartile range (P25–P75), P10–P90 range
- n (values), missing count (null values), total shots
- potential outliers: count outside the Tukey fences (P25 − 1.5·IQR, P75 + 1.5·IQR). They are
  flagged, never removed.
- % of shots within the target range, when one is set for this club and metric.

Sessions with fewer than 5 values for a metric are drawn hollow and labelled "few shots"
*(builder's call on the threshold)*.

### 8.3 Categories and tiles

The dashboard is a grid of tiles grouped under six categories. The user can **add, remove and
reorder tiles**. The layout is one layout for all clubs, saved in `settings` (`progression.layout`).
A **Reset to default** button restores the default layout.

| Category | Question | Tiles available |
|---|---|---|
| Distance | Are distances improving and becoming more predictable? | Carry · Total · Roll · **Club gapping** |
| Accuracy | Are shots starting and finishing closer to the line? | Lateral (landing) · Launch direction (H) · Curve distance |
| Consistency | Is the swing becoming more repeatable? | Carry variation (SD) · Direction variation (lateral SD) · Mishit frequency |
| Club delivery | Are swing mechanics and impact conditions improving? | Club path · Face to path · Face to target · Attack angle · Low point |
| Ball flight | Is the flight more efficient and controlled? | Spin · Spin axis · Launch angle (V) · Apex (height) · Descent angle |
| Strike quality | Is energy transfer better and contact more consistent? | **Speed & smash** · Smash · Ball speed · Spin loft · **Impact location** |

**Default layout** *(builder's call)*: Median carry, Carry variation, Lateral, Face to path, Spin,
Speed & smash, Impact location, Mishit frequency.

**Standard metric tile** (from the owner's reference screenshot): title; headline **session median**
for the latest session with the change since the previous session; a line chart of each session's
**median with its P25–P75 band** (P10–P90 available as a toggle); a details popover/expander with
the full §8.2 numbers per session; the target range drawn as a shaded band when set, with "% in
range" per session; a "Set target range" control.

**Special tiles:**

- **Variation tiles** (Carry variation, Direction variation): plot SD per session. Lower = more
  consistent. This is the only place the UI says better or worse.
- **Mishit frequency:** excluded shots ÷ all shots for this club, per session. (For now a mishit
  *is* a user-excluded shot.) Not affected by the Stock-shots switch.
- **Speed & smash:** club speed and ball speed medians on one chart, smash factor on a second axis or
  a linked mini-chart, so "club speed flat, ball speed up" is visible.
- **Impact location:** a face heatmap (heel/toe × low/high) for the selected sessions or one session
  at a time, plus per-session average distance from face centre and strike spread (SD of distance or
  of each axis). **Shots without impact data are left out of every impact number and counted as
  "impact not measured: k of n".** Never treated as centred.
- **Club gapping:** median carry per club, with the gap between neighbouring clubs and each club's
  P25–P75 so overlaps show. It ignores the club picker and has its own session control: the last N
  sessions of any club (same N as the dashboard), or the hand-picked set when one is chosen. The
  Stock-shots switch applies *(builder's call)*.
- **Accuracy tiles** (Lateral, Launch direction, Curve distance): the headline and line chart use
  **distance from the line** (absolute value, e.g. median lateral miss), following spec v0.4 §6
  ("average lateral error = mean absolute lateral miss"). The signed median (left/right bias) is
  shown as a second line or in the details. Values stay target-relative (right +, left −) with no
  mirroring for left-handed sessions. A target range on these tiles applies to the absolute value
  *(builder's call)*.

**Wording:** changes are shown neutrally (arrow + signed value + unit), with no green/red judgement,
except variation tiles where lower is labelled "more consistent". No fitted trend lines or
significance claims.

### 8.4 Layout

Designed for desktop (≥ 1024 px). It must not break at 820 px (single tile column is fine). Phone
layouts are not required in v1.

## 9. Compare two shots

**Purpose:** two good shots, usually from different days, and "what changed?".

- **Entry:** a **Compare…** button on any shot in the Shot Inspector (this becomes shot A). A picker
  chooses shot B: session → club → shot, defaulting to the current session and club. Excluded shots
  can be picked and are marked "(excluded)".
- **Layout B** (chosen by the owner from the mockups; `.superpowers/brainstorm/…/compare-layouts.html`):
  - Header: two labels, **A** (white) and **B** (purple), each with club, shot number, session name
    and session date, plus **Swap** and **Change shot…**.
  - Left: both shots **overlaid on the same diagrams**: side-view trajectory, top-view landing, and
    top-view delivery (club path and face).
  - Right: **"What changed"** table, every metric: B value, A value, Δ (A − B) with units. Sorted by
    size of change (relative to a per-metric scale, e.g. the metric's typical spread) *(builder's
    call on the scale)*. If either value is missing the row says n/a and sorts last. No good/bad
    colouring.
- Any two shots can be compared, including different clubs.
- Comparisons are not saved. The `/compare?a=&b=` route makes the page reloadable.
- Local mode only in v1.

## 10. Mac app (step 2)

- Electron main process: single-instance lock; resolve the data folder; spawn the bundled
  `mygolfviz-api` with the data folder and the token; the backend picks a free port and reports it
  on stdout as one JSON line (`{"port": …}`); poll `/api/v1/health`; then open the window at the
  tokenised URL. Startup is shown in a small splash. On failure: an error screen with the log path and
  "Open logs" / "Quit".
- If the backend dies while the app is open: show an error screen with "Restart backend".
- On quit: ask the backend to shut down (SIGTERM; it checkpoints WAL and exits), kill it after a
  timeout.
- Window size and position are remembered. Standard macOS menus and shortcuts. "Open data folder"
  and "Open logs" in the app menu (via preload).
- App name **MyGolfViz**, icon generated from `apps/web/public/icon.svg` (`.icns`), bundle id
  `io.github.<owner>.mygolfviz` *(builder's call)*.
- Output: an unsigned Apple Silicon `.dmg` / `.app` built locally with one command. First launch
  needs right-click → Open; document it.

## 11. Delivery order

Each step ends with something the owner can use. A separate implementation plan is written per step.

1. **Saving sessions (browser + local backend).** `apps/api` with SQLite, migrations, pre-migration
   backup, originals, the full §6 API minus progression/compare-specific endpoints; local build mode;
   library list + calendar; import to new/existing session with duplicate handling; session page with
   saved details, saved exclusions, imports panel (remove, reorder, rename, download original); delete
   session. Run with one command and open `localhost`.
   *Done when:* create a session, import 3 CSVs in one go, append 2 more, remove one, exclude some
   shots, restart the backend, and everything (incl. exclusions, details and file order) is back; the
   public build is byte-for-byte unaffected in behaviour and passes `ci:public`.
2. **Mac app.** Electron shell, PyInstaller backend, icon, data folder, lifecycle and error screens,
   `.dmg` build.
   *Done when:* on a Mac without Python or Node, MyGolfViz.app opens, shows the library, and keeps
   data across quit/reopen and across installing a newer build.
3. **Progression.** §8 in full.
4. **Compare.** §9.

## 12. Decisions that override the source documents

| Topic | Source said | Decided |
|---|---|---|
| Local packaging | v0.4: Docker Compose | Electron Mac app; no Docker |
| Who parses | v0.4: Python re-validates raw CSVs | TS parser only; Python re-hashes bytes and validates the parsed payload (§6.1) |
| Preview endpoint | v0.4: `POST /api/imports/preview` | Preview happens in the frontend; `/imports/check` only for duplicates |
| API prefix | v0.4: `/api/…` | `/api/v1/…` |
| Name | Desktop_design: "FlightScope Analytics" | **MyGolfViz** (app, window, data folder) |
| Repo layout | Desktop_design: `frontend/`, `backend/`, `desktop/` | Existing `apps/web`, `packages/*`; new `apps/api`, `apps/desktop` |
| Calendar | v0.4/frames: later phase | In the first release (step 1) |
| Session date | v0.4/frames: nullable, "No date set" list | Required in local mode; defaults to the day the session is created; no "No date set" list |
| Nav | frames: Sessions · Trends · Clubs | Sessions · Progression |
| Session library on phone/iPad | v0.4 responsive matrix | Not required in v1 (no LAN access yet) |

## 13. Future work (recorded, not in v1)

- **Compare two shots in the public viewer** (within the one working set).
- **Automatic mishit detection** (e.g. smash well below the club's norm), feeding Mishit frequency
  and an optional auto stock-shot filter.
- iPad/phone access over the LAN (opt-in, paired/authenticated, HTTPS or Tailscale).
- Windows and Intel Mac builds, signing/notarisation, GitHub Releases, auto-update.
- Backup/restore and export screens.
- Re-parse stored originals with a newer parser.
- Club renaming/merging across sessions; club profiles (loft etc.).
- Saved comparisons; cross-session dispersion overlay (the "dispersion overlay" mockup).

## 14. Testing

- **Python (pytest):** every endpoint; import atomicity (fail mid-insert → no rows, no new original);
  duplicate rules; hash recomputation; payload validation (bad types, missing keys, duplicate
  `source_row`, unknown parser version); remove import / delete session GC; migrations on an existing
  DB with a backup taken; Host/token checks; lock file.
- **Contract:** the golden fixtures in `fixtures/flightscope/` parsed by the TS parser, posted to the
  API, read back, and compared field-for-field (nulls stay null).
- **TS (Vitest):** progression statistics (median, quantiles, IQR, Tukey counts, % in range, null
  handling, impact-missing exclusion, mishit frequency), session ordering, adapter behaviour.
- **Playwright (local):** starts the backend on a temp data folder; library list/calendar, import
  new/append/duplicate, exclusions persisting across reload, remove import, progression tiles render
  with fixtures, compare page.
- **Public:** `npm run ci:public` unchanged and green; `verify-public-build` passes.
- **Mac app:** a manual checklist for step 2 (clean-machine launch, quit/reopen, upgrade keeps data,
  backend crash screen).
