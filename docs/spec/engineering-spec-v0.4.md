ARCHITECTURE DECISION  /  ONE PROJECT, TWO BUILDS
FlightScope Analytics Dashboard
Product & engineering specification  |  Version 0.4  |  10 November 2026

| Core product contract One GitHub repository and one React + TypeScript frontend, compiled for two targets. The GitHub Pages viewer analyzes CSV exports entirely in browser memory, with no account, backend or saved sessions. The self-hosted build adds a local FastAPI service and SQLite persistence. Both builds share parsing, analytics, responsive UI and golf visualizations. |
|---|


# 1  Purpose, principles and scope
The product turns Mevo Gen 2 CSV exports into useful ball-flight, club-delivery, dispersion, and impact-location analysis. It addresses interrupted FlightScope recordings without relying on FlightScope Cloud synchronization. A range visit may produce multiple exports; only the user decides which files belong together.

## Non-negotiable decisions
- One repository, one React + TypeScript frontend, two build targets; do not duplicate UI screens or maintain separate app branches.
- The visible entry action is "Load Session CSV" in both modes.
- A user may select one or multiple CSV files in a single action.
- CSV names, including embedded dates, are untrusted labels; never infer session name, date, time, or file grouping from them.
- Public mode has no backend ingest, saved sessions, login, durable cache, or history. Refreshing or closing the page loses the analyzed data.
- Local mode supports create / append / remove workflows with complete source provenance and backups.
- The interface distinguishes measured, derived, illustrative, and unavailable information.

# 2  Deployment modes and feature contract

| Capability | Cloud Viewer (public) | Local App (self-hosted) |
|---|---|---|
| Open a CSV | 1+ files; parse in browser | 1+ files; preview, then import |
| Temporary combined analysis | Yes; in-memory only | Yes; plus saved analysis |
| Create or append saved session | Not offered | Yes; explicit destination |
| Session library / calendar | Hidden | Library; calendar optional |
| Filtering by club or source file | Yes | Yes |
| 2D delivery / impact / dispersion | Yes | Yes |
| Cross-session historical trends | No previous history | Yes; user-selected sessions |
| Storage | No user-data persistence | SQLite + original CSVs |
| Backend runtime | None; GitHub Pages static site | FastAPI + Python |
| Accounts | None | No account needed on trusted local network |

Public mode is a transient working set, not a simulated saved session. The UI may assign ephemeral identifiers while files are open, but may not expose "Save session", "Append to previous session", or historical calendar routes. The public build deploys to GitHub Pages; the self-hosted build runs separately from the same GitHub source tree.

## Explicit out of scope for the initial releases
- Undocumented MyFlightScope endpoint automation or cloud scraping; native Mevo live collection.
- Server-side upload or retention for the public website; user accounts or SaaS subscriptions.
- Exact replication of proprietary GCQuad/FS Golf animation or measured time-resolved swing replay.

# 3  User flows and interface behavior

## 3.1  Public Cloud Viewer
1.  Open site -> prominent "Load Session CSV" action and explicit browser-only privacy disclosure.
2.  Select or drag one or more CSV files (iPhone/iPad use the system file picker).
3.  Preview each file: recognized shots, excluded summary rows, missing metrics, invalid format, duplicate within current working set.
4.  Click "Analyze files" -> render one temporary aggregate with optional club/file filtering and shot inspection.
5.  Use "Clear analysis" or load different files to reset. Refresh/close clears the working set; no saved-session screens.
6.  Show an unobtrusive "Want saved history? Run Local App" link to the same GitHub repository and installation instructions.

## 3.2  Local App
1.  Open local library -> "Load Session CSV" (also available from a session detail).
2.  Choose one or more files -> inspect validation preview before any database changes.
3.  Choose "New session" (name required, date/notes optional) or "Existing session" (explicit destination).
4.  Confirm import -> commit each valid file atomically; show per-file success / skipped / invalid results.
5.  Open saved session with combined shots; filter by club and import file; navigate to the selected shot.
6.  Rename/reorder imports, remove an imported file, or add more CSVs without losing other imported sources.

