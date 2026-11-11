import type { Handedness, Shot, Vec3 } from '@fsa/domain';
import { trajectoryCurve } from './trajectory';

/** Illustrative geometry built from impact measurements; not captured swing motion.
 *  Scene coordinates in yards: x lateral (right +), y downrange (target +), z up; ball at origin. */
export const CLUB_ARC_RADIUS_YD = 1.7;

export interface ReplayScene {
  shotId: string;
  handedness: Handedness;
  plane: { u: Vec3; w: Vec3; vPlaneDeg: number } | null;
  clubArc: Vec3[] | null;
  impactIndex: number;
  faceDirection: Vec3 | null;
  ballFlight: Vec3[] | null;
  landing: Vec3 | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const ARC_SAMPLES = 41;
const FLIGHT_SAMPLES = 61;

export function buildReplayScene(shot: Shot, handedness: Handedness): ReplayScene {
  const { swingH, swingV, aoa, ftt, carry, lateral, launchH } = shot.m;
  const scene: ReplayScene = {
    shotId: shot.id, handedness, plane: null, clubArc: null, impactIndex: 25,
    faceDirection: null, ballFlight: null, landing: null,
  };

  if (swingH !== null && swingV !== null) {
    const H = rad(swingH), V = rad(swingV), R = CLUB_ARC_RADIUS_YD;
    const g = handedness === 'right' ? 1 : -1;
    const u: Vec3 = [Math.sin(H), Math.cos(H), 0];
    const s: Vec3 = [-Math.cos(H) * g, Math.sin(H) * g, 0];
    const w: Vec3 = [Math.cos(V) * s[0], Math.cos(V) * s[1], Math.sin(V)];
    const thetaB = aoa === null ? 0 : Math.asin(clamp(Math.sin(rad(aoa)) / Math.sin(V), -1, 1));
    const c: Vec3 = [0, 1, 2].map((i) => R * (Math.cos(thetaB) * w[i]! - Math.sin(thetaB) * u[i]!)) as Vec3;
    const arc: Vec3[] = [];
    for (let i = 0; i < ARC_SAMPLES; i++) {
      const th = thetaB + rad(-100 + 4 * i);
      arc.push([0, 1, 2].map((k) => c[k]! + R * (-Math.cos(th) * w[k]! + Math.sin(th) * u[k]!)) as Vec3);
    }
    scene.plane = { u, w, vPlaneDeg: swingV };
    scene.clubArc = arc;
  }

  if (ftt !== null) scene.faceDirection = [Math.sin(rad(ftt)), Math.cos(rad(ftt)), 0];

  const curve = trajectoryCurve(shot);
  if (carry !== null && lateral !== null && launchH !== null && curve) {
    const Yl = Math.sqrt(Math.max(carry * carry - lateral * lateral, 0));
    const qx = (Math.tan(rad(launchH)) * Yl) / 2, qy = Yl / 2;
    const flight: Vec3[] = [];
    for (let i = 0; i < FLIGHT_SAMPLES; i++) {
      const t = i / (FLIGHT_SAMPLES - 1), u = 1 - t;
      const x = 2 * u * t * qx + t * t * lateral;
      const y = 2 * u * t * qy + t * t * Yl;
      const z = 3 * u * u * t * curve.p1[1] + 3 * u * t * t * curve.p2[1];
      flight.push([x, y, z]);
    }
    scene.ballFlight = flight;
    scene.landing = [lateral, Yl, 0];
  }
  return scene;
}

export type ReplayPhase = 'Downswing' | 'Impact' | 'Ball flight' | 'Landing';

export function replayPhase(progress: number): ReplayPhase {
  if (progress < 0.30) return 'Downswing';
  if (progress < 0.34) return 'Impact';
  if (progress < 0.95) return 'Ball flight';
  return 'Landing';
}

/** Fractional-index interpolation along a polyline between indices a and b. */
function along(pts: Vec3[], a: number, b: number, f: number): Vec3 {
  const x = a + (b - a) * f;
  const i = Math.min(Math.floor(x), pts.length - 2), r = x - i;
  const p = pts[i]!, q = pts[i + 1]!;
  return [p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r, p[2] + (q[2] - p[2]) * r];
}

export function replayFrame(scene: ReplayScene, progress: number): { clubHead: Vec3 | null; ball: Vec3 } {
  const origin: Vec3 = [0, 0, 0];
  const p = clamp(progress, 0, 1);
  const phase = replayPhase(p);
  const arc = scene.clubArc;
  if (phase === 'Downswing') {
    return { clubHead: arc ? along(arc, 0, scene.impactIndex, p / 0.30) : null, ball: origin };
  }
  if (phase === 'Impact') return { clubHead: arc ? origin : null, ball: origin };
  const clubHead = arc ? arc[arc.length - 1]! : null;
  if (phase === 'Ball flight') {
    const fl = scene.ballFlight;
    return { clubHead, ball: fl ? along(fl, 0, fl.length - 1, (p - 0.34) / 0.61) : origin };
  }
  return { clubHead, ball: scene.landing ?? origin };
}
