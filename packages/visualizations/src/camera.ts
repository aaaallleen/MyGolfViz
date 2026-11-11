import type { Handedness, Vec3 } from '@fsa/domain';
import { CLUB_ARC_RADIUS_YD, type ReplayScene } from '@fsa/analytics';

export type CameraPreset = 'dtl' | 'perspective' | 'side' | 'top';
export interface Camera { eye: Vec3; target: Vec3; up: Vec3; focal: number }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Viewport aspect used for framing (the replay canvas is 800×480). */
const ASPECT = 0.6;
const FILL = 0.46; // fraction of half-width/height the framed points may use (2% margin + slack)

const bounds = (pts: Vec3[]) => {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
  return { lo, hi, mid: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] as Vec3 };
};

/** Re-centre the target on the framed points, then fit focal so every point sits within FILL of the half-extents. */
function fitCamera(eye: Vec3, initialTarget: Vec3, up: Vec3, pts: Vec3[], viewportWidth: number): Camera {
  let target = initialTarget;
  const offsets = (cam: Camera) => {
    const out: { x: number; y: number; depth: number }[] = [];
    for (const p of pts) {
      const r = projectPoint(p, cam, { width: 0, height: 0 });
      if (r) out.push(r);
    }
    return out;
  };
  // Pass 1: centre the framed points on the view axis.
  let cam: Camera = { eye, target, up, focal: 1 };
  const o = offsets(cam);
  if (o.length > 0) {
    // Plain loops: spreading ~100k+ points into Math.min/max exceeds engine argument limits.
    let xLo = Infinity, xHi = -Infinity, yLo = Infinity, yHi = -Infinity, dSum = 0;
    for (const q of o) {
      if (q.x < xLo) xLo = q.x;
      if (q.x > xHi) xHi = q.x;
      if (q.y < yLo) yLo = q.y;
      if (q.y > yHi) yHi = q.y;
      dSum += q.depth;
    }
    const cx = (xLo + xHi) / 2;
    const cy = (yLo + yHi) / 2;
    const dAvg = dSum / o.length;
    const f = normalize(sub(target, eye));
    const r = normalize(cross(f, up));
    const v = cross(r, f);
    target = [0, 1, 2].map((k) => target[k]! + r[k]! * cx * dAvg - v[k]! * cy * dAvg) as Vec3;
    cam = { eye, target, up, focal: 1 };
  }
  // Pass 2: the largest focal length that keeps every point inside the margin.
  let fit = Infinity;
  for (const q of offsets(cam)) {
    fit = Math.min(fit, (FILL * viewportWidth) / Math.max(Math.abs(q.x), 1e-9));
    fit = Math.min(fit, (FILL * ASPECT * viewportWidth) / Math.max(Math.abs(q.y), 1e-9));
  }
  return { eye, target, up, focal: Math.min(fit, 3 * viewportWidth) };
}

function presetCamera(preset: CameraPreset, pts: Vec3[], handedness: Handedness, viewportWidth: number): Camera {
  const g = handedness === 'right' ? -1 : 1;
  const { lo, hi, mid } = bounds(pts);
  const Z = hi[2];
  const M = Math.max(hi[1] - lo[1], 30); // overall scale in yards
  const behind = Math.max(0, -lo[1]);
  let eye: Vec3, up: Vec3 = [0, 0, 1];
  switch (preset) {
    case 'dtl': eye = [2.5 * g, -(behind + 10), 3]; break;
    case 'perspective': eye = [0.45 * M * g, -(behind + 0.45 * M), 0.3 * M + Z]; break;
    case 'side': eye = [-(0.8 * M + 20) * g, mid[1], 1.5]; break;
    case 'top': eye = [mid[0], mid[1], Z + M]; up = [0, 1, 0]; break;
  }
  const target: Vec3 = preset === 'top' ? [mid[0], mid[1], 0] : mid;
  return fitCamera(eye, target, up, pts, viewportWidth);
}

/** Frames the origin and every point of every flight passed in. */
export function flightCamera(
  preset: CameraPreset, flights: Vec3[][], handedness: Handedness, viewportWidth: number,
): Camera {
  const pts: Vec3[] = [[0, 0, 0]];
  for (const f of flights) for (const p of f) pts.push(p);
  if (pts.length === 1) pts.push([-5, -5, 0], [5, 5, 3]);
  return presetCamera(preset, pts, handedness, viewportWidth);
}

/** Corners of the swing-plane quad the 3D component draws: origin ± u·R, and those points + w·R. */
export function planeQuad(scene: ReplayScene): Vec3[] {
  const pl = scene.plane;
  if (!pl) return [];
  const R = CLUB_ARC_RADIUS_YD;
  const at = (su: number, sw: number): Vec3 =>
    [0, 1, 2].map((k) => su * pl.u[k]! * R + sw * pl.w[k]! * R) as Vec3;
  return [at(-1, 0), at(1, 0), at(1, 1), at(-1, 1)];
}

/** Fixed elevated 3/4 view from the golfer side, framing origin, club arc and plane quad only. */
export function clubCamera(scene: ReplayScene, viewportWidth: number): Camera {
  const g = scene.handedness === 'right' ? -1 : 1;
  const pts: Vec3[] = [[0, 0, 0], ...(scene.clubArc ?? []), ...planeQuad(scene)];
  if (pts.length === 1) pts.push([-R_FALLBACK, -R_FALLBACK, 0], [R_FALLBACK, R_FALLBACK, R_FALLBACK]);
  const { lo, hi, mid } = bounds(pts);
  const S = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1);
  const eye: Vec3 = [mid[0] + g * 1.2 * S, mid[1] - 1.0 * S, mid[2] + 0.5 * S];
  return fitCamera(eye, mid, [0, 0, 1], pts, viewportWidth);
}

const R_FALLBACK = CLUB_ARC_RADIUS_YD;

export function projectPoint(
  p: Vec3, cam: Camera, viewport: { width: number; height: number },
): { x: number; y: number; depth: number } | null {
  const f = normalize(sub(cam.target, cam.eye));
  const r = normalize(cross(f, cam.up));
  const v = cross(r, f);
  const d = sub(p, cam.eye);
  const depth = dot(d, f);
  if (depth <= 0.05) return null;
  return {
    x: viewport.width / 2 + (cam.focal * dot(d, r)) / depth,
    y: viewport.height / 2 - (cam.focal * dot(d, v)) / depth,
    depth,
  };
}
