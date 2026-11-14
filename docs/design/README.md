# Design reference — FlightScope Analytics UI

`frames/` holds the 13 boards unpacked from `FlightScope Analytics UI Claude Code.html`
(fonts and runtime stripped; `sc-raw-*` tags renamed to plain HTML; `viewBox` restored).
Open them in a browser or read the markup. `{{…}}` placeholders and `<sc-for>` loops are
filled from the `<script type="text/x-dc">` block at the bottom of each file — that block
holds the sample rows. All sample numbers in the frames are invented; never copy them
into code or tests.

The frames were drawn for the **Local App** (session names, user-set dates, library).
The Cloud Viewer reuses their visual language, components and layouts, but takes its
navigation and copy from the spec (§3.1, §8) and the overrides below.

## Frame index and cloud-v1 use

| Frame | Cloud v1 use |
|---|---|
| 00 Session library · list | Not in cloud (local only) — reference for header/nav styling only |
| 01 Session library · calendar | Not in cloud (later phase) |
| 02 Load Session CSV · preview | **Yes** — per-file preview list, status icons, footer summary + primary action. Drop the "Add to New/Existing session" block |
| 03 Import completed | Not in cloud (local import result) |
| 04 Session dashboard | **Yes** — the Overview page: filter bar, KPI grid, dispersion, trajectory, selected-shot card, shot table |
| 05 Club data · Face impact | **Yes** — Inspector "Face impact" tab, tile row, provenance legend, "All measurements" details |
| 06 3D reconstruction | **Yes** — Inspector "3D reconstruction" tab: illustrative shot replay (camera presets, replay controls, Show toggles), "Top view · face to path" ×4 and "Side view · everything" ×2 |
| 07 Club data · 2D reconstruction | **Yes** — Inspector vertical delivery (side view), "True scale / Exaggerated ×2" toggle |
| 08 Face outline per club type | **Yes** — driver / wood-hybrid / iron face outlines |
| 09 iPad · Session dashboard | **Yes** — 820 px layout |
| 10 iPad · Inspector · impact not measured | **Yes** — missing-impact state copy and behavior |
| 11 iPhone · Session dashboard | **Yes** — 390 px layout: chips, 2-per-row KPI cards, compact shot cards, bottom tab bar |
| 12 iPhone · Inspector · 2D | **Yes** — 390 px inspector: one diagram at a time |

## Design tokens (from the frames)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D1210` | page background |
| `--surface` | `#151C19` | cards, panels |
| `--surface-sunken` | `#101714` | segmented-control track, inputs |
| `--surface-raised` | `#1B2420` | active nav item |
| `--row-selected` | `#22302A` | selected table row |
| `--border` | `#26312C` | card borders |
| `--border-strong` | `#3A4740` | control borders |
| `--text` | `#EAF0EC` | primary text, primary button background |
| `--text-2` | `#C9D3CD` | secondary text |
| `--muted` | `#9BA9A1` | labels, "Not measured" |
| `--ball` | `#F5A742` | ball-flight metrics (orange) |
| `--club` | `#62B6F7` | club-delivery metrics (blue) |
| `--link-hover` | `#9DD2FB` | link hover |
| `--danger` | `#FF9A8A` | invalid-file status |

Fonts: Inter (body, 14 px, `font-variant-numeric: tabular-nums`), Space Grotesk 600
(headings, KPI values). Controls: `min-height: 44px`, radius 8 px (pills 22 px), cards radius 10–12 px.

## Binding decisions (where the spec or the product owner overrides the frames)

1. **Ellipse caption.** The frames say "holding about 39% of shots"; spec §6 forbids that claim. Use:
   "1σ covariance ellipse · about 39% expected coverage if shots were bivariate normal ·
   observed: {k} of {n} shots inside".
2. **Impact units and signs.** The frames show "6 toe · 4 high mm", but the CSV reports inches. Show inches with 2 decimals
   ("0.62 in toe · 0.44 in high"). Lateral impact: + toe, − heel, 0 centered (confirmed by the
   product owner). Vertical impact: + high. Face drawn face-on as in frames 05/08: for a right-hander the toe is
   on the left; a left-hander is mirrored.
