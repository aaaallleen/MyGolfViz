import { formatMeasurement, type MeasurementKey, type Measurements, type Vec3 } from '@fsa/domain';
import type { ReplayScene } from '@fsa/analytics';
import { screenBasis } from './cameras';
import { BALL, CLUB, FACE, INK, MUTED, PLANE } from './palette';
import type { View2D, View3D, ViewCamera } from './types';

export type Annotation =
  | { kind: 'line'; id: string; color: string; a: Vec3; b: Vec3; dashed?: boolean; width?: number }
  | { kind: 'wedge'; id: string; color: string; origin: Vec3; from: Vec3; to: Vec3; radius: number }
  | { kind: 'label'; id: string; color: string; at: Vec3; text: string };

export interface Badge { id: string; label: string; text: string | null; color: string; note?: string }

type Wedge = Extract<Annotation, { kind: 'wedge' }>;

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const ORIGIN: Vec3 = [0, 0, 0];
const Z: Vec3 = [0, 0, 1];
const TARGET: Vec3 = [0, 1, 0];

/** Horizontal unit direction `deg` degrees right (+x) of the target line. */
const heading = (deg: number): Vec3 => [Math.sin(rad(deg)), Math.cos(rad(deg)), 0];
/** Unit direction along horizontal `h` (unit) tilted `deg` up. */
const tilt = (h: Vec3, deg: number): Vec3 => add(scale(h, Math.cos(rad(deg))), scale(Z, Math.sin(rad(deg))));

const LABELS: Record<string, string> = {
  clubPath: 'Club path', swingH: 'H-plane', ftp: 'Face to path', aoa: 'Attack angle', lowPoint: 'Low point',
  swingV: 'V-plane', ftt: 'Face to target', launchH: 'Launch direction', dynamicLoft: 'Dynamic loft',
  launchV: 'Launch angle', spinLoft: 'Spin loft', spin: 'Spin', spinAxis: 'Spin axis',
};
const COLORS: Record<string, string> = {
  clubPath: CLUB, aoa: CLUB, lowPoint: CLUB, swingH: PLANE, swingV: PLANE, ftp: FACE, ftt: FACE, dynamicLoft: FACE,
  spinLoft: FACE, launchH: BALL, launchV: BALL, spin: INK, spinAxis: INK,
};
const fmt = (key: MeasurementKey, v: number | null) => (v === null ? null : formatMeasurement(key, v));

function badge(key: MeasurementKey, m: Measurements, note?: string): Badge {
  return { id: key, label: LABELS[key]!, text: fmt(key, m[key]), color: COLORS[key]!, ...(note ? { note } : {}) };
}

/** A wedge plus the label that names it, placed just past the arc on the bisector. */
function wedgeWithLabel(id: string, key: MeasurementKey, m: Measurements, from: Vec3, to: Vec3, radius: number): Annotation[] {
  const w: Wedge = { kind: 'wedge', id, color: COLORS[key]!, origin: ORIGIN, from, to, radius };
  const at = scale(normalize(add(normalize(from), normalize(to))), radius * 1.15);
  return [w, { kind: 'label', id: `${id}-label`, color: w.color, at, text: `${LABELS[key]} ${fmt(key, m[key])}` }];
}

/** The swing-plane vectors of replay.ts: u along the plane's ground line, s toward the golfer, w up the plane. */
function planeVectors(m: Measurements, handedness: 'right' | 'left') {
  const H = rad(m.swingH ?? 0), V = rad(m.swingV ?? 0), g = handedness === 'right' ? 1 : -1;
  const u: Vec3 = [Math.sin(H), Math.cos(H), 0];
  const s: Vec3 = [-Math.cos(H) * g, Math.sin(H) * g, 0];
  const w: Vec3 = add(scale(s, Math.cos(V)), scale(Z, Math.sin(V)));
  return { u, s, w };
}

/** Face normal for a face-to-target wedge: the measured FTT. */
const faceToTarget = (m: Measurements): Vec3 | null => (m.ftt === null ? null : heading(m.ftt));
/** Face normal for a face-to-path wedge: path + FTP, so the wedge reads FTP exactly even when FTT − path differs by rounding. */
const faceFromPath = (m: Measurements): Vec3 | null =>
  m.clubPath === null || m.ftp === null ? null : heading(m.clubPath + m.ftp);

