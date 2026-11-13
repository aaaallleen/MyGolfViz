import type { Handedness, Measurements, Vec3 } from '@fsa/domain';
import type { ReplayScene } from '@fsa/analytics';
import type { View2D, View3D, ViewCamera } from './types';

const rad = (d: number) => (d * Math.PI) / 180;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

const ORIGIN: Vec3 = [0, 0, 0];
const Z: Vec3 = [0, 0, 1];
const DIST = 10;
/** Starting half-heights in yards; framing to the arc happens at render time. */
const SIZE_3D = 1.9;
const SIZE_2D = 0.16;
const OVERVIEW_FOV = 32;

/** Horizontal unit direction `deg` degrees right (+x) of the target line. */
const heading = (deg: number): Vec3 => [Math.sin(rad(deg)), Math.cos(rad(deg)), 0];
const sign = (h: Handedness) => (h === 'right' ? 1 : -1);

/** Straight down; golfer at the bottom (right-hander: target on the left). */
const topCam = (g: number, size: number): ViewCamera => ({ kind: 'ortho', eye: [0, 0, DIST], target: ORIGIN, up: [g, 0, 0], size });

/** Horizontal, square to the club path, facing the golfer (right-hander: target on the right). */
const faceOnCam = (clubPath: number | null, g: number, size: number): ViewCamera => {
  const p = heading(clubPath ?? 0);
  const n: Vec3 = [p[1], -p[0], 0]; // horizontal, perpendicular to the path, away from a right-hander
  return { kind: 'ortho', eye: scale(n, DIST * g), target: ORIGIN, up: Z, size };
};

export function camera3D(view: View3D, scene: ReplayScene, m: Measurements): ViewCamera {
  const g = sign(scene.handedness);
  switch (view) {
    case 'top':
      return topCam(g, SIZE_3D);
    case 'faceOn':
      return faceOnCam(m.clubPath, g, SIZE_3D);
    case 'dtl':
      // Along the swing direction, so the plane is edge-on and V-plane reads true.
      return { kind: 'ortho', eye: scale(heading(m.swingH ?? 0), -DIST), target: ORIGIN, up: Z, size: SIZE_3D };
    case 'overview':
      return { kind: 'persp', eye: [3.2 * g, -3.6, 2.2], target: [0, 0.2, 0.5], up: Z, size: OVERVIEW_FOV };
  }
}

export function camera2D(view: View2D, m: Measurements, handedness: Handedness): ViewCamera {
  const g = sign(handedness);
  switch (view) {
    case 'ftt':
    case 'ftp':
      return topCam(g, SIZE_2D);
    case 'loft':
      return faceOnCam(m.clubPath, g, SIZE_2D);
    case 'spinAxis':
      return { kind: 'ortho', eye: [0, -DIST, 0], target: ORIGIN, up: Z, size: SIZE_2D };
  }
}

/** Unit screen axes of a camera: right, up and forward (into the screen). */
export function screenBasis(cam: ViewCamera): { right: Vec3; up: Vec3; forward: Vec3 } {
  const forward = normalize(sub(cam.target, cam.eye));
  const right = normalize(cross(forward, cam.up));
  return { right, up: cross(right, forward), forward };
}

/** Orthographic projection into slot fractions: x 0..1 left to right, y 0..1 top to bottom. `aspect` = width / height. */
export function projectOrtho(cam: ViewCamera, p: Vec3, aspect: number): { x: number; y: number } {
  const { right, up } = screenBasis(cam);
  const d = sub(p, cam.target);
  return { x: 0.5 + dot(d, right) / (2 * cam.size * aspect), y: 0.5 - dot(d, up) / (2 * cam.size) };
}
