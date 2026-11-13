import type { HeadSpec } from './specs';

/** A point (x, z) in the face plane, inches. */
export type Pt = [number, number];
type V3 = [number, number, number];

/** The flat region of a wood is this much wider than its face, and the face outline is inset this far from its edge. */
const FACE_MARGIN_IN = 0.12;
const FACE_INSET_IN = FACE_MARGIN_IN / 2;
/** Score lines stop this far short of the face outline. */
const LINE_MARGIN_IN = 0.2;
/** A blade's lowest score line sits this far above the leading edge. */
const BLADE_FIRST_LINE_IN = 0.1;
/** A blade's back cap centre is pushed this far toward the face, for the recessed back. */
const BLADE_BACK_RECESS_IN = 0.08;
const OUTLINE_POINTS = 64;
const DEG = Math.PI / 180;

/**
 * The face as a closed loop of 64 (x, z) points in the face plane, first point not repeated, exactly
 * `faceWidthIn` wide. The loop has positive shoelace area in (x, z): it runs counter-clockwise when drawn
 * with +x to the right and +z up, which is the view from behind the face. Seen from in front of the face
 * (from +y), +x (the toe) points to the viewer's left and the loop runs clockwise.
 */
export function faceOutline(spec: HeadSpec): Pt[] {
  return spec.kind === 'blade' ? bladeOutline(spec) : woodOutline(spec);
}

/**
 * Horizontal score lines, bottom to top, each stopping short of the face outline.
 * With `clearCentreIn > 0` each row is split in two, leaving that width clear in the middle.
 */
export function scoreLines(spec: HeadSpec): { z: number; x1: number; x2: number }[] {
  const { count, spacingIn, clearCentreIn } = spec.scoreLines;
  const outline = faceOutline(spec);
  const stack = (count - 1) * spacingIn;
  const z0 = spec.kind === 'blade' ? Math.min(...outline.map((p) => p[1])) + BLADE_FIRST_LINE_IN : -stack / 2;
  const lines: { z: number; x1: number; x2: number }[] = [];
  for (let k = 0; k < count; k++) {
    const z = z0 + k * spacingIn;
    const [left, right] = chordAt(outline, z);
    const x1 = left + LINE_MARGIN_IN, x2 = right - LINE_MARGIN_IN;
    if (clearCentreIn > 0) lines.push({ z, x1, x2: -clearCentreIn / 2 }, { z, x1: clearCentreIn / 2, x2 });
    else lines.push({ z, x1, x2 });
  }
  return lines;
}

/**
 * The head body as a closed, outward-wound triangle mesh in the face frame, with its flat face on y = 0 and
 * nothing in front of it. Woods are sampled on an `nu` (around) × `nv` (front to back) grid, giving
 * 2·nu·(nv − 1) triangles; blades are built from the face outline and ignore `nu` and `nv`.
 */
export function bodySurface(spec: HeadSpec, nu: number, nv: number): { positions: Float32Array; indices: Uint32Array } {
  return spec.kind === 'blade' ? bladeSurface(spec) : woodSurface(spec, nu, nv);
}

/** Face-on outline of the body (its convex hull in x, z), counter-clockwise; null for blades. */
export function bodySilhouette(spec: HeadSpec): Pt[] | null {
  if (spec.kind === 'blade') return null;
  // the mesh's first ring is the exact edge of the flat face, so the hull holds the face outline
  const { positions } = woodSurface(spec, 96, 64);
  const pts: Pt[] = [];
  for (let i = 0; i < positions.length; i += 3) pts.push([positions[i]!, positions[i + 2]!]);
  return convexHull(pts);
}

