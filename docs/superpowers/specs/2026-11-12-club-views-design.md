# Club data views: real 3D and multi-view 2D — design

Date: 2026-11-12 · Status: ready for review

## Why

The Shot Inspector's **3D reconstruction** and **2D reconstruction** tabs look too toy-like, and
they don't show enough viewpoints to read the numbers from the picture. The 3D tab has a single
angled camera. From that camera you can't see the swing plane edge-on, and you can't look at the
attack angle from the side. The 2D diagrams exaggerate angles (×4, ×2) and use flat
schematic shapes.

The reference is the FlightScope app (screenshots in `~/Desktop/Demo images/`, IMG_5879–5882 for
3D and IMG_5891–5894 for 2D). In that app each camera angle labels only the angles you can read
from it, and the lines are drawn at their true angle. Colored number badges match the line
colors. We want that way of reading a swing, in this app's own visual style.

Success: with one shot selected, the user can read path, H-plane, face to path, attack angle,
low point and V-plane straight off the 3D views. They can read face to target, face to path,
dynamic loft / launch / attack, and spin axis straight off the 2D views. Every angle on screen
matches its number.

## Goals

- Rebuild the 3D tab as a real three.js scene: a shaded club model, swing arc, ground and
  annotations, seen through four preset cameras, plus a separate draggable 3D reconstruction mode.
- Rebuild the 2D tab with the same layout and the same three.js club model, using fixed cameras
  and true-angle lines.
- One layout for both tabs: **one large view plus three thumbnails**. Clicking (or tapping) a
  thumbnail swaps it into the large slot. This is layout B from the mockup; the user chose it.
- Draw measured angles at true scale. A measuring view uses a camera square-on to the plane of
  the angle it labels, so the on-screen angle equals the number.
- Colored badges under the large view, each the same color as the line it describes.

## Non-goals (this round)

- **D-plane.** The FlightScope D-plane screens (IMG_5884–5890) come later, as a spinnable 3D
  reconstruction. This round should leave a three.js scene and club model that the D-plane can
  reuse, but builds nothing D-plane-specific.
- The Face impact tab, the Ball data panel and its SVG ball-flight viewer (`BallFlight3D`) are
  unchanged.
- No change to how club motion is inferred. The arc stays the illustrative model in
  `packages/analytics/src/replay.ts` (`buildReplayScene`).

## Anti-goals (fails even if it technically works)

- Exaggerated angles, or an angle label whose drawn wedge doesn't match its number in the view
  it's labelled in.
- Presenting the reconstruction as captured motion. The "Illustrative reconstruction" banner and
  provenance tags stay (spec §181: never represented as a recorded swing).
- Copying FlightScope's branding, light theme or exact art. Use the app's dark tokens
  (`docs/design/README.md`) and its own drawings.
- Breaking the privacy guarantees. Nothing may be fetched from another origin, nothing stored,
  and `scripts/verify-public-build.mjs` must still pass. three.js 0.187's `three.module.js` and
  `three.core.js` contain none of the strings that script forbids. Check any addon you import.

## Layout (both tabs) — user's decision

- **One large view plus three thumbnails** on desktop and iPad: large view on the left, thumbnails
  stacked in a column on the right. Clicking a thumbnail swaps it into the large slot. The view
  that was large becomes a thumbnail.
- Under the large view: its name, a one-line "what this view reads" hint, and that view's
  colored badges.
- *My call:* on phone (≤ 600 px) the thumbnails become a horizontal row under the large view.
- *My call:* each tab remembers its own large view while the user moves between shots. It resets
  only on reload. Keep it in in-memory state only; browser storage is forbidden.
- *My call:* both tabs use one shared layout component, so they look and behave the same.
- The **Show** checkbox fieldsets on both tabs go away. Picking a view replaces them.

## 3D tab — the four views

All four views show the same scene: ground grid, dashed target line, the club arc for the shot
(from `buildReplayScene`), a shaded club model at its replay position, and the ball.

