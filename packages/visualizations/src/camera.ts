import type { Vec3 } from '@fsa/domain';
import type { ReplayScene } from '@fsa/analytics';

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

/** Everything that must stay visible: ball, club arc, ball flight and landing. */
function framedPoints(scene: ReplayScene): Vec3[] {
  const pts: Vec3[] = [[0, 0, 0]];
  if (scene.clubArc) pts.push(...scene.clubArc);
  if (scene.ballFlight) pts.push(...scene.ballFlight);
  if (scene.landing) pts.push(scene.landing);
  if (pts.length === 1) pts.push([-5, -5, 0], [5, 5, 3]);
  return pts;
}

export function cameraFor(preset: CameraPreset, scene: ReplayScene, viewportWidth: number): Camera {
  const g = scene.handedness === 'right' ? -1 : 1;
  const pts = framedPoints(scene);
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
  const mid: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const Y = hi[1], Z = hi[2];
  const M = Math.max(hi[1] - lo[1], 30); // overall scale in yards
  const behind = Math.max(0, -lo[1]);

  let eye: Vec3, up: Vec3 = [0, 0, 1];
  switch (preset) {
    case 'dtl': eye = [2.5 * g, -(behind + 10), 3]; break;
    case 'perspective': eye = [0.45 * M * g, -(behind + 0.45 * M), 0.3 * M + Z]; break;
    case 'side': eye = [-(0.8 * M + 20) * g, mid[1], 1.5]; break;
    case 'top': eye = [mid[0], mid[1], Z + M]; up = [0, 1, 0]; break;
  }
  let target: Vec3 = preset === 'top' ? [mid[0], mid[1], 0] : mid;

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
    const cx = (Math.min(...o.map((q) => q.x)) + Math.max(...o.map((q) => q.x))) / 2;
    const cy = (Math.min(...o.map((q) => q.y)) + Math.max(...o.map((q) => q.y))) / 2;
    const dAvg = o.reduce((a, q) => a + q.depth, 0) / o.length;
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
