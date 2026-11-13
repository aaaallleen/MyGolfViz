# Club Views (real 3D + multi-view 2D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Shot Inspector's 3D and 2D club tabs with three.js views: four camera views per tab, shown as one large view plus three thumbnails, with lines drawn at their true angle and colored badges that match the lines.

**Architecture:** Geometry is pure TypeScript with no three.js: cameras, annotations (lines and wedges in scene coordinates), badges and head pose. A thin three.js layer turns those specs into a `THREE.Scene`. One shared `WebGLRenderer` (one context per tab) renders each view and copies the frame into that slot's 2D canvas. A React `ViewGallery` handles the layout (large view plus thumbnails, swapping, badges, labels). `ClubViews3D` and `ClubViews2D` compose these pieces, and the web app's tabs wire them to the store.

**Tech Stack:** React 19, TypeScript, three.js 0.187 (`three` + `three/addons` OrbitControls and SVGLoader), Vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-club-views-design.md`

## Global Constraints

- Scene coordinates are yards: x is lateral (right of target +), y is downrange (target +), z is up, and the ball is at the origin (`Vec3` in `@fsa/domain`). The arc comes from `buildReplayScene` in `packages/analytics/src/replay.ts` and is unchanged.
- L/R sign: positive = R = +x (`formatMeasurement`); all label text uses `formatMeasurement`.
- Orientation (right-hander; a left-hander mirrors every view except Down the line and Spin axis):
  - Top, 2D Face to target and 2D Face to path: golfer at the bottom, target on the **left**.
  - Face-on and 2D Dynamic loft: target on the **right**.
  - Down the line and 2D Spin axis: camera behind the ball looking at the target.
- Measuring cameras are orthographic and square to the plane of the angle they label:
  - Face-on and Dynamic loft: square to the **club path**.
  - Down the line: looks along `u = (sin swingH, cos swingH, 0)`.
  - Only the 3/4 overview uses perspective, and it draws text labels, never wedges.
- Colors:
  - Path, arc, attack: `CLUB #62B6F7`
  - Planes: `PLANE #3FBF8A`
  - Face, FTP, loft: `FACE #E66767`
  - Launch: `BALL #F5A742`
  - Spin axis: `INK #EAF0EC`
  - Target line, ground, level: `MUTED #9BA9A1`
- One WebGL context per mounted tab. No storage APIs, no cross-origin fetches. `node scripts/verify-public-build.mjs apps/web/dist` must pass (it forbids the strings `/api/`, `localStorage`, `sessionStorage`, `indexedDB`, `serviceWorker`, `document.cookie`, `sendBeacon` in built JS).
- No angle exaggeration anywhere. Keep the "Illustrative reconstruction" banner and the provenance tag. Missing values are never invented: no line, wedge or badge is drawn for a null measurement, and the badge says "Not measured".
- 3D view ids, in this order: `top`, `faceOn`, `dtl`, `overview`. 3D opens on `faceOn`.
- 2D view ids, in this order: `ftt`, `ftp`, `loft`, `spinAxis`. 2D opens on `ftt`.
- On phones (≤ 600 px) the thumbnails sit in a row under the large view; otherwise they sit in a column to its right. Touch targets are ≥ 44 px.
- Run Node 24: `source ~/.nvm/nvm.sh && nvm use` before every npm/npx command.

## Review Focus

1. **A shot with partial club data:** for example, `swingH`/`swingV` null but `clubPath`/`aoa`/`ftt` present, or the reverse. Every view should still render what's present and badge the rest "Not measured", without throwing. Tests in Tasks 2 and 6.
2. **A left-handed golfer:** each view mirrors as the orientation table says, wedges still span the measured angle, and labels still say R/L from the data. Tests in Tasks 1 and 2.
3. **No WebGL** (jsdom, an old phone, or a lost context): the gallery, badges, banner and 2D panels still render, with a fallback message in place of the pictures. Tests in Task 4.
4. **Switching shots or tabs quickly while Play runs:** no leaked renderer, rAF loop or OrbitControls. Disposal is verified in Task 5.
5. **Extreme values:** for example, path 25° L or V-plane 75°. Wedges stay correct, labels stay inside the slot (clamped), and the camera frames the arc. Tests in Tasks 2 and 4.

---

### Task 1: three.js dependency and the pure view cameras

