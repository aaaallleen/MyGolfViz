# Local App Step 2 — Mac App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MyGolfViz.app` for Apple Silicon. It is built locally with one command as an unsigned `.dmg`, and it starts the bundled backend and shows the step-1 library. It keeps data across quit/reopen and across installing a newer build, and it never needs Python or Node on the Mac.

**Architecture:**
- **Electron shell:** `apps/desktop` is an Electron main process plus preload, in TypeScript compiled to CommonJS.
- **Startup:**
  - It resolves the data folder and spawns the backend: a PyInstaller one-folder binary when packaged, or `apps/api/.venv/bin/mygolfviz-api` in development.
  - The backend is started with `--port 0 --exit-with-stdin`. Main reads the backend's one JSON port line, polls `/api/v1/health`, then loads the printed tokenised URL in a sandboxed window.
  - A local splash page shows during startup.
- **Errors:** a local error page offers Restart backend / Open logs / Quit.
- **Testability:** the main-process logic lives in small, pure modules, so Vitest can test it without Electron. Playwright's Electron driver tests the wired app, both in development and packaged.
- **Backend changes:** the backend gains what the shell needs:
  - exiting when its parent goes away;
  - a clean SIGTERM shutdown with a WAL checkpoint;
  - distinct exit codes;
  - a CSP header.
  - It also absorbs three step-2 follow-ups from the step-1 review.

**Tech Stack:**
- Electron `45.2.0` and electron-builder `26.18.1`. Pin both exactly; they are the newest releases at least two weeks old on 2026-11-13.
- TypeScript 7 (`module: nodenext`, CommonJS output).
- Vitest (node environment) and Playwright `_electron`.
- PyInstaller `6.22.3`, in the uv dependency group `build`.
- `iconutil` is not needed: electron-builder converts a 1024 px PNG.

**Spec:** `docs/superpowers/specs/2026-11-13-local-app-design.md`. Read it first. §4, §4.2, §4.3, §10, §11 step 2 and §14 "Mac app" are the source of truth. The step-1 plan, `docs/superpowers/plans/2026-11-13-local-app-step1-saving-sessions.md`, describes the backend and local build this plan builds on. Do not reread it in full; the Interfaces blocks below name what you use.

## Global Constraints

- **Public build unchanged.** `npm run ci:public` stays green on every commit. Do not edit `scripts/verify-public-build.mjs`. `npm run ci:local` also stays green.
- **Platform:** Apple Silicon (`arm64`) macOS only for the app. Do not add hard-coded Mac-only paths or Mac-only APIs to Python. Use `platformdirs` and plain `os` calls. Guard `fcntl.F_FULLFSYNC` with `hasattr`.
- **Pinned versions:** `electron` `45.2.0` and `electron-builder` `26.18.1`, as exact versions in `apps/desktop/package.json` `devDependencies`. `pyinstaller==6.22.3` goes in `[dependency-groups] build` of `apps/api/pyproject.toml`.
- **App identity:** `productName` `MyGolfViz`, `appId` `io.github.aaaallleen.mygolfviz`. The workspace package is named `@fsa/desktop`, with `"type": "commonjs"` and `"private": true`.
- **Data folder:** if `MYGOLFVIZ_DATA_DIR` is set, use it; otherwise use `path.join(app.getPath('appData'), 'MyGolfViz')`. On macOS that is `~/Library/Application Support/MyGolfViz`, the same folder `npm run local` uses. Electron's own `userData` is set to `<dataDir>/electron` before `app.whenReady()`, so Chromium caches never sit beside the database.
- **Token:** the backend generates it, as in step 1. Electron opens the `url` from the port line and never passes or reads a token itself (spec §4.3).
- **Backend launch (both modes):** args `--data-dir <dataDir> --port 0 --static-dir <webDir> --exit-with-stdin`.
  - The env is `process.env` minus `MYGOLFVIZ_TOKEN` and `MYGOLFVIZ_DATA_DIR`.
  - stdio is `['pipe', 'pipe', 'pipe']`. Electron keeps stdin open, and **always drains stdout and stderr**.
- **Backend locations:**
  - Packaged: binary `<resourcesPath>/api/mygolfviz-api/mygolfviz-api`, web `<resourcesPath>/web`.
  - Development: binary `<repo>/apps/api/.venv/bin/mygolfviz-api`, web `<repo>/apps/web/dist-local`.
- **Backend exit codes:**
  - `0`: clean shutdown.
  - `3`: data folder already in use. This one already exists, with stderr `MyGolfViz is already running with this data folder`.
  - `4`: startup failed before the port line, for example a migration error.