3. **Inspector structure (product owner, 2026-11-11).**
   - **Ball data** comes first: a 3D ball-flight viewer with frame 06's camera buttons (DTL, Perspective, Side, Top), the selected shot bold, other visible shots faint behind an "Other shots" switch (None · the shot's club · All clubs; the shot's club by default), and a flight replay (Launch · Ball flight · Landing). Beside it are the spinning ball and the launch/flight readouts.
   - **Club data** has the tabs "Face impact", "3D reconstruction" and "2D reconstruction".
   - The 3D tab is a club-only scene with frame 06's downswing replay (Downswing · Impact · Follow-through) and "Show" toggles Top view, AoA, V-plane, Side view. Top view and Side view toggle the two angle diagrams under the scene.
   - The 2D tab has "Show" toggles Face to target, Face to path, Dynamic loft, Spin axis. These show or hide those layers and the flat spin-axis panel.
   - Replays show phase names, not seconds; frame 06's "Impact · 0.00 s" becomes "Impact".
4. **Session details follow the frames.** The session name, date ("7 Nov 2026 (set by you)"), notes and the
   "Right-handed" chip are shown as designed. In the Cloud Viewer the user types them on the Load page
   or via "Edit details"; they are kept in tab memory only and never prefilled from file names.
   Defaults: "Untitled session", "No date set", Right-handed. There is no "Sessions /" breadcrumb root,
   no "Append CSV files" and no "Manage or remove files" (the Load page covers adding and removing files).
5. **Cloud navigation.** Only "Load Session CSV", "Overview", "Shot Inspector",
   "Help / Get Local Version" (spec §8). No Sessions / Trends / Clubs.
6. **Dispersion modes.** Carry: "Landing dispersion · top view", note "Actual reported landing
   position". Total: "Total Distance vs. Landing Offset", note "Hybrid plot, not actual resting
   position". Never "Total Dispersion".
7. **Shot table.** Shows every filtered row (no 8-row pagination). Rows are grouped by club when
   "All" clubs is selected.
8. **Progression (Local App).**
   - The page is a flat grid of tiles, each with its category as a small eyebrow above the title; there are no category sections.
   - One dashboard-level **Band** toggle (P25–P75 / P10–P90) sets the band on every tile.
   - A session with fewer than 5 values for a metric is labelled `few shots` and drawn hollow. The label shows only when 0 < n < 5; n 0 is no shots at all.
   - For accuracy tiles (lateral, launch direction, curve) the target range applies to the absolute value, |value|.
   - Target ranges are keyed by club and sent in the request body, not the URL, so club names with spaces or a slash round-trip.
   - Changing the club clears a hand-picked session set; the pick belongs to the club it was made for.
   - The scope bar, with its Shots choice line, is sticky, so the choice of all or stock shots is always on screen.
   - While an answer for a new club or sessions loads, the previous tiles stay on screen, dimmed.
   - Speed & smash draws two charts that share one x alignment, so the same session sits at the same x in both.
9. **Compare (Local App).**
   - Layout B: the two shots' diagrams on the left, the "What changed" table on the right; one column on narrow windows.
   - Shot A is white (`COMPARE_A`) and shot B is purple (`COMPARE_B`), in the header, the diagrams and the table.
   - Δ = A − B, shown signed with the unit and no colouring: nothing is "better" or "worse". Rows sort by |Δ| / `COMPARE_SCALE`, biggest change first; a row with a missing side reads `n/a` and sorts last.
   - The comparison lives in the URL (`/compare?a=…&b=…`, either may be absent), so every state reloads and works with Back.
   - The Compare tab remembers the last comparison per window, in memory only: a click on the tab restores it, Back and reload do not, so Back is never trapped.
   - The picker goes session → club → shot, sessions newest first, with an `F2`-style badge on shots when the session has 2 or more files. The B picker starts from A's session and club.
