# Local App Step 1 — Saving Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local build of the existing React app, backed by a FastAPI + SQLite service. It has a session library (list + calendar), import of 1+ CSVs into a new or existing session, and a session page whose details, exclusions and imports are saved. It runs with one command and opens in a browser at `127.0.0.1`.

**Architecture:**
- **Backend:** `apps/api` is a Python package (`mygolfviz_api`). It owns one data folder, holding SQLite plus content-addressed original CSVs.
- **Serving:** it serves `/api/v1/*` and the built local frontend from one origin, behind a per-launch token.
- **Frontend:** a compile-time mode (`VITE_APP_MODE=local`) adds local routes and pages under `apps/web/src/local/`, all reached through dynamic imports that the public build drops.
- **Session page:** opening a session loads it into the existing `WorkingSet` store, so Overview and Shot Inspector are reused unchanged.
- **Saving:** a sync hook writes detail and exclusion changes back to the API.

**Tech Stack:** Python 3.12+, uv, FastAPI, Uvicorn, SQLAlchemy 2, Alembic, Pydantic v2, python-multipart, platformdirs, filelock, pytest + httpx. React 19, React Router 8 (HashRouter), Vite 8, Vitest, Playwright, `openapi-typescript`, Base UI (`AlertDialog`), sonner.

**Spec:** `docs/superpowers/specs/2026-11-13-local-app-design.md`. Read it first. §4–§7 and §11 step 1 are the source of truth. The design frames `docs/design/frames/00`, `01`, `02` and `03` give the layout and copy for the library, calendar, import and result pages.

## Global Constraints

- **The public build does not change.** `npm run ci:public` must stay green on every commit. `scripts/verify-public-build.mjs` must not be edited, and `apps/web/dist` must not contain `/api/`.
- **Local mode:** `VITE_APP_MODE=local`, set by Vite mode `localapp` in `apps/web/.env.localapp`. Vite refuses `local` as a mode name. Output goes to `apps/web/dist-local`, with base `/`.
- **Keeping local code out of the public bundle:** reach every local-only module through `import.meta.env.VITE_APP_MODE === 'local' ? lazy(() => import(...)) : null`. Write the comparison inline, not through an exported constant, so Rollup folds it and drops the import.
- **Router:** HashRouter in both modes.
- **API prefix:** `/api/v1`. JSON field names are camelCase over the wire (Pydantic `alias_generator=to_camel`, `populate_by_name=True`).
- **IDs and timestamps:** ids are UUIDv4 strings. Timestamps are UTC ISO-8601 with `Z`, set by the backend.
- **Session date:** required, `YYYY-MM-DD`. The default is the user's **local** calendar date at the moment of creation. It is never derived from a filename or CSV content, and it cannot be cleared.
- **Session name:** required. It is stored trimmed, 1–200 characters.
- **Missing measurements:** stay `null` end to end. Never coerce to 0.
- **Exclusions:** keyed by `(session_id, sha256, source_row)`, the same key as `exclusionKey(sha256, sourceRow)` in `@fsa/analytics`. They are not deleted with an import.
- **Data folder:** default `platformdirs.user_data_dir("MyGolfViz", appauthor=False, roaming=True)`. It is overridden by `--data-dir` or `MYGOLFVIZ_DATA_DIR`. Layout: `mygolfviz.sqlite3`, `originals/<sha256>.csv`, `backups/`, `logs/`, `mygolfviz.lock`.
- **Host binding:** `127.0.0.1` only.
- **Default port:** `npm run local` uses port `8765`. `--port 0` picks a free port, which Electron will use in step 2.
- **Known parser versions:** the backend accepts the set `KNOWN_PARSER_VERSIONS = {"1.0.0"}` in `apps/api/src/mygolfviz_api/config.py`. It must contain `PARSER_VERSION` from `packages/csv-parser/src/parse.ts`.
- **Copy, verbatim:**
  - `Sessions`, `Load Session CSV`, `Import files`, `Clear files`, `New session`, `Existing session`, `Add to`, `Open session`, `Delete session`, `Remove file`, `Download original`
  - `Already in this session — will be skipped`
  - `` `Also in “${name}”` `` + checkbox `Import anyway`
  - `Name is required`, `No sessions yet`, `Open MyGolfViz from the link printed in the terminal.`
  - `Couldn't save session details`, `Couldn't save exclusions`
- **Commands:**
  - TS: `npx vitest run <path>`, `npm run typecheck`.
  - Python, from the repo root: `uv run --project apps/api pytest apps/api/tests -q`.
- **Tooling:** if `uv` is missing, install it with `brew install uv`. Do not use pip directly.

## Review Focus

1. **Default date near midnight.** A user in UTC−8 creating a session at 21:00 local must get *today's* local date, not tomorrow's UTC date. The test is in Task 11.
2. **Fast exclusion toggling.** Excluding, including and excluding again quickly, while the first PATCH is still in flight, must leave the server in the final on-screen state. Requests are sent one after another, never in parallel. The test is in Task 9.
3. **A crash mid-import.** If the DB insert fails after the original CSV is written, no rows remain and no new orphan CSV is left. Leftover temp files are swept at the next start. The test is in Task 4.
4. **Removing the last import of a session.** The session stays, with 0 shots. The session page shows an empty state with Load Session CSV, not a crash and not the public "No analysis yet". The test is in Task 12.
5. **Non-ASCII and comma-containing filenames.** For example `Range é, 3.csv`: import, list and **Download original** must keep the exact name, using `Content-Disposition` with RFC 5987 `filename*`. The test is in Task 5.

---

### Task 1: Backend skeleton — settings, data folder, lock, CLI, health

**Files:**
- Create: `apps/api/pyproject.toml`, `apps/api/src/mygolfviz_api/{__init__,__main__,config,app}.py`, `apps/api/tests/conftest.py`, `apps/api/tests/test_app.py`
- Modify: `.gitignore` (add `dist-local/`, `apps/api/.venv/`, `__pycache__/`, `.pytest_cache/`)