- **Timeouts:**
  - Startup: port line plus first `200` from `/api/v1/health` within **30 s**. Poll every 100 ms.
  - Quit: SIGTERM, then SIGKILL after **5 s**.
- **Electron security:**
  - `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webviewTag: false`.
  - Every permission request is denied.
  - Navigation is allowed only to the backend origin. `http:`/`https:` URLs on any other origin open in the system browser; everything else is blocked.
  - `window.open` is denied and routed to the same rule.
- **CSP**, sent by the backend on every HTML response from the SPA route, verbatim: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. The splash and error pages carry `default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' data:` in a meta tag.
- **Copy, verbatim:**
  - Splash: `Starting MyGolfViz…`
  - Buttons: `Restart backend`, `Open logs`, `Quit`
  - App-menu items: `Open Data Folder`, `Open Logs`
  - Exit 3, title `MyGolfViz is already running`; body `Another copy is using your data folder (for example npm run local in a terminal). Quit it, then choose Restart backend.`
  - Exit 4 or any other startup failure, title `MyGolfViz couldn't start`; body `Details are in the logs.`
  - Startup timeout, title `MyGolfViz couldn't start`; body `It took too long to start. Details are in the logs.`
  - Backend died while the app was open, title `MyGolfViz stopped unexpectedly`; body `Your saved sessions are safe. Restart the backend to continue.`
- **Logs:** the backend writes `<dataDir>/logs/mygolfviz-api.log`, as it already does. Electron appends lifecycle events, plus each backend stderr line prefixed `[api] `, to `<dataDir>/logs/mygolfviz-desktop.log`. "Open Logs" opens the `logs` folder.
- **Commands:**
  - TS: `npx vitest run <path>`, `npm run typecheck`.
  - Python: `uv run --project apps/api pytest apps/api/tests -q`.
  - Node 24: prefix with `PATH=$HOME/.nvm/versions/node/v24.11.0/bin:$PATH` if the shell's Node is older.

## Review Focus

1. **Electron killed or crashing.** If the app is force-quit or crashes, the backend must exit too. Otherwise it keeps the lock and the next launch says "already running" forever. The backend exits when its stdin reaches EOF. The test is in Task 1.
2. **A chatty backend.** If Electron stops reading the backend's stdout/stderr, the pipe fills and the backend freezes mid-request after enough logging. Both streams must be drained for the whole life of the process. The test is in Task 3, with a real child that writes 4 MB to each stream.
3. **Copy/paste in text fields.** Cmd+C, Cmd+V, Cmd+X, Cmd+A, Cmd+Z and Shift+Cmd+Z must work in the session name and notes fields. On macOS they only work if the menu has an Edit menu with those roles. The test is in Task 4.
4. **A disconnected second display.** A window last placed on a display that is gone must open fully on a visible display, not off-screen. The test is in Task 4.
5. **Accidental navigation.** A CSV dropped outside the drop zone, or a link to another site, must not replace the app with a file view or a web page. Other-site `http(s)` links open in the default browser; everything else is blocked. Unit tests are in Task 4; the e2e is in Task 5.

---

### Task 1: Backend lifecycle for a parent process

**Files:**
- Modify: `apps/api/src/mygolfviz_api/__main__.py`, `apps/api/src/mygolfviz_api/app.py`, `apps/api/src/mygolfviz_api/migrate.py`
- Test: `apps/api/tests/test_lifecycle.py` (new)

**Interfaces:**
- Consumes:
  - `main(argv) -> int` and `open_listening_socket(host, port)` in `__main__.py`
  - `create_app(settings)`, `upgrade(settings) -> str`
  - `backup_database(settings, from_rev) -> Path`
  - `DataLock`, `AlreadyRunning`
- Produces:
  - CLI flag `--exit-with-stdin`.
  - Exit codes `0` / `3` / `4`, as in Global Constraints.
  - A FastAPI lifespan shutdown that runs `PRAGMA wal_checkpoint(TRUNCATE)` and then `engine.dispose()`.
  - Log lines `migration backup written to <path>` (INFO) and `migration failed` (ERROR with traceback, logger `mygolfviz_api.migrate`).