**Files:**
- Modify: `packages/visualizations/package.json` (add `"three": "0.187.0"` to dependencies, `"@types/three"` matching to root devDependencies), `package-lock.json`
- Create: `packages/visualizations/src/club3d/types.ts`
- Create: `packages/visualizations/src/club3d/cameras.ts`
- Test: `packages/visualizations/src/club3d/cameras.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type View3D = 'top' | 'faceOn' | 'dtl' | 'overview';
  export type View2D = 'ftt' | 'ftp' | 'loft' | 'spinAxis';
  export const VIEWS_3D: readonly View3D[]; // ['top','faceOn','dtl','overview']
  export const VIEWS_2D: readonly View2D[]; // ['ftt','ftp','loft','spinAxis']
  export interface ViewCamera {
    kind: 'ortho' | 'persp';
    eye: Vec3; target: Vec3; up: Vec3;
    /** ortho: half-height of the view in yards; persp: vertical fov in degrees */
    size: number;
  }
  ```
- Produces (`cameras.ts`):
  - `camera3D(view: View3D, scene: ReplayScene, m: Measurements): ViewCamera`
  - `camera2D(view: View2D, m: Measurements, handedness: Handedness): ViewCamera`
  - `screenBasis(cam: ViewCamera): { right: Vec3; up: Vec3; forward: Vec3 }`, the unit vectors (pure math, also used by tests and label projection).
  - `projectOrtho(cam: ViewCamera, p: Vec3, aspect: number): { x: number; y: number }` gives coordinates in [0,1] slot space (x right, y down); ortho only.

- [ ] **Step 1: Install three**

Run: `source ~/.nvm/nvm.sh && nvm use && npm i -w @fsa/visualizations three@0.187.0 && npm i -D @types/three@0.187.0`
Expected: both appear in the package files; `npm ls three` shows a single copy.

- [ ] **Step 2: Write failing tests in `cameras.test.ts`**

Use a right-handed scene from `buildReplayScene` with `m = { swingH: 6, swingV: 60.7, aoa: -4, clubPath: 8.3, ftp: 3.6, ftt: 11.8, dynamicLoft: 40.9, launchV: 26, launchH: 5.7, spinAxis: 2.6 }`, other keys null. Also build its `'left'` twin.
```ts
test('top: looks straight down; right-hander target (+y) is screen-left, golfer side (-x) is screen-down', () => {
  const b = screenBasis(camera3D('top', rh, m));
  expect(b.forward).toEqual(near([0, 0, -1]));
  expect(dot(b.right, [0, 1, 0])).toBeLessThan(-0.99);
  expect(dot(b.up, [1, 0, 0])).toBeGreaterThan(0.99);
});
test('top, left-hander: target is screen-right', () => { /* dot(right,[0,1,0]) > 0.99 */ });
test('faceOn: horizontal, square to club path 8.3° R; target on the right for a right-hander', () => {
  const b = screenBasis(camera3D('faceOn', rh, m));
  expect(b.forward[2]).toBeCloseTo(0, 6);
  expect(dot(b.forward, pathDir(8.3))).toBeCloseTo(0, 6);
  expect(dot(b.right, [0, 1, 0])).toBeGreaterThan(0.98);
});
test('faceOn, left-hander: target on the left', () => { /* dot(right,[0,1,0]) < -0.98 */ });
test('dtl: looks along u = (sin 6°, cos 6°, 0), horizontal, same for both hands', () => {
  for (const s of [rh, lh]) expect(screenBasis(camera3D('dtl', s, m)).forward).toEqual(near([Math.sin(rad(6)), Math.cos(rad(6)), 0]));
});
test('overview is perspective from behind (eye.y < 0) and above (eye.z > 0), on the side away from the golfer', () => { /* rh eye.x > 0, lh eye.x < 0 */ });
test('dtl with swingH null falls back to the target line; faceOn with clubPath null is square to the target line', ...);
test('camera2D: ftt and ftp share top-down; loft matches faceOn; spinAxis looks along +y; all ortho with size < 0.3 yd', ...);
test('projectOrtho: ball projects to the slot centre for top/faceOn/dtl', ...);
```
`near(v)` is a small helper (each component within 1e-6), and `pathDir(d) = [sin d, cos d, 0]`.

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run --project packages/visualizations src/club3d/cameras.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `types.ts` and `cameras.ts`**

