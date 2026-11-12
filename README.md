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

A local version (FastAPI + SQLite via Docker Compose) is planned and is not in this release.

## Known limitations

- The CSV header map has only been validated against the 2022 Mevo Gen 2 exports in
  `fixtures/flightscope/`.
- The 3D views (ball flight and club) and the trajectory are illustrative geometry drawn from
  measurements, not captured motion.
- The Total dispersion mode is a hybrid plot (total distance vs landing offset), not the
  resting position.