## 3.3  Consistent interaction rules
- A selected shot is synchronized across dispersion point, shot table, and shot inspector. Previous/Next follows current filters.
- Preserve active club, source-file filter, and selected shot when switching 2D, impact, and other inspector tabs.
- Make populated library and empty-state messaging mutually exclusive; reflect the deployment mode in navigation.
- After an import, show files added, shots added, files skipped, warnings, and the updated local session.
- Use one-column phone layouts and touch-friendly controls; avoid squeezing a desktop table into a 390 px viewport.

# 4  Application architecture and code organization
Maintain exactly one GitHub repository and one React + TypeScript application in apps/web. Build the frontend with a compile-time public or local mode flag; share all UI primitives, CSV parsing, analytics and visualizations. The public output is static assets for GitHub Pages. Local mode uses that same frontend plus apps/api (FastAPI). Persistence features are capability-gated and excluded from the public bundle, not merely hidden while remaining callable.

| ONE GITHUB REPOSITORY  -  apps/web = ONE REACT FRONTEND                        |          shared TS parsing + analytics + diagrams                  /                     \n         / PUBLIC BUILD           LOCAL BUILD  GitHub Pages assets       Same React UI + FastAPI  File API -> memory        Python validates imports  No server / storage       SQLite + original CSV files |
|---|


| Component | Technology / responsibilities |
|---|---|
| Web UI | React + TypeScript + Vite, responsive layouts, React Router, TanStack Query for API-backed local views |
| Browser ingestion | File API + PapaParse (or equivalent); schema validation; no upload to server in public mode |
| Shared calculations | TypeScript analytics and standardized field semantics; custom React SVG delivery diagrams; Plotly for statistics |
| Local backend | Python 3.12+, FastAPI + Pydantic; trusted re-validation of raw uploaded CSVs, SQLite / SQLAlchemy / Alembic |
| Public deployment | GitHub Pages via GitHub Actions, static Vite output; no Python runtime, no user-data requests |
| Local deployment | Docker Compose with persistent DB and source-file volume; HTTPS or private access for remote devices |
| Contract testing | Shared golden CSV fixtures and expected normalized / analytics outputs, checked in both TS and Python |


## Repository outline

| apps/web/                   ONE React + TS app (Vite, mode-specific routes)apps/api/                   Local-only FastAPI + SQLitepackages/csv-parser/       Browser CSV normalizationpackages/domain/           Common field semantics, units and provenancepackages/analytics/        Shared TypeScript calculationspackages/visualizations/   SVG club diagrams and dispersion plotspackages/ui/               Shared responsive componentsfixtures/flightscope/      Shared golden test CSVs and expectations.github/workflows/pages.yml GitHub Pages build and deploy pipelinedeployments/local/          Docker Compose, volumes and backup instructionspackage.json                npm workspace scripts for two builds |
|---|

Guard against drift: the browser parser and Python local ingestion must conform to the same documented field conventions and fixture-based expectations. API/OpenAPI-generated TypeScript types cover local API contracts. All chart calculations live in shared TypeScript modules, with parity tests for any backend-derived values.

## 4.1  One frontend, two build profiles
Use npm workspaces (or an equivalent single workspace manager) for apps/web and shared packages. The frontend is not forked: its compile-time mode selects route availability and the data-access adapter. The local build can call FastAPI; the public build must operate fully offline after its static assets have loaded.

| Build / concern | Required contract |
|---|---|
| Public build | VITE_APP_MODE=public; static Vite build; File API + in-memory analysis; no local API adapter or persistence implementation shipped. |
| Local build | VITE_APP_MODE=local; same React components and analytics; persistent repository adapter calls local FastAPI. |
| Feature gating | Compile-time mode determines navigation and available actions; runtime guards enforce supported repository capabilities. |
| Routing | Use hash routing in GitHub Pages build or another tested static-site fallback; local mode may use standard history routing. |
| Asset base | Set Vite base to /<repository-name>/ for GitHub project Pages, or / when using a custom root domain. |
| Dependency direction | Shared visualization, parser and analytics packages never import FastAPI clients, local storage adapters or host-specific code. |


