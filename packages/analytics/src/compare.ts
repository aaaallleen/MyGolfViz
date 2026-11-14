import { MEASUREMENT_KEYS, type MeasurementKey, type Measurements } from '@fsa/domain';

/** Typical shot-to-shot spread for one club, in the metric's own unit. A change of one scale is a score of 1. */
export const COMPARE_SCALE: Readonly<Record<MeasurementKey, number>> = {
  ballSpeed: 3, clubSpeed: 2, smash: 0.03, carry: 8, total: 10, roll: 5, swingH: 2, spin: 400,
  height: 8, flightTime: 0.4, aoa: 1.5, spinLoft: 2, swingV: 2, spinAxis: 3, lateral: 8, ftp: 1.5,
  ftt: 1.5, dynamicLoft: 2, clubPath: 2, launchH: 2, launchV: 1.5, lowPoint: 2, descentV: 3, curve: 6,
  impactLateral: 0.3, impactVertical: 0.3, altitude: 200,
};

export interface CompareRow {
  key: MeasurementKey;
  a: number | null;
  b: number | null;
  delta: number | null;
  score: number | null;
}

const finiteOrNull = (v: number | null): number | null => (v !== null && Number.isFinite(v) ? v : null);

/** One row per measurement, biggest scaled change first. Missing sides sort last, in field order. */
export function compareShots(a: Measurements, b: Measurements): CompareRow[] {
  const rows: CompareRow[] = MEASUREMENT_KEYS.map((key) => {
    const av = finiteOrNull(a[key]);
    const bv = finiteOrNull(b[key]);
    if (av === null || bv === null) return { key, a: av, b: bv, delta: null, score: null };
    const delta = av - bv;
    return { key, a: av, b: bv, delta, score: Math.abs(delta) / COMPARE_SCALE[key] };
  });
  const scored = rows
    .filter((r) => r.score !== null)
    .sort((x, y) => (y.score as number) - (x.score as number));
  return [...scored, ...rows.filter((r) => r.score === null)];
}