// ---------------------------------------------------------------------------------------------------------
// Wood kind: a superellipsoid with a flat face cut across its front.
//
// The level frame is the head sitting soled (X toe, Y forward, Z up). Body maths uses face-aligned axes
// about the body centre: x toward the toe, y along the face normal, z up the face; a face-aligned vector q
// is (x, y cos L − z sin L, y sin L + z cos L) in the level frame. The face plane is y = dist and the body
// is the part of the superellipsoid behind it. The face centre is (0, dist, centreZ), the middle of the
// flat region's height.

interface WoodBody {
  dist: number;
  centreZ: number;
  /** Superellipsoid radius along a face-aligned unit direction. */
  radius(d: V3): number;
  /** Distance from the face centre along the in-plane angle `phi` to the edge of the flat region. */
  edgeRadius(phi: number): number;
}

const woodCache = new WeakMap<HeadSpec, WoodBody>();

function woodBody(spec: HeadSpec): WoodBody {
  const cached = woodCache.get(spec);
  if (cached) return cached;
  const e = spec.exponent ?? 2.5;
  const c = Math.cos(spec.loftDeg * DEG), s = Math.sin(spec.loftDeg * DEG);
  const half = {
    x: spec.headWidthIn / 2,
    front: spec.headDepthIn * 0.4,
    back: spec.headDepthIn * 0.7,
    up: spec.headHeightIn * 0.6,
    down: spec.headHeightIn * 0.4,
  };
  /** Superellipsoid level set of a face-aligned offset from the body centre: < 1 inside. */
  const level = (x: number, y: number, z: number) => {
    const ly = y * c - z * s, lz = y * s + z * c;
    return (
      (Math.abs(x) / half.x) ** e +
      (Math.abs(ly) / (ly >= 0 ? half.front : half.back)) ** e +
      (Math.abs(lz) / (lz >= 0 ? half.up : half.down)) ** e
    );
  };
  const radius = (d: V3) => level(d[0], d[1], d[2]) ** (-1 / e);
  const far = 2 * Math.max(half.x, half.front, half.back, half.up, half.down);
  const edgeAt = (dist: number, z0: number, phi: number) =>
    bisect(0, far, (rho) => level(rho * Math.cos(phi), dist, z0 + rho * Math.sin(phi)) < 1);
  const angles = Array.from({ length: 128 }, (_, k) => (2 * Math.PI * k) / 128);
  const toeSide = Array.from({ length: 65 }, (_, k) => (Math.PI * (k - 32)) / 64); // the body is symmetric in x
  const flatWidth = (dist: number) =>
    level(0, dist, 0) >= 1 ? 0 : 2 * Math.max(...toeSide.map((phi) => edgeAt(dist, 0, phi) * Math.cos(phi)));
  // the deeper the cut, the wider the flat face: find the plane that makes it faceWidthIn + margin wide
  const dist = bisect(0, radius([0, 1, 0]), (d) => flatWidth(d) > spec.faceWidthIn + FACE_MARGIN_IN);
  const zs = angles.map((phi) => edgeAt(dist, 0, phi) * Math.sin(phi));
  const centreZ = (Math.max(...zs) + Math.min(...zs)) / 2;
  const body: WoodBody = { dist, centreZ, radius, edgeRadius: (phi) => edgeAt(dist, centreZ, phi) };
  woodCache.set(spec, body);
  return body;
}

function woodOutline(spec: HeadSpec): Pt[] {
  const w = woodBody(spec);
  const edge: Pt[] = Array.from({ length: OUTLINE_POINTS }, (_, k) => {
    const phi = (2 * Math.PI * k) / OUTLINE_POINTS, rho = w.edgeRadius(phi);
    return [rho * Math.cos(phi), rho * Math.sin(phi)];
  });
  const inset = offsetInward(edge, FACE_INSET_IN);
  const xs = inset.map((p) => p[0]);
  const scale = spec.faceWidthIn / (Math.max(...xs) - Math.min(...xs));
  const top = spec.flatTop ? spec.faceHeightIn / 2 : Infinity;
  return inset.map(([x, z]) => [x * scale, Math.min(z, top)]);
}