- The handedness sign is `g = scene.handedness === 'right' ? 1 : -1`, matching `replay.ts`.
- **top:** `eye [0,0,10]`, `up [g,0,0]`.
- **faceOn:** let `p = pathDir(clubPath ?? 0)` and `n = [p[1], -p[0], 0]`. Then `eye = n*10*g`, `up [0,0,1]`.
- **dtl:** `eye = -u*10` with `u` from `swingH ?? 0`.
- **overview:** `persp`, `eye [3.2g, -3.6, 2.2]`, fov 32.
- **Sizes:** start ortho at 1.9 yd for 3D and 0.16 yd for 2D. Framing to the arc happens in Task 4.
- **camera2D:** `ftt` and `ftp` match `top`, `loft` matches `faceOn` (handedness applied the same way), and `spinAxis` uses `eye [0,-10,0]`, `up z`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run --project packages/visualizations src/club3d/cameras.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -m "feat(visualizations): add three and pure camera presets for the club views"`

---

### Task 2: Annotations and badges (pure)

**Files:**
- Create: `packages/visualizations/src/club3d/annotations.ts`
- Create: `packages/visualizations/src/club3d/palette.ts` (exports `PLANE = '#3FBF8A'`, `FACE = '#E66767'`; re-exports `CLUB, BALL, INK, MUTED` from `../theme`)
- Test: `packages/visualizations/src/club3d/annotations.test.ts`

**Interfaces:**
- Consumes: `View3D`, `View2D`, `ViewCamera`, `camera3D`, `camera2D`, `screenBasis` (Task 1).
- Produces:
  ```ts
  export type Annotation =
    | { kind: 'line'; id: string; color: string; a: Vec3; b: Vec3; dashed?: boolean; width?: number }
    | { kind: 'wedge'; id: string; color: string; origin: Vec3; from: Vec3; to: Vec3; radius: number }
    | { kind: 'label'; id: string; color: string; at: Vec3; text: string };
  export interface Badge { id: string; label: string; text: string | null; color: string; note?: string }
  export function annotations3D(view: View3D, scene: ReplayScene, m: Measurements): Annotation[];
  export function annotations2D(view: View2D, m: Measurements): Annotation[];
  export function badges3D(view: View3D, m: Measurements): Badge[];
  export function badges2D(view: View2D, m: Measurements): Badge[];
  /** Angle in degrees between the wedge's from/to as seen through `cam` (ortho), for tests and aria. */
  export function apparentWedgeDeg(w: Extract<Annotation, { kind: 'wedge' }>, cam: ViewCamera): number;
  ```
- Badge `text` is `formatMeasurement(key, v)` or `null` when the measurement is missing. `label` uses this exact copy: "Club path", "H-plane", "Face to path", "Attack angle", "Low point", "V-plane", "Face to target", "Launch direction", "Dynamic loft", "Launch angle", "Spin loft", "Spin", "Spin axis". The spin loft badge has `note: 'as reported'`.

**Which annotations each view emits** (wedge vectors in scene coordinates; `pathDir(d)=[sin d, cos d, 0]`; `faceN = pathDir(ftt)`, or `pathDir(clubPath+ftp)` when ftt is null):

| View | Lines | Wedges (id: from → to) | Badges (in order) |
|---|---|---|---|
| top | target line `[0,-3,0]→[0,3,0]` dashed MUTED; H-plane line along `±u` PLANE dashed; face normal `0→faceN*0.5` FACE | `path`: `[0,1,0] → pathDir(clubPath)` CLUB r 1.1; `hplane`: `[0,1,0] → u` PLANE r 1.4; `ftp`: `pathDir(clubPath) → faceN` FACE r 0.7 | Club path, H-plane, Face to path |
| faceOn | level along `pathDir(clubPath)` dashed MUTED; attack line `−0.8·a → 1.6·a`, where `a = [sin p·cos aoa, cos p·cos aoa, sin aoa]` CLUB dashed; low-point tick at `pathDir(clubPath)*lowPoint/36` (only if lowPoint is present) | `aoa`: `pathDir(clubPath) → a` CLUB r 1.2 | Attack angle, Low point |
| dtl | plane line `0 → w*2.2` PLANE dashed | `vplane`: `s → w` PLANE r 0.6 (`s`, `w` from `replay.ts`, recomputed here from swingH/swingV/handedness) | V-plane |
| overview | target line; no wedges | — | Club path, H-plane, V-plane, Attack angle, Face to path |
| 2D ftt | target line; face leading edge (⊥ faceN, length 0.12) FACE; path `−0.12·pd → 0.12·pd` CLUB; launch `0 → pathDir(launchH)*0.14` BALL | `ftt`: `[0,1,0] → faceN` FACE r 0.07 | Face to target, Launch direction, Club path |
| 2D ftp | same lines | `ftp`: `pathDir(clubPath) → faceN` FACE r 0.07 | Face to path, Launch direction, Club path |
| 2D loft | ground along pd; face-plane line through the origin, tilted `dynamicLoft` from vertical, toward the target; attack line as in faceOn (length 0.12); launch `0 → [pd·cos lv, sin lv]*0.14` BALL | `launch`: `pd → launchDir` BALL r 0.06; `loft`: `[0,0,1] → facePlaneUp` FACE r 0.05 | Dynamic loft, Launch angle, Attack angle, Spin loft (note "as reported", no wedge) |
| 2D spinAxis | level reference `[-0.1,0,0]→[0.1,0,0]` dashed MUTED; axis `±[cos a, 0, −sin a]*0.09` INK (positive = R tilts the right end down) | — | Spin, Spin axis |

Labels: one `label` annotation per wedge, placed at `origin + bisector * (radius + 0.15·radius)`, with text `"<Badge label> <formatted value>"`. In overview, labels sit at the arc's top point (V-plane), along the path (path and attack), and on the H-plane line.

- [ ] **Step 1: Write failing tests in `annotations.test.ts`**

```ts
test.each([
  ['top', 'path', 8.3], ['top', 'hplane', 6.0], ['top', 'ftp', 3.6],
  ['faceOn', 'aoa', 4.0], ['dtl', 'vplane', 60.7],
])('3D %s: wedge %s reads %s° through its own camera (right- and left-handed)', (view, id, deg) => {
  for (const s of [rh, lh]) {
    const w = annotations3D(view, s, m).find((a) => a.id === id)!;
    expect(apparentWedgeDeg(w, camera3D(view, s, m))).toBeCloseTo(deg, 1);
  }
});
test.each([['ftt','ftt',11.8],['ftp','ftp',3.6],['loft','launch',26],['loft','loft',40.9]])('2D %s wedge %s reads %s°', ...);
test('dtl V-plane reads 52.6° for swingH 13.3 / swingV 52.6 (camera along swing direction, not target line)', ...);
test('overview has no wedges', () => expect(annotations3D('overview', rh, m).some((a) => a.kind === 'wedge')).toBe(false));
test('badges3D top: Club path 8.3° R, H-plane 6.0° R, Face to path 3.6° R with matching colors', () => {
  expect(badges3D('top', m).map((b) => [b.label, b.text, b.color])).toEqual([
    ['Club path', '8.3° R', CLUB], ['H-plane', '6.0° R', PLANE], ['Face to path', '3.6° R', FACE]]);
});
test('missing data: swingH/swingV null → no hplane/vplane wedges, H-plane and V-plane badges text null; nothing throws for an all-null shot in any view', ...);
test('extremes: clubPath -25 (25° L) and swingV 75 still read true', ...);
test('spin axis 2.6 R: the axis right end (x > 0) is lower than its left end', ...);
test('2D loft: Spin loft badge has note "as reported" and no spin-loft wedge exists', ...);
test('every wedge color equals its badge color', ...);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project packages/visualizations src/club3d/annotations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `annotations.ts` and `palette.ts`**

