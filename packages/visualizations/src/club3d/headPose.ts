import type { Measurements, Vec3 } from '@fsa/domain';
import type { ReplayScene } from '@fsa/analytics';

export interface HeadPose {
  /** Unit normal out of the face (toward the target, tilted up by the loft). */
  faceNormal: Vec3;
  /** Unit direction up the shaft from the hosel. */
  shaftDir: Vec3;
  /** Unit direction from heel to toe, in the face plane, pointing away from the golfer. */
  toeDir: Vec3;
  /** Measured contact point in inches from the face centre (toe +, high +); null unless both were measured. */
  strike: { lateralIn: number; verticalIn: number } | null;
  /** True when dynamic loft was not measured: the head is drawn at its static loft, soled. */
  flat: boolean;
}

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/**
 * Club head orientation and contact point at impact from the measurements. A missing face angle is square, a
 * missing loft is the head's static loft and a missing plane is the head's lie; none of these is shown in a label.
 */
export function headPose(m: Measurements, scene: ReplayScene, head: { loftDeg: number; lieDeg: number }): HeadPose {
  const g = scene.handedness === 'right' ? 1 : -1;
  const ftt = rad(m.ftt ?? 0), loft = rad(m.dynamicLoft ?? head.loftDeg);
  const faceNormal: Vec3 = [Math.sin(ftt) * Math.cos(loft), Math.cos(ftt) * Math.cos(loft), Math.sin(loft)];
  // Without a full plane, still honour a measured V-plane (as the Down the line wedge does) before the head's lie.
  const lie = rad(m.swingV ?? head.lieDeg);
  const shaftDir: Vec3 = scene.plane
    ? normalize(scene.plane.w)
    : [-g * Math.cos(lie), 0, Math.sin(lie)];
  // Heel-to-toe is the face's horizontal leading edge (sole level), pointing away from the golfer.
  let toe = normalize(cross(faceNormal, [0, 0, 1]));
  if (dot(toe, [g, 0, 0]) < 0) toe = scale(toe, -1);
  const strike = m.impactLateral !== null && m.impactVertical !== null
    ? { lateralIn: m.impactLateral, verticalIn: m.impactVertical }
    : null;
  return { faceNormal, shaftDir, toeDir: toe, strike, flat: m.dynamicLoft === null };
}

/** Centre of the circle through the arc (circumcentre of its first, middle and last points). */
export function arcCenter(arc: Vec3[]): Vec3 {
  const a = arc[0]!, b = arc[Math.floor(arc.length / 2)]!, c = arc[arc.length - 1]!;
  const ab = sub(b, a), ac = sub(c, a);
  const n = cross(ab, ac);
  const n2 = dot(n, n);
  const t1 = scale(cross(n, ab), dot(ac, ac));
  const t2 = scale(cross(ac, n), dot(ab, ab));
  return add(a, scale(add(t1, t2), 1 / (2 * n2)));
}

export interface OutlineSegment { op: 'M' | 'L' | 'C' | 'Z'; pts: [number, number][] }

/** Parses the absolute M/L/C/Z path data used by FACE_OUTLINES. */
export function parseOutline(d: string): OutlineSegment[] {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: OutlineSegment[] = [];
  const counts = { M: 1, L: 1, C: 3, Z: 0 } as const;
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++]!.toUpperCase() as OutlineSegment['op'];
    if (!(op in counts)) throw new Error(`Unsupported path command ${op}`);
    const pts: [number, number][] = [];
    for (let k = 0; k < counts[op]; k++) pts.push([Number(tokens[i++]), Number(tokens[i++])]);
    out.push({ op, pts });
  }
  return out;
}