const targetLine = (len = 3): Annotation =>
  ({ kind: 'line', id: 'target-line', color: MUTED, a: [0, -len, 0], b: [0, len, 0], dashed: true });

export function annotations3D(view: View3D, scene: ReplayScene, m: Measurements): Annotation[] {
  const out: Annotation[] = [];
  const { u, s, w } = planeVectors(m, scene.handedness);
  const path = m.clubPath === null ? null : heading(m.clubPath);
  switch (view) {
    case 'top': {
      out.push(targetLine());
      if (m.swingH !== null) {
        out.push({ kind: 'line', id: 'hplane-line', color: PLANE, a: scale(u, -1.6), b: scale(u, 1.6), dashed: true });
        out.push(...wedgeWithLabel('hplane', 'swingH', m, TARGET, u, 1.4));
      }
      if (path) out.push(...wedgeWithLabel('path', 'clubPath', m, TARGET, path, 1.1));
      const face = faceFromPath(m) ?? faceToTarget(m);
      if (face) out.push({ kind: 'line', id: 'face-normal', color: FACE, a: ORIGIN, b: scale(face, 0.5), width: 3 });
      const ftpFace = faceFromPath(m);
      if (path && ftpFace) out.push(...wedgeWithLabel('ftp', 'ftp', m, path, ftpFace, 0.7));
      break;
    }
    case 'faceOn': {
      const p = path ?? TARGET;
      out.push({ kind: 'line', id: 'level', color: MUTED, a: scale(p, -1.5), b: scale(p, 1.5), dashed: true });
      if (m.aoa !== null) {
        const a = tilt(p, m.aoa);
        out.push({ kind: 'line', id: 'attack-line', color: CLUB, a: scale(a, -0.8), b: scale(a, 1.6), dashed: true });
        out.push(...wedgeWithLabel('aoa', 'aoa', m, p, a, 1.2));
      }
      if (m.lowPoint !== null) {
        const at = scale(p, m.lowPoint / 36);
        out.push({ kind: 'line', id: 'low-point', color: CLUB, a: add(at, [0, 0, -0.08]), b: add(at, [0, 0, 0.08]), width: 3 });
        out.push({ kind: 'label', id: 'low-point-label', color: CLUB, at: add(at, [0, 0, -0.3]), text: `Low point ${fmt('lowPoint', m.lowPoint)}` });
      }
      break;
    }
    case 'dtl': {
      if (m.swingV !== null) {
        out.push({ kind: 'line', id: 'plane-line', color: PLANE, a: ORIGIN, b: scale(w, 2.2), dashed: true });
        out.push(...wedgeWithLabel('vplane', 'swingV', m, s, w, 0.6));
      }
      break;
    }
    case 'overview': {
      out.push(targetLine());
      const arc = scene.clubArc;
      if (arc && m.swingV !== null) {
        const top = arc.reduce((a, b) => (b[2] > a[2] ? b : a));
        out.push({ kind: 'label', id: 'vplane-label', color: PLANE, at: top, text: `V-plane ${fmt('swingV', m.swingV)}` });
      }
      if (m.swingH !== null) out.push({ kind: 'label', id: 'hplane-label', color: PLANE, at: scale(u, -1.2), text: `H-plane ${fmt('swingH', m.swingH)}` });
      const pathText = [m.clubPath === null ? null : `Path ${fmt('clubPath', m.clubPath)}`, m.aoa === null ? null : `Attack ${fmt('aoa', m.aoa)}`]
        .filter(Boolean).join(' · ');
      if (pathText) out.push({ kind: 'label', id: 'path-label', color: CLUB, at: scale(path ?? TARGET, 0.9), text: pathText });
      break;
    }
  }
  return out;
}