| VITE_APP_MODE=public  npm run build:public    # GitHub Pages outputVITE_APP_MODE=local   npm run build:local     # Docker/local output# npm scripts above must be implemented in package.json.# Vite base path must match the actual Pages repository URL. |
|---|


## 4.2  GitHub Pages delivery pipeline
1.  Push changes to the same GitHub repository; GitHub Actions runs TypeScript tests and shared golden CSV fixtures.
2.  Build apps/web in PUBLIC mode with Vite. Verify output paths and routing when served below the repository base path.
3.  Deploy only apps/web/dist as the GitHub Pages artifact; exclude Python code, SQLite files, raw CSV uploads and local secrets.
4.  Run browser privacy checks: no fetch that transmits CSV or normalized shots; no durable user data in cookies, localStorage, sessionStorage or IndexedDB.
5.  Expose a link from the public viewer to this repository, explaining Docker setup for the persistent Local App.
GitHub Pages serves static files only. No Python/FastAPI service runs on the public site, and no server-side user accounts or session database are needed.

## 4.3  Local packaging
Build apps/web with LOCAL mode, then package it with the FastAPI backend using Docker Compose. Prefer same-origin API routing (for example /api) behind the local HTTP server. Persist SQLite and source CSVs on Docker volumes or a user-selected host directory; document backup and restore. Private LAN/VPN access is supported, but publicly exposed unauthenticated local APIs are out of scope.
Suggested command: docker compose up --build. Both deployments are reproducible from one tagged source revision; neither requires changing application branches to switch modes.

# 5  Domain and storage semantics

| Entity | Core fields | Required behavior |
|---|---|---|
| Session (local) | id, name, date?, notes, created_at, updated_at | User-defined group; date nullable and never inferred. |
| ImportFile (local) | id, session_id, name, sha256, ordinal, imported_at, parser_version, original_blob_path | Provenance; source file can be removed independently. |
| Shot (local) | id, import_file_id, source_row, source_shot_number?, club, measurements, raw_fields | One physical CSV shot row; not deduped by rounded values. |
| ViewerBatch (public) | ephemeral file identifiers, names, parsed shots, UI order | In-memory only; never persisted or sent to a service. |
| ClubProfile (optional) | id, name, loft?, notes? | Only local; not necessary to import a shot. |


## Identity, duplicate policy, and ordering
- In Local App, SHA-256 of raw bytes detects identical re-uploads into the same session; skip by default with an explicit result.
- Identical file content used in a different session yields a warning but can be explicitly accepted; do not enforce global uniqueness.
- In Cloud Viewer, warn about byte-identical files within the active temporary batch; no historical duplicate lookup is possible.
- Preserve original file bytes, CSV row index, filename, parser version, import ordinal, and any source shot label.
- When CSVs lack real shot timestamps, order shots by user-managed file ordinal and original CSV row; no inferred cross-file chronology.
- Deleting one import removes only its shots; recalculation uses remaining shots, never stale cached totals.

# 6  CSV parsing, validation, and measurement fidelity
Known example: FlightScope Golf Session Sept 19 2022.csv has 32 columns, 16 Driver shots, plus Avg and Dev summary rows. The misleading filename was generated on 10 November 2026; it is not reliable recording-date evidence. Time (s) denotes ball flight duration, not a wall-clock shot timestamp. Newer Mevo Gen 2 exports must be tested before finalizing the header map.

| Input / measurement | Canonical treatment |
|---|---|
| "8.1 R", "6 L" | Convert target-relative left/right directions to signed numbers: right positive, left negative. |
| "-" / blank | Store null, never zero; include valid-value sample count in every summary. |
| "Avg", "Dev" rows | Exclude from shot records; optionally preserve source summaries for debugging. |
| Units in headers / values | Normalize mph, yards, rpm, feet, inches, degrees; preserve raw text and source units. |
| FTP, FTT, path, AOA | Keep distinct measurements; soft-check approximate relationships with rounding tolerance. |
| Impact X/Y | Keep missing values null; verify sign conventions independently before drawing heel/toe or high/low. |
| Unrecognized or missing column | Warn and degrade gracefully; no invented measurements or silently shifted columns. |
| Time (s) | Flight duration only; never used for session grouping or shot chronology. |