Write the per-view emitters from the table above. To get `apparentWedgeDeg`, project `from` and `to` onto the camera's `right`/`up` basis, then return the absolute angle between the two 2D vectors in degrees.

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(visualizations): true-angle annotations and badges for club views"`

---

### Task 3: Club model, head pose and scene builder (three.js, no renderer)

**Files:**
- Create: `packages/visualizations/src/club3d/headPose.ts` (pure)
- Create: `packages/visualizations/src/club3d/clubModel.ts`
- Create: `packages/visualizations/src/club3d/buildScene.ts`
- Test: `packages/visualizations/src/club3d/headPose.test.ts`, `packages/visualizations/src/club3d/buildScene.test.ts`

**Interfaces:**
- Consumes: `Annotation` (Task 2), `FACE_OUTLINES` (`../faceOutlines`), `clubCategory` (`@fsa/domain`), `ReplayScene`, `clubFrame` (`@fsa/analytics`).
- Produces:
  ```ts
  // headPose.ts
  export interface HeadPose { faceNormal: Vec3; shaftDir: Vec3; toeDir: Vec3 }
  export function headPose(m: Measurements, scene: ReplayScene): HeadPose;
  // clubModel.ts
  export function buildClubModel(category: ClubCategory, handedness: Handedness): THREE.Group; // origin at face centre, face normal +y, toe +x (−x when left), shaft up the hosel
  // buildScene.ts
  export interface ClubSceneInput {
    scene: ReplayScene; m: Measurements; club: string;
    others: ReplayScene[];      // same-club arcs for "All shots"
    headScale: number;          // 3 for 3D, 1 for 2D
    annotations: Annotation[];  // for the view being drawn; swapped per render
  }
  export interface ClubScene {
    root: THREE.Scene;
    setProgress(p: number): void;       // moves the club along the arc via clubFrame; impact pose at 0.60–0.66
    setShowOthers(on: boolean): void;
    setAnnotations(a: Annotation[]): void;
    dispose(): void;                    // disposes every geometry and material it created
  }
  export function buildClubScene(input: ClubSceneInput): ClubScene;
  ```