export function annotations2D(view: View2D, m: Measurements): Annotation[] {
  const out: Annotation[] = [];
  const path = m.clubPath === null ? null : heading(m.clubPath);
  switch (view) {
    case 'ftt':
    case 'ftp': {
      out.push(targetLine(0.5));
      const face = view === 'ftt' ? faceToTarget(m) : faceFromPath(m) ?? faceToTarget(m);
      if (face) {
        const edge: Vec3 = [face[1], -face[0], 0]; // along the leading edge, perpendicular to the face normal
        out.push({ kind: 'line', id: 'face-edge', color: FACE, a: scale(edge, -0.06), b: scale(edge, 0.06), width: 3 });
      }
      if (path) out.push({ kind: 'line', id: 'path-line', color: CLUB, a: scale(path, -0.12), b: scale(path, 0.12), width: 3 });
      if (m.launchH !== null) out.push({ kind: 'line', id: 'launch-line', color: BALL, a: ORIGIN, b: scale(heading(m.launchH), 0.14), width: 3 });
      if (view === 'ftt' && m.ftt !== null) out.push(...wedgeWithLabel('ftt', 'ftt', m, TARGET, heading(m.ftt), 0.07));
      const ftpFace = faceFromPath(m);
      if (view === 'ftp' && path && ftpFace) out.push(...wedgeWithLabel('ftp', 'ftp', m, path, ftpFace, 0.07));
      break;
    }
    case 'loft': {
      const p = path ?? TARGET;
      out.push({ kind: 'line', id: 'ground', color: MUTED, a: scale(p, -0.3), b: scale(p, 0.3) });
      if (m.dynamicLoft !== null) {
        const up = add(scale(p, -Math.sin(rad(m.dynamicLoft))), scale(Z, Math.cos(rad(m.dynamicLoft))));
        out.push({ kind: 'line', id: 'face-plane', color: FACE, a: scale(up, -0.08), b: scale(up, 0.1), width: 3 });
        out.push(...wedgeWithLabel('loft', 'dynamicLoft', m, Z, up, 0.05));
      }
      if (m.aoa !== null) {
        const a = tilt(p, m.aoa);
        out.push({ kind: 'line', id: 'attack-line', color: CLUB, a: scale(a, -0.12), b: ORIGIN, width: 3 });
      }
      if (m.launchV !== null) {
        const l = tilt(p, m.launchV);
        out.push({ kind: 'line', id: 'launch-line', color: BALL, a: ORIGIN, b: scale(l, 0.14), width: 3 });
        out.push(...wedgeWithLabel('launch', 'launchV', m, p, l, 0.06));
      }
      break;
    }
    case 'spinAxis': {
      out.push({ kind: 'line', id: 'level', color: MUTED, a: [-0.1, 0, 0], b: [0.1, 0, 0], dashed: true });
      if (m.spinAxis !== null) {
        const a = rad(m.spinAxis);
        const d: Vec3 = [Math.cos(a), 0, -Math.sin(a)]; // positive (R) tilts the right end down
        out.push({ kind: 'line', id: 'spin-axis', color: INK, a: scale(d, -0.09), b: scale(d, 0.09), width: 3 });
      }
      break;
    }
  }
  return out;
}

export function badges3D(view: View3D, m: Measurements): Badge[] {
  switch (view) {
    case 'top': return [badge('clubPath', m), badge('swingH', m), badge('ftp', m)];
    case 'faceOn': return [badge('aoa', m), badge('lowPoint', m)];
    case 'dtl': return [badge('swingV', m)];
    case 'overview': return [badge('clubPath', m), badge('swingH', m), badge('swingV', m), badge('aoa', m), badge('ftp', m)];
  }
}

export function badges2D(view: View2D, m: Measurements): Badge[] {
  switch (view) {
    case 'ftt': return [badge('ftt', m), badge('launchH', m), badge('clubPath', m)];
    case 'ftp': return [badge('ftp', m), badge('launchH', m), badge('clubPath', m)];
    case 'loft': return [badge('dynamicLoft', m), badge('launchV', m), badge('aoa', m), badge('spinLoft', m, 'as reported')];
    case 'spinAxis': return [badge('spin', m), badge('spinAxis', m)];
  }
}

/** The angle between a wedge's edges as drawn through an orthographic camera, in degrees. */
export function apparentWedgeDeg(w: Wedge, cam: ViewCamera): number {
  const { right, up } = screenBasis(cam);
  const a = Math.atan2(dot(w.from, up), dot(w.from, right));
  const b = Math.atan2(dot(w.to, up), dot(w.to, right));
  let d = Math.abs(b - a) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}