- [ ] **Step 1: Write the failing tests** in `test_lifecycle.py`. Each test spawns `[sys.executable, "-m", "mygolfviz_api", "--data-dir", tmp, "--port", "0", ...]`, as `test_app.py::test_cli_prints_port_line` does, and reads the JSON port line.
  - `test_sigterm_exits_cleanly_and_checkpoints`: import one fixture CSV through the API so the WAL has content, then `p.send_signal(SIGTERM)`.
    - `p.wait(timeout=5) == 0`.
    - `mygolfviz.sqlite3-wal` is absent or 0 bytes.
    - `DataLock(tmp)` can be entered.
  - `test_exits_when_stdin_closes`: start with `--exit-with-stdin` and `stdin=PIPE`, then `p.stdin.close()`.
    - `p.wait(timeout=5) == 0`.
    - `DataLock(tmp)` can be entered.
  - `test_stdin_flag_absent_keeps_running`: same, without the flag. After closing stdin, the process is still alive 1 s later. Then terminate it.
  - `test_lock_held_exits_3`: hold `DataLock(tmp)` in the test.
    - Exit code `3`.
    - stderr contains `MyGolfViz is already running with this data folder`.
    - stdout is empty.
  - `test_startup_failure_exits_4_and_logs`:
    - Write a file named `mygolfviz.sqlite3` containing `not a database`.
    - Exit code `4`, nothing on stdout.
    - `logs/mygolfviz-api.log` contains `migration failed` and a traceback line.
  - `test_migration_backup_path_logged`: create a DB at an older revision, using the pattern of the existing migration-upgrade test in `test_db.py`. Start `create_app`. The log contains `migration backup written to` followed by an existing path.

- [ ] **Step 2: Run them and see them fail.** `uv run --project apps/api pytest apps/api/tests/test_lifecycle.py -q`, then expect failures, not errors in collection.

- [ ] **Step 3: Implement.**
  - **`__main__.py`:**
    - Add `--exit-with-stdin`. A daemon thread reads `sys.stdin.buffer` until EOF, then sets `server.should_exit = True`.
    - Wrap everything between taking the lock and printing the port line in `try/except Exception`. On failure, log with `logger.exception`, print `MyGolfViz couldn't start: <exc>` to stderr, and `return 4`. The lock is still released in `finally`.
  - **`app.py`:** a `lifespan` context manager whose shutdown runs the checkpoint on `app.state.engine` and then disposes it. Uvicorn already turns SIGTERM into a graceful shutdown, so do not install your own signal handler.
  - **`migrate.py`:** log the backup path after `backup_database`, and wrap `command.upgrade` in `try/except` that logs `migration failed` and re-raises.
  - **`create_app`:** call `attach_log_handler` before `upgrade`, as it already does, so the failure reaches the file.

- [ ] **Step 4: Run the whole Python suite.** `uv run --project apps/api pytest apps/api/tests -q` → all pass.

- [ ] **Step 5: Commit.** `feat(api): exit with the parent, checkpoint on SIGTERM, distinct startup exit codes`

### Task 2: Backend hardening — CSP, non-HTTP scopes, durable originals

**Files:**
- Modify: `apps/api/src/mygolfviz_api/static.py`, `security.py`, `storage.py`, `e2e-local/sessions.spec.ts` (or `e2e-local/helpers.ts`)
- Test: `apps/api/tests/test_static.py`, `test_security.py`, `test_imports.py` (add tests)

**Interfaces:**
- Consumes: `install_static(app, static_dir)`, `SecurityMiddleware`, `OriginalStore.put(data) -> tuple[str, bool]`.
- Produces: the `CSP` constant in `static.py`, with the exact value from Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - `test_static.py::test_index_has_csp`:
    - `GET /`, and a deep link like `GET /some/route`, served from a temp static dir holding `index.html`, both have a `Content-Security-Policy` header equal to the constant.
    - `GET /assets/x.js` has no CSP header.
    - The placeholder page also has the header.
  - `test_security.py::test_websocket_scope_rejected`: a raw ASGI call with `{"type": "websocket", ...}` gets `websocket.close` and never reaches the inner app. Use a sentinel inner app that fails if called. `lifespan` scopes still pass through to the inner app.
  - `test_imports.py::test_put_fsyncs_directory`: monkeypatch `os.fsync` to record the file descriptors passed. Check that `OriginalStore.put` fsyncs both the temp file and a descriptor opened on the `originals` directory, in that order, after the replace.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement.**
  - **`static.py`:** add the CSP header wherever `index.html` or the placeholder is returned.
  - **`security.py`:** `lifespan` passes through; `http` keeps today's checks; any other scope type is closed. For `websocket`, send `{"type": "websocket.close", "code": 1008}`.
  - **`storage.py`:** after `os.replace`, call `os.open(dir, os.O_RDONLY)`, then `os.fsync`, then close. On macOS also call `fcntl.fcntl(fd, fcntl.F_FULLFSYNC)` on the file when `hasattr(fcntl, "F_FULLFSYNC")`. Ignore `OSError` from the directory fsync on filesystems that refuse it.

