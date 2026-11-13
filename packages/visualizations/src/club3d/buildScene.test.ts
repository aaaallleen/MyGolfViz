import * as THREE from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Handedness, Measurements } from '@fsa/domain';
import { annotations3D } from './annotations';
import { buildClubScene, type ClubScene, type ClubSceneInput } from './buildScene';
import type { ClubModelData } from './clubModel';
import { REF_M, mOf, sceneOf } from './testFixtures';

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
  const build = (club: string, m: Measurements, hand: Handedness = 'right') => {
    const sc = sceneOf(m, hand);
    const s = buildClubScene(input({ club, m, scene: sc, annotations: [] }));
    s.setProgress(0.63); s.root.updateMatrixWorld(true);
    return s;
  };
  const ballR = (s: ClubScene) => ((named(s.root, 'ball') as THREE.Mesh).geometry as THREE.SphereGeometry).parameters.radius;
  const groundZ = (s: ClubScene) => named(s.root, 'ground')!.position.z;
  /** Lowest vertex of the head (precise: the bounding box of a tilted head reaches below its real sole). */
  const headMinZ = (s: ClubScene) => new THREE.Box3().setFromObject(named(s.root, 'club-head')!, true).min.z;
  /** World point where the ball touches the face: ball centre minus radius along the face normal. */
  const touchInFace = (s: ClubScene) => {
    const centre = named(s.root, 'club-face-centre')!;
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(centre.matrixWorld);
    return centre.worldToLocal(worldOf(named(s.root, 'ball')!).addScaledVector(normal, -ballR(s)));
  };

  test.each(clubs)('%s: the ball stays on the origin and the head is never below the ground', (club) => {
    const s = build(club, REF_M);
    expect(worldOf(named(s.root, 'ball')!).z).toBeCloseTo(ballR(s), 6);
    expect(headMinZ(s)).toBeGreaterThanOrEqual(groundZ(s) - 1e-6);
    expect(named(s.root, 'target-line')!.position.z).toBeCloseTo(groundZ(s), 9);
    expect(!!named(s.root, 'tee')).toBe(groundZ(s) < -1e-6);
    // No strike measured: the sole rests on the ground, which stays put, and no tee is drawn.
    expect(groundZ(s)).toBe(0);
    expect(named(s.root, 'tee')).toBeUndefined();
    expect(headMinZ(s)).toBeCloseTo(0, 4);
    s.dispose();
  });

  test.each(clubs)('%s: no strike measured: the ball still touches the face plane, centred heel to toe', (club) => {
    const s = build(club, REF_M);
    const p = touchInFace(s);
    expect(Math.abs(p.y)).toBeLessThan(1e-3);
    expect(Math.abs(p.x) * 36).toBeLessThan(0.01);
    s.dispose();
  });

  test('Driver with a measured centre strike is teed up: the ground drops to the head', () => {
    const s = build('Driver', { ...REF_M, impactLateral: 0, impactVertical: 0 });
    expect(groundZ(s)).toBeLessThan(0);
    expect(named(s.root, 'tee')).toBeDefined();
    expect(headMinZ(s)).toBeCloseTo(groundZ(s), 4);
    s.dispose();
  });

  test.each(clubs)('%s: no loft measured: the sole rests on the ground at the static loft', (club) => {
    const s = build(club, mOf({ swingH: 6, swingV: 60, aoa: -2, clubPath: 2 }));
    expect(groundZ(s)).toBe(0);
    expect(headMinZ(s)).toBeCloseTo(0, 4);
    expect(named(s.root, 'tee')).toBeUndefined();
    s.dispose();
  });

  test.each(['right', 'left'] as const)('%s-handed: a measured strike puts the ball on that point of the face', (hand) => {
    const s = build('Driver', { ...REF_M, impactLateral: 0.65, impactVertical: -0.3 }, hand);
    const p = touchInFace(s); // model-local yards; the mirror is inside the model, so toe is +x for both hands
    expect(p.x * 36).toBeCloseTo(0.65, 2);
    expect(p.z * 36).toBeCloseTo(-0.3, 2);
    expect(Math.abs(p.y)).toBeLessThan(1e-3);
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
    const s = build('7 Iron', { ...REF_M, impactLateral: 0.65 });
    const p = touchInFace(s);
    expect(Math.abs(p.x) * 36).toBeLessThan(0.01);
    expect(Math.abs(p.y)).toBeLessThan(1e-3);
    expect(groundZ(s)).toBe(0);
    expect(named(s.root, 'tee')).toBeUndefined();
    s.dispose();
  });

  test.each([[-5, 0, 0], [75, 0, 0], [40.9, 2.5, 1.5]])('extreme input loft %s strike (%s, %s): finite and above ground', (loft, lat, vert) => {
    const s = build('Gap Wedge', { ...REF_M, dynamicLoft: loft, impactLateral: lat, impactVertical: vert });
    s.root.traverse((o) => expect(o.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(true));
    expect(headMinZ(s)).toBeGreaterThanOrEqual(groundZ(s) - 1e-6);
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
