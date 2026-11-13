# Club Head Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slab club heads with four code-built 3D heads (driver, fairway wood, hybrid, iron), pose them from each shot's measurements, and draw the Face impact face from the same description.

**Architecture:** One `HeadSpec` per club type (inches and degrees) is the single source of truth. Pure maths in `heads/shape.ts` turns a spec into a body surface, a face outline, score lines and a face-on silhouette; `club3d/clubModel.ts` turns that into cached three.js geometry; `FaceImpact.tsx` turns it into SVG. `headPose.ts` and `buildScene.ts` place the head from the measurements, with a lie-flat fallback.

**Tech Stack:** TypeScript, React, three.js 0.187 (core plus addons already imported), vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-club-head-models-design.md`. Read it before starting any task.

## Global Constraints

- No new dependencies, no model files, no image textures, nothing new in `apps/web/public`.
- Nothing fetched from another origin; `npm run verify:public` must still pass.
- The face is a flat plane through the model origin with its normal on model +y. No bulge or roll.
- Each head at most 6,000 triangles; first build under 20 ms on a laptop.
- Head geometry is generated once per club type and shared; materials are per scene.
- `annotations.ts`, `annotations.test.ts`, `cameras.ts`, `cameras.test.ts` and `packages/analytics/src/replay.ts` are not edited.
- Labels and badges never show a value that was not measured.
- Loft, lie and face width are used exactly as in the spec table; other dimensions may be tuned by up to 10%.
- Units: specs and `heads/shape.ts` work in inches; three.js scenes work in yards (`IN = 1 / 36`).
- Commands: one test file `npx vitest run <path>`; everything `npm run typecheck && npm test`.

## Review Focus

Inputs the spec implies but does not spell out. Each has a test in the task named.

1. Only one of lateral or vertical impact is present: the ball sits on the face centre, nothing throws (Task 4).
2. An impact point far outside the face (2.5 in toe, 1.5 in high), or an extreme dynamic loft (−5°, 75°): the scene builds with finite positions and the head is not below the ground (Task 4).
3. Left-handed with an off-centre strike: a toe strike moves the head the mirrored way (Task 4).
4. A scene is disposed and another is built for the same club type: the shared geometry is still usable (Task 3).
5. Unusual club names (`4h`, `Hybrid 4`, `3 Rescue`, `2 Utility Iron`, empty string): they map to hybrid, hybrid, hybrid, iron, iron (Task 1).

## File Structure

| File | Responsibility |
|---|---|
| `packages/domain/src/clubs.ts` | `ClubCategory` gains `hybrid` |
| `packages/visualizations/src/heads/specs.ts` (new) | `HeadSpec` type and `HEAD_SPECS`, the numbers |
| `packages/visualizations/src/heads/shape.ts` (new) | Pure maths, no three.js: body surface, face outline, score lines, silhouette |
| `packages/visualizations/src/club3d/clubModel.ts` (rewrite) | three.js head from a spec; geometry cache; model contract |
| `packages/visualizations/src/club3d/headPose.ts` | Pose from measurements with fallbacks; strike point |
| `packages/visualizations/src/club3d/buildScene.ts` | Placement against the ball, ground and tee, hosel and shaft, shared-geometry disposal |
| `packages/visualizations/src/FaceImpact.tsx` | SVG face from the spec |
| `packages/visualizations/src/faceOutlines.ts` | Deleted in Task 5 |

---

### Task 1: Hybrid club category

**Files:**
- Modify: `packages/domain/src/clubs.ts:1-7`, `packages/domain/src/clubs.test.ts`
- Modify: `apps/web/src/components/ImpactTab.tsx:8`, `packages/visualizations/src/FaceImpact.tsx:16`, `packages/visualizations/src/faceOutlines.ts`, `packages/visualizations/src/club3d/clubModel.ts:8`

**Interfaces:**
- Produces: `type ClubCategory = 'driver' | 'wood' | 'hybrid' | 'iron'`; `clubCategory(club: string): ClubCategory`.

- [ ] **Step 1: Replace the `clubCategory` table test in `clubs.test.ts`**

```ts
test.each([
  ['Driver', 'driver'], ['1W', 'driver'], ['3 Wood', 'wood'], ['5W', 'wood'],
  ['4 Hybrid', 'hybrid'], ['4h', 'hybrid'], ['Hybrid 4', 'hybrid'], ['3 Rescue', 'hybrid'],
  ['7 Iron', 'iron'], ['2 Utility Iron', 'iron'], ['Pitching Wedge', 'iron'], ['Gap Wedge', 'iron'],
  ['Unknown club', 'iron'], ['', 'iron'],
] as const)('clubCategory(%s)', (club, cat) => {
  expect(clubCategory(club)).toBe(cat);
});
```

- [ ] **Step 2: Run `npx vitest run packages/domain/src/clubs.test.ts`.** Expected: FAIL on the hybrid rows.

- [ ] **Step 3: Implement.** Order of checks in `clubCategory`: driver (`/driver|\b1w\b/i`), then hybrid (`/hybrid|rescue|\b\d+\s?h\b/i`), then wood (`/wood|\b\d+\s?w\b/i`), else iron. `compareClubs` is unchanged.

- [ ] **Step 4: Make every `Record<ClubCategory, …>` compile.** `ImpactTab.tsx` `NAME`: `wood: 'Wood'`, `hybrid: 'Hybrid'`. `FaceImpact.tsx` `CATEGORY_NAME`: `wood: 'Wood'`, `hybrid: 'Hybrid'`. `faceOutlines.ts`: add `hybrid` as a copy of the `wood` entry and `clubModel.ts` `DEPTH_IN`: `hybrid: 2.3` (both are temporary; Tasks 3 and 5 remove them).

- [ ] **Step 5: Run `npm run typecheck && npm test`.** Expected: PASS. Fix any test that asserted "Wood/hybrid" or "Wood or hybrid" to the new names.

- [ ] **Step 6: Commit** `feat(domain): hybrid is its own club category`.

---

### Task 2: Head specs and shape maths

**Files:**
- Create: `packages/visualizations/src/heads/specs.ts`, `packages/visualizations/src/heads/shape.ts`
- Test: `packages/visualizations/src/heads/shape.test.ts`

**Interfaces:**
- Produces (all lengths inches; **face frame**: origin at the face centre, x toward the toe for a right-hander, y out of the face, z up along the face):

```ts
// specs.ts
export interface HeadSpec {
  kind: 'wood' | 'blade';
  loftDeg: number; lieDeg: number;
  faceWidthIn: number; faceHeightIn: number;
  headWidthIn: number; headDepthIn: number; headHeightIn: number;
  /** blade only: face height at the toe and heel ends, and top-line thickness. */
  toeHeightIn?: number; heelHeightIn?: number; topLineIn?: number;
  hosel: { base: [number, number, number]; lengthIn: number; radiusIn: number };
  /** clearCentreIn > 0 leaves that width in the middle of the face without lines (driver). */
  scoreLines: { count: number; spacingIn: number; clearCentreIn: number };
  finish: { body: string; face: string; lines: string; hosel: string; metalness: number; roughness: number };
}
export const HEAD_SPECS: Record<ClubCategory, HeadSpec>;