- [ ] **Step 4: Prove the CSP doesn't break the app.**
  - In `e2e-local`, register `page.on('console')` plus an `addInitScript` that records `securitypolicyviolation` events.
  - At the end of the main flow, assert zero violations.
  - Run `npm run e2e:local` → 3 passed. If a violation appears, fix the cause, but do not loosen the CSP without recording a ruling.

- [ ] **Step 5: Run `npm run ci:local` → green. Commit:** `feat(api): CSP on the app page, close non-HTTP scopes, fsync the originals folder`

### Task 3: Desktop package and the backend process manager

**Files:**
- Create:
  - `apps/desktop/package.json`, `apps/desktop/tsconfig.json`
  - `apps/desktop/src/backend/portLine.ts`, `apps/desktop/src/backend/command.ts`, `apps/desktop/src/backend/BackendProcess.ts`
  - `apps/desktop/src/startupError.ts`
  - `apps/desktop/test/fake-backend.mjs`
- Modify: `vitest.config.ts` (add an `apps/desktop` node project), root `package.json` (`typecheck` also runs `tsc --noEmit -p apps/desktop/tsconfig.json`), `.gitignore` (`apps/desktop/dist/`, `apps/desktop/release/`, `apps/api/build/`, `apps/api/dist/`)
- Test: `apps/desktop/src/backend/*.test.ts`, `apps/desktop/src/startupError.test.ts`

**Interfaces:**
- Produces (exact signatures; later tasks use them):
  - `parsePortLine(line: string): { port: number; url: string } | null`. Returns null unless the line is JSON with an integer `port` in 1–65535 and a `url` starting with `http://127.0.0.1:<port>/`.
  - `backendCommand(o: { packaged: boolean; resourcesPath: string; repoRoot: string; dataDir: string; env: NodeJS.ProcessEnv }): { command: string; args: string[]; env: NodeJS.ProcessEnv }`.
  - `class BackendProcess`:
    - `constructor(opts: { command: string; args: string[]; env: NodeJS.ProcessEnv; startupTimeoutMs?: number; fetchImpl?: typeof fetch; spawnImpl?: typeof spawn; onLog?: (line: string) => void })`
    - `start(): Promise<{ url: string; pid: number }>` rejects with `BackendStartError`.
    - `stop(timeoutMs = 5000): Promise<void>`
    - `onUnexpectedExit(cb: (code: number | null, signal: NodeJS.Signals | null) => void): void`
    - `readonly stderrTail: string[]` holds the last 50 lines.
  - `class BackendStartError extends Error { kind: 'already-running' | 'failed' | 'timeout'; exitCode: number | null }`
  - `startupErrorCopy(kind: 'already-running' | 'failed' | 'timeout' | 'crashed'): { title: string; body: string }` returns the Global Constraints copy.

- [ ] **Step 1: Scaffold the package.**
  - `package.json`:
    - name `@fsa/desktop`, `"type": "commonjs"`, `main` `dist/main.js`.
    - Scripts: `build` (`tsc -p tsconfig.json`), `dev`, `dist`; fill these in Task 4/5.
    - devDependencies: exact `electron` `45.2.0` and `electron-builder` `26.18.1`.
  - `tsconfig.json`: extends `../../tsconfig.base.json`, overrides `module`/`moduleResolution` `nodenext`, sets `lib` to `["ES2023", "DOM"]`, `types` to `["node"]`, `noEmit: false`, `outDir: dist`, `rootDir: src`, and excludes `**/*.test.ts`.
  - Run `npm install` at the root, then `npm run typecheck` → passes.

- [ ] **Step 2: Write the failing tests.**
  - `portLine.test.ts`:
    - `{"port": 50123, "url": "http://127.0.0.1:50123/?token=abc"}` parses.
    - These return null: non-JSON, port 0, port 70000, `url` on `localhost`, `url` with a different port, `url` with an `https:` scheme, a missing url.
  - `command.test.ts`:
    - Packaged mode gives `<res>/api/mygolfviz-api/mygolfviz-api` with args `['--data-dir', d, '--port', '0', '--static-dir', '<res>/web', '--exit-with-stdin']`.
    - Development mode gives `<repo>/apps/api/.venv/bin/mygolfviz-api` with `--static-dir <repo>/apps/web/dist-local`.
    - In both, the returned env has no `MYGOLFVIZ_TOKEN` and no `MYGOLFVIZ_DATA_DIR`, even when the input env has them, and keeps `PATH`.
  - `startupError.test.ts`: each kind returns the exact title and body.
  - `BackendProcess.test.ts` runs `node test/fake-backend.mjs <mode>` as a real child. In mode `ok`, the fake opens an HTTP server on port 0 with `/api/v1/health`, prints the port line, and stays up until SIGTERM.
    - `start()` resolves with the url and pid. `stop()` resolves within 5 s and the child is gone.
    - **Review Focus 2:** in mode `chatty`, after the port line the fake writes 4 MB to stdout and 4 MB to stderr, then writes a marker file. The marker appears within 5 s of `start()` resolving, and `stderrTail.length <= 50`.
    - Mode `exit3` prints the already-running message to stderr and exits 3: `start()` rejects with kind `already-running`. Mode `exit4`: kind `failed`, exitCode 4, and `stderrTail` holds its message.
    - Mode `silent` never prints a port line. With `startupTimeoutMs: 500`, the result is kind `timeout`, and the child has been killed.
    - Mode `ok`, then the test kills the child with SIGKILL: the `onUnexpectedExit` callback fires once. After `stop()`, a later exit does **not** fire it.
    - Mode `ignore-term` ignores SIGTERM: `stop(500)` resolves after SIGKILL.

