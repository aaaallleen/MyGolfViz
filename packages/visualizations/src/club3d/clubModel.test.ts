import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { HEAD_SPECS } from '../heads/specs';
import { buildClubModel, type ClubModelData } from './clubModel';

const cats = ['driver', 'wood', 'hybrid', 'iron'] as const;

/** Unit normals, from the winding, of every triangle with area; the triangulator leaves a few zero-area
 *  triangles along the straight runs of the blade outline, and those have no facing (nor draw anything). */
function triangleNormals(g: THREE.BufferGeometry): THREE.Vector3[] {
  const pos = g.getAttribute('position');
  const count = g.index ? g.index.count : pos.count;
  const at = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, g.index ? g.index.getX(k) : k);
  const out: THREE.Vector3[] = [];
  for (let k = 0; k < count; k += 3) {
    const a = at(k), b = at(k + 1), c = at(k + 2);
    const n = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a));
    if (n.length() > 1e-10) out.push(n.normalize());
  }
  return out;
}

describe.each(cats)('%s model contract', (c) => {
  const model = buildClubModel(c, 'right');
  const mesh = (n: string) => model.getObjectByName(n) as THREE.Mesh;

  test('named children exist', () => {
    for (const n of ['club-head', 'club-face', 'club-grooves', 'club-face-centre']) expect(model.getObjectByName(n), n).toBeDefined();
  });

  test('face is the flat plane y ≈ 0 facing +y, centred on the origin', () => {
    const b = new THREE.Box3().setFromObject(mesh('club-face'));
    expect(b.min.y).toBeGreaterThan(-1e-4);
    expect(b.max.y).toBeLessThan(0.01 / 36);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 3);
    expect((b.max.x - b.min.x) * 36).toBeCloseTo(HEAD_SPECS[c].faceWidthIn, 1);
    const geo = mesh('club-face').geometry;
    const facing = triangleNormals(geo);
    expect(facing.length).toBeGreaterThan(20);
    for (const n of facing) expect(n.y).toBeGreaterThan(0.99); // winding
    const normals = geo.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0.99); // shading
  });

  test('body never pokes through the face', () => expect(new THREE.Box3().setFromObject(mesh('club-head')).max.y).toBeLessThan(1e-4));

  test('the body keeps a hard edge round its flat face: every vertex on the face plane of a face triangle shades flat', () => {
    const geo = mesh('club-head').geometry;
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), index = geo.index!;
    let faceTriangles = 0;
    for (let k = 0; k < index.count; k += 3) {
      const vs = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
      if (!vs.every((v) => Math.abs(pos.getY(v)) < 1e-7)) continue;
      faceTriangles++;
      for (const v of vs) expect(nrm.getY(v)).toBeGreaterThan(0.999);
    }
    expect(faceTriangles).toBeGreaterThan(20);
  });

  test('userData carries loft, lie and a heel-side hosel base behind the face', () => {
    const d = model.userData as ClubModelData;
    expect(d.loftDeg).toBe(HEAD_SPECS[c].loftDeg);
    expect(d.lieDeg).toBe(HEAD_SPECS[c].lieDeg);
    expect(d.hoselBase.x).toBeLessThan(0);
    expect(d.hoselBase.y).toBeLessThan(0);
    expect(d.hoselLengthYd).toBeCloseTo(HEAD_SPECS[c].hosel.lengthIn / 36, 6);
  });

  test('triangle budget', () => {
    let triangles = 0;
    model.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (!(o as THREE.Mesh).isMesh || !g) return;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(6000);
  });

  test('left-handed is the mirror and shares geometry', () => {
    const l = buildClubModel(c, 'left');
    expect(l.scale.x).toBe(-1);
    expect((l.getObjectByName('club-head') as THREE.Mesh).geometry).toBe(mesh('club-head').geometry);
    expect(mesh('club-head').geometry.userData.shared).toBe(true);
    expect((l.getObjectByName('club-head') as THREE.Mesh).material).not.toBe(mesh('club-head').material);
  });
});

test.each(['driver', 'wood', 'hybrid'] as const)('%s body behind the face shades smooth: none of its vertices is split', (c) => {
  const pos = (buildClubModel(c, 'right').getObjectByName('club-head') as THREE.Mesh).geometry.getAttribute('position');
  const seen = new Set<string>();
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getY(v)) < 1e-7) continue;
    const key = [pos.getX(v), pos.getY(v), pos.getZ(v)].join();
    expect(seen.has(key), key).toBe(false);
    seen.add(key);
  }
});

test('first build of every head takes under 100 ms in total', async () => {
  vi.resetModules();
  const fresh = await import('./clubModel');
  const start = performance.now();
  for (const c of cats) fresh.buildClubModel(c, 'right');
  expect(performance.now() - start).toBeLessThan(100);
});