function woodSurface(spec: HeadSpec, nu: number, nv: number) {
  const w = woodBody(spec);
  // Vertex 0 is the face centre. Ring 1 is the exact edge of the flat face, one point per in-plane angle
  // around the face centre, so the face is a flat fan with an exact crease at its rim. Rings 2 … nv − 1
  // run over the body from that edge to the back pole: each keeps its edge point's azimuth about the face
  // normal and steps its polar angle evenly from the edge's to π.
  const positions = new Float32Array((nu * (nv - 1) + 2) * 3);
  let n = 0;
  const put = (x: number, y: number, z: number) => {
    positions[n++] = x;
    positions[n++] = y - w.dist;
    positions[n++] = z - w.centreZ;
  };
  put(0, w.dist, w.centreZ);
  const edges = Array.from({ length: nu }, (_, i) => {
    const phi = (2 * Math.PI * i) / nu, rho = w.edgeRadius(phi);
    const x = rho * Math.cos(phi), z = w.centreZ + rho * Math.sin(phi);
    return { x, z, polar: Math.atan2(Math.hypot(x, z), w.dist), azimuth: Math.atan2(z, x) };
  });
  for (const e of edges) put(e.x, w.dist, e.z);
  for (let j = 2; j < nv; j++)
    for (const { polar, azimuth } of edges) {
      const theta = polar + ((Math.PI - polar) * (j - 1)) / (nv - 1);
      const d: V3 = [Math.sin(theta) * Math.cos(azimuth), Math.cos(theta), Math.sin(theta) * Math.sin(azimuth)];
      const r = w.radius(d);
      put(r * d[0], r * d[1], r * d[2]);
    }
  put(0, -w.radius([0, -1, 0]), 0);
  const front = 0, back = nu * (nv - 1) + 1;
  const ring = (j: number, i: number) => 1 + (j - 1) * nu + (i % nu);
  const indices: number[] = [];
  for (let i = 0; i < nu; i++) {
    indices.push(front, ring(1, i + 1), ring(1, i));
    for (let j = 1; j < nv - 1; j++) {
      const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1);
      indices.push(a, b, c, b, d, c);
    }
    indices.push(ring(nv - 1, i), ring(nv - 1, i + 1), back);
  }
  return { positions, indices: Uint32Array.from(indices) };
}

// ---------------------------------------------------------------------------------------------------------
// Blade kind: a rounded trapezoid face, given thickness that tapers from the sole to the top line.

function bladeOutline(spec: HeadSpec): Pt[] {
  const half = spec.faceWidthIn / 2, sole = -spec.faceHeightIn / 2;
  const corners: { p: Pt; r: number }[] = [
    { p: [-half, sole], r: 0.2 },
    { p: [half, sole], r: 0.2 },
    { p: [half, sole + spec.toeHeightIn!], r: 0.45 },
    { p: [-half, sole + spec.heelHeightIn!], r: 0.2 },
  ];
  const path: Pt[] = [];
  corners.forEach(({ p, r }, k) => {
    const prev = corners[(k + 3) % 4]!.p, next = corners[(k + 1) % 4]!.p;
    const u1 = unit([prev[0] - p[0], prev[1] - p[1]]), u2 = unit([next[0] - p[0], next[1] - p[1]]);
    const halfAngle = Math.acos(u1[0] * u2[0] + u1[1] * u2[1]) / 2;
    const bis = unit([u1[0] + u2[0], u1[1] + u2[1]]);
    const centre: Pt = [p[0] + (bis[0] * r) / Math.sin(halfAngle), p[1] + (bis[1] * r) / Math.sin(halfAngle)];
    const t = r / Math.tan(halfAngle);
    const a0 = Math.atan2(p[1] + u1[1] * t - centre[1], p[0] + u1[0] * t - centre[0]);
    let a1 = Math.atan2(p[1] + u2[1] * t - centre[1], p[0] + u2[0] * t - centre[0]);
    while (a1 < a0) a1 += 2 * Math.PI; // the loop turns left at every corner
    for (let m = 0; m <= 16; m++) {
      const a = a0 + ((a1 - a0) * m) / 16;
      path.push([centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)]);
    }
  });
  return resampleLoop(path, OUTLINE_POINTS);
}