- [ ] **Step 3: Run them and see them fail.** `npx vitest run apps/desktop`

- [ ] **Step 4: Implement the four modules and the fake.**
  - **Readiness:** `BackendProcess` treats the backend as ready only after the first `200` from `GET <origin>/api/v1/health`, polled every 100 ms. Both checks share one deadline.
  - **Output:** stdout lines after the port line, and all stderr lines, go to `onLog`, with stderr prefixed `[api] `.
  - **stdin:** never ended by `BackendProcess` except in `stop()`.

- [ ] **Step 5: Run `npx vitest run apps/desktop` → pass. Run `npm run typecheck` → pass. Commit:** `feat(desktop): workspace package and backend process manager`

### Task 4: Electron main process, preload, splash and error pages

**Files:**
- Create:
  - `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`
  - `apps/desktop/src/navigation.ts`, `apps/desktop/src/windowState.ts`, `apps/desktop/src/menu.ts`, `apps/desktop/src/dataDir.ts`, `apps/desktop/src/desktopLog.ts`
  - `apps/desktop/static/splash.html`, `apps/desktop/static/error.html`, `apps/desktop/static/error.js`, `apps/desktop/static/pages.css`
- Modify: root `package.json`: `desktop:prep` = `npm run build:local && uv sync --project apps/api && npm run build -w @fsa/desktop`; `desktop:dev` = `npm run desktop:prep && electron apps/desktop`
- Test: `apps/desktop/src/{navigation,windowState,menu,dataDir}.test.ts`

**Interfaces:**
- Consumes: Task 3's `backendCommand`, `BackendProcess`, `BackendStartError` and `startupErrorCopy`.
- Produces:
  - `classifyNavigation(target: string, appOrigin: string | null): 'allow' | 'external' | 'block'`. `allow` means the same origin as the app. `external` means `http:`/`https:` on another origin. `block` covers everything else, including `file:`, `javascript:`, `data:` and unparsable URLs.
  - `clampToDisplays(saved: Rect | null, workAreas: Rect[], fallback: { width: number; height: number }): Rect`, where `Rect = { x; y; width; height }`.
  - `loadWindowState(file): Rect | null` and `saveWindowState(file, rect)`. The file is JSON at `<userData>/window-state.json`.
  - `buildMenuTemplate(o: { appName: string; isDev: boolean; openDataFolder: () => void; openLogs: () => void }): MenuItemConstructorOptions[]`.
  - `resolveDataDir(env: NodeJS.ProcessEnv, appData: string): string`.
  - The preload exposes `window.mygolfviz = { appVersion: string; openDataFolder(): Promise<void>; openLogs(): Promise<void>; restartBackend(): Promise<void>; quit(): Promise<void> }`.
  - When `MYGOLFVIZ_E2E=1`, main sets `globalThis.__mygolfviz = { backendPid(): number | null; appOrigin(): string | null }` for tests.

- [ ] **Step 1: Write the failing unit tests.**
  - `navigation.test.ts`, with app origin `http://127.0.0.1:50123`:
    - **allow:** `http://127.0.0.1:50123/#/sessions`.
    - **external:** `https://github.com/aaaallleen/MyGolfViz`.
    - **block:**
      - `http://127.0.0.1:50124/`, a different port. This is blocked, not external.
      - `file:///Users/x/a.csv`, `javascript:alert(1)`, `data:text/html,x`, `not a url`.
      - Any URL when the app origin is null (during startup).
  - `windowState.test.ts`, Review Focus 4:
    - With saved `{x: 2200, y: 100, width: 1200, height: 800}` and a single work area `{0, 25, 1512, 920}`, the result lies fully inside that area.
    - A saved rect that fits stays unchanged.
    - A saved rect larger than the area is shrunk to fit.
    - Null gives the fallback size, centred.
    - `loadWindowState` on missing or corrupt JSON returns null.
  - `menu.test.ts`, Review Focus 3:
    - The template has an Edit menu with roles `undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`.
    - The app menu contains `Open Data Folder` and `Open Logs`, and clicking them calls the callbacks.
    - `toggleDevTools` is present only when `isDev`.
    - The app, Window and View menus use the standard roles.
  - `dataDir.test.ts`:
    - With `MYGOLFVIZ_DATA_DIR`, the result is that path.
    - Without it, the result is `<appData>/MyGolfViz`.

