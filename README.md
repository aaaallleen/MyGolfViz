# MyGolfViz Cloud Viewer

## What it is

A browser-only viewer for FlightScope Mevo Gen 2 session CSV exports. Load one or more
files and get a session overview (averages, dispersion, trajectory, shot table) and a Shot
Inspector with a 3D ball-flight viewer, a spinning ball, and club data (face impact, 3D and
2D reconstructions). It is a static site: there is no backend and no database. 

View the Viewer at: https://aaaallleen.github.io/MyGolfViz

## Privacy

- Your CSV files are read in the browser tab. Nothing is uploaded and nothing is stored:
  no cookies, no local storage, no IndexedDB, no service worker cache.
- The app makes no requests that carry your data. A browser test checks this on every build.
- Session details you type (name, date, notes, handedness) also stay in the tab and are
  never filled in from file names or CSV contents.
- "Clear analysis" drops the app's references to your data, and so does closing the tab.
  A refresh starts empty.

## Use

1. Open the Pages URL of this repository's deployment.
2. Choose **Load Session CSV** and pick one or more exports (or drop them on the page).
3. Review the file list, then choose **Analyze files**.

## Develop

```sh
nvm use          # Node 24, from .nvmrc
npm ci
npm run dev      # local dev server
npm test         # unit tests
npm run e2e      # Playwright: builds the public bundle and runs privacy and responsive checks
```

`npm run ci:public` runs everything CI runs: typecheck, unit tests, the public build and its
verification, and the end-to-end suite (install the browser once with
`npx playwright install chromium`).

## Deploy

In the repository, go to Settings → Pages → Source and choose **GitHub Actions**. Pushing to
`main` (or running the workflow manually) tests, builds and publishes the site. The base path
is set automatically from the repository name.

## Local App

The Local App keeps your sessions. A small backend on your own computer (FastAPI + SQLite) saves
every import, the original CSV files, your session details, exclusions and file order, and
serves the same viewer with a session library on top. It only listens on `127.0.0.1` and only
answers the private link it prints when it starts.

### Prerequisites

```sh
brew install uv  # Python tooling; uv installs the Python version the backend needs
nvm use          # Node 24, from .nvmrc
npm ci
```

### Run

```sh
npm run local
```

This builds the local viewer and starts the backend. It prints one line such as
`{"port": 8765, "url": "http://127.0.0.1:8765/?token=…"}`: open that URL. The token changes on
every start, so use the newly printed link each time. Stop the app with Ctrl+C.

### Where data lives

Everything is in one data folder:

- macOS: `~/Library/Application Support/MyGolfViz`
- Linux: `~/.local/share/MyGolfViz`
- Windows: `%APPDATA%\MyGolfViz`

It holds the database (`mygolfviz.sqlite3`), the original CSV files (`originals/`), a copy of the
database taken before each schema upgrade (`backups/`) and the logs (`logs/`). Back up or move
that folder to keep your sessions. To use another folder, set `MYGOLFVIZ_DATA_DIR` or pass
`--data-dir`. Only one backend can use a data folder at a time.

### Develop

Run the backend and the Vite dev server in two terminals, with the same fixed token:

```sh
MYGOLFVIZ_TOKEN=dev uv run --project apps/api mygolfviz-api   # backend on 127.0.0.1:8765
MYGOLFVIZ_TOKEN=dev npm run dev:local                         # viewer with hot reload; /api goes to the backend
```

Open the URL Vite prints. The dev server adds the token to every `/api` request, so no sign-in
link is needed. After changing the API, run `npm run api:types` to regenerate the client types.

### Tests

```sh
npm run ci:local
```

This runs the backend tests (pytest), the local build and its verification, and the local
end-to-end tests (`npm run e2e:local`), which start the real backend on port 8799 with a fresh,
empty data folder. CI runs it as a separate job next to `ci:public`.

## Known limitations

- The CSV header map has only been validated against the 2022 Mevo Gen 2 exports in
  `fixtures/flightscope/`.
- The 3D views (ball flight and club) and the trajectory are illustrative geometry drawn from
  measurements, not captured motion.
- The Total dispersion mode is a hybrid plot (total distance vs landing offset), not the
  resting position.
