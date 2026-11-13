import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { decodeCsvBytes, parseFlightScopeCsv } from '@fsa/csv-parser';
import { clubCategory, type Handedness, type Measurements } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { annotations3D } from './annotations';
import { buildClubScene, type ClubScene, type ClubSceneInput } from './buildScene';
import type { ClubModelData } from './clubModel';
import { HEAD_SPECS } from '../heads/specs';
import { REF_M, mOf, sceneOf } from './testFixtures';
import { BALL_RADIUS_YD } from './types';

const scene = sceneOf(REF_M);
const input = (over: Partial<ClubSceneInput> = {}): ClubSceneInput => ({
  scene, m: REF_M, club: '7 Iron', others: [], headScale: 3, mode: '3d',
  annotations: annotations3D('top', scene, REF_M), ...over,
});
const named = (root: THREE.Object3D, name: string) => root.getObjectByName(name);
const worldOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

afterEach(() => vi.restoreAllMocks());

describe('buildClubScene', () => {
  test('contains ground, target-line, arc, swing-plane, club, ball and annotations', () => {
    const s = buildClubScene(input());
    for (const n of ['ground', 'target-line', 'arc', 'swing-plane', 'club', 'ball', 'annotations']) expect(named(s.root, n), n).toBeDefined();
    expect(named(s.root, 'annotations')!.children.length).toBeGreaterThan(0);
    s.dispose();
  });

  test('swing-plane is hidden until setPlaneVisible(true)', () => {
    const s = buildClubScene(input());
    expect(named(s.root, 'swing-plane')!.visible).toBe(false);
    s.setPlaneVisible(true);
    expect(named(s.root, 'swing-plane')!.visible).toBe(true);
    s.dispose();
  });

  test('setProgress(0.63) puts the club face at the ball; setProgress(0) at the start of the arc', () => {
    const s = buildClubScene(input());
    s.setProgress(0.63);
    s.root.updateMatrixWorld(true);
    expect(worldOf(named(s.root, 'club-face-centre')!).length()).toBeLessThan(0.15);
    s.setProgress(0);
    s.root.updateMatrixWorld(true);
    const a0 = new THREE.Vector3(...scene.clubArc![0]!);
    expect(worldOf(named(s.root, 'club-face-centre')!).distanceTo(a0)).toBeLessThan(0.15);
    s.dispose();
  });

  const clubs = ['7 Iron', 'Driver', '3 Wood', '4 Hybrid'];
  const NO_LOFT = mOf({ swingH: 6, swingV: 60, aoa: -2, clubPath: 2 });
  const build = (club: string, m: Measurements, hand: Handedness = 'right', over: Partial<ClubSceneInput> = {}) => {
    const sc = sceneOf(m, hand);
    const s = buildClubScene(input({ club, m, scene: sc, annotations: [], ...over }));
    s.setProgress(0.63); s.root.updateMatrixWorld(true);
    return s;
  };
  const ballR = (s: ClubScene) => ((named(s.root, 'ball') as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
  const groundZ = (s: ClubScene) => named(s.root, 'ground')!.position.z;
  /** How deep this club's sole may sit in the turf, in scene yards (its own turfIn, scaled with the head like the ball). */
  const turf = (s: ClubScene) =>
    ((named(s.root, 'club-head-model')!.userData as ClubModelData).turfIn / 36) * (ballR(s) / BALL_RADIUS_YD);
  /** Lowest vertex of the head (precise: the bounding box of a tilted head reaches below its real sole). */
  const headMinZ = (s: ClubScene) => new THREE.Box3().setFromObject(named(s.root, 'club-head')!, true).min.z;
  /** World point where the ball touches the face: ball centre minus radius along the face normal. */
  const touchInFace = (s: ClubScene) => {
    const centre = named(s.root, 'club-face-centre')!;
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(centre.matrixWorld);
    return centre.worldToLocal(worldOf(named(s.root, 'ball')!).addScaledVector(normal, -ballR(s)));
  };
  /** The ball touches the face plane, centred heel to toe, at least 0.1 in inside the face's top and bottom. */
  const expectContactOnFace = (s: ClubScene) => {
    const face = new THREE.Box3().setFromBufferAttribute((named(s.root, 'club-face') as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute);
    const p = touchInFace(s);
    expect(Math.abs(p.y)).toBeLessThan(1e-3);
    expect(Math.abs(p.x) * 36).toBeLessThan(0.01);
    expect(p.z * 36).toBeGreaterThanOrEqual(face.min.z * 36 + 0.1 - 1e-3);
    expect(p.z * 36).toBeLessThanOrEqual(face.max.z * 36 - 0.1 + 1e-3);
  };
  /** The head brushes at most the turf depth below the ground, and the tee is there exactly when the ground dropped. */
  const expectGround = (s: ClubScene) => {
    expect(headMinZ(s)).toBeGreaterThanOrEqual(groundZ(s) - turf(s) - 1e-6);
    expect(named(s.root, 'target-line')!.position.z).toBeCloseTo(groundZ(s), 9);
    expect(!!named(s.root, 'tee')).toBe(groundZ(s) < 0);
  };

  test.each(clubs)('%s, no strike measured: the ball stays on the origin and touches the face; the head is not sunk', (club) => {
    const s = build(club, REF_M);
    expect(worldOf(named(s.root, 'ball')!).z).toBeCloseTo(ballR(s), 6);
    expectGround(s);
    expectContactOnFace(s);
    s.dispose();
  });

  test.each(clubs)('%s, no loft measured: the ball touches the face and the head is not sunk', (club) => {
    const s = build(club, NO_LOFT);
    expectGround(s);
    expectContactOnFace(s);
    s.dispose();
  });

  test('7 Iron at its static loft, no strike: the sole rests on the ground, no tee', () => {
    const s = build('7 Iron', { ...REF_M, dynamicLoft: 33 });
    expect(groundZ(s)).toBe(0);
    expect(named(s.root, 'tee')).toBeUndefined();
    expect(headMinZ(s)).toBeCloseTo(0, 4);
    s.dispose();
  });

  test('7 Iron at 40.9° loft, no strike: the sole rests on the ground within the turf, no tee', () => {
    const s = build('7 Iron', REF_M);
    expect(groundZ(s)).toBe(0);
    expect(named(s.root, 'tee')).toBeUndefined();
    expectContactOnFace(s);
    s.dispose();
  });

  test('7 Iron with a measured strike 0.3 in high: the sole sits in the turf, no tee', () => {
    const s = build('7 Iron', { ...REF_M, dynamicLoft: 22, impactLateral: 0, impactVertical: 0.3 });
    expect(groundZ(s)).toBe(0);
    expect(named(s.root, 'tee')).toBeUndefined();
    expect(headMinZ(s)).toBeGreaterThanOrEqual(-turf(s));
    s.dispose();
  });

  test('7 Iron with a measured strike 1.0 in high: deeper than the turf, so the ball is teed up', () => {
    const s = build('7 Iron', { ...REF_M, dynamicLoft: 22, impactLateral: 0, impactVertical: 1.0 });
    expect(groundZ(s)).toBeLessThan(0);
    expect(named(s.root, 'tee')).toBeDefined();
    expect(headMinZ(s)).toBeCloseTo(groundZ(s), 4);
    s.dispose();
  });

  test('real iron shots with a measured strike are almost never drawn on a tee (fixtures)', () => {
    const dir = join(__dirname, '../../../../fixtures/flightscope');
    const shots = readdirSync(dir).filter((f) => f.endsWith('.csv')).flatMap((f) =>
      parseFlightScopeCsv(decodeCsvBytes(new Uint8Array(readFileSync(join(dir, f)))).text, f).shots
        .filter((sh) => clubCategory(sh.club) === 'iron' && sh.m.impactLateral !== null && sh.m.impactVertical !== null)
        .map((sh) => ({ ...sh, fileId: f, id: `${f}:${sh.sourceRow}` })));
    expect(shots.length).toBeGreaterThan(50);
    let teed = 0;
    for (const shot of shots) {
      const s = buildClubScene(input({ scene: buildReplayScene(shot, 'right'), m: shot.m, club: shot.club, annotations: [] }));
      if (named(s.root, 'tee')) teed++;
      s.dispose();
    }
    expect(teed / shots.length).toBeLessThanOrEqual(0.05);
  });

  test('Driver at 35° loft, no strike: contact on the face, the head is teed up', () => {
    const s = build('Driver', { ...REF_M, dynamicLoft: 35 });
    expectContactOnFace(s);
    expect(groundZ(s)).toBeLessThan(0);
    expect(named(s.root, 'tee')).toBeDefined();
    expect(headMinZ(s)).toBeCloseTo(groundZ(s), 4);
    s.dispose();
  });

  test.each(['right', 'left'] as const)('Driver at 35° with a measured high-heel strike (%s): headBounds hold the whole head and the lowered ground', (hand) => {
    const s = build('Driver', { ...REF_M, dynamicLoft: 35, impactLateral: -0.5, impactVertical: 0.5 }, hand);
    expect(groundZ(s)).toBeLessThan(0); // the case that clipped: the ground dropped for a tee
    const { min, max } = s.headBounds;
    const head = new THREE.Box3().setFromObject(named(s.root, 'club-head')!, true);
    for (let i = 0; i < 3; i++) {
      expect(min[i]).toBeLessThanOrEqual(head.min.getComponent(i) + 1e-9);
      expect(max[i]).toBeGreaterThanOrEqual(head.max.getComponent(i) - 1e-9);
    }
    expect(min[2]).toBeLessThanOrEqual(headMinZ(s) + 1e-9);
    expect(min[2]).toBeLessThanOrEqual(groundZ(s) + 1e-9);
    s.dispose();
  });

  test('Driver with a measured centre strike: contact at the face centre, the head is teed up', () => {
    const s = build('Driver', { ...REF_M, impactLateral: 0, impactVertical: 0 });
    const p = touchInFace(s);
    expect(p.x * 36).toBeCloseTo(0, 6);
    expect(p.z * 36).toBeCloseTo(0, 6);
    expect(groundZ(s)).toBeLessThan(0);
    expect(named(s.root, 'tee')).toBeDefined();
    expect(headMinZ(s)).toBeCloseTo(groundZ(s), 4);
    s.dispose();
  });

  const clubsByHand = clubs.flatMap((club) => (['right', 'left'] as const).map((hand) => [club, hand] as const));

  test.each(clubsByHand)('%s, %s-handed: a measured strike puts the ball on that point of the face', (club, hand) => {
    const s = build(club, { ...REF_M, impactLateral: 0.65, impactVertical: -0.3 }, hand);
    const p = touchInFace(s); // model-local yards; the mirror is inside the model, so toe is +x for both hands
    expect(p.x * 36).toBeCloseTo(0.65, 2);
    expect(p.z * 36).toBeCloseTo(-0.3, 2);
    expect(Math.abs(p.y)).toBeLessThan(1e-3);
    s.dispose();
  });

  /** The scene at impact as built (the pivot is identity there), without moving along the arc. */
  const atImpact = (club: string, m: Measurements, hand: Handedness) => {
    const s = buildClubScene(input({ club, m, scene: sceneOf(m, hand), annotations: [] }));
    s.root.updateMatrixWorld(true);
    return s;
  };
  /** World direction of the face normal: club-face-centre's world rotation applied to +y. */
  const faceNormalWorld = (s: ClubScene) =>
    new THREE.Vector3(0, 1, 0).applyQuaternion(named(s.root, 'club-face-centre')!.getWorldQuaternion(new THREE.Quaternion()));
  /** World direction of the model's toe axis (model +x, through the left-handed mirror). */
  const toeWorld = (s: ClubScene) => new THREE.Vector3(1, 0, 0).transformDirection(named(s.root, 'club-head-model')!.matrixWorld);
  const expectOrientation = (s: ClubScene, fttDeg: number, loftDeg: number, hand: Handedness) => {
    const f = (fttDeg * Math.PI) / 180, l = (loftDeg * Math.PI) / 180;
    const want = [Math.sin(f) * Math.cos(l), Math.cos(f) * Math.cos(l), Math.sin(l)];
    const n = faceNormalWorld(s);
    for (let i = 0; i < 3; i++) expect(Math.abs(n.getComponent(i) - want[i]!), `normal[${i}]`).toBeLessThan(1e-6);
    const toe = toeWorld(s);
    expect(Math.abs(toe.z), 'level leading edge').toBeLessThan(1e-6);
    expect(Math.sign(toe.x), 'toe away from the golfer').toBe(hand === 'right' ? 1 : -1);
  };

  test.each(clubsByHand)('%s, %s-handed: the face points along the measured face angle and loft; the toe is level and away from the golfer', (club, hand) => {
    const s = atImpact(club, { ...REF_M, ftt: 11.8, dynamicLoft: 40.9 }, hand);
    expectOrientation(s, 11.8, 40.9, hand);
    s.dispose();
  });

  test.each(clubsByHand)('%s, %s-handed: with no face angle or loft measured the face is square at its static loft', (club, hand) => {
    const s = atImpact(club, { ...REF_M, ftt: null, dynamicLoft: null }, hand);
    expectOrientation(s, 0, HEAD_SPECS[clubCategory(club)].loftDeg, hand);
    s.dispose();
  });

  test('left-handed toe strike moves the head the opposite way in the world', () => {
    const x = (hand: Handedness) => {
      const s = build('7 Iron', { ...REF_M, ftt: 0, impactLateral: 0.8, impactVertical: 0 }, hand);
      const v = worldOf(named(s.root, 'club-face-centre')!).x;
      s.dispose();
      return v;
    };
    expect(Math.sign(x('right'))).toBe(-Math.sign(x('left')));
  });

  test('one impact value alone is treated as no strike', () => {
    const none = build('7 Iron', REF_M);
    const s = build('7 Iron', { ...REF_M, impactLateral: 0.65 });
    expect(touchInFace(s).distanceTo(touchInFace(none))).toBeLessThan(1e-9);
    expect(groundZ(s)).toBe(groundZ(none));
    expectContactOnFace(s);
    none.dispose(); s.dispose();
  });

  const expectFinite = (s: ClubScene) =>
    s.root.traverse((o) => expect(o.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(true));

  test.each([[-5, 0, 0], [75, 0, 0], [40.9, 2.5, 1.5]])('extreme input loft %s strike (%s, %s): finite and not sunk', (loft, lat, vert) => {
    const s = build('Gap Wedge', { ...REF_M, dynamicLoft: loft, impactLateral: lat, impactVertical: vert });
    expectFinite(s);
    expectGround(s);
    s.dispose();
  });

  test.each([-5, 75, 85])('extreme input loft %s, no strike: finite, not sunk, contact on the face', (loft) => {
    const s = build('Gap Wedge', { ...REF_M, dynamicLoft: loft });
    expectFinite(s);
    expectGround(s);
    expectContactOnFace(s);
    s.dispose();
  });

  test('2d (headScale 1), no strike: contact on the face and the head is not sunk', () => {
    const s = build('7 Iron', REF_M, 'right', { headScale: 1, mode: '2d' });
    expectGround(s);
    expectContactOnFace(s);
    s.dispose();
  });

  test('setShowOthers toggles the others group; one child per other arc', () => {
    const others = [sceneOf(mOf({ swingH: 3, swingV: 58, aoa: -3 }), 'right', 'o1'), sceneOf(mOf({ swingH: 9, swingV: 62, aoa: -5 }), 'right', 'o2')];
    const s = buildClubScene(input({ others }));
    const g = named(s.root, 'others')!;
    expect(g.children).toHaveLength(2);
    expect(g.visible).toBe(false);
    s.setShowOthers(true);
    expect(g.visible).toBe(true);
    s.dispose();
  });

  test('2d mode hides the ground grid, arc and others but keeps the target line', () => {
    const s = buildClubScene(input({ mode: '2d', headScale: 1 }));
    expect(named(s.root, 'ground')!.visible).toBe(false);
    expect(named(s.root, 'arc')!.visible).toBe(false);
    expect(named(s.root, 'target-line')!.visible).toBe(true);
    s.dispose();
  });

  const visibleNames = (root: THREE.Object3D) => {
    const out: string[] = [];
    const walk = (o: THREE.Object3D) => { if (!o.visible) return; out.push(o.name); o.children.forEach(walk); };
    walk(named(root, 'annotations')!);
    return out;
  };

  test('setAnnotations replaces the annotations', () => {
    const s = buildClubScene(input());
    s.setAnnotations(annotations3D('dtl', scene, REF_M));
    const names = visibleNames(s.root);
    expect(names).toContain('vplane');
    expect(names).not.toContain('path');
    s.dispose();
  });

  test('setAnnotations with a key builds each layer once and shows only that layer', () => {
    const s = buildClubScene(input({ annotations: [] }));
    s.setAnnotations(annotations3D('top', scene, REF_M), 'top');
    const topLayer = named(s.root, 'annotations')!.getObjectByName('layer:top')!;
    expect(topLayer).toBeDefined();
    s.setAnnotations(annotations3D('dtl', scene, REF_M), 'dtl');
    expect(visibleNames(s.root)).toContain('vplane');
    expect(visibleNames(s.root)).not.toContain('path');
    s.setAnnotations(annotations3D('top', scene, REF_M), 'top');
    expect(named(s.root, 'annotations')!.getObjectByName('layer:top')).toBe(topLayer);
    expect(visibleNames(s.root)).toContain('path');
    expect(visibleNames(s.root)).not.toContain('vplane');
    s.dispose();
  });

  test('dispose() disposes every geometry it created and none of the shared head geometry', () => {
    const s = buildClubScene(input());
    const geoms = new Set<THREE.BufferGeometry>();
    s.root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) geoms.add(g); });
    const shared = [...geoms].filter((g) => g.userData.shared);
    expect(shared.length).toBeGreaterThan(0);
    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    s.dispose();
    const disposed = new Set(spy.mock.contexts as THREE.BufferGeometry[]);
    for (const g of geoms) expect(disposed.has(g), g.type).toBe(!g.userData.shared);
  });

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
    const model = named(s.root, 'club-head-model')!;
    const hoselLength = ((hosel as THREE.Mesh).geometry as THREE.CylinderGeometry).parameters.height;
    const lowerEnd = worldOf(hosel).addScaledVector(axis(hosel), -hoselLength / 2);
    const base = model.localToWorld((model.userData as ClubModelData).hoselBase.clone());
    expect(lowerEnd.distanceTo(base)).toBeLessThan(1e-6);
    s.dispose();
  });

  test('missing plane (swingH null): no arc points, club at the ball, no throw', () => {
    const m = mOf({ ftt: 2, dynamicLoft: 30 });
    const s2 = sceneOf(m);
    const s = buildClubScene(input({ scene: s2, m, annotations: [] }));
    s.setProgress(0.2);
    s.root.updateMatrixWorld(true);
    expect(named(s.root, 'arc')!.children).toHaveLength(0);
    expect(worldOf(named(s.root, 'club-face-centre')!).length()).toBeLessThan(0.15);
    s.dispose();
  });

  test('setClubOpacity ghosts every club material and restores it', () => {
    const s = buildClubScene(input());
    const mats = () => {
      const out: THREE.Material[] = [];
      named(s.root, 'club')!.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) out.push(m as THREE.Material); });
      return out;
    };
    const before = mats().map((m) => m.version);
    s.setClubOpacity(0.3);
    expect(mats().every((m) => m.transparent && m.opacity === 0.3)).toBe(true);
    expect(mats().every((m, i) => m.version > before[i]!), 'needsUpdate so the shader recompiles').toBe(true);
    s.setClubOpacity(1);
    expect(mats().every((m) => m.opacity === 1 && !m.transparent)).toBe(true);
    s.dispose();
  });

  test('setClubOpacity with an unchanged alpha does not touch the materials (no shader re-check per draw)', () => {
    const s = buildClubScene(input());
    const mats: THREE.Material[] = [];
    named(s.root, 'club')!.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) mats.push(m as THREE.Material); });
    s.setClubOpacity(0.3);
    const v = mats.map((m) => m.version);
    s.setClubOpacity(0.3);
    expect(mats.map((m) => m.version)).toEqual(v);
    s.dispose();
  });

  test('driver and left-handed builds do not throw', () => {
    expect(() => buildClubScene(input({ club: 'Driver', scene: sceneOf(REF_M, 'left') })).dispose()).not.toThrow();
    expect(() => buildClubScene(input({ club: '4 Hybrid' })).dispose()).not.toThrow();
  });
});