**Interfaces:**
- Produces:
  - `config.Settings` (frozen dataclass): `data_dir: Path`, `token: str`, `host: str = "127.0.0.1"`, `port: int = 8765`, `static_dir: Path | None = None`, `allowed_hosts: tuple[str, ...] | None = None` (None means `("127.0.0.1:{port}", "localhost:{port}")`).
  - `config.default_data_dir() -> Path`
  - `config.KNOWN_PARSER_VERSIONS: frozenset[str]`
  - `config.DataLock(data_dir)`: a context manager over `filelock.FileLock(data_dir / "mygolfviz.lock", timeout=0)`. When the lock is held elsewhere it raises `AlreadyRunning("MyGolfViz is already running with this data folder")`.
  - `app.create_app(settings: Settings) -> FastAPI`. It creates `data_dir/{originals,backups,logs}` and attaches a `RotatingFileHandler` (`logs/mygolfviz-api.log`, 1 MB × 3 files) to the `mygolfviz_api` and `uvicorn` loggers. It never logs request bodies or shot data. Later tasks add routers here.
  - `GET /api/v1/health` returns `{"status": "ok", "appVersion": <package version>, "schemaVersion": <alembic head or null>}`.
  - CLI `mygolfviz-api` (`[project.scripts]`), also runnable as `python -m mygolfviz_api`:
    - Flags: `--data-dir`, `--port` (default 8765), `--static-dir`.
    - The token comes from `MYGOLFVIZ_TOKEN`, or else `secrets.token_urlsafe(32)`.
    - It binds the socket itself (`socket.bind((host, port))`), so `--port 0` works. It then prints exactly one JSON line to stdout, `{"port": P, "url": "http://127.0.0.1:P/?token=T"}`, and runs `uvicorn.Server(...).serve(sockets=[sock])`.
    - It exits with code 3 and the `AlreadyRunning` message on stderr if the lock is held.
  - `tests/conftest.py` fixtures:
    - `settings(tmp_path)`: token `"t"`, `allowed_hosts=("testserver",)`.
    - `client(settings)`: a `TestClient` with header `X-MyGolfViz-Token: t`.
    - `anon(settings)`: a `TestClient` with no token.

- [ ] **Step 1: Write failing tests** in `test_app.py`:
  - `test_health_ok`: `client.get("/api/v1/health")` returns 200, `status == "ok"`.
  - `test_creates_data_folders`: after `create_app`, `originals`, `backups` and `logs` exist under `tmp_path`, and one health request leaves `logs/mygolfviz-api.log` in place.
  - `test_second_lock_refused`: inside `with DataLock(d):`, a second `DataLock(d).__enter__()` raises `AlreadyRunning`.
  - `test_cli_prints_port_line`: run `python -m mygolfviz_api --data-dir <tmp> --port 0` as a subprocess. Read the first stdout line, parse it as JSON, and check that `port > 0`, that `url` ends with `?token=` plus the token, and that `GET {base}/api/v1/health` returns 200. Then terminate the process.
- [ ] **Step 2: Run** `uv run --project apps/api pytest apps/api/tests -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the pyproject, with `requires-python = ">=3.12"`, the runtime deps from the Tech Stack, and a `dev` dependency group with `pytest` and `httpx`. Then implement the modules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): FastAPI skeleton with data folder, lock, CLI and health`.

---

### Task 2: Database, models, migrations with pre-migration backup

**Files:**
- Create: `apps/api/src/mygolfviz_api/{db,models,migrate}.py`, `apps/api/src/mygolfviz_api/migrations/{env.py,script.py.mako,versions/0001_initial.py}`, `apps/api/tests/test_db.py`
- Modify: `app.py` (run `migrate.upgrade(settings)` in `create_app`; `health.schemaVersion`)

**Interfaces:**
- Produces:
  - `db.make_engine(path: Path) -> Engine`. On every connect it sets `PRAGMA journal_mode=WAL`, `foreign_keys=ON` and `busy_timeout=5000`.
  - `db.session_scope(engine) -> ContextManager[orm.Session]`. It commits on success and rolls back on any exception.
  - `models`: `Session`, `Import`, `Shot`, `Exclusion`, `Setting`, `TargetRange`. Columns are exactly as in spec §5, with these details:
    - `Import`: `byte_length`, `summary_row_count`, and `warnings` (JSON).
    - `Shot.measurements`: JSON holding all 27 keys.
    - Unique (`session_id`, `sha256`) on imports, and unique (`import_id`, `source_row`) on shots.
    - `Exclusion` primary key: (`session_id`, `sha256`, `source_row`).
    - `ON DELETE CASCADE`: sessions→imports→shots and sessions→exclusions.
    - Indexes: `shots.club` and `shots.import_id`.
  - `migrate.upgrade(settings) -> str`. It returns the head revision and uses a programmatic Alembic `Config` whose `script_location` is the package's `migrations` directory, with no `alembic.ini`. If the DB file exists and its current revision ≠ head, it first copies it with `sqlite3.Connection.backup` to `backups/mygolfviz-<UTC yyyymmddTHHMMSSZ>-<from-rev or 'none'>.sqlite3` and keeps the newest 5.

- [ ] **Step 1: Write failing tests** in `test_db.py`:
  - `test_fresh_db_migrates_to_head_without_backup`: `backups/` is empty, and `health.schemaVersion == "0001"`.
  - `test_pending_migration_backs_up_first`: create a DB at an empty base (`alembic stamp base` plus one table), then call `upgrade`. Exactly one backup exists, and it opens as SQLite.
  - `test_keeps_five_backups`: pre-create 6 backup files, run a backup, and check that 5 remain and the oldest are gone.
  - `test_pragmas`: on a connection, `PRAGMA foreign_keys` returns 1 and `journal_mode` returns `wal`.
  - `test_cascade_session_delete`: insert session→import→shot plus an exclusion, delete the session, and check that all four tables are empty.
