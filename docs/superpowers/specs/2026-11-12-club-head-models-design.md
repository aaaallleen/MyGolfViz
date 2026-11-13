# Club head models: driver, fairway wood, hybrid, iron — design

Date: 2026-11-12 · Status: built (branch `feat/club-head-models`); amended during the build, see "Changes made while building"

## Why

Every club head in the app is the flat face outline from
`packages/visualizations/src/faceOutlines.ts`, pushed straight back into a slab
(`club3d/clubModel.ts`). There are three shapes (driver, wood, iron) and hybrids borrow the wood.
From the side, the top or behind, a driver has no crown and no rounded body, so the 3D tab and the
2D tab do not read as a real club. The Face impact tab shows a bare outline with no face detail.

The reference is the FlightScope app (screenshots in `~/Desktop/Demo images/`): IMG_5879–5894 show
a 7 iron, IMG_5897–5902 a driver. In those, each club type has a recognisable head in every view:
face-on on the inch grid (IMG_5899), from above for face to path (IMG_5902), from the side for
dynamic loft (IMG_5901, IMG_5893), from the target side for spin axis (IMG_5900), and in the
spinnable 3D views (IMG_5897, IMG_5898, IMG_5882).

Success: with a driver, a fairway wood, a hybrid or an iron shot selected, the head is
recognisably that kind of club from every camera in the 3D and 2D tabs, and the Face impact tab
shows that same club's face, at true size on the inch grid, with score lines.

## Decisions the user made

- **Four heads, one per type:** driver, fairway wood, hybrid, iron. Every iron and wedge shares
  the one iron head; every fairway wood shares one wood head. The shape does not change with the
  specific club (no per-loft variants).
- **Hybrids get their own head** and are no longer treated as woods.
- **Built from scratch in code.** No model files are shipped or loaded in this round.
- **Looks:** irons are grey. Driver, wood and hybrid are glossy black with a light face. Gloss is
  wanted only if it is cheap; a plain finish is acceptable.
- The FlightScope models and art are not reused.
- **The head is posed from the measurements, not laid flat every time.** Face angle, dynamic
  loft, swing plane, attack angle, low point and the contact point on the face all show in the
  reconstruction. Where a measurement is missing and the pose can't be worked out, the head lies
  flat on its sole.

## Goals

- Four code-built heads, each a real 3D shape: body, flat face, score lines, hosel.
- The 3D tab and the 2D tab use the new heads through the existing scene and cameras, with no
  change to how angle lines, wedges and badges are computed or drawn.
- The head's pose reflects each shot's measurements, including where on the face the ball was
  struck, and falls back to lying flat when they are missing.
- The Face impact drawing shows the same face as the 3D head: both come from one description of
  the head.
- One place in the code that answers "give me the head for this club type", so a loaded model
  file could later replace any one head without touching the scene, cameras or annotations.
- Light on space and compute (budgets below).

## Non-goals (this round)

- Loading `.glb` or any other model file, and exporting the code-built heads to a file. Only the
  slot is built.
- Per-club variation (wedge vs long iron, 3 wood vs 7 wood), putters, brand detail, badges,
  cavity-back sculpting, adjustable-hosel detail.
- Changes to the swing arc model (`buildReplayScene`), cameras, annotations, badges or tab
  layout. The arc already reflects club path, attack angle, low point and the swing plane.
- Measuring or inventing head roll (toe up or toe down). The leading edge stays level.
- The D-plane view.
- Face bulge and roll. The face is a flat plane.

## Anti-goals (fails even if it technically works)

- Any drawn angle or impact location that stops matching its number. The face must stay a flat
  plane through the model origin with its normal on the model's +y axis, because the pose code
  and every face-angle line rely on that.
- A head that disappears against the app's dark background (`SURFACE` `#101714`).
- Copying FlightScope's models, textures or exact art.
- Breaking the privacy guarantees: nothing fetched from another origin, nothing stored,
  `scripts/verify-public-build.mjs` still passes. No new dependencies; three.js core plus addons
  already in use only.
