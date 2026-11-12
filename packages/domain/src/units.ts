import type { Unit } from './types';

const FACTORS: Record<Exclude<Unit, 'none'>, Record<string, number>> = {
  yd: { yds: 1, yd: 1, yards: 1, m: 1.0936133, meters: 1.0936133, metres: 1.0936133 },
  mph: { mph: 1, 'km/h': 0.6213712, kph: 0.6213712, 'm/s': 2.2369363 },
  ft: { ft: 1, feet: 1, m: 3.2808399 },
  in: { in: 1, inch: 1, inches: 1, ftin: 1, mm: 1 / 25.4, cm: 1 / 2.54 },
  deg: { '°': 1, deg: 1, degrees: 1 },
  rpm: { rpm: 1 },
  s: { s: 1, sec: 1, seconds: 1 },
};

export function toCanonical(value: number, sourceUnit: string | null, canonical: Unit): number | null {
  if (canonical === 'none') return sourceUnit === null ? value : null;
  if (sourceUnit === null) return null;
  const factor = FACTORS[canonical][sourceUnit.trim().toLowerCase()];
  return factor === undefined ? null : value * factor;
}
