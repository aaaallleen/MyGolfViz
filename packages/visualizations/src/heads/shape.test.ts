import { expect, test } from 'vitest';
import { HEAD_SPECS } from './specs';
import { bodySilhouette, bodySurface, faceOutline, scoreLines } from './shape';

const cats = ['driver', 'wood', 'hybrid', 'iron'] as const;
const span = (pts: number[][], i: number) => Math.max(...pts.map((p) => p[i]!)) - Math.min(...pts.map((p) => p[i]!));

/** Even-odd ray cast in the (x, z) plane. */
function pointInPolygon([x, z]: readonly number[], poly: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
    if (zi! > z! !== zj! > z! && x! < ((xj! - xi!) * (z! - zi!)) / (zj! - zi!) + xi!) inside = !inside;
  }
  return inside;
}

/** Shoelace area in the (x, z) plane: positive when the loop runs counter-clockwise. */
function signedArea(poly: readonly (readonly number[])[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!, [x2, z2] = poly[(i + 1) % poly.length]!;
    a += x1! * z2! - x2! * z1!;
  }
  return a / 2;
}

/** Rotate a point about the x axis by `deg` (right-handed). */
function rotX([x, y, z]: number[], deg: number): number[] {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return [x!, y! * c - z! * s, y! * s + z! * c];
}

function toPoints(positions: Float32Array): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < positions.length; i += 3) out.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
  return out;
}

/** Signed volume of a closed triangle mesh: positive when every triangle faces outward. */
function signedVolume(P: number[][], indices: Uint32Array): number {
  let v = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [P[indices[t]!]!, P[indices[t + 1]!]!, P[indices[t + 2]!]!];
    v += a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
  }
  return v / 6;
}

/** Parity of the crossings of a ray from `o` with the mesh (Möller–Trumbore): odd means inside. */
function insideMesh(o: number[], P: number[][], indices: Uint32Array): boolean {
  const d = [0.31, 0.27, 0.91]; // an off-axis direction, so the ray avoids mesh edges
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  let hits = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = P[indices[t]!]!, e1 = sub(P[indices[t + 1]!]!, a), e2 = sub(P[indices[t + 2]!]!, a);
    const p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(o, a), u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 0) hits++;
  }
  return hits % 2 === 1;
}

test.each(cats)('%s face outline: closed loop around the centre, true width and height', (c) => {
  const s = HEAD_SPECS[c], o = faceOutline(s);
  expect(o.length).toBeGreaterThanOrEqual(48);
  expect(o.length).toBeLessThanOrEqual(96);
  expect(span(o, 0)).toBeCloseTo(s.faceWidthIn, 1); // exact face width
  const tall = s.kind === 'blade' ? s.toeHeightIn! : s.faceHeightIn;
  expect(span(o, 1) / tall).toBeGreaterThan(0.9);
  expect(span(o, 1) / tall).toBeLessThan(1.1);
  expect(pointInPolygon([0, 0], o)).toBe(true);
  expect(signedArea(o)).toBeGreaterThan(0); // counter-clockwise
});

test('iron face is taller at the toe than the heel', () => {
  const o = faceOutline(HEAD_SPECS.iron);
  const toe = Math.max(...o.filter((p) => p[0] > 1).map((p) => p[1]));
  const heel = Math.max(...o.filter((p) => p[0] < -1).map((p) => p[1]));
  expect(toe - heel).toBeGreaterThan(0.6);
});

test.each(cats)('%s score lines lie inside the face outline', (c) => {
  const s = HEAD_SPECS[c], o = faceOutline(s), lines = scoreLines(s);
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) {
    expect(l.x1).toBeLessThan(l.x2);
    expect(pointInPolygon([l.x1, l.z], o), `(${l.x1}, ${l.z})`).toBe(true);
    expect(pointInPolygon([l.x2, l.z], o), `(${l.x2}, ${l.z})`).toBe(true);
  }
});

test('driver score lines leave the centre clear; iron lines are full width', () => {
  expect(scoreLines(HEAD_SPECS.driver).every((l) => Math.min(Math.abs(l.x1), Math.abs(l.x2)) >= 0.7)).toBe(true);
  expect(scoreLines(HEAD_SPECS.iron).every((l) => l.x1 < -1 && l.x2 > 1)).toBe(true);
  expect(scoreLines(HEAD_SPECS.iron)).toHaveLength(HEAD_SPECS.iron.scoreLines.count);
});

test.each(cats)('%s body: flat face at y = 0, nothing in front of it, real size', (c) => {
  const s = HEAD_SPECS[c], { positions, indices } = bodySurface(s, 48, 32);
  const P = toPoints(positions);
  expect(Math.max(...P.map((p) => p[1]!))).toBeCloseTo(0, 5);
  expect(indices.length / 3).toBeLessThanOrEqual(6000);
  // Woods: un-tilt by the static loft (rotate about x by +loftDeg) and measure the level bounding box.
  // Blades are a slab behind the face, so they are measured in the face frame as they are.
  const L = s.kind === 'wood' ? P.map((p) => rotX(p, s.loftDeg)) : P;
  for (const [i, want] of [[0, s.headWidthIn], [1, s.headDepthIn], [2, s.headHeightIn]] as const) {
    expect(span(L, i) / want, `axis ${i}`).toBeGreaterThan(0.9);
    expect(span(L, i) / want, `axis ${i}`).toBeLessThan(1.1);
  }
  expect(P.every((p) => p.every(Number.isFinite))).toBe(true);
});

test.each(cats)('%s body is a closed, outward-wound mesh holding the hosel base', (c) => {
  const s = HEAD_SPECS[c], { positions, indices } = bodySurface(s, 48, 32);
  const P = toPoints(positions);
  const edges = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const key = `${indices[t + k]}>${indices[t + ((k + 1) % 3)]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  // every directed edge appears once and is matched by its reverse
  for (const [key, n] of edges) {
    expect(n, key).toBe(1);
    const [a, b] = key.split('>');
    expect(edges.get(`${b}>${a}`), key).toBe(1);
  }
  expect(signedVolume(P, indices)).toBeGreaterThan(0);
  const [x, y] = s.hosel.base;
  expect(x).toBeLessThan(-s.faceWidthIn / 2 + 0.3);
  expect(y).toBeLessThan(0);
  expect(insideMesh(s.hosel.base, P, indices)).toBe(true);
});

test.each(['driver', 'wood', 'hybrid'] as const)('%s silhouette contains the face outline', (c) => {
  const s = HEAD_SPECS[c], sil = bodySilhouette(s)!;
  expect(sil).not.toBeNull();
  for (const p of faceOutline(s)) expect(pointInPolygon(p, sil), `(${p[0]}, ${p[1]})`).toBe(true);
});

test('iron has no silhouette', () => expect(bodySilhouette(HEAD_SPECS.iron)).toBeNull());