**Pose rule:**
- `faceNormal` is `pathDir(ftt)` tilted up by `dynamicLoft`; a null value means 0 for that axis.
- `shaftDir` is the plane's `w` when `scene.plane` is present. When it isn't, use the default 60° lie toward the golfer.
- `toeDir` is `normalize(faceNormal × shaftDir)` with its sign chosen so it points away from the golfer.

**Scene contents** (object `name`s are used by the tests):
- `ground`: a grid of 0.5 yd cells over ±3 yd, color `GRID`.
- `target-line`
- `arc`: the solid part up to `impactIndex` plus a fainter follow-through.
- `swing-plane`: a translucent quad (opacity 0.10). It goes into the root when `scene.plane` is present; the view decides whether it's visible (overview only).
- `others`: one faded line per other arc, hidden by default.
- `club`: the model group, scaled by `headScale` and oriented by `headPose`.
- `ball`: radius `0.0233 * headScale`, white.
- `annotations`: line, wedge and label objects. Labels become empty `Object3D`s whose world position is read for the HTML overlay.

Use a hemisphere light plus one directional light, and `MeshStandardMaterial` for the head (dark metal, roughness 0.35) and the shaft. To build the head, parse the outline's `d` with `SVGLoader` (`three/addons/loaders/SVGLoader.js`) into a `Shape`, scale it to `widthIn` inches (to yards), and run `ExtrudeGeometry` with depth `0.6 in` and a bevel. Iron grooves are thin dark lines on the face. Wedges are `CircleGeometry`-style fans built between `from` and `to`, meaning a `BufferGeometry` triangle fan with 24 segments; fill opacity 0.28 and an edge line.

- [ ] **Step 1: Write failing tests**

```ts
// headPose.test.ts
test('face normal for ftt 11.8 R, loft 40.9: heading 11.8° right of +y, 40.9° up', ...);
test('left-handed toe points −x; right-handed +x', ...);
test('null ftt/loft → face normal [0,1,0]', ...);
// buildScene.test.ts (node-safe: no renderer)
test('scene contains ground, target-line, arc, club, ball, annotations; swing-plane only when scene.plane', ...);
test('setProgress(0.63) puts the club at the ball; setProgress(0) at arc[0]', ...);
test('setShowOthers toggles the others group visibility and has one child per other scene', ...);
test('setAnnotations replaces children; dispose() calls dispose on every geometry it created (spy on BufferGeometry.prototype.dispose)', ...);
test('missing plane (swingH null): no arc, club at the ball, no throw', ...);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project packages/visualizations src/club3d/headPose.test.ts src/club3d/buildScene.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `headPose.ts`, `clubModel.ts` and `buildScene.ts`**

If `SVGLoader` can't run under jsdom, fall back to a hand-written parser for the M/L/C/Z commands those three outlines use. Check this first.

- [ ] **Step 4: Run the tests and see them pass**

Expected: PASS.

- [ ] **Step 5: Check the build for forbidden strings**

Run: `npm run build:public && npm run verify:public`
Expected: `verify-public-build: apps/web/dist is clean`. The new code isn't imported by the app yet, so this only proves the deps install cleanly. The real check comes in Task 7.

- [ ] **Step 6: Commit**

`git commit -m "feat(visualizations): club model, head pose and three.js scene for club views"`

---

### Task 4: Shared renderer and `ViewGallery`

**Files:**
- Create: `packages/visualizations/src/club3d/renderer.ts`
- Create: `packages/visualizations/src/club3d/ViewGallery.tsx`
- Modify: `apps/web/src/styles/app.css` (add `.view-gallery*` rules)
- Test: `packages/visualizations/src/club3d/ViewGallery.test.tsx`, `packages/visualizations/src/club3d/renderer.test.ts`

**Interfaces:**
- Consumes: `ViewCamera`, `screenBasis` (Task 1), `Badge` (Task 2).
- Produces:
  ```ts
  // renderer.ts
  export function webglAvailable(): boolean; // false in jsdom
  export function toThreeCamera(cam: ViewCamera, aspect: number): THREE.Camera;
  /** Fits an ortho camera's size so `pts` (scene coords) fill ≤ 90 % of the slot; returns a new ViewCamera. */
  export function frameCamera(cam: ViewCamera, pts: Vec3[], aspect: number): ViewCamera;
  export interface SharedRenderer {
    draw(target: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera): void; // renders, then drawImage into target's 2D context at devicePixelRatio
    dispose(): void;
  }
  export function createSharedRenderer(): SharedRenderer | null; // null when WebGL is unavailable
  // ViewGallery.tsx
  export interface GalleryView<V extends string> {
    id: V; name: string; hint: string; ariaLabel: string; badges: Badge[];
    labels?: { id: string; text: string; color: string; x: number; y: number }[]; // slot fractions, large view only
  }
  export function ViewGallery<V extends string>(props: {
    label: string;                         // e.g. "3D club views"
    views: GalleryView<V>[]; large: V; onSelect(v: V): void;
    canvasRef(id: V, el: HTMLCanvasElement | null): void;  // parent draws into these
    webgl: boolean;
    toolbar?: React.ReactNode;             // Play / All shots / Reset view
    largeOverlay?: React.ReactNode;        // e.g. the orbit off-preset note
  }): JSX.Element;
  ```

**Layout:**
- Root: `<section className="view-gallery" aria-label={label}>`.
- Large slot: `.view-gallery__large`. It holds a `<canvas role="img" aria-label=…>` in a 16:10 box, the label overlay (absolutely positioned spans at `x*100%`/`y*100%`, clamped to 4–96 %), the name, the hint and the badges.
- Thumbnails: `.view-gallery__thumbs`. Each is a `<button aria-label="Show <name> view" aria-pressed=false>` holding a 16:10 canvas and the name.
- Badges: `<ul className="view-badges">`. Each `li` has a swatch in the badge color, the label, and either the text or `<Missing />`, with the note in parentheses.
- Without WebGL, each canvas is replaced by `<p className="view-gallery__fallback">3D view needs WebGL, which this browser doesn't provide. The numbers are below.</p>`. The large slot gets the full text; thumbnails get just the name.
- CSS:
  - ≥ 601 px: `grid-template-columns: minmax(0,3fr) minmax(0,1fr)`.
  - ≤ 600 px: one column, thumbnails in a 3-column row.
  - Thumbnail buttons have `min-height: 44px`.

