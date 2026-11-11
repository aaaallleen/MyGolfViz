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

export function cameraFor(preset: CameraPreset, scene: ReplayScene, viewportWidth: number): Camera {
  const g = scene.handedness === 'right' ? -1 : 1;
  const Y = scene.landing ? scene.landing[1] : 60;
  const focal = 0.9 * viewportWidth;
  switch (preset) {
    case 'dtl': return { eye: [0.6 * g, -4, 1.7], target: [0, 0.5 * Y, 0], up: [0, 0, 1], focal };
    case 'perspective': return { eye: [4 * g, -3, 2.5], target: [0, 8, 0.5], up: [0, 0, 1], focal };
    case 'side': return { eye: [-6 * g, 0.5, 1.0], target: [0, 0.5, 0.8], up: [0, 0, 1], focal };
    case 'top': return { eye: [0, 1, 8], target: [0, 1, 0], up: [0, 1, 0], focal };
  }
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
