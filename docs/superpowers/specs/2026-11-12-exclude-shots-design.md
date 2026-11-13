# Excluding shots — design

Date: 2026-11-12 · Status: ready for review

## Why

A session always has a few shots the golfer doesn't want counted, like a topped drive or a shank.
Right now every shot in the CSVs goes into every average, every dispersion ellipse and every
comparison, so one mishit can drag a club's numbers off. Users need a way to leave a shot out and
to put it back later.

Users find bad shots in two places: the **dispersion plot** (an outlier dot) and the **shot data
table** (an odd number). So excluding a shot should happen where they spotted it. People also
expect to see and manage what's been left out near the top of the page. That has to work without
a second table, and it has to stay clear which file a shot came from when several CSVs are loaded.

Success: a user can spot a mishit in the plot or table, exclude it in one deliberate action, and
watch it drop out of the plot, averages and club counts. They can always see how many shots are
excluded and which ones, and can bring any of them back.

## Goals

- Exclude a shot from the **selected-shot card** next to the plot, using an "Exclude shot" button.
- Exclude or re-include shots from the **shot table**, but only in an explicit **"Edit shots"**
  mode. Outside that mode the table can't change exclusions (to avoid misclicks).
- An excluded shot is left out of: the dispersion plot and its ellipses, the Session averages
  (KPI grid), the Clubs table, the club filter chip counts, "‹ ›" stepping, the shot pickers, and the
  Inspector's faint comparison shots.
- Excluded shots stay **visible but greyed** in the shot table, so the CSV data is still there to
  read.
- A **"N excluded" chip** in the filter bar lists the excluded shots. Each has its own undo, and
  there's an "Include all".
- In the **Inspector**, excluded shots are skipped unless the user opens one on purpose. An opened
  excluded shot shows a banner with "Include it again".
- **File badges** (F1, F2, …) on shot numbers when two or more files are loaded, so shots from
  different CSVs can be told apart.

## Non-goals

- Saving exclusions between page loads. Nothing in the app is saved between loads today (state is
  in memory only), and this feature doesn't change that.
- Any change to the uploaded CSV or the parsed rows. Excluding only changes which shots the app
  uses.