- A noticeably slower Shot Inspector. See budgets.

## What gets built

### 1. A fourth club type

`ClubCategory` in `packages/domain/src/clubs.ts` becomes `'driver' | 'wood' | 'hybrid' | 'iron'`.
`clubCategory()` returns `hybrid` for names containing "hybrid" or "rescue" and for the short form
`4H`; `wood` for "wood" and `5W`; `driver` and `iron` as today (unknown names stay `iron`).
Everything keyed by category gains a hybrid entry: the labels in `ImpactTab.tsx` ("Wood/hybrid"
becomes "Wood", plus "Hybrid") and `FaceImpact.tsx`, and the tests.

### 2. One description per head

A new `HeadSpec` per category replaces `FACE_OUTLINES` as the single source of truth. It holds
real dimensions in inches and degrees:

- the face outline as a closed curve in the face plane, with the face centre at (0, 0), toe on +x
  for a right-hander, up on +y
- score-line positions on the face
- static loft and lie
- body dimensions: heel-to-toe width, front-to-back depth, crown height, sole shape
- hosel position, length and radius
- colours and finish

Both consumers read this spec: the 3D builder (below) and the Face impact drawing. `FaceImpact`
stays an SVG drawing (no extra 3D canvas on that tab) and keeps its `data-role` hooks, its inch
grid and its handedness mirroring. It draws the spec's face outline at true scale, the score
lines, the hosel, and for driver, wood and hybrid a darker body silhouette showing above and
around the face, as seen face-on. The 0.5 in grid and the impact dots are unchanged.

Design dimensions. These are typical real-club figures; the builder may tune any of them by up
to about 10% for looks, but loft, lie and face width are used as written. The built values live
in `packages/visualizations/src/heads/specs.ts`; a test holds the built driver, wood and hybrid
bodies within 10% of this table.

| | Driver | Fairway wood | Hybrid | Iron |
|---|---|---|---|---|
| Stands for | 460 cc driver | 3 wood | 4 hybrid | 7 iron |
| Static loft | 10.5° | 15° | 22° | 33° |
| Lie | 58° | 58° | 59.5° | 62.5° |
| Face width (heel–toe) | 4.3 in | 3.7 in | 3.3 in | 3.0 in |
| Face height at centre | 2.2 in | 1.4 in | 1.4 in | 1.7 in (2.2 at toe, 1.2 at heel) |
| Head width (heel–toe) | 4.8 in | 4.2 in | 3.9 in | 3.2 in |
| Head depth (front–back) | 4.5 in | 3.4 in | 2.3 in | 0.7 in at sole, 0.25 at top line |
| Head height | 2.5 in | 1.6 in | 1.55 in | as face |
| Face shape | wide rounded, flat-ish top | shallow rounded | shallow, squarer toe | trapezoid, high toe, straight leading edge |
| Score lines | centre left clear, lines either side | full-width lines | full-width lines | 9–11 full-width lines |

### 3. The 3D heads

