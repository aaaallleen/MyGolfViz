# Mac app manual checklist

Run this on a built `.dmg` (`npm run desktop:dist`) before a release. The automated tests cover
the lifecycle; these items need a real Mac, a real display or a real person.

- [ ] **Clean-Mac launch.** On a Mac with no Python or Node installed, install the app and open it.
  Expected: the splash "Starting MyGolfViz…" appears, then the viewer loads with an empty library.
- [ ] **First-launch Gatekeeper flow.** Test with a quarantined copy of the dmg
  (`xattr -w com.apple.quarantine "0081;00000000;Safari;" <copy of the dmg>`) or the CI artifact; a dmg built
  on this Mac is not quarantined. Open the unsigned app for the first time.
  Expected: macOS 15 and later blocks it until System Settings → Privacy & Security → **Open Anyway**;
  earlier macOS opens it after right-click → Open. After that it opens normally.
- [ ] **Import, quit, reopen.** Import a FlightScope CSV, quit with Cmd+Q, reopen.
  Expected: the session is in the library with the same shots and the original file is kept.
- [ ] **Install a newer build over the old one.** Quit the running app first (the single-instance lock would only
  focus the old window). Bump the version, rebuild, replace the app in Applications, open it, and confirm
  **About MyGolfViz** shows the new version.
  Expected: all sessions are still there. If the schema changed, a new copy of the database appears in `backups/`.
- [ ] **Backend crash recovery.** Find the `mygolfviz-api` process and kill it.
  Expected: the app shows the error screen with **Restart backend**, **Open logs** and **Quit**;
  Restart backend brings the viewer back with the data intact.
- [ ] **Copy and paste in Notes.** Select text in the app, copy, paste into Notes; copy in Notes, paste into an app field.
  Expected: both directions work.
- [ ] **Window position.** Move and resize the window, quit, reopen.
  Expected: it reopens in the same place and size. Then, with the window on an external display, quit,
  unplug the display and reopen. Expected: the window appears fully on a connected screen.
- [ ] **Download original.** Open a session and download an original CSV.
  Expected: the file saves with its original file name and opens in a spreadsheet.
- [ ] **Drop a CSV outside the drop zone.** Drag a CSV onto another part of the window.
  Expected: the app does not navigate away or show the file; the window stays as it was.
- [ ] **Two app launches.** Open the app, then open it again (Finder or Dock).
  Expected: no second window or backend; the existing window comes to the front and the data is not damaged.
- [ ] **Open the app while `npm run local` runs.** Start `npm run local`, then open the app.
  Expected: the app shows a startup error that the data folder is in use; `npm run local` is unaffected.
  Repeat the other way round: app open, then `npm run local`. Expected: it exits with the same message.
