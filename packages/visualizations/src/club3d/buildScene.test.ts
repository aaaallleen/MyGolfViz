import * as THREE from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { annotations3D } from './annotations';
import { buildClubScene, type ClubSceneInput } from './buildScene';
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
    expect(worldOf(named(s.root, 'club-face-centre')!).length()).toBeLessThan(0.1);
    s.setProgress(0);
    s.root.updateMatrixWorld(true);
    const a0 = new THREE.Vector3(...scene.clubArc![0]!);
    expect(worldOf(named(s.root, 'club-face-centre')!).distanceTo(a0)).toBeLessThan(0.1);
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

  test('setAnnotations replaces the annotation children', () => {
    const s = buildClubScene(input());
    s.setAnnotations(annotations3D('dtl', scene, REF_M));
    const kids = named(s.root, 'annotations')!.children.map((c) => c.name);
    expect(kids.some((n) => n.startsWith('vplane'))).toBe(true);
    expect(kids.some((n) => n.startsWith('path'))).toBe(false);
    s.dispose();
  });

  test('dispose() disposes every geometry it created', () => {
    const s = buildClubScene(input());
    const geoms = new Set<THREE.BufferGeometry>();
    s.root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) geoms.add(g); });
    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    s.dispose();
    const disposed = new Set(spy.mock.contexts as THREE.BufferGeometry[]);
    for (const g of geoms) expect(disposed.has(g)).toBe(true);
  });

  test('missing plane (swingH null): no arc points, club at the ball, no throw', () => {
    const m = mOf({ ftt: 2, dynamicLoft: 30 });
    const s2 = sceneOf(m);
    const s = buildClubScene(input({ scene: s2, m, annotations: [] }));
    s.setProgress(0.2);
    s.root.updateMatrixWorld(true);
    expect(named(s.root, 'arc')!.children).toHaveLength(0);
    expect(worldOf(named(s.root, 'club-face-centre')!).length()).toBeLessThan(0.1);
    s.dispose();
  });

  test('driver and left-handed builds do not throw', () => {
    expect(() => buildClubScene(input({ club: 'Driver', scene: sceneOf(REF_M, 'left') })).dispose()).not.toThrow();
    expect(() => buildClubScene(input({ club: '4 Hybrid' })).dispose()).not.toThrow();
  });
});