- [ ] **Step 1: Write failing tests**

```ts
test('renders the large view name, hint and badges; three thumbnail buttons named "Show <name> view"', ...);
test('clicking a thumbnail calls onSelect with its id', ...);
test('missing badge text renders the Missing component', ...);
test('webgl=false: fallback copy in the large slot, no canvas elements', ...);
test('labels are clamped to 4–96 %', ...);
test('webglAvailable() is false under jsdom; createSharedRenderer() returns null', ...);
test('frameCamera: every framed point projects inside 5–95 % of the slot for aspect 1.6 and 0.6', ...);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project packages/visualizations src/club3d/ViewGallery.test.tsx src/club3d/renderer.test.ts`

- [ ] **Step 3: Implement `renderer.ts`, `ViewGallery.tsx` and the CSS**

Create the `WebGLRenderer` with `{ antialias: true, alpha: false }` and the clear color `SURFACE`. `draw` sets the size to the target's CSS size × DPR (capped at 2), renders, then calls `ctx.drawImage(renderer.domElement, 0, 0)` on the target.

- [ ] **Step 4: Run the tests and see them pass**

- [ ] **Step 5: Commit**

`git commit -m "feat(visualizations): shared renderer and large-plus-thumbnails view gallery"`

---

### Task 5: `ClubViews3D` and the new 3D tab

**Files:**
- Create: `packages/visualizations/src/club3d/ClubViews3D.tsx`
- Create: `packages/visualizations/src/club3d/index.ts`. It exports `ClubViews3D`, `ClubViews2D` (Task 6), `ViewGallery` and the types; re-export it from `packages/visualizations/src/index.ts`.
- Modify: `apps/web/src/state/reducer.ts`, `apps/web/src/state/store.tsx`. Add `clubView3D: View3D` (initially `'faceOn'`) and `clubView2D: View2D` (initially `'ftt'`), the actions `setClubView3D` and `setClubView2D`, and the API functions of the same names.
- Modify: `apps/web/src/components/Club3DTab.tsx` (rewrite), `apps/web/src/pages/InspectorPage.tsx` (pass `others` filtered to the same club)
- Test: `packages/visualizations/src/club3d/ClubViews3D.test.tsx`; update `apps/web/src/pages/InspectorPage.test.tsx` (3D tests at lines ~111–141) and the reducer tests if present

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `useReplayClock` and `ReplayControls` from `../ReplayControls` and `Banner` from `../SceneChrome`.
- Produces:
  ```ts
  export interface ClubViews3DProps {
    scene: ReplayScene; m: Measurements; club: string; others: ReplayScene[];
    large: View3D; onSelect(v: View3D): void;
  }
  export function ClubViews3D(props: ClubViews3DProps): JSX.Element;
  ```

**Behavior:**
- **Names and hints:**
  - Top: "Path, H-plane, face to path"
  - Face-on: "Attack angle, low point"
  - Down the line: "Swing plane steepness"
  - 3/4 overview: "Everything in one picture"
- **Toolbar:**
  - The existing `ReplayControls`, driven by `useReplayClock({ initial: 0.63 })`. While the clock runs, all four canvases redraw on every clock tick.
  - A checkbox **All shots**, unchecked by default. It's disabled with the title "No other shots with this club" when `others` is empty.
  - A **Reset view** button, enabled only while the large camera is off preset.
