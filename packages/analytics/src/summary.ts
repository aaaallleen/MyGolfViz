import type { Shot } from '@fsa/domain';

export interface Summary { n: number; of: number; mean: number | null; sd: number | null; min: number | null; max: number | null }

/** Population statistics (divide by n). sd is null when n < 2. */
export function summarize(values: readonly (number | null)[]): Summary {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { n: 0, of: values.length, mean: null, sd: null, min: null, max: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n < 2 ? null : Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { n, of: values.length, mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
}

export type HeadlineKey = 'carry' | 'total' | 'ballSpeed' | 'clubSpeed' | 'smash' | 'spin' | 'lateral' | 'clubPath';
export const HEADLINE_KEYS: readonly HeadlineKey[] = [
  'carry', 'total', 'ballSpeed', 'clubSpeed', 'smash', 'spin', 'lateral', 'clubPath',
];

export function headlineMetrics(shots: readonly Shot[]): Record<HeadlineKey, Summary> {
  const out = {} as Record<HeadlineKey, Summary>;
  for (const key of HEADLINE_KEYS) out[key] = summarize(shots.map((s) => s.m[key]));
  return out;
}
