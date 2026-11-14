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
  /** The baseline shot's value (shot A). */
  base: number | null;
  /** Each other shot's value, in slot order (B, C, D). */
  values: (number | null)[];
  /** Each other shot's value minus the baseline; null when either side is missing. */
  deltas: (number | null)[];
  /** The biggest |delta| / scale across the other shots; null when no shot has a delta. */
  score: number | null;
}

const finiteOrNull = (v: number | null): number | null => (v !== null && Number.isFinite(v) ? v : null);

/** One row per measurement, against the baseline; biggest scaled change first. Rows with no change to measure sort last, in field order. */
export function compareShots(base: Measurements, others: readonly Measurements[]): CompareRow[] {
  const rows: CompareRow[] = MEASUREMENT_KEYS.map((key) => {
    const bv = finiteOrNull(base[key]);
    const values = others.map((o) => finiteOrNull(o[key]));
    const deltas = values.map((v) => (v === null || bv === null ? null : v - bv));
    const scores = deltas.filter((d): d is number => d !== null).map((d) => Math.abs(d) / COMPARE_SCALE[key]);
    return { key, base: bv, values, deltas, score: scores.length ? Math.max(...scores) : null };
  });
  const scored = rows
    .filter((r) => r.score !== null)
    .sort((x, y) => (y.score as number) - (x.score as number));
  return [...scored, ...rows.filter((r) => r.score === null)];
}