## Statistical and interpretive rules
- Use non-null denominators for each statistic and label coverage, e.g., "Club path 29 / 34 shots".
- Keep legitimate outliers with quality flags rather than automatically discarding them.
- Define average lateral error as mean absolute lateral miss from target; other error measures must have explicit labels.
- A 1-sigma 2D covariance ellipse has approximately 39% expected coverage under a bivariate normal model; do not claim it contains 39% of the actual sample. Observed coverage may be reported separately.
- Do not equate two-dimensional loft minus attack with an exact three-dimensional spin-loft identity. Use measured spin loft where available; label approximations.
- Distinguish measured data, derived values, illustrative geometry, and unavailable data via tooltips, legend, or small labels.

# 7  Analytics and visualization specification

## 7.1  Combined overview and shot table
- Headline metrics: total shots, carry, total, ball/club speed, spin, smash, dispersion, selected filters, and each metric's n.
- Top-down dispersion: X = signed lateral displacement; Y = carry landing; target-line origin and units explicit.
- Offer carry-landings versus total resting position when supported; mark missing total/lateral data clearly.
- Keep shot table, plot, and inspector linked. Source file names and import order are available on hover/detail.
- Show mean carry / lateral centroid and optional covariance ellipse without implying normality or a fixed contained fraction.

## 7.2  GCQuad-inspired shot inspector

| Inspector panel | Required semantics |
|---|---|
| Horizontal delivery (2D) | Target line, club path, face-to-target, face-to-path, horizontal launch; signed angles and reference lines. |
| Vertical delivery (2D) | Ground line, angle of attack, dynamic loft, vertical launch, measured spin loft when available. |
| Ball spin | Total spin and spin axis. Backspin/sidespin components are marked as derived if calculated. |
| Face impact | Heel/toe and vertical strike location only when supplied. No selected-shot marker when absent; aggregate other strikes may remain visible if labeled. |
| 3D reconstruction (deferred) | An illustrative geometric rendering, never represented as a recorded swing or measured flight time series. |

Desktop: put the selected diagram first and keep secondary metrics in an expandable details section. iPad: use an adaptable two-column or tabbed layout. iPhone: one diagram at a time, two KPI cards per row, compact shot cards rather than a tiny full-width table.

# 8  Navigation, mode boundaries, and public privacy

## Cloud mode guarantees
- No calls that transmit CSV bytes, normalized shots, or measurement values to analytics, logging, error-reporting, or backend endpoints.
- No user-data use of localStorage, sessionStorage, IndexedDB, cookies, browser database, or service-worker offline cache.
- Browser JS memory may contain data while the page remains open; "Clear analysis" explicitly releases references and refresh terminates the working set.
- Navigation only includes Load CSV, Overview, Shot Inspector, and Help / Get Local Version. No saved library, calendar, or history route. The install link goes to the same GitHub repository.
- Explain that the viewer is stateless; avoid claims that browser or operating-system processes instantly erase every RAM copy.

## Local mode guarantees
- All writes go through local FastAPI; no automatically hosted cloud database or account dependency.
- Persist original CSV and normalized shots; a backup includes both database and source-file storage.
- A private LAN or VPN (for example Tailscale) is preferred for mobile access; do not expose unauthenticated FastAPI to the public internet.
- Mode capability checks are enforced in route availability and API deployment configuration, not only through visually hiding buttons.

## Responsive acceptance widths

| Viewport | Layout expectation |
|---|---|
| 1440 px desktop | Dense dashboard, side-by-side plots and metrics, full shot table without clipping. |
| 820 px tablet | Adaptive grid, accessible import flow, chart labels visible, inspector tabs manageable by touch. |
| 390 px phone | Single-column cards and diagrams, readable text, no horizontal body overflow, touch targets >= 44 px high. |


# 9  Local-only API and transaction contract