// shape.ts
export type Pt = [number, number];                      // (x, z) in the face plane
export function faceOutline(spec: HeadSpec): Pt[];      // closed loop, counter-clockwise seen from +y, 48–96 points, first point not repeated
export function scoreLines(spec: HeadSpec): { z: number; x1: number; x2: number }[];
export function bodySurface(spec: HeadSpec, nu: number, nv: number): { positions: Float32Array; indices: Uint32Array }; // closed mesh in the face frame
export function bodySilhouette(spec: HeadSpec): Pt[] | null;  // face-on outline of the body; null for blades
```

- [ ] **Step 1: Write `specs.ts`** with these values (spec table):

| | driver | wood | hybrid | iron |
|---|---|---|---|---|
| kind | wood | wood | wood | blade |
| loftDeg / lieDeg | 10.5 / 58 | 15 / 58 | 22 / 59.5 | 33 / 62.5 |
| faceWidthIn / faceHeightIn | 4.3 / 2.2 | 3.7 / 1.4 | 3.3 / 1.4 | 3.0 / 1.7 |
| headWidthIn / headDepthIn / headHeightIn | 4.8 / 4.5 / 2.5 | 4.2 / 3.4 / 1.6 | 3.9 / 2.3 / 1.55 | 3.2 / 0.7 / 2.2 |
| toeHeightIn / heelHeightIn / topLineIn | – | – | – | 2.2 / 1.2 / 0.25 |
| hosel lengthIn / radiusIn | 1.5 / 0.25 | 1.5 / 0.24 | 1.5 / 0.23 | 2.3 / 0.27 |
| scoreLines count / spacingIn / clearCentreIn | 9 / 0.18 / 1.4 | 7 / 0.15 / 0 | 7 / 0.15 / 0 | 10 / 0.14 / 0 |
| finish body / face / lines / hosel | `#1B1F23` / `#AEB7BF` / `#2B3036` / `#15191C` | same | same | `#8B949C` / `#B4BCC3` / `#2B3036` / `#6F7880` |
| finish metalness / roughness | 0.3 / 0.18 | same | same | 0.6 / 0.45 |