`buildClubModel(category, handedness)` keeps its name, its return type and its local-frame
contract (the scene's own changes are in section 4):

- origin at the face centre, face normal +y, toe +x (mirrored with `scale.x = -1` when
  left-handed), up +z
- child named `club-head` (the body; the scene measures its lowest point to sit the sole on the
  ground), `club-face`, `club-grooves`, `club-face-centre`
- `userData`: the hosel base (the local point at the heel where the hosel starts), hosel length
  and radius, static loft and lie. The hosel itself is drawn by the scene (section 4).

Inside that frame the body is tilted back by the head's static loft. So when the scene turns the
face to the measured dynamic loft, the crown and sole sit as they would on a real club delivered
with that loft, rather than the body always being square to the face as the slab is today. The
model also exposes its static loft and lie (for the fallbacks in section 4).

Shapes:

- **Driver, wood, hybrid:** a closed, rounded body generated from the spec: a planform outline
  seen from above (wide and deep for the driver, pear-shaped for the wood, compact for the
  hybrid), a domed crown, a flatter curved sole, and a flat face cut across the front. The face
  plate, slightly inset from the body edge, carries the score lines.
- **Iron:** a blade: the face outline given thickness that tapers from a wide sole to a thin top
  line, with a slightly recessed back, and a cylindrical hosel rising from the heel at the lie
  angle.

How the surfaces are generated (lathe, lofted cross-sections, deformed sphere, extruded profile)
is the builder's choice.

Finish:

- Iron: grey satin metal, lighter grey face, dark score lines.
- Driver, wood, hybrid: black body with a glossy highlight from the existing scene lights, light
  grey face, dark score lines, dark hosel. Gloss is a material setting only: no environment maps,
  no reflections, no image textures.

### 4. How the head is posed (changes `headPose.ts` and `buildScene.ts`)

The head shows what was measured. Sample data: `Demo_csv/` and `fixtures/flightscope/`, columns
FTT, Dynamic Loft, Swing V, Swing H, AOA, Club Path, Low Point, Lateral Impact, Vertical Impact.

| Measurement | Present | Missing |
|---|---|---|
| Face to target | face turned by that angle | face square to the target line |
| Dynamic loft | face tipped to that loft; the body tips with it by (dynamic − static), however large | face at the head's static loft, so the body is level on its sole |
| Swing plane (Swing V, Swing H) | shaft lies in the plane, as today | shaft at the head's own lie angle (replaces the fixed 60°) |
| Lateral and vertical impact | the head is shifted so the ball touches the face at that point (inches from face centre; toe and high positive, as the Face impact tab plots them) | the ball meets the face centred heel-to-toe, at the height that rests the sole on the ground, kept on the face |
| AOA, club path, low point | already drive the arc the head travels along; unchanged | unchanged |

Both impact values are needed to shift the head; if either is missing the strike counts as
unmeasured. (Forcing face-centre contact when the height is unknown would push every iron's sole
below the ground line, because a ball on the ground meets a lofted face below its centre.) A head with no face angle and no loft therefore lies flat, square, soled, at static loft:
the "lay it flat" case. Labels and badges still never show a value that was not measured.

Ground and ball. The ball rests on the ground and never moves; the head is placed against it.
With a measured strike the ball touches the face exactly there. With no measured strike the
contact is centred heel-to-toe, at the height that lets the sole rest on the ground, but never
off the face (kept at least 0.1 in inside its top and bottom edges). Nothing then adjusts for
the ground: if the head ends up below the ground line it is drawn through it, because a normal
golf shot does hit into the ground. No tee is ever drawn and the ground never moves (the user's
decision). The contact point is never falsified.

Hosel and shaft. The shaft and hosel form one straight line: the hosel is aimed along the shaft
direction from its base at the heel, rather than fixed at the spec's lie angle, so there is no
kink however far the head tips. How the model and scene split that work is the builder's choice.

The existing test "the ball rests on the ground and the head sole sits on it" is rewritten to
these rules.

### 5. The slot for a loaded model later

`buildClubModel` is the slot. Its contract (the frame, the named children and the hosel base above)
plus static loft, lie and the hosel base, is written down as a doc comment and covered by a test that runs against all four categories, so
a future loaded model only has to satisfy the same contract. No loader, registry or async path is
built now.

## Budgets

- Each head: at most 6,000 triangles.
- Each head's geometry is generated once per club type and reused by every scene and view. Scene
  disposal must not free the shared geometry: `disposeTree` in `buildScene.ts` skips the cached
  head geometries, and the existing test "dispose() disposes every geometry it created" is
  narrowed to geometry the scene owns. Materials stay per scene, because the scene changes their
  opacity (`setClubOpacity`).
- No image textures and no new files in `apps/web/public`.
- First build of a head under 20 ms on a laptop (checked in a test with a generous margin, or by
  measurement during development).

## Calls made by the designer (not the user)

- The Face impact drawing stays SVG and is driven by the same spec, rather than becoming a 3D
  render.
- "Black" is drawn as a very dark charcoal with a lighter edge highlight where needed, so the
  head stays visible on the app's dark background. If it still reads poorly in a screenshot
  check, lighten the body before dropping the gloss.
- The representative clubs and the dimension table above.
- Body tilted by static loft inside the face-normal frame.
- "Rescue" counts as hybrid; a "utility iron" stays an iron.
- Geometry cached per club type; no model loader or file export in this round.
- No limit on how far the body tips with measured loft; a 60° wedge shot on the shared 33° iron
  will look laid back, because that is what was measured.
- No tee and no moving ground: this began as a designer call to draw a tee whenever the head
  would sink, and the user replaced it with "never draw a tee; the club may go through the
  ground".
- The hosel is aimed along the shaft so the two never kink.
- Head roll is not modelled; the leading edge stays level.

## Left to the builder

- Surface construction technique, segment counts, exact curve control points.
- Material numbers (metalness, roughness, exact greys) and whether a little extra light is
  needed for the black heads.
- How the Face impact body silhouette is derived from the spec.
- File layout inside `packages/visualizations/src` (for example one file per head), and whether
  `faceOutlines.ts` is removed or reduced to a thin adapter over the spec. `FACE_OUTLINES` is
  exported from the package index; nothing outside the package uses it.

## How we'll know it's right

- Unit tests: category mapping including hybrids; each head meets the frame contract (face
  vertices lie on y = 0 with normal +y, named children exist, the hosel base is heel-side and behind the face
  of the face centre, left-handed is the mirror); bounding sizes match the spec within tolerance;
  triangle budget; the Face impact outline width in pixels equals spec width × 40.
- Pose tests for all four types: measured loft and face angle give that face normal; missing
  loft gives static loft with the sole on the ground; a measured impact point puts the ball's
  touch point at that offset on the face (right- and left-handed); the ground and target line stay at zero and no tee
  exists, whatever the pose; shaft and hosel are collinear; missing plane uses the lie.
- Existing angle tests (`annotations.test.ts`, `cameras.test.ts`) pass untouched.
- A visual check in the running app: for each of the four types, look at the 3D tab's four
  cameras (including a high-loft wedge shot, a shot with no loft, and an off-centre strike) and reconstruction mode, the 2D tab's four views, and the Face impact tab, right- and
  left-handed, and compare by eye against the reference screenshots for shape, not style.
- `npm test`, the e2e suite and `scripts/verify-public-build.mjs` pass.

## Changes made while building

These were decided during the build and replace earlier wording where they differ.

- **Unmeasured strike.** The first draft put the ball on the face centre. That forced every iron
  onto a tee, because a ball on the ground meets a lofted face below its centre. Now the contact
  is centred heel-to-toe at the height that rests the sole on the ground, kept on the face.
- **No tee (user's decision).** Intermediate versions drew a tee when the head would sink, first
  for any depth, then past a turf allowance. On the fixture sessions that still put 41–48% of
  measured-strike iron shots on a tee. The user's rule replaces all of it: never draw a tee; the
  club may pass through the ground line.
- **Iron body.** The blade's back runs level-backward from the face, so its sole is level at its
  static loft. Wood-kind bodies are warped behind the face so the crown peaks just behind the
  face and the head is widest about 40% back; the warp is the identity on the face plane.
- **Hosel.** Drawn by the scene along the shaft direction from the model's hosel base.
- **Framing.** `cameras.ts` is unchanged, but the 3D measuring views now also keep the club
  head's box in frame, so a head below the ground line is not cut off.
- **Tuning after the visual check.** Black finish drawn as dark graphite `#4A525B` (hosel `#3A4149`) after the user found the head too close to the background; driver body 5.0 × 4.6 in
  and wood 4.4 in wide before the warp; hybrid 3.6 in wide; iron score-line spacing 0.13 in.