| Endpoint | Purpose |
|---|---|
| POST /api/imports/preview | Parse 1+ files and return validation, per-file counts, warnings; NO write. |
| POST /api/sessions | Create user-named logical session; nullable date and notes. |
| GET /api/sessions | Library list and counts. |
| PATCH /api/sessions/{id} | Rename or edit user-supplied metadata. |
| POST /api/sessions/{id}/imports | Commit validated file(s) to chosen session, per-file atomicity. |
| GET /api/sessions/{id}/imports | Source files, counts, warning summaries and explicit order. |
| DELETE /api/imports/{id} | Remove one source file and its shots; recompute statistics. |
| GET /api/sessions/{id}/shots | Paged / filterable shots by club or source import. |
| GET /api/shots/{id} | Normalized values with measurement status and provenance. |

Batch import semantics: parse all candidates before any database commit; commit each valid file atomically; return imported / skipped_duplicate / invalid per file. A partially successful batch is allowed but must be explicit. Repeated retries cannot create duplicate rows for the same source hash and destination.
The GitHub Pages build MUST NOT depend on, include, or call any of these API routes; only the local build includes the FastAPI adapter. The public viewer must still work when no API endpoint exists.

# 10  Delivery sequence and acceptance criteria

| Milestone | Core work | Ship gate |
|---|---|---|
| C0  Data kernel | TS CSV parser, canonical schema, golden fixture tests | 16 shots + 2 excluded summaries; missing impact null; no inferred dates. |
| C1  Public viewer | Same React app in public mode; GitHub Pages CI deployment | 1+ CSV -> plots on desktop/iPhone; static Pages URL works without API or storage. |
| C2  Public UX polish | Source filtering, linked selection, null states, help/self-hosting link | Filtered shot navigation and 390/820/1440 px layouts tested. |
| L1  Local persistence | Same React frontend in local mode + FastAPI, SQLite and uploads | Create/append/remove 3 files; records and metadata survive restart. |
| L2  Local history | Session library, comparisons, safe backups | Metrics recompute after deletion; restore backup reliably. |
| A1  Advanced (optional) | 3D illustrative replay, calendar, trend exploration | Precise measured/derived/illustrative labels and regression tests. |


## Release test matrix
- Fixture: exactly 16 Driver shots from 32 columns; Avg/Dev excluded; face-impact missingness handled without synthetic points.
- Upload 3 files in one cloud analysis; analyze as one temporary working set; clear or reload and confirm zero retained shots.
- Verify GitHub Pages build works from the repository subpath with direct navigation and refresh; no request for unavailable API routes.
- Verify public page sends no CSV or normalized shot payload to any network destination, including error-reporting and telemetry.
- Verify the public build has no persisted shot data, local API client, SQLite artifacts or Python runtime dependencies.
- In local mode, append 2 files to an existing session; validate user-controlled naming, dates, and source-file order.
- Within one session, detect repeated identical CSV by SHA-256; warn before using same file in a different session.
- Remove one import; confirm other shots, source records, and computed totals remain correct.
- Every inspector panel handles missing club metrics or face impact without creating contradictory text/markers.
- Selected shot remains stable across plot/table/inspector and changes only as expected when filters remove it.
- Validate positive/negative delivery and impact orientation against actual FlightScope exports and reference shots.
- Render desktop, tablet, and phone layouts and test import/selection with touch and keyboard.

# 11  Open decisions and deferred extensions
- Obtain a modern Mevo Gen 2 CSV with Pro Package and Face Impact Location to confirm header aliases and heel/toe sign conventions.
- Determine whether the public viewer needs an optional derived-statistics download; initial requirement is view-only, so no export control is planned.
- Choose GitHub organization/user and repository name; set the matching GitHub Pages base path, action permissions and self-hosting README link.
- Decide local backup and restore UX after SQLite and source-blob consistency tests are implemented.
- Keep authorized MyFlightScope integrations, device collection, native app, and server-backed public accounts out of scope until explicitly needed.

| Definition of done - two-mode v1 One GitHub repository and one React + TypeScript frontend produce two builds: a stateless GitHub Pages viewer with no upload, backend or persistence; and a self-hosted frontend with local FastAPI, SQLite, source CSV provenance and saved sessions. Dates and grouping remain user-defined. |
|---|