function bladeSurface(spec: HeadSpec) {
  const outline = faceOutline(spec);
  const half = spec.faceWidthIn / 2, sole = -spec.faceHeightIn / 2;
  const topAt = (x: number) => spec.heelHeightIn! + ((x + half) / spec.faceWidthIn) * (spec.toeHeightIn! - spec.heelHeightIn!);
  const thickness = (x: number, z: number) => {
    const f = Math.min(1, Math.max(0, (z - sole) / topAt(x)));
    return spec.headDepthIn + (spec.topLineIn! - spec.headDepthIn) * f;
  };
  const m = outline.length;
  const front: V3[] = outline.map(([x, z]) => [x, 0, z]);
  const back: V3[] = outline.map(([x, z]) => [x, -thickness(x, z), z]);
  const mean = (pts: V3[]): V3 => [0, 1, 2].map((i) => pts.reduce((sum, p) => sum + p[i]!, 0) / pts.length) as V3;
  const frontCentre = mean(front), backCentre = mean(back);
  backCentre[1] += BLADE_BACK_RECESS_IN;
  // vertices: front ring 0..m−1, back ring m..2m−1, front centre 2m, back centre 2m+1
  const positions = Float32Array.from([...front, ...back, frontCentre, backCentre].flat());
  const indices: number[] = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    indices.push(2 * m, j, i); // face, toward +y
    indices.push(2 * m + 1, m + i, m + j); // back, toward −y
    indices.push(i, j, m + i, j, m + j, m + i); // the rim
  }
  return { positions, indices: Uint32Array.from(indices) };
}

// ---------------------------------------------------------------------------------------------------------
// Small geometry helpers.

/** Largest value in [lo, hi] for which `inside` holds, assuming it holds below a threshold and not above. */
function bisect(lo: number, hi: number, inside: (v: number) => boolean): number {
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function unit([x, z]: Pt): Pt {
  const len = Math.hypot(x, z);
  return [x / len, z / len];
}

/** Move every point of a counter-clockwise loop inward along its normal. */
function offsetInward(loop: Pt[], by: number): Pt[] {
  return loop.map((p, k) => {
    const prev = loop[(k + loop.length - 1) % loop.length]!, next = loop[(k + 1) % loop.length]!;
    const [tx, tz] = unit([next[0] - prev[0], next[1] - prev[1]]);
    return [p[0] - tz * by, p[1] + tx * by];
  });
}

/** `count` points evenly spaced by arc length around a closed polyline. */
function resampleLoop(path: Pt[], count: number): Pt[] {
  const pts = path.filter((p, k) => k === 0 || Math.hypot(p[0] - path[k - 1]![0], p[1] - path[k - 1]![1]) > 1e-9);
  const cum = [0];
  for (let k = 1; k <= pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k % pts.length]!;
    cum.push(cum[k - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[pts.length]!;
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const at = (total * k) / count;
    while (cum[seg + 1]! < at) seg++;
    const a = pts[seg]!, b = pts[(seg + 1) % pts.length]!, f = (at - cum[seg]!) / (cum[seg + 1]! - cum[seg]!);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Leftmost and rightmost crossings of the horizontal line at `z` with a closed loop. */
function chordAt(loop: Pt[], z: number): [number, number] {
  let left = Infinity, right = -Infinity;
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k]!, b = loop[(k + 1) % loop.length]!;
    if (a[1] > z === b[1] > z) continue;
    const x = a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  return [left, right];
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...chain(pts), ...chain(pts.reverse())];
}