- Selecting several shots at once with drag, shift-click or rules ("exclude all carries under
  X"). Edit mode toggles one row at a time.
- Excluding shots on the Load page before analysis. The existing per-file Include there is
  unchanged.

## Anti-goals (would be a failure even if it technically works)

- A misclick in the table excludes or includes a shot. Outside edit mode, a row click must only
  select.
- An excluded shot quietly comes back somewhere: an average, an ellipse, a comparison shot in
  the Inspector, or a step with ‹ ›.
- Two shots from different files with the same shot number that can't be told apart in the table,
  on the card, or in the excluded list.

## Behaviour

### State

- The store keeps a set of excluded shots, keyed by **file content hash + CSV row**
  (`${sha256}:${sourceRow}`), not by the shot id. A shot id (`${fileKey}:${sourceRow}`) gets a
  new `fileKey` whenever a file is staged again. Staging already removes duplicate files by
  sha256, so the hash key is unique within a session. *(My call, after review: this lets
  exclusions survive removing a CSV and adding it back.)*
- **Re-analysing** (adding or removing files on the Load page and pressing Analyze again)
  **keeps** exclusions for shots that are still there, including a file that was removed and
  added back. Entries whose file is no longer loaded stay in the set but match nothing; they
  aren't shown or counted. **Clear** empties exclusions with everything else, and Clear's undo brings them back,
  because they are part of the same state.
- `visibleShots` (the list everything already reads: plot, KPIs, Clubs table, card, stepping,
  Inspector) becomes the **included** shots in the current club/file filter. Most surfaces then
  respect exclusions without code changes of their own.
- The shot table needs a second list: every shot in the current club/file filter, excluded ones
  included, in the same display order. Whether a row is excluded is looked up in the set.

### Filter bar (Overview, top)

- Club chip counts and the "All · N" count show **included** shots.
  - *My call:* a club whose shots are all excluded keeps its chip with a count of 0, so its greyed
    rows can still be reached by filtering to it.
- The Source file option counts stay as **total** shots in each file. They describe the file, not
  the current selection.
- New **"N excluded" chip**, shown only when N > 0. N counts every excluded shot in the session,
  whatever the club/file filter. It opens a popover listing each excluded shot as
  `Club · [F#] Shot N · carry` with an undo button per row, and "Include all" at the bottom.
  Clicking a row (not its undo) selects that shot. If the shot is outside the current club/file
  filter, the filter changes so it shows: the club chip switches to the shot's club, and the file
  filter goes to "All files" if it was set to another file. *(My call.)*
  - *My call:* the popover's "Include all" brings back every excluded shot in the session, not
    just the ones in the current filter.

**Undo for "Include all" (every place it appears).** Because it can undo many deliberate
exclusions in one click, each "Include all" shows a short "N shots included · Undo" notice
that restores exactly the set it removed. The undo works as long as the set of excluded shots
hasn't changed since; a filter or selection change doesn't block it. *(My call.)*
- The Overview's averages heading (`Averages · All clubs · 58 shots`) counts included shots.

### Selected-shot card (Overview)

- New **"Exclude shot"** button in the card footer, next to "Open shot inspector →". It is styled
  as a secondary or warning button, never the primary one.
- After excluding the selected shot, the selection moves to the **next included shot** in display
  order. If it was the last one, it moves to the previous one. If nothing is left, nothing is
  selected.
- If the selected shot is excluded (reached by clicking a greyed row or an entry in the excluded
  list), the card still shows its values, with an "Excluded" tag in place of "6 of 22". The button
  becomes **"Include shot"**. ‹ › from there goes to the nearest included shot in that direction
  in display order.
- The card's shot picker lists included shots only, plus the current shot when it is excluded.

### Shot table (Overview)

- **Normal mode:** clicking a row selects it, as it does today. Excluded rows are greyed and carry
  a small "Excluded" tag by the shot number. Nothing in normal mode changes exclusions.
- An **"Edit shots"** button sits at the top right of the Shots panel, on the heading row, next to
  the Columns menu. It turns on edit mode:
  - The table gets a visible edit-mode frame, and its title reads "Editing shots".
  - A pinned leading **Use** column holds a switch per row: on = included, off = excluded.
  - Only the switch changes exclusion. Row clicks still select.
  - Turning off the selected row's switch keeps the selection on that row, which now shows as
    excluded. The card switches to "Include shot". This is unlike the card's Exclude button,
    which moves the selection on. *(My call.)*
  - The plot, averages and counts update immediately on each toggle. There is no separate
    "save".
  - The heading row shows **"Exclude all"**, **"Include all"** and **"Done"**. Done leaves edit
    mode. Both bulk actions cover only the shots in the current club/file filter (what the table
    shows), keep the selection where it is, and show an undo notice ("N shots excluded" /
    "N shots included" · Undo). Each is disabled when there is nothing for it to do. *(Include
    all: my call. Exclude all: added after the first build, at the user's request.)*
- The table's footer note reads "N used · M excluded" for the current filter.
- Sorting, column hiding and club grouping work the same in both modes.
- *My call:* edit mode is a local UI state of the table. It is not kept when leaving the Overview.

### File badges

- When `workingSet.files.length >= 2`, shot numbers show a small `F{ordinal}` badge in the shot
  table's Shot column, the selected-shot card's title and picker options, and the excluded-list
  popover. The Inspector header already shows `File N · name` and `CSV row N`, and stays as it
  is.
- Hovering (or the accessible name) gives `File N · name · CSV row N`. This is the existing
  `rowTitle` text.
- The Inspector's shot picker options (`ShotHeader`) get the badge too, because they use the same
  `Club · shot N · carry` text as the card's picker. The Inspector header's File and CSV row chips
  stay as they are. *(My call, after review.)*
- With one file loaded there are no badges.
- Each file's badge has a distinct colour, picked by the builder.

### Shot Inspector

- The Inspector has the same **"Exclude shot"** button as the selected-shot card, on the title
  row beside "Shot N · Club". It is styled as a secondary button. Excluding moves on to the next
  included shot, exactly as the card does, and announces "Shot N excluded · M shots used". On an
  excluded open shot the title row shows the **Excluded** tag instead, and the red banner's
  **"Include it again"** is the one include action. The breadcrumb's session link (with a ←
  arrow) is the way back to the Overview; there is no separate Back to overview button.
  *(Added after the first build, at the user's request.)*
- ‹ ›, the shot picker and the faint comparison shots (all shots / same-club shots behind the
  current one) use included shots only. They already read `visibleShots`, so they follow
  automatically.
- If the **selected shot is excluded** (only possible by opening it on purpose from the
  Overview), the Inspector shows that shot rather than falling back to the first visible one,
  which is what `selected ?? visibleShots[0]` would do today. It adds a banner: "This shot is
  excluded. It isn't in your averages or comparisons. **Include it again**". The position reads
  "Excluded" instead of "N of M". ‹ › goes to the nearest included shot.

### Empty states

- If every shot in the current club/file filter is excluded, the Overview shows the empty state
  "All N shots here are excluded" in place of the averages and the plot. Its action includes
  those N shots again, with the undo notice. The **selected-shot card** and the **shot table**
  stay on screen, so a greyed row can still be selected, included or opened in the Inspector.
  *(My call, after review.)*
- If the Inspector is opened with nothing selected and every shot in the filter is excluded, it
  shows "All N shots here are excluded", with the same include action and a link back to the
  Overview. It does not show the generic "No shots match these filters". *(My call.)*

## Accessibility

- The Use switches are real form controls (`role="switch"` or a checkbox) with names like
  "Use shot 4, Driver, file 1".
- "Exclude shot" and "Include shot" announce the change, for example through a polite live region:
  "Shot 4 excluded · 57 shots used".
- Greyed rows must still meet contrast for reading. The "Excluded" tag, not the colour alone,
  marks the state.
- Phones: "Edit shots" and the Use column have to fit the existing phone table layout. The
  excluded-list popover works with touch.

## Testing

- Unit: exclusion reducer actions (exclude, include, include all, keeping exclusions on
  re-analyse, including a file removed and added back; clear and undo; Include all and its undo, at
  both session scope and filter scope), `visibleShots` leaving excluded shots out, stepping and
  next-selection rules from an excluded or just-excluded shot, club counts.
- Component: the table can't toggle outside edit mode, edit-mode switches, the card button
  swapping between Exclude and Include, badges only with 2+ files.
- e2e: load two fixture files, exclude a shot from the card and another from Edit shots, check
  that the averages and the plot point count change, open an excluded shot in the Inspector and
  include it again.

## Left to the builder

- Exact visual styling: greyed rows, the tag, the badge colours, the edit-mode frame and the
  chip's look within `@fsa/ui`.
- Whether the exclusion set lives in `Filters` or next to it in `StoreState`. Either works if the
  behaviour above holds.
- The popover component for the excluded list. The shot table already uses Base UI `Popover`.
- The wording of the live-region announcements.