- **Orbit:** attach `OrbitControls` (`three/addons/controls/OrbitControls.js`) to the large canvas, rotating a clone of the large view's three camera. When the camera turns more than 0.5° from its preset forward direction, every badge in the large view gets `note: 'rotate back to read true'`. Changing the large view or the shot resets the camera.
- **Labels:** the large view's `label` annotations are projected with `toThreeCamera` + `Vector3.project` into slot fractions. Thumbnails have no labels.
- **Banner:** keep "Illustrative reconstruction" and its copy above the gallery. Below the
  gallery, add `<ProvenanceTag kind="illustrative" />` with the text "Club head drawn 3× life
  size so it reads; angles are true". `ClubViews2D` gets the same tag with "Club head is a
  generic shape for its club type".
- **No club data** (`scene.plane === null`): below the gallery, show `<p>Club delivery not measured for this shot</p>`.
- **Disposal:** on unmount or shot change, dispose the `ClubScene`, the `SharedRenderer` and the `OrbitControls`, and cancel the rAF.
- **aria-label** for the large view: `"<name>: " + badges.map(b => \`${b.label} ${b.text ?? 'not measured'}\`).join(', ')`.

- [ ] **Step 1: Write failing tests**

```ts
// ClubViews3D.test.tsx (jsdom → webgl false)
test('opens on the large view passed in; thumbnails are Top, Down the line, 3/4 overview', ...);
test('Face-on badges: Attack angle 4.0° down, Low point …; aria-label lists them', ...);
test('All shots disabled with no others; enabled with others', ...);
test('Club delivery not measured for a shot with swingH/swingV null', ...);
test('banner "Illustrative reconstruction" present', ...);
// InspectorPage.test.tsx — replace the 3D Show-checkbox tests with:
test('3D tab: Face-on large by default; clicking "Show Top view" makes Top large and the choice survives Next shot', ...);
test("File 1 Shot 14, 3D tab: 'Club delivery not measured for this shot'", ...); // keep, adapt
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project packages/visualizations src/club3d/ClubViews3D.test.tsx && npx vitest run --project apps/web`

- [ ] **Step 3: Implement**

Write `ClubViews3D`, the store additions, and the `Club3DTab` rewrite, which renders `ClubViews3D` with the store's `clubView3D`. In `InspectorPage`, pass `others` as `visibleShots.filter(s => s.club === shot.club && s.id !== shot.id).map(s => scenes.get(s.id)!)`.

- [ ] **Step 4: Run all the unit tests and see them pass**

Run: `npm test`
Expected: PASS. The old `ClubReplay3D` tests still pass because the component still exists until Task 7.

- [ ] **Step 5: Look at it in Chromium**

Start `npx -w @fsa/web vite --mode public --port 5199`, load a fixture CSV, open Inspector → 3D, and take screenshots at 1280 and 390 px. Check by eye:
- Face-on shows the attack wedge.
- Top shows three wedges with the target on the left.
- Down the line shows the plane edge-on.
- Swapping works.
- Play moves the club in every view.
- Orbit and Reset view work.

Toggle handedness to Left and confirm the Top view mirrors.

- [ ] **Step 6: Commit**

`git commit -m "feat(web): real-3D club views with four cameras in the 3D tab"`

---

### Task 6: `ClubViews2D` and the new 2D tab

**Files:**
- Create: `packages/visualizations/src/club3d/ClubViews2D.tsx`
- Modify: `apps/web/src/components/Club2DTab.tsx`. Replace the Show toggles, the phone `SegmentedControl` and the three diagram panes with `ClubViews2D`. **Keep** the "Measured angles" and "Against session average" panels unchanged. Add a `handedness` prop.
- Modify: `apps/web/src/pages/InspectorPage.tsx` (pass handedness and the scene to `Club2DTab`)
- Test: `packages/visualizations/src/club3d/ClubViews2D.test.tsx`; update `InspectorPage.test.tsx` (2D tests at lines ~143–200 and 288)

**Interfaces:**
- Consumes: Tasks 1–4. `ClubViews2D` builds its own `ClubScene` with `headScale: 1` and no `others`, and calls `setProgress(0.63)` once (impact).
- Produces:
  ```ts
  export interface ClubViews2DProps {
    scene: ReplayScene; m: Measurements; club: string; handedness: Handedness;
    large: View2D; onSelect(v: View2D): void;
  }
  export function ClubViews2D(props: ClubViews2DProps): JSX.Element;
  ```