**Orientation (user's decision): match FlightScope and mirror for left-handers.** FlightScope's
screenshots fix the orientation of each view for a right-hander. For a left-hander, every view
except Down the line and Spin axis is mirrored.

| View | Right-hander | Mirrored for a left-hander? |
|---|---|---|
| 3D Top; 2D Face to target and Face to path (IMG_5879, 5891) | Golfer at the bottom of the screen, target on the **left** (looking down over the golfer's shoulder) | Yes |
| 3D Face-on; 2D Dynamic loft (IMG_5893) | Camera faces the golfer, target on the **right** | Yes |
| 3D Down the line; 2D Spin axis (IMG_5881, 5894) | Camera behind the ball looking at the target; golfer on the left | The golfer moves to the right; the camera itself doesn't change |

This applies to the 2D tab too. `Club2DTab` needs the handedness passed in, which it doesn't have
today. L/R in labels and badges always comes from the measurements, never from screen direction.

| View | Camera | Labels and badges |
|---|---|---|
| **Top** | Orthographic, straight down; golfer at the bottom of screen | Club path (wedge from the target line), H-plane (`swingH`, the plane's ground line), face to path (wedge from path to face) |
| **Face-on** | Orthographic, horizontal, looking square to the **club path** direction (not the target line), so the attack angle reads true | Attack angle (wedge from level), low point (tick and distance ahead of or behind the ball) |
| **Down the line** | Orthographic, from behind the ball looking along the **swing direction** `u = (sin swingH, cos swingH, 0)` from `replay.ts`, not the target line, so the plane is truly edge-on and V-plane reads true | V-plane (`swingV`, wedge from the ground to the plane) |
| **3/4 overview** | Perspective, from behind and above to the target side | Translucent swing plane. Values appear as **text labels with leader lines, and no wedges**, because a perspective camera can't draw an angle true. Its badge row shows all the main values: path, H-plane, V-plane, attack, face to path. |

*My call (from the review):* a measuring camera is square to the plane of the angle it labels,
even when that tilts the target line a few degrees on screen. With H-plane values of 7–13° in the
demo data, a camera on the target line would misdraw V-plane (it would show 51.9° for 52.6°).
Wedges are drawn only in the orthographic measuring views.

- *My call:* the 3D tab opens on **Face-on** as the large view, with the other three as thumbnails.
- **Modes (user's decision, revised after review):** a switch at the top of the tab picks between
  two modes:
  - **Views:** the four fixed cameras, with no dragging.
  - **3D reconstruction:** one large draggable viewer. It starts at the 3/4 overview camera:
    - Dragging rotates and the wheel or a pinch zooms.
    - **Reset view** returns it to the start, and is enabled once it has been rotated, zoomed or panned.
    - It shows the translucent swing plane and text labels; there are no angle wedges.
    - Its badges are the overview's.

  Only the reconstruction canvas captures touch drags. The mode is kept while moving between
  shots.
- **Play:** one Play button animates the club along the arc in all four views at once. Keep the
  existing replay clock (`useReplayClock`), phase labels (Downswing / Impact / Follow-through),
  speed and loop controls.
- **All shots:** a toggle overlays the arcs of the other visible shots of the **same club**, thin
  and faded, in every view. *My call* on "same club"; the inspector already has these scenes
  (`others` in `InspectorPage`).
- Handedness: `buildReplayScene` already mirrors the scene for a left-hander. The camera presets
  follow the orientation rule above.
- Missing club data (`scene.plane === null`): show the ground and ball with "Club delivery not
  measured for this shot", as today.

## 2D tab — the four views

Each view poses the same three.js club head with a fixed camera (no orbit). Lines are drawn at
true angle from the ball or impact point. These views have no ×2 or ×4 exaggeration and no "True
scale / Exaggerated" toggle.

| View | Camera | Lines (each with a matching badge) |
|---|---|---|
| **Face to target** | Looking down on the head | Target line (grey), face (FTT), club path, launch direction (`launchH`) |
| **Face to path** | Same as above | Same lines, with the face colored and badged as face to path (FTP) |
| **Dynamic loft** | From the toe side, square to the club path (same rule as Face-on) | Ground, loft line (`dynamicLoft`), launch angle (`launchV`) with a wedge from level, attack angle (`aoa`). *My call:* spin loft gets a badge marked "as reported", with no wedge. Spin loft is a 3D angle, and the spec (line 161) says not to draw it as loft minus attack. |
| **Spin axis** | From behind the ball looking at the target | Ball with a tilted axis line; badges for spin rate and spin axis. Tilted right = ball curves right, the same convention as today's `SpinAxisDiagram` |

- *My call:* the 2D tab opens on **Face to target**.
- The **Measured angles** and **Against session average** panels stay under the views, unchanged
  (user's decision for now; they'll revisit after review).

## Colors

One color per measurement. It is the same in every view and in both tabs, and each badge
matches its line. *My call*, built from the existing tokens and the club palette:

| Measurement | Color |
|---|---|
| Club path, swing arc, attack angle | `CLUB` `#62B6F7` |
| H-plane, V-plane, swing plane | green `#3FBF8A` |
| Face to target, face to path, dynamic loft | red `#E5484D` |
| Launch direction, launch angle | `BALL` `#F5A742` |
| Spin axis | `INK` `#EAF0EC` |
| Target line, ground, level | `MUTED` `#9BA9A1` |

Validated with the dataviz palette script against `SURFACE` `#101714`, comparing every pair:
- Red and green, the pair that shares the Top view, separate by ΔE 9.0 for deutan viewers.
- The worst pair is orange (launch) and green at ΔE 8.0 for protan viewers. That's a WARN, allowed because every
  line also has a text label and badge, and those two colors never share a view.
- Contrast passes for all four.
- The lightness band flags the existing app tokens `CLUB` and `BALL` (and the green). These are thin lines on a dark
  surface, where being lighter helps legibility. Changing the app-wide tokens is out of scope.

## Club model

- *My call:* build the club in code from three.js geometry rather than load a model file. That
  avoids licensing a 3D asset and avoids an extra file fetch. It also lets the head match the
  shot's club category (driver / wood-hybrid / iron). Extrude the face outlines already in
  `packages/visualizations/src/faceOutlines.ts` into a head with some thickness, then add a
  hosel, a shaft and a darker grip.
- Pose the head from the measurements: the face rotated by `ftt` about vertical and tilted back
  by `dynamicLoft`; the shaft along the swing plane (the plane's up vector `w` in `replay.ts`). A
  missing value means a neutral pose for that axis, and the value is never invented in a label.
- The head is drawn larger than true scale relative to the arc, the way the reference does, so it
  reads. Angles stay true. Only the head size changes, and the tab's provenance note says so.

## Engineering constraints

- **One WebGL context per tab.** Thumbnails must not each open their own context, because
  browsers cap contexts and phones are tight. Render all four views with one renderer, using
  scissor/viewport regions or by copying frames into thumbnail canvases. The builder chooses.
  Only the active club-data tab's scene is mounted.
- **Bundle size:** three.js lives in the lazily loaded Inspector chunk (`lazyPage`), which is
  preloaded at startup so it still works offline (`e2e/offline.spec.ts`). Import only what's
  used.
- **No WebGL** (old device, or jsdom in unit tests): show a plain message in place of the views.
  Badges and panels still render, so the numbers remain available.
- **Testability:** keep the geometry pure and in plain modules, unit-tested with Vitest:
  - camera presets and the "on preset" check
  - wedge start/end angles and badge text
  - head pose
  - arc points per view

  The React/three layer stays thin. Playwright covers the real render and the layout: one large
  view plus three thumbnails, swapping on click, no horizontal overflow at 390/820/1280 px, and
  44 px touch targets.
- **Text labels:** use HTML or CSS overlays positioned from projected points, or three's
  `CSS2DRenderer`, so text stays crisp and uses the app fonts. The builder chooses.
- Accessibility: each large view gets an `aria-label` summarizing its measurements, like today's
  SVGs. Thumbnails are buttons named after their view. Badges are real text.

## What goes away

- `ClubReplay3D`, `HorizontalDeliveryDiagram`, `VerticalDeliveryDiagram` and `SpinAxisDiagram`
  plus their tests. Delete anything nothing else imports; `camera.ts` is still used by
  `BallFlight3D`, so keep the parts it needs.
- `ShowToggles` and the e2e checks that reference the Show fieldsets and the 2D phone
  `SegmentedControl` (`e2e/responsive.spec.ts`). Replace those checks with ones for the new
  layout.

## Left to the builder

- The exact camera distances, framing and zoom limits, and how framing adapts to arc size and
  aspect ratio.
- Lighting and material choices, within the dark tokens.
- How the single renderer serves the thumbnails.
- Whether labels use the HTML overlay or `CSS2DRenderer`.
- The file and component structure inside `packages/visualizations` and `apps/web`.