- [ ] **Step 2: Run** pytest. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** pytest. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): SQLite models, Alembic initial migration, pre-migration backup`.

---

### Task 3: Token and Host checks

**Files:**
- Create: `apps/api/src/mygolfviz_api/security.py`, `apps/api/tests/test_security.py`
- Modify: `app.py`

**Interfaces:**
- Produces: middleware installed by `create_app`, with these rules:
  1. A `Host` header not in the allowed hosts gets 421 and `{"detail": "Wrong host"}`.
  2. `/api/v1/*`, except `/api/v1/health`, requires the token. It is accepted from the `X-MyGolfViz-Token` header or the `mygolfviz_token` cookie, compared with `hmac.compare_digest`. A missing or wrong token gets 401 and `{"detail": "Not authorised"}`.
  3. `GET /?token=<t>` with the correct token returns a 303 to `/`, with `Set-Cookie: mygolfviz_token=<t>; HttpOnly; SameSite=Strict; Path=/`. A wrong token gets 401.
  4. Non-API paths (static files, `index.html`) need no token.

- [ ] **Step 1: Write failing tests:**
  - `test_api_needs_token`: `anon.get("/api/v1/sessions")` returns 401.
  - `test_header_token_ok`: `client.get` on the same path is not 401.
  - `test_token_exchange_sets_cookie`: `anon.get("/?token=t", follow_redirects=False)` returns 303, and the cookie attributes include `httponly` and `samesite=strict`. A later `anon.get("/api/v1/sessions")` (with the cookie jar) returns 200.
  - `test_wrong_host`: a request with `headers={"Host": "evil.example:8765"}` returns 421.
  - `test_health_open`: `anon.get("/api/v1/health")` returns 200.
- [ ] **Step 2: Run** pytest. Expected: FAIL.
- [ ] **Step 3: Implement** `security.py`. For `test_header_token_ok` to pass before Task 4 exists, register `GET /api/v1/sessions` as a stub that returns `[]`.
- [ ] **Step 4: Run** pytest. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): per-launch token and Host header checks`.

---

### Task 4: Import payload fixtures, originals store, import commit and duplicate check

**Files:**
- Create:
  - `apps/web/src/local/importPayload.ts`, `apps/web/src/local/importPayload.test.ts`
  - `fixtures/flightscope/payloads/*.json` (generated)
  - `apps/api/src/mygolfviz_api/{schemas,storage}.py`, `apps/api/src/mygolfviz_api/routers/imports.py`
  - `apps/api/tests/test_imports.py`

**Interfaces:**
- Produces (TS, `apps/web/src/local/importPayload.ts`; no React, no fetch):
  - `interface ImportFileManifest { field: string; name: string; parserVersion: string; summaryRowCount: number; warnings: ParseWarning[]; shots: ParsedShot[]; acceptCrossSessionDuplicate: boolean }`
  - `type ImportTarget = { sessionId: string } | { newSession: { name: string; date: string; notes: string; handedness: Handedness } }`
  - `interface ImportManifest { destination: ImportTarget; files: ImportFileManifest[] }`
  - `toFileManifest(field: string, parse: ParseResult, acceptCrossSessionDuplicate: boolean): ImportFileManifest`
- Produces (generated fixtures): `fixtures/flightscope/payloads/<csv name without .csv>.json` = `toFileManifest("file0", parse, false)` for each of the 3 fixtures. The test writes them when `UPDATE_PAYLOADS=1` and otherwise compares against the committed files.
- Produces (Python):
  - `storage.OriginalStore(data_dir)`:
    - `.put(data: bytes) -> tuple[str, bool]`: returns (sha256, created). It writes `originals/.tmp-<uuid>`, fsyncs, then `os.replace`s it to `<sha>.csv`. If that file already exists, the temp file is deleted and `created=False`.
    - `.path(sha) -> Path`
    - `.delete_if_unreferenced(db, sha) -> bool`
    - `.sweep(db) -> int`: removes `.tmp-*` files and any `<sha>.csv` that no import references. `create_app` calls it at startup.
  - `schemas.ParsedShotIn`: `sourceRow: int ≥ 1`, `shotLabel`, `club: str (min 1)`, `shotType`, `mode` and `location` (all `str | None`), `m: Measurements`, `raw: dict[str, str]`, `flags: list[Literal['no_measurements','check_face_to_path','check_smash']]`.
  - `schemas.Measurements`: 27 explicit `float | None` fields, named exactly as the TS `MeasurementKey`s. `extra="forbid"`, finite numbers only.
  - `POST /api/v1/imports`: multipart, with a `manifest` field (JSON `ImportManifest`) and one file part per `files[i].field`. The response is `ImportResponse { session: SessionRow; results: FileResult[] }`, where `FileResult = { field, name, status: 'imported'|'skipped_duplicate'|'invalid', importId?: str, shotCount?: int, reason?: str, warnings: list }`. A `newSession` destination is created in the same request, before any file is processed. Each file goes through spec §6.1 steps 1–5. Each file is committed in its own transaction. `ordinal` = max + 1.
  - `POST /api/v1/imports/check`: body `{ sha256s: list[str], sessionId: str | None }`. Response: `{ results: [{ sha256, inDestination: bool, otherSessions: [{ id, name }] }] }`.

- [ ] **Step 1: Write the TS test** `importPayload.test.ts`:
  - `test('payload fixtures are up to date')`: parse each fixture CSV, build `toFileManifest('file0', parse, false)`, and either write it (with `UPDATE_PAYLOADS=1`) or `expect(JSON.parse(committed)).toEqual(fresh)`.
  - `test('manifest keeps nulls')`: the first shot of `Sept 19 2022` has `m.impactLateral === null` in the manifest.
- [ ] **Step 2: Run** `UPDATE_PAYLOADS=1 npx vitest run apps/web/src/local/importPayload.test.ts`, then run it again without the env var. Expected: PASS, and three JSON files are created.
- [ ] **Step 3: Write failing pytest tests** in `test_imports.py`, building multipart requests from `fixtures/flightscope/*.csv` plus the matching payload JSON:
  - `test_import_three_into_new_session`: all three are `imported`. The shot counts equal each `expected/*.expected.json` `shotCount`, and the session row's date and name are those sent.
  - `test_roundtrip_matches_golden`: reading the stored `shots` rows directly through `db.session_scope`, each import's shot count, per-club counts and per-key non-null counts (from `measurements`) equal the `expected/*.expected.json` values, and every stored `measurements` dict has all 27 keys.
  - `test_hash_recomputed`: a manifest whose file bytes differ from the fixture still stores `sha256(bytes)`, not anything the client could claim.
  - `test_same_file_twice_in_one_request`: the second result is `skipped_duplicate`.
  - `test_same_file_again_same_session_skipped`: no new rows.
  - `test_cross_session_requires_accept`: without the flag the result is `invalid`, with the reason `in_other_session`. With the flag it is `imported`. Exactly one file exists in `originals/`.
  - `test_invalid_payloads`: unknown `parserVersion`, a missing measurement key, an extra key, a duplicate `sourceRow`, `NaN`, and zero shots each give that file `invalid` while the other files in the batch import.
  - `test_db_failure_leaves_nothing` (Review Focus 3): monkeypatch the shot insert to raise. The import gets status `invalid` with reason `storage_error`. No import or shot rows exist, and `originals/` has no new file.
  - `test_sweep_removes_temp_and_orphans`: create `originals/.tmp-x` and an unreferenced `<sha>.csv`, restart `create_app`, and check both are gone.
  - `test_check_endpoint`: the three statuses are reported correctly.
- [ ] **Step 4: Run** pytest. Expected: FAIL.
- [ ] **Step 5: Implement** `schemas.py`, `storage.py` and `routers/imports.py`.
- [ ] **Step 6: Run** pytest. Expected: PASS.
- [ ] **Step 7: Commit** `feat(api): import commit with re-hash, validation, duplicates and atomic originals`.

---

### Task 5: Sessions, imports management, shots and exclusions endpoints

**Files:**
- Create: `apps/api/src/mygolfviz_api/routers/{sessions,shots}.py`, `apps/api/tests/test_sessions.py`, `apps/api/tests/test_exclusions.py`
- Modify: `routers/imports.py`, `schemas.py`, `app.py`

**Interfaces:**
- Produces (all under `/api/v1`, camelCase JSON):
  - `SessionIn { name: str; date: str (YYYY-MM-DD); notes: str = ""; handedness: 'right'|'left' = 'right' }`, and `SessionPatch` with the same fields, all optional, where `date` may not be null.
  - `SessionRow { id, name, date, notes, handedness, createdAt, updatedAt, shotCount, fileCount, clubs: [{ club, count }] }`. Clubs are in order of first appearance by import ordinal and then source row.
  - `ImportRow { id, sessionId, originalFilename, displayName, sha256, byteLength, ordinal, parserVersion, shotCount, summaryRowCount, warnings, importedAt }`
  - `ShotOut { id, importId, sourceRow, shotLabel, club, shotType, mode, location, m, raw, flags, excluded: bool }`
  - Routes:
    - `GET /sessions` returns `SessionRow[]`.
    - `POST /sessions` creates one. A blank or whitespace name gives 422.
    - `GET /sessions/{id}` returns `{ session: SessionRow, imports: ImportRow[] }`, with imports sorted by ordinal.
    - `PATCH /sessions/{id}` and `DELETE /sessions/{id}`. Delete also garbage-collects unreferenced originals.
    - `GET /sessions/{id}/shots` returns `ShotOut[]`, ordered by import ordinal and then `sourceRow`.
    - `GET /sessions/{id}/imports`.
    - `PATCH /sessions/{id}/imports/order` takes `{ importIds }`. The list must be exactly the session's imports in some order (otherwise 422). It renumbers ordinals to 1..n.
    - `PATCH /imports/{id}` takes `{ displayName: str | null }`.
    - `DELETE /imports/{id}` deletes the import and its shots, garbage-collects the original, and renumbers the remaining ordinals to 1..n. Exclusions are **kept**.
    - `GET /imports/{id}/original` returns the exact bytes as `text/csv`, with `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded original name>`.
    - `PATCH /sessions/{id}/exclusions` takes `{ exclude: [shotId], include: [shotId] }` and applies both in one transaction. Shot ids that aren't in this session give 422. It returns `{ excludedShotIds: [...] }`.
  - Unknown ids give 404, with `{"detail": "Not found"}`.

- [ ] **Step 1: Write failing tests:**
  - `test_create_requires_name_and_date`: missing date gives 422, a `"   "` name gives 422, and `"  Range  "` is stored as `"Range"`.
  - `test_patch_cannot_clear_date`: `{"date": null}` gives 422.
  - `test_library_row_counts`: after importing 2 fixtures, `shotCount`, `fileCount` and the `clubs` counts are right.
  - `test_reorder_and_renumber`: reordering and then deleting the middle import leaves ordinals `[1, 2]`.
  - `test_remove_import_keeps_exclusions`: exclude a shot of import B, delete B, and re-import the same file. The new shot with that `sourceRow` has `excluded == True`.
  - `test_same_file_two_sessions_independent_exclusions`.
  - `test_exclusions_reject_foreign_shot`: a shot id from another session gives 422 and nothing changes.
  - `test_original_download_exact_bytes_and_unicode_name` (Review Focus 5): import with the filename `Range é, 3.csv`. The bytes equal the source bytes, and the `filename*` header decodes to the exact name.
  - `test_remove_last_import_keeps_session` (Review Focus 4): the session still exists, `shotCount == 0`, and `GET /shots` returns `[]`.
  - `test_delete_session_gcs_originals`: an original shared with another session survives, and one that isn't shared is removed.
- [ ] **Step 2: Run** pytest. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** pytest. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): sessions, imports management, shots and exclusions endpoints`.

---

### Task 6: Serving the local frontend and the `npm run local` command

**Files:**
- Create: `apps/api/src/mygolfviz_api/static.py`, `apps/api/tests/test_static.py`, `apps/web/.env.localapp`
- Modify:
  - `app.py`
  - `apps/web/package.json`: add `build:local` = `vite build --mode localapp --outDir dist-local` and `dev:local` = `vite --mode localapp`
  - root `package.json`: add `build:local`, `local` and `api:test`
  - `apps/web/vite.config.ts`: in mode `localapp`, add `server.proxy['/api']` pointing at `http://127.0.0.1:${MYGOLFVIZ_PORT ?? 8765}`, adding the header `X-MyGolfViz-Token: ${MYGOLFVIZ_TOKEN}`

**Interfaces:**
- Produces:
  - When `settings.static_dir` is set, `GET /` and any non-API, non-file path serve `index.html` with `Cache-Control: no-store`, and `/assets/*` files are served as-is. When it is unset, `GET /` returns a small HTML page saying the frontend isn't built (`npm run build:local`).
  - Root `local` script: `npm run build:local && uv run --project apps/api mygolfviz-api --static-dir apps/web/dist-local`.
  - Root `api:test` script: `uv run --project apps/api pytest apps/api/tests -q`.

- [ ] **Step 1: Write failing tests:**
  - `test_index_served_with_static_dir`: with a temp dir holding `index.html` and `assets/a.js`, `GET /` returns the index and `GET /assets/a.js` returns the file.
  - `test_api_404_not_swallowed_by_spa`: `GET /api/v1/nope` returns a 404 JSON response, not the index.
- [ ] **Step 2: Run** pytest. Expected: FAIL.
- [ ] **Step 3: Implement** `static.py` and the scripts.
- [ ] **Step 4: Run** pytest. Expected: PASS. Then run `npm run build:public && npm run verify:public`, which must still pass.
- [ ] **Step 5: Commit** `feat(api): serve the local frontend; npm run local`.

---

### Task 7: Local mode in the frontend — mode, routes, nav, paths, API types

**Files:**
- Create:
  - `apps/web/src/local/LocalRoutes.tsx`, `apps/web/src/local/api.ts`, `apps/web/src/local/api-types.ts` (generated), `apps/web/src/local/openapi.json` (generated)
  - `apps/web/src/paths.ts`, `apps/web/src/local/api.test.ts`
  - `apps/api/src/mygolfviz_api/openapi_dump.py`, `apps/api/tests/test_openapi_fresh.py`
  - `scripts/verify-local-build.mjs`
- Modify:
  - `apps/web/src/mode.ts`, `apps/web/src/mode.test.tsx`
  - `apps/web/src/routes.tsx`, `apps/web/src/layout/Nav.tsx`, `apps/web/src/layout/AppShell.tsx`
  - `apps/web/src/components/{NoAnalysis,ShotHeader,SelectedShotCard}.tsx`, `apps/web/src/pages/{LoadPage,InspectorPage}.tsx`
  - root `package.json`: add `api:types` and `verify:local`; `ci:public` stays unchanged
  - add `openapi-typescript` to the root devDependencies

**Interfaces:**
- Produces:
  - `readAppMode(v): 'public' | 'local'`. Any other value throws `Unsupported VITE_APP_MODE: ${v}. This build supports: public, local`.
  - `LOCAL_NAV = [{ to: '/sessions', label: 'Sessions' }, { to: '/import', label: 'Load Session CSV' }, { to: '/help', label: 'Help' }]`. `Nav` picks the list with the inline env comparison.
  - `paths.ts`: `useAppPaths(): { home: string; load: string; overview: string; inspect: string }`.
    - Public: `{ home: '/', load: '/', overview: '/overview', inspect: '/inspect' }`.
    - Local, when the store has a `sessionId`: `{ home: '/sessions', load: '/import?session=<id>', overview: '/sessions/<id>', inspect: '/sessions/<id>/inspect' }`.
    - Local, with no session: `overview` and `inspect` = `'/sessions'`.
    - Every hard-coded `'/overview'`, `'/inspect'` and `'/'` link in the files listed above uses it.
  - `routes.tsx`: in local mode it renders the lazily imported `LocalRoutes`. The public `<Routes>` stay byte-identical in behaviour.
  - `LocalRoutes`: `/` redirects to `/sessions`. Placeholder pages for `/sessions`, `/sessions/:id`, `/sessions/:id/inspect`, `/import` and `/import/result` are filled in by Tasks 8–12. `/help` is `HelpPage`, and `*` redirects to `/sessions`.
  - `api.ts`:
    - `class ApiError extends Error { status: number; detail: string }`.
    - `request<T>(method, path, body?) => Promise<T>`, with `credentials: 'same-origin'` and a JSON body, throwing `ApiError` on non-2xx. A 401 also dispatches `window` event `mygolfviz:unauthorised`.
    - Typed wrappers with names matching the endpoints: `listSessions`, `createSession`, `getSession`, `patchSession`, `deleteSession`, `getShots`, `reorderImports`, `renameImport`, `deleteImport`, `originalUrl(importId): string`, `patchExclusions`, `checkImports`, `commitImport(manifest: ImportManifest, files: { field: string; file: Blob; name: string }[])`.
    - Types are imported from `api-types.ts` (`components['schemas'][...]`).
  - `LocalRoutes` listens for `mygolfviz:unauthorised` and then replaces the page with `EmptyState` titled `Open MyGolfViz from the link printed in the terminal.`
  - The `api:types` script runs `uv run --project apps/api python -m mygolfviz_api.openapi_dump > apps/web/src/local/openapi.json && npx openapi-typescript apps/web/src/local/openapi.json -o apps/web/src/local/api-types.ts`.
  - `verify-local-build.mjs apps/web/dist-local` fails unless some `.js` file contains `/api/v1/`.

- [ ] **Step 1: Write failing tests:**
  - `mode.test.tsx`: `readAppMode('local') === 'local'`, and the throw message for `'x'` is exact.
  - `api.test.ts` (with `fetch` mocked):
    - `request` sends JSON with `credentials: 'same-origin'`.
    - A 422 throws `ApiError` with `status === 422` and the server's `detail`.
    - A 401 dispatches `mygolfviz:unauthorised`.
    - `commitImport` posts a `FormData` with a `manifest` field and a file part per `field`.
  - `test_openapi_fresh.py`: the committed `apps/web/src/local/openapi.json` equals `json.loads(json.dumps(create_app(settings).openapi()))`.
  - An existing-tests guard: `npx vitest run apps/web/src` stays green. The public route tests (`shell.test.tsx`) are unchanged.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/mode.test.tsx apps/web/src/local` and `npm run api:test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Run `npm run api:types` to generate the two files.
- [ ] **Step 4: Run:**
  - `npx vitest run apps/web/src` and `npm run typecheck`: PASS.
  - `npm run api:test`: PASS.
  - `npm run build:public && npm run verify:public`: PASS, with no `/api/` in `dist`.
  - `npm run build:local && npm run verify:local`: PASS.
- [ ] **Step 5: Commit** `feat(web): local build mode with its own routes, nav and API client`.

---

### Task 8: Store support for an open session

**Files:**
- Modify: `apps/web/src/state/reducer.ts`, `apps/web/src/state/store.tsx`, `apps/web/src/reducer.test.tsx`
- Create: `apps/web/src/local/sessionToWorkingSet.ts`, `apps/web/src/local/sessionToWorkingSet.test.ts`

**Interfaces:**
- Consumes: `ImportRow`, `ShotOut` and `SessionRow` types from `api-types.ts` (Task 7).
- Produces:
  - `StoreState.sessionId: string | null`, with `initialState.sessionId = null`.
  - Action `{ type: 'loadSession'; sessionId: string; workingSet: WorkingSet; details: SessionDetails; excluded: ReadonlySet<string>; keepView: boolean }`. It sets those fields and leaves `staged` untouched.
    - With `keepView: false`, filters become all and the selection becomes null.
    - With `keepView: true`, the club and file filters are kept while they still exist in the new working set (otherwise they are reset), and the selection is kept while the id still exists.
  - Action `{ type: 'clearStaged' }` sets `staged: []` only.
  - `WorkingSetApi` additions: `loadSession(args: Omit<Extract<Action, {type:'loadSession'}>, 'type'>): void` and `clearStaged(): void`.
  - `sessionToWorkingSet(session: SessionRow, imports: ImportRow[], shots: ShotOut[]): { workingSet: WorkingSet; details: SessionDetails; excluded: Set<string> }`:
    - File `id = import.id`, `name = displayName ?? originalFilename`, and `ordinal`, `sha256`, `byteLength`, `parserVersion` come from the import.
    - Shot `id = shot.id`, `fileId = importId`. Shots are ordered by import ordinal and then `sourceRow`.
    - `excluded` = `exclusionKey(sha256, sourceRow)` for every shot with `excluded: true`.
    - `details` = `{ name, date, notes, handedness }`.

- [ ] **Step 1: Write failing tests:**
  - `sessionToWorkingSet.test.ts`: two imports given out of order come back ordered by ordinal. `displayName` overrides `originalFilename`. The excluded keys use the import's sha256. `m` nulls stay null.
  - `reducer.test.tsx`:
    - `test('loadSession replaces the working set and resets the view')`
    - `test('loadSession keepView keeps a still-valid filter and selection, and drops gone ones')`
    - `test('clearStaged leaves the open session alone')`
- [ ] **Step 2: Run** `npx vitest run apps/web/src/reducer.test.tsx apps/web/src/local`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(state): open a saved session in the working-set store`.

---

### Task 9: Session route loader and saving details and exclusions

**Files:**
- Create: `apps/web/src/local/SessionRoute.tsx`, `apps/web/src/local/useSessionSync.ts`, `apps/web/src/local/useSessionSync.test.tsx`
- Modify: `apps/web/src/local/LocalRoutes.tsx`, `apps/web/src/components/SessionDetailsForm.tsx` (+ test)

**Interfaces:**
- Consumes: `api.getSession`, `api.getShots`, `api.patchSession`, `api.patchExclusions`, `sessionToWorkingSet`, `ws.loadSession`.
- Produces:
  - `SessionRoute({ page: 'overview' | 'inspect' })`:
    - It reads `:id`. If `ws.sessionId !== id`, it fetches the session and its shots, then calls `loadSession({..., keepView: false})`, showing `Loading session…` meanwhile.
    - A 404 shows `EmptyState` titled `Session not found`, with a link to Sessions.
    - Otherwise it renders `OverviewPage` or `InspectorPage`. When the session has 0 shots, it renders a bare `<h1>{name}</h1>` for now; Task 12 replaces that with `EmptySession`.
  - `useSessionSync(): void`, mounted once inside `LocalRoutes`. It keeps a ref `saved = { sessionId, details, excluded }`, which is reset on every `loadSession`.
    - **Details:** when `details` differs from `saved.details`, it debounces 400 ms, then PATCHes only the changed fields that are valid. The name must be non-blank after trimming, and the date must be non-null. On success it updates `saved.details`. On failure it shows `toast.error("Couldn't save session details")` and dispatches `setDetails(saved.details)`.
    - **Exclusions:** when `excluded` differs from `saved.excluded`, it computes the added and removed keys, maps them to shot ids through the working set, and queues one PATCH.
    - **Queue:** there is at most one request in flight. When it finishes, the next request is computed from the *current* state against `saved`. On failure it shows `toast.error("Couldn't save exclusions")` and dispatches `setExcludedKeys(saved.excluded)`.
  - `SessionDetailsForm` gets a new prop, `required?: boolean` (default false).
    - When true, the name and date inputs get `required`, and clearing the date input emits no change.
    - An empty name shows `Name is required` under the field.
    - The public behaviour is unchanged when the prop is false.

- [ ] **Step 1: Write failing tests** in `useSessionSync.test.tsx`, using fake timers and a mocked `api`:
  - `test('details are saved once after 400 ms of no typing')`
  - `test('a blank name is not sent; the other changed fields are')`
  - `test('a failed details save rolls back and toasts')`
  - `test('fast exclude/include/exclude sends requests one at a time and ends at the final state')` (Review Focus 2): the first PATCH's promise is held open while two more toggles happen. After it resolves, exactly one more PATCH is sent, and the server-side tally (the mock) equals the final on-screen excluded set.
  - `test('a failed exclusion save rolls back to the last saved set')`
  - In `SessionDetailsForm` tests: `required` blocks clearing the date and shows `Name is required`, and the default (`required` false) still emits `date: null` on clear.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local apps/web/src/components`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pass `required` to the details form in `OverviewPage` only when the inline local-mode comparison is true.
- [ ] **Step 4: Run** the same tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(local): open sessions by URL and save details and exclusions as you go`.

---

### Task 10: Session library — list and calendar

**Files:**
- Create: `apps/web/src/local/LibraryPage.tsx`, `apps/web/src/local/LibraryList.tsx`, `apps/web/src/local/LibraryCalendar.tsx`, `apps/web/src/local/library.ts`, `apps/web/src/local/library.test.ts`, `apps/web/src/local/LibraryPage.test.tsx`, `apps/web/src/local/DeleteSessionDialog.tsx`
- Modify: `apps/web/src/local/LocalRoutes.tsx`, `apps/web/src/styles/app.css`

**Interfaces:**
- Produces:
  - `library.ts` (pure):
    - `type LibrarySort = 'date-desc' | 'date-asc' | 'shots-desc' | 'shots-asc' | 'name-asc' | 'name-desc'`.
    - `filterSessions(rows: SessionRow[], query: string): SessionRow[]`: case-insensitive match on name, notes or any club name.
    - `sortSessions(rows: SessionRow[], sort: LibrarySort): SessionRow[]`: ties are broken by `createdAt` descending.
    - `monthGrid(year: number, month0: number): { date: string; inMonth: boolean }[]`: 42 cells, Monday first.
    - `sessionsByDate(rows: SessionRow[]): Map<string, SessionRow[]>`.
    - `todayLocal(now?: Date): string`: `YYYY-MM-DD` from the local calendar fields (`getFullYear`, `getMonth`, `getDate`), never `toISOString`.
  - `LibraryPage`:
    - The URL query `?view=list|calendar` defaults to list. The header shows `Sessions` and `` `${n} sessions · ${shots} shots · ${files} source files` ``. It has the search box, the Sort select (list view only) and the List/Calendar segmented control, laid out and worded as in frame `00`.
    - **List:** the frame `00` table (name link → `/sessions/<id>`, date via `formatSessionDate` without the "(set by you)" suffix, shots, files, club chips `Club n`). It has a row action menu with `Open` and `Delete session`.
    - **Calendar:** the frame `01` layout without the "No date set" panel, with Today and previous/next month. Clicking a day selects it, and the side panel lists that day's sessions with shots, files, clubs and a link.
    - **Empty state:** title `No sessions yet`, body `Load one or more FlightScope CSV exports. You choose the session they belong to and what it is called.`, and a `Load Session CSV` button → `/import`.
  - `DeleteSessionDialog({ session, onDeleted })`: a Base UI `AlertDialog` titled `` `Delete “${name}”?` `` with the body `` `This removes ${shotCount} shots and ${fileCount} files from MyGolfViz. The original CSVs on your computer are not touched.` `` and the buttons `Cancel` and `Delete session`. On confirm it calls `api.deleteSession`. If the store's `sessionId` is the deleted one, it calls `ws.clear()` and navigates to `/sessions`.

- [ ] **Step 1: Write failing tests:**
  - `library.test.ts`:
    - `filterSessions` matches on a club name and on a note.
    - `sortSessions` in each order, including the tie-break.
    - `monthGrid(2026, 10)` (November 2026): the first cell is `2026-10-26`, there are 42 cells, and the first `inMonth` cell is `2026-11-01`.
    - `todayLocal(new Date(2026, 10, 12, 23, 30))` returns `'2026-11-12'`.
  - `LibraryPage.test.tsx` (mocked `api.listSessions`):
    - The list shows two rows sorted newest first.
    - Typing a club name filters the list.
    - Switching to Calendar shows the session on its day.
    - With zero sessions, the empty state shows and its button goes to `/import`.
    - Delete confirm calls `api.deleteSession` and removes the row.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the design tokens and match frames `00` and `01`.
- [ ] **Step 4: Run** the same tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(local): session library with list and calendar views`.

---

### Task 11: Import into a new or existing session

**Files:**
- Create: `apps/web/src/local/ImportDestination.tsx`, `apps/web/src/local/ImportDestination.test.tsx`, `apps/web/src/local/ImportResultPage.tsx`, `apps/web/src/local/useImportCommit.ts`
- Modify: `apps/web/src/pages/LoadPage.tsx`, `apps/web/src/pages/LoadPage.test.tsx`, `apps/web/src/local/LocalRoutes.tsx`, `apps/web/src/state/store.tsx`

**Interfaces:**
- Consumes: `toFileManifest`, `api.checkImports`, `api.commitImport`, `api.listSessions`, `ws.clearStaged`, `todayLocal`.
- Produces:
  - `store.addFiles` keeps the original `File` per staged key in a ref map, `filesByKey: ReadonlyMap<string, File>`, exposed on `WorkingSetApi` (local mode only uses it). The map is cleared on `clear` and `clearStaged`. Public behaviour is unchanged.
  - `ImportDestination({ staged, value, onChange })`:
    - `value: ImportTarget & { accept: Record<sha256, boolean> }`.
    - A radio group labelled `Add to` with `New session` and `Existing session`.
    - **New session:** a `SessionDetailsForm` with `required`. The date is pre-filled with `todayLocal()` when the form first renders, and the name starts empty.
    - **Existing session:** a select of sessions (newest first). It is preselected from `?session=<id>`, and choosing `?session` also preselects the `Existing session` radio.
    - It calls `api.checkImports` whenever the included hashes or the destination change. For each included file it renders `Already in this session — will be skipped`, or `` `Also in “${name}”` `` with an `Import anyway` checkbox, which writes to `accept`.
  - `LoadPage` in local mode:
    - It hides `PrivacyNotice`, the "Run Local App" link and the public session details section, and renders `ImportDestination` in their place (lazily imported).
    - The secondary button is `Clear files` (`clearStaged`).
    - The primary button is `Import files`. It is disabled when there are no included shots, when a new session has a blank name, or while a commit is running.
  - `useImportCommit()` returns `{ commit(dest, staged, accept): Promise<ImportResponse>, busy }`. It builds the manifest with `field = "file" + index`, sending `parse` for each included `ok` file, the `File` from `filesByKey`, and `accept[sha]`.
  - After a commit, `clearStaged()` runs and the page navigates to `/import/result`, passing the response in router state.
  - `ImportResultPage`, laid out as in frame `03`:
    - **Heading:** `` `Imported into “${session.name}”` ``.
    - **Count line:** `` `${filesAdded} files added · ${shotsAdded} shots added · ${skipped} skipped · ${invalid} not imported` ``.
    - **Per-file list:** status, shots, warnings count, and for `invalid` the reason text from a lookup: `in_other_session` → `Also in another session — not imported`, `storage_error` → `Couldn't save this file`, anything else → `Not a valid FlightScope export`.
    - **Buttons:** `Open session` → `/sessions/<id>`, and `Load more files` → `/import?session=<id>`.
    - Opened without state, the page redirects to `/sessions`.

- [ ] **Step 1: Write failing tests:**
  - `ImportDestination.test.tsx` (mocked api):
    - The new-session date is pre-filled with the local date. Use a fake system time of `2026-11-13T05:00:00Z` with `TZ=America/Los_Angeles`, and expect `2026-11-12` (Review Focus 1). Set `process.env.TZ` in the test file's top-level setup.
    - `?session=s1` preselects Existing session and `s1`.
    - The duplicate statuses render, and ticking `Import anyway` sets `accept[sha] = true`.
  - `LoadPage.test.tsx`, in local mode (`vi.stubEnv('VITE_APP_MODE', 'local')`, `vi.resetModules()`, then a dynamic import of the page, because the lazy choice is made at module load):
    - `Import files` is disabled with a blank new-session name.
    - A successful commit (mocked) navigates to `/import/result` and clears the staged list.
    - The public-mode tests are unchanged and still pass.
  - Also in `ImportDestination.test.tsx`: `ImportResultPage` renders the count line for a mixed response, and the reason text for each `invalid` reason.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local apps/web/src/pages/LoadPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same tests, `npm run typecheck`, and `npm run build:public && npm run verify:public`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(local): import CSVs into a new or existing session`.

---

### Task 12: Session page extras — imports panel, delete session, empty session

**Files:**
- Create: `apps/web/src/local/ImportsPanel.tsx`, `apps/web/src/local/ImportsPanel.test.tsx`, `apps/web/src/local/EmptySession.tsx`, `apps/web/src/local/useReloadSession.ts`
- Modify: `apps/web/src/pages/OverviewPage.tsx` (a slot for local extras, lazily imported with the inline env check), `apps/web/src/local/SessionRoute.tsx`, `apps/web/src/pages/HelpPage.tsx`

**Interfaces:**
- Consumes: `api.reorderImports`, `api.renameImport`, `api.deleteImport`, `api.originalUrl`, `DeleteSessionDialog`, `sessionToWorkingSet`, `ws.loadSession`.
- Produces:
  - `useReloadSession(): () => Promise<void>`. It re-fetches the open session and its shots, then calls `loadSession({..., keepView: true})`.
  - `ImportsPanel()`, rendered on the local Overview below the shot table:
    - Its heading is `Files`. It lists the imports by ordinal: `FileBadge` (F1…), name, `` `${shotCount} shots` ``, imported date, and the warnings count.
    - **Row controls:** `Move up`, `Move down`, `Rename` (an inline text input, where saving an empty value sends `displayName: null`), `Download original` (`<a href={api.originalUrl(id)} download>`), and `Remove file`.
    - `Remove file` opens an `AlertDialog` titled `` `Remove “${name}”?` `` with the body `` `Its ${shotCount} shots leave this session. Exclusions you set on them are kept in case you add the file again.` ``.
    - Every change calls the API and then `reloadSession()`. A failure shows `toast.error` with the server `detail`.
    - The panel ends with buttons `Load Session CSV` (→ `/import?session=<id>`) and `Delete session` (`DeleteSessionDialog`).
  - `EmptySession()` (when the session has 0 shots): an `EmptyState` titled `No shots in this session` with the body `Load one or more CSV exports into it.`, a `Load Session CSV` button → `/import?session=<id>`, and the `ImportsPanel` underneath (empty list, Delete session still available).
  - `HelpPage` in local mode replaces the stateless/privacy paragraph and the "Run Local App" link with one sentence: `Your sessions and the original CSV files are saved on this computer in the MyGolfViz data folder.` The rest is unchanged.

- [ ] **Step 1: Write failing tests** in `ImportsPanel.test.tsx` (mocked api and a store preloaded via `loadSession`):
  - `Move down` on F1 calls `reorderImports([id2, id1])` and then reloads.
  - Renaming to blank sends `displayName: null`.
  - `Remove file` confirm calls `deleteImport` and reloads, and the shot count in the Overview updates.
  - Removing the last file renders `No shots in this session` (Review Focus 4).
  - `Download original` has `href` `/api/v1/imports/<id>/original` and a `download` attribute.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/local`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run apps/web/src`, `npm run typecheck`, and `npm run build:public && npm run verify:public`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(local): files panel, delete session and empty-session state`.

---

### Task 13: Local end-to-end tests, CI job and README

**Files:**
- Create: `playwright.local.config.ts`, `e2e-local/helpers.ts`, `e2e-local/sessions.spec.ts`
- Modify: root `package.json` (`e2e:local`, `ci:local`), `.github/workflows/ci.yml` (a new `local` job), `README.md` (a "Local App" section that replaces the "planned" line), `tsconfig.json` (include `e2e-local`, `playwright.local.config.ts`)

**Interfaces:**
- Produces:
  - `playwright.local.config.ts`:
    - `testDir: 'e2e-local'` and `baseURL: 'http://127.0.0.1:8799/'`.
    - `webServer.command`: `npm run build:local && MYGOLFVIZ_TOKEN=e2e MYGOLFVIZ_DATA_DIR=$(mktemp -d) uv run --project apps/api mygolfviz-api --port 8799 --static-dir apps/web/dist-local`.
    - `workers: 1` (one shared database).
  - `e2e-local/helpers.ts`:
    - `signIn(page)` goes to `/?token=e2e` and expects the Sessions heading.
    - `importInto(page, files, dest: { newName: string } | { existing: string })`.
  - Scripts: `e2e:local` = `playwright test -c playwright.local.config.ts`, and `ci:local` = `npm run api:test && npm run build:local && npm run verify:local && npm run e2e:local`.
  - CI `local` job: Node from `.nvmrc`, `astral-sh/setup-uv`, `npm ci`, the Playwright chromium install, then `npm run ci:local`.

- [ ] **Step 1: Write** `sessions.spec.ts`, implementing the spec §11 step 1 "done when" scenario as one test plus two short ones:
  - `test('create, append, remove, exclude, restart-proof')`:
    1. Sign in.
    2. Import 3 fixtures into a new session `Range A` with date `2026-11-01`. Expect the result page to say `3 files added`.
    3. Open the session. Add the remaining files again into `Range A`, expecting `skipped`.
    4. Remove file F2. Exclude one shot.
    5. Reload the page (`page.reload()`). The exclusion (`1 excluded`), the name, the date and the remaining file order all survive.
    6. Restarting the backend is covered by pytest. Here, a full reload with the cookie proves the data comes from the server.
  - `test('library calendar shows the session on its date')`
  - `test('cross-session duplicate asks before importing')`
- [ ] **Step 2: Run** `npm run e2e:local`. Expected: PASS. (These tests cover features built in Tasks 1–12, so they should pass on the first run. If one fails, fix the feature, not the test.)
- [ ] **Step 3: Update** the README "Local App" section:
  - Prerequisites: `brew install uv`, Node 24.
  - Run: `npm run local`, then open the printed URL.
  - Where data lives.
  - Develop: `npm run dev:local` with `MYGOLFVIZ_TOKEN=dev`, and the backend started with `MYGOLFVIZ_TOKEN=dev uv run --project apps/api mygolfviz-api`.
  - Tests: `npm run ci:local`.
- [ ] **Step 4: Run** `npm run ci:public` and `npm run ci:local`. Expected: both PASS.
- [ ] **Step 5: Commit** `test(local): end-to-end sessions flow; CI job and README`.
