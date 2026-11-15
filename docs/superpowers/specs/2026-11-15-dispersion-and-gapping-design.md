# Dispersion over time and the Gapping tab — design

Status: draft for the owner's review (2026-11-15), builder-checked. Mockups were reviewed in the brainstorming companion
(`.superpowers/brainstorm/…/dispersion-toggles.html`, `gapping-tab-v2.html`; git-ignored, not binding).

## 1. Why

The owner asked two questions the app can't answer well today:

1. **"Across sessions, did my dispersion get better?"** Progression only has line charts (lateral, lateral SD,
   carry SD). The owner wants to *see* each session's landing dots and an ellipse around them, and watch the
   ellipse get smaller.
2. **"What is my current gapping?"** The owner wants a **stock yardage for each club**, and, when reviewing, a
   way to **spot overlaps and holes in the bag**. The owner's words: the circle around the shots is "a very
   intuitive way of figuring out if two clubs overlap".

The owner also pointed out that the app's ellipse isn't what launch-monitor software draws: tracers draw a
shape that holds every shot. Today's ellipse is one standard deviation (1σ covariance), which holds only
about 4 in 10 shots.

## 2. Goals, non-goals, anti-goals

### Goals
- An **Ellipse** choice, **1 SD** or **Every shot**, wherever dispersion ellipses are drawn by club or session:
  the session page, the new Progression tile and the new Gapping tab.
- A Progression tile, **Dispersion by session**: per session dots and ellipse for the scope bar's club, with a
  **Side by side** / **Overlaid** view toggle.
- A new **Gapping** tab (local app): every club's dots and ellipse on one top view, plus a stock yardage table
  with gaps, overlap and hole flags, and a **consistency score ± confidence** per club.

### Non-goals (this release)
- The 9-in-10 (90%) ellipse. Shown in the mockups and dropped by the owner.
- A minimum-area enclosing ellipse (see §3.1).
- The consistency score anywhere but the Gapping tab (not on Progression, not on the session page).
- Gapping in the public viewer. It keeps one session in memory and has no "latest / last N / all time".
- Changing or removing Progression's existing **Club gapping** tile; it stays as it is.
- Ellipses in Compare (it compares single shots).
- Printing or exporting a yardage card.

### Anti-goals
- A score that gets worse just because more balls were hit. (This is why the score ignores the Ellipse toggle,
  §5.)
- Missing values drawn or counted as 0. A shot without lateral has no dot and isn't in any ellipse; a shot
  without carry isn't in carry stats.
- Silently mixing excluded shots in when the owner chose stock shots.
- Changing how the public viewer looks beyond the new Ellipse toggle on its session page.

## 3. The ellipse

### 3.1 Definitions
Both kinds share one shape: the covariance ellipse of the points (lateral, carry or total), centred on the mean.
They differ only in size.