- [ ] **Step 2: Run them and see them fail. Implement the four pure modules. Run `npx vitest run apps/desktop` → pass.**

- [ ] **Step 3: Implement `main.ts`.** Flow:
  1. `resolveDataDir`, then `app.setPath('userData', <dataDir>/electron)`.
  2. `requestSingleInstanceLock()`. A second instance focuses the existing window and quits.
  3. `whenReady`: install the menu, show `splash.html` in a 1200×800 window, sized and placed from window state, then `startBackend()`.
     - On success, load the backend url in the same window.
     - On `BackendStartError`, load `error.html?kind=<kind>`.
  4. `onUnexpectedExit` loads `error.html?kind=crashed`.
  5. IPC handlers:
     - `openDataFolder` and `openLogs` → `shell.openPath`.
     - `restartBackend` → stop if running, show the splash, `startBackend()`.
     - `quit` → `app.quit()`.
     - Accept IPC only from frames whose URL is the app origin or one of the two local pages.
  6. Window security:
     - `webPreferences` per Global Constraints, with `preload` set to the compiled `preload.js`.
     - `will-navigate` and `setWindowOpenHandler` use `classifyNavigation`; `external` → `shell.openExternal`.
     - `session.setPermissionRequestHandler((…, cb) => cb(false))`.
  7. Quit: `before-quit` → `preventDefault` once, `await backend.stop(5000)`, then `app.quit()` again.
  8. Window lifecycle: save window bounds on `close`. On macOS `window-all-closed` does not quit; `activate` re-opens a window at the current backend url, or at the error page if there is none.
  9. Logging: `desktopLog.ts` appends to `<dataDir>/logs/mygolfviz-desktop.log` and is wired as `BackendProcess.onLog`.

  Error page details:
  - `error.html` with `error.js` reads `kind` from the query, fills the title and body using `textContent`, and wires the three buttons to `window.mygolfviz`.
  - Its copy comes from `startupErrorCopy`, passed in the query as `title` and `body`, so the HTML holds no second copy of the strings.
  - It also shows the logs folder path (spec §10), passed as `logs`, under the body.
  - For `failed`, it shows the last 20 `stderrTail` lines in a `<pre>`, passed as `detail`.
  - The splash shows the icon and `Starting MyGolfViz…`.

- [ ] **Step 4: Run it by hand.** `npm run desktop:dev`:
  - The window opens on the library.
  - Cmd+Q quits, and no `mygolfviz-api` process is left (`pgrep -f mygolfviz-api` is empty).
  - With `npm run local` already running, the app shows `MyGolfViz is already running`.

- [ ] **Step 5: Run `npm run typecheck`, then `npx vitest run apps/desktop` → pass. Commit:** `feat(desktop): Electron shell with splash, error screens, menus and locked-down window`

### Task 5: Desktop end-to-end tests (development app)

**Files:**
- Create: `playwright.desktop.config.ts`, `e2e-desktop/helpers.ts`, `e2e-desktop/app.spec.ts`
- Modify: root `package.json` (`e2e:desktop` = `npm run desktop:prep && playwright test -c playwright.desktop.config.ts`), `tsconfig.json` (include `e2e-desktop`, `playwright.desktop.config.ts`)

**Interfaces:**
- Consumes:
  - `globalThis.__mygolfviz` (Task 4) via `electronApp.evaluate`.
  - The Task 4 copy.
  - The step-1 helpers' import flow; reuse `e2e-local/helpers.ts` `importInto` if it imports cleanly, otherwise copy the minimum.
- Produces:
  - `launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }>`.
    - Development mode launches `electron` with `args: ['apps/desktop']`.
    - When `MYGOLFVIZ_DESKTOP_EXECUTABLE` is set, it launches that executable instead; Task 6 uses this.
    - env: `MYGOLFVIZ_DATA_DIR`, `MYGOLFVIZ_E2E=1`.