`hosel.base` is chosen by the implementer on the heel side: `x < −faceWidthIn / 2 + 0.3`, `y < 0`, inside the body.

- [ ] **Step 2: Write `shape.test.ts`**

```ts
const cats = ['driver', 'wood', 'hybrid', 'iron'] as const;
const span = (pts: number[][], i: number) => Math.max(...pts.map((p) => p[i]!)) - Math.min(...pts.map((p) => p[i]!));

test.each(cats)('%s face outline: closed loop around the centre, true width and height', (c) => {
  const s = HEAD_SPECS[c], o = faceOutline(s);
  expect(o.length).toBeGreaterThanOrEqual(48);
  expect(span(o, 0)).toBeCloseTo(s.faceWidthIn, 1);                     // exact face width
  const tall = s.kind === 'blade' ? s.toeHeightIn! : s.faceHeightIn;
  expect(span(o, 1) / tall).toBeGreaterThan(0.9); expect(span(o, 1) / tall).toBeLessThan(1.1);
  expect(pointInPolygon([0, 0], o)).toBe(true);
  expect(signedArea(o)).toBeGreaterThan(0);                              // counter-clockwise
});
test('iron face is taller at the toe than the heel', () => { /* max z for x > 1 exceeds max z for x < -1 by > 0.6 */ });
test.each(cats)('%s score lines lie inside the face outline', (c) => { /* both ends of every line pass pointInPolygon */ });
test('driver score lines leave the centre clear; iron lines are full width', () => {
  expect(scoreLines(HEAD_SPECS.driver).every((l) => Math.min(Math.abs(l.x1), Math.abs(l.x2)) >= 0.7)).toBe(true);
  expect(scoreLines(HEAD_SPECS.iron).every((l) => l.x1 < -1 && l.x2 > 1)).toBe(true);
});
test.each(cats)('%s body: flat face at y = 0, nothing in front of it, real size', (c) => {
  const s = HEAD_SPECS[c], { positions, indices } = bodySurface(s, 48, 32);
  const P = toPoints(positions);
  expect(Math.max(...P.map((p) => p[1]))).toBeCloseTo(0, 5);
  expect(indices.length / 3).toBeLessThanOrEqual(6000);
  // un-tilt by the static loft (rotate about x by +loftDeg) and measure the level bounding box
  const L = P.map((p) => rotX(p, s.loftDeg));
  for (const [i, want] of [[0, s.headWidthIn], [1, s.headDepthIn], [2, s.headHeightIn]] as const)
    { expect(span(L, i) / want).toBeGreaterThan(0.9); expect(span(L, i) / want).toBeLessThan(1.1); }
  expect(P.every((p) => p.every(Number.isFinite))).toBe(true);
});
test.each(['driver', 'wood', 'hybrid'] as const)('%s silhouette contains the face outline', (c) => { /* every faceOutline point passes pointInPolygon(bodySilhouette) */ });
test('iron has no silhouette', () => expect(bodySilhouette(HEAD_SPECS.iron)).toBeNull());
```

Put `pointInPolygon`, `signedArea`, `rotX`, `toPoints` in the test file.

- [ ] **Step 3: Run it.** Expected: FAIL (module not found).