- **1 SD** (today's ellipse, unchanged): Mahalanobis radius 1.
- **Every shot**: the same shape scaled up until the farthest point (largest Mahalanobis distance) lies on the
  edge, so every point is inside. *(Planner's call: keeping the covariance shape, rather than a true minimum-area
  enclosing ellipse, makes the two kinds directly comparable, is deterministic and cheap. A single mishit
  stretches it; that is the honest behaviour the owner accepted, and the Stock-only choice is the remedy.)*
- An ellipse needs at least 3 points and a non-degenerate covariance, as today.
- **Width × depth** of an ellipse means its extent left–right and short–long: 2·k·SDx by 2·k·SDy, where k is
  the Mahalanobis radius of that kind (1 for 1 SD). SDx and SDy are the same population SDs (divide by n) the
  ellipse is built from, so the numbers match the drawn shape. *(Planner's call after the builder check.)*

### 3.2 Where the toggle appears
- **Session page** (`ShotPatternPanel`, top view, local and public): an **Ellipse** segmented control
  (`1 SD` | `Every shot`) in the panel head next to Carry/Total. The caption under the plot describes the
  chosen ellipse: the 1 SD caption stays as today; the Every shot caption says the ellipse holds every shot per
  club.
- **Progression** Dispersion by session tile (§4) and the **Gapping** tab (§5): the same control.
- One preference shared by all three places. Default **1 SD**. *(Planner's call: it's one concept, so
  flipping it in one place and seeing another place disagree would confuse.)* In the local app it's saved with
  the settings API like the Progression scope; in the public viewer it lives only in memory for the tab, like
  everything else there.

## 4. Progression: Dispersion by session

- New tile `dispersion`, title **Dispersion by session**, category **Accuracy**, available from **+ Add tile**.
  It is appended to the default layout for new dashboards; existing saved layouts aren't changed.
- **Shots:** the scope bar's club, its sessions (the same `sessionsForClub` rule as the other club tiles), and its
  Shots choice (all or stock only). Landing position is **carry**.
- **Controls on the tile:** Ellipse (`1 SD` | `Every shot`, §3.2) and View (`Side by side` | `Overlaid`). The View
  choice is remembered in the Progression scope (`progression.scope` gains it; `parseScope` defaults it to Side by
  side).
- **Side by side:** one small top-view plot per session, **oldest first**, all on the **same scale** so sizes
  compare. Each shows the session's dots, ellipse and centre cross, with the session date above and
  "width × depth" (yards) below, plus "n of m inside" for 1 SD only (under Every shot it is always all of
  them, so it's hidden). Many sessions wrap onto more rows; they don't shrink below a
  readable size.
- **Overlaid:** one plot with every session's dots and ellipse, **each session in its own colour** from the
  existing categorical palette (`CLUB_SERIES`), assigned oldest first, with a legend table beside the plot:
  session (colour dot + date), width, depth. With more than 8 sessions the palette would repeat, so Overlaid
  draws the **latest 8** and says so ("Overlaid shows the latest 8 of N sessions"). *(Planner's call.)*
- A session with fewer than 3 shots with lateral and carry shows its dots without an ellipse and the note the
  session page uses. The tile's usual `few shots` rule applies to sessions with 0 < n < 5.
- Same orientation as the app's other top views. The scale is fitted to the club's shots (not from the tee), so
  a 7-iron's spread is readable; the tile drops the tee and distance arcs. In Overlaid the plot's groups are
  sessions, not clubs.

## 5. The Gapping tab

### 5.1 Page
- New local-only route `/gapping`, nav item **Gapping** after Compare (nav: Sessions · Progression · Compare ·
  Gapping). The public build has no route, link or code for it (`AppPaths.gapping` is `null` in public, like
  `compare`). If shot tagging lands first or later, its **Tags** item goes after Gapping.
- **Based on** (select): **Selected session…**, **Latest session**, **Last 3 sessions**, **Last 10 sessions**,
  **All time**. Choosing Selected session shows a **Session** picker (newest first, default the latest
  session). Default **Last 3 sessions**. *(Planner's call.)*
- **Last 3 / Last 10 sessions count per club** (owner's choice): each club uses the last N sessions *in which it
  was hit*, so every club in the bag always has a stock yardage even if it wasn't hit recently, and different
  clubs may come from different dates. This differs from Progression's Club gapping tile (last N sessions
  overall), which stays as it is. **Latest session** is the newest session overall (one session's snapshot, like
  Selected session); **All time** is every session.
- **Ellipse**: §3.2. **Shots**: `All shots` | `Stock only`, default **Stock only**, same meaning as Progression's
  (stock = excluded shots left out).
- The choices are remembered (settings API), like Progression's scope.
- A line under the controls says what's in use, for example `Each club's last 3 sessions · 412 shots · 9 excluded
  left out` or `Nov 9, 2026 · 64 shots`. Because clubs can come from different dates, each table row's Shots
  cell also says how many sessions it came from on hover/focus (for example "38 shots from 3 sessions, Sep 21 –
  Nov 9").
- Empty states: no saved sessions → the app's usual "load a CSV" empty state; the chosen shots have no club with
  carry values → a sentence saying so.

### 5.2 Plot
- One top view (carry) of every club in the chosen shots: dots, ellipse and centre per club, in the app's club
  colours (`clubColors` over every club shown), reusing `DispersionPlot`.
- Hovering (or focusing) a table row highlights that club in the plot, using the plot's existing
  `highlightClub`.

### 5.3 Stock yardage table
One row per club with at least one carry value, sorted by stock carry, longest first.

| Column | Meaning |
| --- | --- |
| Club | colour dot + name |
| **Stock carry** | median carry, the headline number (bold) |
| Total | median total |
| Short – long | the carry extent of the club's ellipse (centre ± k·SD carry), per the Ellipse choice |
| Left – right | the lateral extent of the ellipse |
| Gap to next | this club's stock carry minus the next shorter club's; `—` on the last row |
| Consistency | score ± confidence (§5.4) |
| Shots | count; `few shots` when 0 < n < 5 |

Flags in the Gap to next cell:
- **overlaps {next club}** when this club's ellipse reaches into the next club's along carry (this club's short
  edge < the next club's long edge), so the flag follows the Ellipse choice and matches the picture. Edges come
  from the ellipse (centred on the mean) while rows sort by median carry; that is intended.
- **hole** when the gap is at least **1.75 ×** the median of the table's positive gaps (needs at least 3 of them;
  zero or negative gaps from overlapping clubs would otherwise drag the median down).
  *(Planner's calls: carry-extent overlap rather than exact 2-D intersection; the 1.75 factor.)*

Clubs without an ellipse (fewer than 3 shots with lateral and carry) show `—` for the extents and never flag
overlap.

### 5.4 Consistency score
- **Measures distance and direction together** (owner's choice). For a club's shots with both carry and lateral:
  - `spread% = 100 × √(SDcarry² + SDlateral²) / stock carry`, with sample SDs (n − 1).
  - `score = clamp(100 × (15 − spread%) / 12, 0, 100)`, rounded: 100 at a 3% spread, 0 at 15%.
    Constants `SCORE_BEST_PCT = 3`, `SCORE_WORST_PCT = 15`, a starting calibration (tour ≈ 85–90, typical
    amateur ≈ 50) to tune once real data is in.
  - Example: 7-iron, stock carry 160 yd, SD carry 6 yd, SD lateral 8 yd → spread 6.25% → **73**.
- **Only with more than 5 shots** (n ≥ 6, owner's rule). Otherwise the cell is `—` with a `few shots` note.
- **Confidence shown as ±** (owner's choice): one standard error of the score from the shot count,
  `± = (100 / 12) × spread% / √(2(n − 1))`, rounded (≈ 68% likely range). Example at spread 6.25%: 8 shots →
  73 ± 14, 20 shots → 73 ± 8, 50 shots → 73 ± 5. Shown as `73 ± 14`. The ± is shown as computed even near
  0 or 100 (`98 ± 5`); it says how much the score could move, not a range clamped to the scale.
- **Ignores the Ellipse toggle**; follows Based on and Shots.
- A short caption under the table explains the score and the ± in plain words.

## 6. Data and API
- No schema change. The Gapping tab and the Progression tile use the existing `GET /sessions` and
  `GET /shots` (with `session_ids`, `club` as needed). For per-club Last N, the session rows' club counts give
  each club's last N sessions; the page fetches the union of those sessions' shots and keeps, per club, only the
  shots from that club's own sessions. Remembered choices go through the existing settings API
  under new keys.
- All maths lives in `packages/analytics` (ellipse kinds, gapping rows with extents/flags, consistency score),
  unit tested there; components only draw.

## 7. Testing
- Analytics: per-club Last N session selection (a club missing from recent sessions still appears, from its own
  last N); both ellipse kinds (every point inside for Every shot; 1 SD unchanged), width × depth, degenerate
  and < 3 points; gapping rows (median carry/total, ordering, gap, overlap by ellipse kind, hole threshold,
  missing values); the score and ± against the worked examples, the n ≥ 6 rule and clamping.
- Web unit: session page Ellipse toggle and caption (local and public); the Progression tile (both views,
  oldest first, same scale, latest-8 note, < 3 shots note, toggles remembered); the Gapping page (Based on
  options incl. the session picker, Shots, table columns and flags, row hover highlights the club, empty states).
- e2e-local: import sessions with known clubs, open Gapping, switch Based on and Ellipse, check stock carry and a
  flag; add the Dispersion by session tile and switch views.
- Public: `ci:public` passes; the public bundle has no Gapping route or calls; the session page toggle works.

## 8. Left to the builder
- Exact visual design of the tile, the page and the table within the existing tokens and components.
- How the session-scale small plots are drawn (a zoom option on `DispersionPlot` or a compact sibling).
- Settings shapes. Suggested keys: `ellipse.kind` (shared), `gapping.scope` (Based on, picked session, Shots),
  and View inside `progression.scope`.
- The exact caption copy, listed in the plan for the owner's copy review.
