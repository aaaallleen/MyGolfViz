import type { Handedness, MeasurementKey, Measurements, Shot, Vec3 } from '@fsa/domain';
import { buildReplayScene, type ReplayScene } from '@fsa/analytics';

const KEYS: MeasurementKey[] = [
  'ballSpeed', 'clubSpeed', 'smash', 'carry', 'total', 'roll', 'swingH', 'spin', 'height', 'flightTime', 'aoa',
  'spinLoft', 'swingV', 'spinAxis', 'lateral', 'ftp', 'ftt', 'dynamicLoft', 'clubPath', 'launchH', 'launchV',
  'lowPoint', 'descentV', 'curve', 'impactLateral', 'impactVertical', 'altitude',
];

/** Full measurements record with every key null except the ones given. */
export function mOf(partial: Partial<Measurements>): Measurements {
  const m = Object.fromEntries(KEYS.map((k) => [k, null])) as Measurements;
  return { ...m, ...partial };
}

/** The 7 iron from the FlightScope reference screenshots. */
export const REF_M = mOf({
  swingH: 6, swingV: 60.7, aoa: -4, clubPath: 8.3, ftp: 3.6, ftt: 11.8, dynamicLoft: 40.9,
  launchV: 26, launchH: 5.7, spinAxis: 2.6, spin: 3253, spinLoft: 44.9, lowPoint: 2.5,
});

export function sceneOf(m: Measurements, handedness: Handedness = 'right', id = 's'): ReplayScene {
  return buildReplayScene({ id, fileId: 'f', sourceRow: 1, m } as unknown as Shot, handedness);
}

export const rad = (d: number) => (d * Math.PI) / 180;
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const pathDir = (d: number): Vec3 => [Math.sin(rad(d)), Math.cos(rad(d)), 0];