- [ ] **Step 1: Write the tests.** The config uses one worker, `testDir: 'e2e-desktop'`, and a fresh `mkdtemp` data dir per test, removed in `afterEach`.
  - `opens the library and keeps a session across quit and reopen`:
    - Launch; heading `Sessions` and `No sessions yet` are visible.
    - Import one fixture CSV into a new session named `Desktop e2e`.
    - `app.close()`. The backend pid from `__mygolfviz.backendPid()` is gone within 5 s (`process.kill(pid, 0)` throws).
    - Relaunch on the same data dir: `Desktop e2e` is listed.
  - `backend crash shows the error screen and Restart backend recovers`:
    - `process.kill(backendPid, 'SIGKILL')`.
    - `MyGolfViz stopped unexpectedly` is visible.
    - Click `Restart backend`: `Sessions` is visible again, and the new pid differs.
  - `already running shows its own message`: hold the data folder with a `npm run local`-style backend started from the test (`apps/api/.venv/bin/mygolfviz-api --data-dir <dir> --port 0`). The app shows `MyGolfViz is already running`. Stop that backend, click `Restart backend`, and `Sessions` is visible.
  - `navigation stays inside the app` (Review Focus 5):
    - `page.evaluate(() => { location.href = 'file:///etc/hosts' })`, and separately to `http://127.0.0.1:1/`.
    - After 500 ms the page origin is still the backend origin.
    - Stub `shell.openExternal` through `electronApp.evaluate`. A `window.open('https://example.com')` records that URL and opens no new window (`app.windows().length === 1`).
  - **CSP:** in every test, zero `securitypolicyviolation` events on the app page, collected as in Task 2.

- [ ] **Step 2: Run `npm run e2e:desktop` → 4 passed, three times in a row.** Fix the feature, not the test.

- [ ] **Step 3: Commit.** `test(desktop): end-to-end lifecycle, crash recovery and navigation tests`

### Task 6: Icon, PyInstaller backend and the `.dmg`

**Files:**
- Create:
  - `apps/api/packaging/mygolfviz-api.spec`, `apps/api/packaging/entry.py`
  - `scripts/make-icon.mjs`, `apps/desktop/build/icon.png` (generated and committed)
  - `apps/desktop/electron-builder.yml`
  - `apps/api/tests/test_frozen.py`
- Modify: `apps/api/pyproject.toml` (`[dependency-groups] build = ["pyinstaller==6.22.3"]`), root `package.json` scripts, `apps/desktop/package.json` (`dist`)

**Interfaces:**
- Consumes: Task 1's CLI, and Task 5's `launchApp` with `MYGOLFVIZ_DESKTOP_EXECUTABLE`.
- Produces, as root scripts:
  - `api:bin`: `uv run --project apps/api --group build pyinstaller apps/api/packaging/mygolfviz-api.spec --noconfirm --distpath apps/api/dist --workpath apps/api/build`. It outputs `apps/api/dist/mygolfviz-api/mygolfviz-api`.
  - `desktop:icon`: `node scripts/make-icon.mjs`.
  - `desktop:dist`: `build:local`, then `api:bin`, then `npm run build -w @fsa/desktop`, then `electron-builder --mac dmg --arm64 --projectDir apps/desktop`. Output is `apps/desktop/release/MyGolfViz-<version>-arm64.dmg`, plus `release/mac-arm64/MyGolfViz.app`.
  - `e2e:desktop:packaged`: `MYGOLFVIZ_DESKTOP_EXECUTABLE=apps/desktop/release/mac-arm64/MyGolfViz.app/Contents/MacOS/MyGolfViz playwright test -c playwright.desktop.config.ts` (no `desktop:prep`).

- [ ] **Step 1: Write `test_frozen.py`.** It is skipped unless `MYGOLFVIZ_API_BIN` is set. It runs the binary with `--data-dir tmp --port 0 --static-dir <a temp dir holding index.html> --exit-with-stdin` and checks:
  - The port line parses.
  - `/api/v1/health` returns `schemaVersion` equal to the Alembic head, which proves the migrations were bundled.
  - `/` returns the temp `index.html` with the CSP header.
  - Closing stdin exits 0 within 5 s.

- [ ] **Step 2: PyInstaller.**
  - `entry.py` calls `sys.exit(mygolfviz_api.__main__.main())`.
  - The spec builds one folder named `mygolfviz-api`, `console=True`, `target_arch='arm64'`.
  - `datas`: the `mygolfviz_api/migrations` tree, including `env.py`, `script.py.mako` and `versions/*.py`, as **source** files at `mygolfviz_api/migrations`. Alembic executes them from disk.
  - `hiddenimports`: `collect_submodules('uvicorn')` plus `mygolfviz_api.migrations` dependencies as needed.
  - Run `npm run api:bin`, then `MYGOLFVIZ_API_BIN=apps/api/dist/mygolfviz-api/mygolfviz-api uv run --project apps/api pytest apps/api/tests/test_frozen.py -q` → pass.