- [ ] **Step 4: Implement `shape.ts`.** The approach, since signatures and tests do not fix it:

  *Level frame* means the head sitting soled: X toe, Y forward, Z up. A level-frame point becomes a face-frame point by rotating about X by −`loftDeg` and translating so the face centre is the origin.

  **Wood kind.** The body is a superellipsoid about a body centre, exponent `e = 2.5`, with separate half-sizes each side: `A = headWidthIn / 2` in X; in Y a short front half and a long back half summing to slightly more than `headDepthIn`; in Z a crown half-height of about 60% and a sole half-depth of about 40% of `headHeightIn`. The surface point along a unit direction `d` is `d · (Σ (|dᵢ| / sᵢ)^e)^(−1/e)` with `sᵢ` picked by the sign of `dᵢ`. The face is a plane with level-frame normal `(0, cos loft, sin loft)`; every surface point in front of it is projected back onto it along the normal, which gives the flat face. Choose the plane's distance from the body centre by bisection so the flat region is `faceWidthIn + 0.12` wide. `bodySurface` samples directions on a `nu × nv` latitude/longitude grid with the pole axis along Y, so the front pole lands in the middle of the flat face.
  `faceOutline` = the boundary of that flat region (for each of 64 angles in the face plane, bisect the radius at which the superellipsoid ends), inset by 0.06 in, then scaled in x so its width is exactly `faceWidthIn`. Fairway wood and hybrid: flatten the top by clamping z to `faceHeightIn / 2`; hybrid additionally uses `e = 3` for a squarer toe.
  `bodySilhouette` = the convex hull of the body's `(x, z)` face-frame points.

  **Blade kind.** `faceOutline` is the trapezoid: sole from `(−W/2, zs)` to `(W/2, zs)`, rising to `heelHeightIn` at the heel end and `toeHeightIn` at the toe end, corners rounded with 0.2 in radius (0.45 in at the high toe), resampled to 64 points, shifted so the face centre (mid-width, `faceHeightIn / 2` above the sole) is the origin. `bodySurface` gives that outline thickness behind the face: at each outline point the back surface is offset in −y by a thickness that goes linearly from `headDepthIn` at the sole to `topLineIn` at the top line; front and back caps are triangulated as fans from their centroids, with the back cap's centre pushed 0.08 in toward the face for the recessed back. Then tilt as above so the level bounding box measures as the test expects (the blade's "level" height is its toe height).

- [ ] **Step 5: Run `npx vitest run packages/visualizations/src/heads`.** Expected: PASS.

- [ ] **Step 6: Commit** `feat(visualizations): head specs and shape maths for four club types`.

---

### Task 3: Three.js heads, the model contract and shared geometry

**Files:**
- Rewrite: `packages/visualizations/src/club3d/clubModel.ts`
- Modify: `packages/visualizations/src/club3d/buildScene.ts` (`disposeTree`, the hosel/shaft block at lines 172–200)
- Test: `packages/visualizations/src/club3d/clubModel.test.ts` (new), `packages/visualizations/src/club3d/buildScene.test.ts`

**Interfaces:**
- Consumes: `HEAD_SPECS`, `faceOutline`, `scoreLines`, `bodySurface` (Task 2).
- Produces:

```ts
export interface ClubModelData {
  loftDeg: number; lieDeg: number;
  hoselBase: THREE.Vector3;   // model-local yards, before the handedness mirror
  hoselLengthYd: number; hoselRadiusYd: number; hoselColor: string;
}
/** Contract: origin = face centre, +y = face normal, +x = toe (scale.x = −1 when left-handed), +z = up along the face.
 *  Children named club-head, club-face, club-grooves, club-face-centre. userData is ClubModelData.
 *  Geometries are cached per category and carry userData.shared = true. A loaded model must meet the same contract. */
export function buildClubModel(category: ClubCategory, handedness: Handedness): THREE.Group;
```

The model no longer contains a hosel mesh and no longer sets `userData.hoselTop`; the scene draws the hosel.

- [ ] **Step 1: Write `clubModel.test.ts`**