**Names and hints:**
- Face to target: "Face angle against the target line"
- Face to path: "Face angle against the club path"
- Dynamic loft: "Loft, launch and attack from the side"
- Spin axis: "Axis tilt seen from behind the ball"

There is no orbit and no Play. The arc and ground grid are hidden in the 2D views, but the target line and ground are kept.

- [ ] **Step 1: Write failing tests**

```ts
test('opens on Face to target; badges Face to target 11.8° R, Launch direction 5.7° R, Club path 8.3° R', ...);
test('Dynamic loft badges include Spin loft (as reported)', ...);
test('Spin axis badges: Spin <rpm>, Spin axis 2.6° R', ...);
// InspectorPage.test.tsx
test('2D tab: no Show fieldset; gallery thumbnails Face to path, Dynamic loft, Spin axis; Measured angles + Against session average panels still present', ...);
test('File 1 Shot 14, 2D tab: Not measured badges, launch 8.9° R, no zero fallbacks', ...); // adapt existing
test('2D large view survives Next shot', ...);
```

- [ ] **Step 2: Run them and see them fail**

- [ ] **Step 3: Implement `ClubViews2D` and update `Club2DTab` and `InspectorPage`**

- [ ] **Step 4: Run `npm test` and see it pass**

- [ ] **Step 5: Look at it in Chromium**

Do the same as Task 5 Step 5, at 1280 and 390 px. Compare against IMG_5891–5894 for orientation. Ball to the left of the head in Face to target and to the right in Dynamic loft (right-hander).

- [ ] **Step 6: Commit**

`git commit -m "feat(web): multi-view three.js 2D club tab with true-angle lines"`

---

### Task 7: Remove the old diagrams and update e2e

**Files:**
- Delete:
  - `packages/visualizations/src/ClubReplay3D.tsx` and `ClubReplay3D.test.tsx`
  - `HorizontalDelivery.tsx`, `VerticalDelivery.tsx` and `SpinAxis.tsx`, plus the tests for them in `diagrams.test.tsx`. Delete the whole file if nothing else is left in it.
  - `apps/web/src/components/ShowToggles.tsx`
- Modify:
  - `packages/visualizations/src/camera.ts` and `camera.test.ts`: remove `clubCamera` and `planeQuad` plus their tests; keep `flightCamera` and `projectPoint`.
  - `packages/visualizations/src/index.ts`: drop the removed exports.
  - `apps/web/src/styles/app.css`: remove the `.show-toggles*`, `.club-3d__diagrams` and `.club-2d__diagrams` rules and the `delivery-*` rules.
  - `e2e/responsive.spec.ts`
- Check: `rg -n "ClubReplay3D|HorizontalDeliveryDiagram|VerticalDeliveryDiagram|SpinAxisDiagram|ShowToggles|clubCamera|planeQuad|show-toggles|delivery-(top|side|spin)" apps packages e2e` returns nothing.

**e2e changes:**
- **390 px test:** replace the club 3D svg fit check and "exactly one 2D pane" with these checks:
  - In both the 3D and 2D tabs, `.view-gallery__large canvas` fits the viewport.
  - Exactly 3 `.view-gallery__thumbs button` are visible, and their tops are below the large slot's bottom.
- **820 px test:**
  - Rename it to "inspector tabs visible; dispersion 'Target' label visible; camera control and both club galleries fit without overflow".
  - Replace the Show-fieldset checks with `fitsViewport(page.locator('.club-data .view-gallery'))` on both tabs.
  - At 820 px the thumbnails are to the right of the large slot.
- **New 1280 px test:**
  - Open the 3D tab, click "Show Top view", and expect the large slot's name to read "Top".
  - Read pixels from the large canvas via `canvas.toDataURL()` length or `getImageData` variance, and check it isn't blank, which proves WebGL rendered.
  - If headless Chromium lacks WebGL, add `launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }` to the Playwright project.

- [ ] **Step 1: Delete and modify as listed, then check that the `rg` search comes back empty**

- [ ] **Step 2: Update `e2e/responsive.spec.ts` as described above**

- [ ] **Step 3: Run the full CI suite**

Run: `npm run ci:public`
Expected: typecheck, unit tests, the public build, `verify:public` ("is clean") and the e2e suite all pass. The privacy e2e checks (no cross-origin requests, no durable storage) still pass with three.js loaded.

- [ ] **Step 4: Check the bundle size**

Run: `ls -la apps/web/dist/assets/*.js`. three.js must be inside the Inspector chunk, not the entry chunk. Look for `WebGLRenderer` with `grep -l WebGLRenderer apps/web/dist/assets/*.js`: it must not match the `index-*.js` entry.

- [ ] **Step 5: Commit**

`git commit -m "refactor: remove the flat club diagrams and Show toggles; e2e for the view galleries"`