- [ ] **Step 3: Icon.** `scripts/make-icon.mjs` renders `apps/web/public/icon.svg` with Playwright's Chromium, which is already a devDependency:
  - Canvas 1024×1024 px, transparent background.
  - The artwork is scaled to 824 px and centred, giving a 100 px margin, the macOS icon grid.
  - Output is `apps/desktop/build/icon.png`.
  - Commit the PNG. Check it by viewing it.

- [ ] **Step 4: `electron-builder.yml`.**
  - `appId` and `productName` as in Global Constraints. `directories: { output: release, buildResources: build }`.
  - `files`: `dist/**`, `static/**`, `package.json`.
  - `extraResources`:
    - `{ from: ../api/dist/mygolfviz-api, to: api/mygolfviz-api }`
    - `{ from: ../web/dist-local, to: web }`
  - `asar: true`, `npmRebuild: false`.
  - `mac`: `{ target: [{ target: dmg, arch: [arm64] }], category: public.app-category.sports, identity: "-", hardenedRuntime: false }`. This is ad-hoc signing: unsigned for distribution, but valid for arm64.
  - `dmg: { artifactName: "MyGolfViz-${version}-arm64.${ext}" }`.

- [ ] **Step 5: Build and check.** `npm run desktop:dist`, then:
  - `codesign --verify --deep --strict apps/desktop/release/mac-arm64/MyGolfViz.app` exits 0.
  - The bundle contains `Contents/Resources/api/mygolfviz-api/mygolfviz-api` and `Contents/Resources/web/index.html`.
  - `npm run e2e:desktop:packaged` → 4 passed.
  - **Clean environment:** run the packaged e2e once with `PATH=/usr/bin:/bin`, which has no uv, Python venv or Node on PATH for the app, and it still passes.

- [ ] **Step 6: Commit.** `feat(desktop): PyInstaller backend, app icon and one-command .dmg build`

### Task 7: CI, docs and the manual checklist

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`, `apps/web/src/pages/HelpPage.tsx` (+ its test)
- Create: `docs/desktop-manual-checklist.md`

**Interfaces:**
- Consumes: the scripts from Task 6.

- [ ] **Step 1: Help heading.** Write a failing test: in local mode, the Help page `h1` is `Help`; in public mode it stays `Help / Get Local Version`. Implement with the inline `import.meta.env.VITE_APP_MODE === 'local'` check. Run `npx vitest run apps/web/src/pages` → pass.

- [ ] **Step 2: CI.**
  - Add `ELECTRON_SKIP_BINARY_DOWNLOAD: 1` as env on the existing `test` and `local` jobs, since they never launch Electron.
  - Add a job `desktop`, named `Mac App - build and packaged e2e`, `runs-on: macos-latest`, `timeout-minutes: 30`. It runs checkout, setup-node from `.nvmrc`, `astral-sh/setup-uv@v10.3.3`, `npm ci`, `npx playwright install chromium`, `npm run desktop:dist`, `npm run e2e:desktop:packaged`.
  - On failure, upload `test-results/` and `apps/desktop/release/*.dmg`.

- [ ] **Step 3: README.** Add a "Mac app" section:
  - Build with `npm run desktop:dist`; the dmg lands in `apps/desktop/release/`.
  - Installing: drag MyGolfViz to Applications.
  - First launch of an unsigned app: on macOS 15 and later, open it once, then System Settings → Privacy & Security → **Open Anyway**. On earlier macOS, right-click → Open.
  - The data folder, and that installing a newer build keeps your data.
  - Open Data Folder and Open Logs.
  - Don't run `npm run local` while the app is open, because they share the data folder.

- [ ] **Step 4: `docs/desktop-manual-checklist.md`.** Spec §14. Each item is a checkbox with its expected result:
  - A clean-Mac launch, with no Python or Node.
  - The first-launch Gatekeeper flow.
  - Import, quit, reopen.
  - Install a newer build over the old one: data kept, and a backup appears in `backups/` when the schema changed.
  - Backend crash recovery.
  - Copy/paste in Notes.
  - Window position kept, then unplugging an external display.
  - Download original saves with the right name.
  - Dropping a CSV outside the drop zone.
  - Two app launches.
  - Opening the app while `npm run local` runs.

- [ ] **Step 5: Run `npm run ci:public` and `npm run ci:local` → green.** Push to the branch and check that the `desktop` CI job passes; fix anything it finds.

- [ ] **Step 6: Commit.** `ci(desktop): build and test the Mac app on macOS; README and manual checklist`