```ts
const cats = ['driver', 'wood', 'hybrid', 'iron'] as const;
describe.each(cats)('%s model contract', (c) => {
  const model = buildClubModel(c, 'right');
  const mesh = (n: string) => model.getObjectByName(n) as THREE.Mesh;
  test('named children exist', () => { for (const n of ['club-head', 'club-face', 'club-grooves', 'club-face-centre']) expect(model.getObjectByName(n), n).toBeDefined(); });
  test('face is the flat plane y ≈ 0 facing +y, centred on the origin', () => {
    const b = new THREE.Box3().setFromObject(mesh('club-face'));
    expect(b.min.y).toBeGreaterThan(-1e-4); expect(b.max.y).toBeLessThan(0.01 / 36);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 3);
    expect((b.max.x - b.min.x) * 36).toBeCloseTo(HEAD_SPECS[c].faceWidthIn, 1);
    // every face normal has y > 0.99
  });
  test('body never pokes through the face', () => expect(new THREE.Box3().setFromObject(mesh('club-head')).max.y).toBeLessThan(1e-4));
  test('userData carries loft, lie and a heel-side hosel base behind the face', () => {
    const d = model.userData as ClubModelData;
    expect(d.loftDeg).toBe(HEAD_SPECS[c].loftDeg); expect(d.lieDeg).toBe(HEAD_SPECS[c].lieDeg);
    expect(d.hoselBase.x).toBeLessThan(0); expect(d.hoselBase.y).toBeLessThan(0);
    expect(d.hoselLengthYd).toBeCloseTo(HEAD_SPECS[c].hosel.lengthIn / 36, 6);
  });
  test('triangle budget', () => { /* sum of index.count / 3 over all meshes ≤ 6000 */ });
  test('left-handed is the mirror and shares geometry', () => {
    const l = buildClubModel(c, 'left');
    expect(l.scale.x).toBe(-1);
    expect((l.getObjectByName('club-head') as THREE.Mesh).geometry).toBe(mesh('club-head').geometry);
    expect(mesh('club-head').geometry.userData.shared).toBe(true);
    expect((l.getObjectByName('club-head') as THREE.Mesh).material).not.toBe(mesh('club-head').material);
  });
});
test('first build of every head takes under 100 ms in total', () => { /* vi.resetModules(), import fresh, time four builds with performance.now() */ });
```

- [ ] **Step 2: In `buildScene.test.ts`,** replace the body of "dispose() disposes every geometry it created" so it asserts: every geometry under the root **without** `userData.shared` had `dispose` called, and no geometry **with** `userData.shared` did. Add:

```ts
test('a second scene for the same club still renders its head after the first is disposed', () => {
  const a = buildClubScene(input({ club: 'Driver' })); a.dispose();
  const b = buildClubScene(input({ club: 'Driver' }));
  const g = (named(b.root, 'club-head') as THREE.Mesh).geometry;
  expect(g.getAttribute('position').count).toBeGreaterThan(100);
  b.dispose();
});
test.each(['7 Iron', 'Driver', '3 Wood', '4 Hybrid'])('%s: hosel and shaft form one straight line from the hosel base', (club) => {
  const s = buildClubScene(input({ club })); s.root.updateMatrixWorld(true);
  const hosel = named(s.root, 'club-hosel')!, shaft = named(s.root, 'club-shaft')!;
  const axis = (o: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
  expect(axis(hosel).angleTo(axis(shaft))).toBeLessThan(1e-6);
  expect(worldOf(shaft).sub(worldOf(hosel)).normalize().angleTo(axis(shaft))).toBeLessThan(1e-4);
  s.dispose();
});
```

- [ ] **Step 3: Run both test files.** Expected: FAIL.

- [ ] **Step 4: Rewrite `clubModel.ts`.** A module-level `Map<ClubCategory, { head, face, grooves }>` of geometries, each built once from Task 2 output (inches × `IN`), `computeVertexNormals()` on the body, `userData.shared = true` on all three. `club-face` is a `ShapeGeometry` of `faceOutline` lifted to `y = 0.002 * IN`; `club-grooves` is `LineSegments` from `scoreLines` at `y = 0.004 * IN`. Materials are created per call from `spec.finish` (`MeshStandardMaterial`; the face uses `metalness 0.2, roughness 0.55`). Remove the `FACE_OUTLINES` and `parseOutline` imports and `DEPTH_IN`.

- [ ] **Step 5: Update `buildScene.ts`.** `disposeTree` skips any geometry with `userData.shared`. Replace the `hoselTop` block: transform `hoselBase` by `head.matrix` then `holder.matrix` as `hoselTop` is today; add a `club-hosel` segment from that point along `shaftDir`, length `hoselLengthYd * headScale`, radius `hoselRadiusYd * headScale`, colour `hoselColor`; start `club-shaft` where the hosel ends. The sole-on-ground lift stays as it is in this task.

- [ ] **Step 6: Run `npm run typecheck && npm test`.** Expected: PASS (the existing "sole sits on it" test still holds here).

- [ ] **Step 7: Commit** `feat(club-views): code-built driver, wood, hybrid and iron heads with shared geometry`.

---

### Task 4: Pose and placement from the measurements

**Files:**
- Modify: `packages/visualizations/src/club3d/headPose.ts`, `packages/visualizations/src/club3d/buildScene.ts`
- Test: `packages/visualizations/src/club3d/headPose.test.ts`, `packages/visualizations/src/club3d/buildScene.test.ts`

**Interfaces:**
- Consumes: `ClubModelData` (Task 3).
- Produces:

```ts
export interface HeadPose {
  faceNormal: Vec3; shaftDir: Vec3; toeDir: Vec3;       // as today
  /** Measured contact point in inches from the face centre (toe +, high +); null unless both were measured. */
  strike: { lateralIn: number; verticalIn: number } | null;
  /** True when dynamic loft was not measured: the head is drawn at its static loft, soled. */
  flat: boolean;
}
export function headPose(m: Measurements, scene: ReplayScene, head: { loftDeg: number; lieDeg: number }): HeadPose;
```

  In the built scene: the ball never moves (centre at `z = ballR`); the `ground` object and `target-line` share a `position.z ≤ 0`; a child named `tee` exists only when that z is below 0.

- [ ] **Step 1: Extend `headPose.test.ts`** (update existing calls to pass `{ loftDeg: 33, lieDeg: 62.5 }`)

```ts
const H = { loftDeg: 33, lieDeg: 62.5 };
test('measured loft and face angle give that face normal', () => {
  const p = headPose(mOf({ ftt: 11.8, dynamicLoft: 40.9 }), sceneOf(REF_M), H);
  expect(p.faceNormal[2]).toBeCloseTo(Math.sin(rad(40.9)), 6);
  expect(Math.atan2(p.faceNormal[0], p.faceNormal[1])).toBeCloseTo(rad(11.8), 6);
  expect(p.flat).toBe(false);
});
test('missing loft uses the static loft and is flat; missing face angle is square', () => {
  const p = headPose(mOf({}), sceneOf(mOf({})), H);
  expect(p.faceNormal[0]).toBeCloseTo(0, 9);
  expect(p.faceNormal[2]).toBeCloseTo(Math.sin(rad(33)), 6);
  expect(p.flat).toBe(true);
});
test('no swing plane and no Swing V: the shaft stands at the head lie', () => {
  const p = headPose(mOf({}), sceneOf(mOf({})), H);
  expect(Math.atan2(p.shaftDir[2], Math.abs(p.shaftDir[0]))).toBeCloseTo(rad(62.5), 6);
});
test('strike needs both impact values', () => {
  expect(headPose(mOf({ impactLateral: 0.65, impactVertical: -0.02 }), sceneOf(REF_M), H).strike).toEqual({ lateralIn: 0.65, verticalIn: -0.02 });
  expect(headPose(mOf({ impactLateral: 0.65 }), sceneOf(REF_M), H).strike).toBeNull();
  expect(headPose(mOf({ impactVertical: 0.3 }), sceneOf(REF_M), H).strike).toBeNull();
});
```

- [ ] **Step 2: Replace the "ball rests on the ground and the head sole sits on it" test in `buildScene.test.ts`** with:

```ts
const clubs = ['7 Iron', 'Driver', '3 Wood', '4 Hybrid'];
const build = (club: string, m: Measurements, hand: Handedness = 'right') => {
  const sc = sceneOf(m, hand);
  const s = buildClubScene(input({ club, m, scene: sc, annotations: [] }));
  s.setProgress(0.63); s.root.updateMatrixWorld(true);
  return s;
};
const ballR = (s: ClubScene) => ((named(s.root, 'ball') as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
const groundZ = (s: ClubScene) => named(s.root, 'ground')!.position.z;
const headMinZ = (s: ClubScene) => new THREE.Box3().setFromObject(named(s.root, 'club-head')!).min.z;
/** World point where the ball touches the face: ball centre minus radius along the face normal. */
const touchInFace = (s: ClubScene) => named(s.root, 'club-face-centre')!.worldToLocal(/* ballCentre − n·r */);

test.each(clubs)('%s: the ball stays on the origin and the head is never below the ground', (club) => {
  const s = build(club, REF_M);
  expect(worldOf(named(s.root, 'ball')!).z).toBeCloseTo(ballR(s), 6);
  expect(headMinZ(s)).toBeGreaterThanOrEqual(groundZ(s) - 1e-6);
  expect(named(s.root, 'target-line')!.position.z).toBeCloseTo(groundZ(s), 9);
  expect(!!named(s.root, 'tee')).toBe(groundZ(s) < -1e-6);
  s.dispose();
});
test.each(clubs)('%s: no loft measured: the sole rests on the ground at the static loft', (club) => {
  const s = build(club, mOf({ swingH: 6, swingV: 60, aoa: -2, clubPath: 2 }));
  expect(headMinZ(s)).toBeCloseTo(groundZ(s), 4);
  s.dispose();
});
test.each([['right', 1], ['left', 1]] as const)('%s-handed: a measured strike puts the ball on that point of the face', (hand) => {
  const s = build('Driver', { ...REF_M, impactLateral: 0.65, impactVertical: -0.3 }, hand);
  const p = touchInFace(s);                       // model-local yards; the mirror is inside the model, so toe is +x for both hands
  expect(p.x * 36 / 3).toBeCloseTo(0.65, 2);      // headScale 3
  expect(p.z * 36 / 3).toBeCloseTo(-0.3, 2);
  expect(Math.abs(p.y)).toBeLessThan(1e-3);
  s.dispose();
});
test('left-handed toe strike moves the head the opposite way in the world', () => {
  const x = (hand: Handedness) => { const s = build('7 Iron', { ...REF_M, ftt: 0, impactLateral: 0.8, impactVertical: 0 }, hand); const v = worldOf(named(s.root, 'club-face-centre')!).x; s.dispose(); return v; };
  expect(Math.sign(x('right'))).toBe(-Math.sign(x('left')));
});
test('one impact value alone leaves the ball on the face centre', () => {
  const s = build('7 Iron', { ...REF_M, impactLateral: 0.65 });
  const p = touchInFace(s); expect(Math.hypot(p.x, p.z) * 36).toBeLessThan(0.01); s.dispose();
});
test.each([[-5, 0, 0], [75, 0, 0], [40.9, 2.5, 1.5]])('extreme input loft %s strike (%s, %s): finite and above ground', (loft, lat, vert) => {
  const s = build('Gap Wedge', { ...REF_M, dynamicLoft: loft, impactLateral: lat, impactVertical: vert });
  s.root.traverse((o) => expect(o.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(true));
  expect(headMinZ(s)).toBeGreaterThanOrEqual(groundZ(s) - 1e-6);
  s.dispose();
});
```

- [ ] **Step 3: Run both files.** Expected: FAIL.

- [ ] **Step 4: Implement `headPose`.** `loft = m.dynamicLoft ?? head.loftDeg`; `ftt = m.ftt ?? 0`; `faceNormal` from those two always (drop the `[0, 1, 0]` special case); shaft: `scene.plane` if present, else `m.swingV ?? head.lieDeg` (delete `DEFAULT_LIE`); `strike` and `flat` as documented. `toeDir` unchanged.

- [ ] **Step 5: Implement placement in `buildScene.ts`,** replacing the "face touches the back of the ball" and "sit the sole on the ground" lines. Build the model first so its `userData` can be passed to `headPose`.

  1. `P` = strike in model-local yards: `(lateralIn·IN, 0, verticalIn·IN)`, or the origin when `strike` is null. It is a point in the head model's own frame, so the handedness mirror and `headScale` apply to it through `head.matrix` and `holder.matrix`.
  2. Set `holder.position` so that world(`P`) = ball centre − `faceNormal · ballR`.
  3. `minZ` = lowest world z of `club-head`. If `minZ < 0`: set `ground.position.z = target.position.z = minZ` and add a `tee` mesh (a cylinder, radius `0.12·ballR`, from `minZ` to the ball's bottom at `z = 0`, colour `#C9D3CD`) to the root. Else if `pose.flat && pose.strike === null`: `holder.position.z −= minZ`. Otherwise leave the head where it is.
  4. Compute the hosel base after step 3.

  The ball mesh is not moved. `setClubOpacity` must not ghost the tee (it is not a child of `club`).

- [ ] **Step 6: Run `npm run typecheck && npm test`.** Expected: PASS, including the untouched `annotations.test.ts` and `cameras.test.ts`.

- [ ] **Step 7: Commit** `feat(club-views): pose the head from loft, face angle, plane and strike point; lie flat when unmeasured`.

---

### Task 5: Face impact drawn from the spec

**Files:**
- Modify: `packages/visualizations/src/FaceImpact.tsx`, `packages/visualizations/src/index.ts`, `packages/visualizations/src/club3d/headPose.ts` (remove `parseOutline`, `OutlineSegment`), `packages/visualizations/src/club3d/headPose.test.ts` (remove their tests)
- Delete: `packages/visualizations/src/faceOutlines.ts`
- Test: `packages/visualizations/src/diagrams.test.tsx`

**Interfaces:**
- Consumes: `HEAD_SPECS`, `faceOutline`, `scoreLines`, `bodySilhouette` (Task 2).
- Produces: `FaceImpactDiagram` props unchanged. New `data-role`s: `body-silhouette` (path; driver, wood, hybrid only), `score-line` (one `line` per score line), `hosel`. `index.ts` exports `HEAD_SPECS` and `type HeadSpec` in place of `FACE_OUTLINES` and `FaceOutline`.

- [ ] **Step 1: Add to `diagrams.test.tsx`**

```ts
const bboxW = (d: string) => { const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => Number(m[1])); return Math.max(...xs) - Math.min(...xs); };
test.each(['driver', 'wood', 'hybrid', 'iron'] as const)('face impact %s: outline is the spec face at 40 px per inch, centred on the grid centre', (category) => {
  const { container } = render(<FaceImpactDiagram {...face({ category })} />);
  const d = role(container, 'face-outline')!.getAttribute('d')!;
  expect(bboxW(d)).toBeCloseTo(HEAD_SPECS[category].faceWidthIn * 40, 0);
  expect(roles(container, 'score-line')).toHaveLength(scoreLines(HEAD_SPECS[category]).length);
  expect(roles(container, 'body-silhouette')).toHaveLength(category === 'iron' ? 0 : 1);
  expect(roles(container, 'hosel')).toHaveLength(1);
});
test('face impact: left-handed mirrors the hosel to the other side', () => { /* hosel x1 is right of face-center for right-handed, left of it for left-handed */ });
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Rewrite the face group in `FaceImpact.tsx`.** Map a face-frame point `(x, z)` in inches to pixels with the existing `px`/`py` helpers (they already handle handedness and put toe-positive on the left for a right-hander), and emit the outline as an absolute `M … L … Z` path in pixel coordinates (no group transform). Draw order: body silhouette (`fill` = the spec body colour at 0.9 opacity), hosel (a round-capped line from `hosel.base` projected to `(x, z)`, length `lengthIn`, leaning away from the toe at `lieDeg` from horizontal, width `2 · radiusIn · 40`), face outline (`fill` = spec face colour at 0.35 opacity over `FACE_FILL`, `stroke` `INK`), score lines (`BORDER`), then the existing grid, centre lines, dots and labels unchanged.

- [ ] **Step 4: Delete `faceOutlines.ts`,** remove `parseOutline` and its tests, update `index.ts`. Run `grep -rn "FACE_OUTLINES\|parseOutline\|faceOutlines" packages apps e2e`; expected: no matches.

- [ ] **Step 5: Run `npm run typecheck && npm test`.** Expected: PASS.

- [ ] **Step 6: Commit** `feat(face-impact): draw each club's face, score lines and body from the head spec`.

---

### Task 6: Visual check, tuning and full CI

**Files:**
- Modify (tuning only): `packages/visualizations/src/heads/specs.ts`, material numbers in `club3d/clubModel.ts`, lights in `club3d/buildScene.ts`
- Modify if needed: `e2e/*.spec.ts`

- [ ] **Step 1: Run the app** (`npm run dev`) and load `Demo_csv/FlightScope Golf Session.csv`.

- [ ] **Step 2: For a Driver, a wood, a hybrid and an iron shot, right- and left-handed, screenshot** the 3D tab's four cameras and reconstruction mode, the 2D tab's four views, and the Face impact tab. Also: a wedge shot with dynamic loft above 55°, a shot with no dynamic loft (the fixtures in `fixtures/flightscope/` contain four), and a shot with a large lateral impact. Compare shapes by eye with `~/Desktop/Demo images/` IMG_5879–5902.

- [ ] **Step 3: Check against the spec's anti-goals.** The black heads are clearly visible on `#101714` in every view (if not, lighten `finish.body` toward `#2A3036` before reducing gloss; a rim `DirectionalLight` from behind is allowed). The head is not clipped by any measuring camera at `headScale` 3; if it is, that is a framing bug to report, not a reason to edit `cameras.ts`. The tee appears only when the ground has dropped. Shaft and hosel are straight.

- [ ] **Step 4: Tune dimensions within 10%** where a head reads wrong (loft, lie and face width stay exact) and re-run `npm test`.

- [ ] **Step 5: Run `npm run ci:public`.** Expected: typecheck, unit tests, public build, `verify:public` and e2e all pass. Update e2e expectations only where they named "Wood/hybrid" or depended on the old outline.

- [ ] **Step 6: Commit** `chore(club-views): tune head dimensions and finish after visual check`, with the screenshots' findings in the commit body.
