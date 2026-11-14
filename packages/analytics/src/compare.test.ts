import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements } from '@fsa/domain';
import { COMPARE_SCALE, compareShots } from './compare';

function blank(): Measurements {
  return Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements;
}

describe('compareShots', () => {
  test('returns one row per measurement', () => {
    const m = blank();
    expect(compareShots(m, m).length).toBe(27);
  });

  test('delta is A minus B', () => {
    const a = { ...blank(), spin: 2410 };
    const b = { ...blank(), spin: 2980 };
    const row = compareShots(a, b).find((r) => r.key === 'spin');
    expect(row?.delta).toBe(-570);
    expect(row?.a).toBe(2410);
    expect(row?.b).toBe(2980);
  });

  test('sorts by change relative to the metric scale', () => {
    const a = { ...blank(), spin: 2410, carry: 248, clubPath: 2.1 };
    const b = { ...blank(), spin: 2980, carry: 236, clubPath: -1.8 };
    const keys = compareShots(a, b).map((r) => r.key);
    expect(keys.slice(0, 3)).toEqual(['clubPath', 'carry', 'spin']);
  });

  test('a missing side gives n/a and sorts last', () => {
    const a = { ...blank(), impactLateral: 0.31, carry: 200 };
    const b = { ...blank(), impactLateral: null, carry: 190 };
    const rows = compareShots(a, b);
    const missing = rows.find((r) => r.key === 'impactLateral');
    expect(missing?.delta).toBeNull();
    expect(missing?.score).toBeNull();
    const lastScoredIndex = rows.reduce((acc, r, i) => (r.score !== null ? i : acc), -1);
    const missingIndex = rows.findIndex((r) => r.key === 'impactLateral');
    expect(missingIndex).toBeGreaterThan(lastScoredIndex);
  });

  test('rows without a score keep field order', () => {
    const m = blank();
    expect(compareShots(m, m).map((r) => r.key)).toEqual([...MEASUREMENT_KEYS]);
  });

  test('zero change is a real row', () => {
    const a = { ...blank(), carry: 200 };
    const b = { ...blank(), carry: 200 };
    const rows = compareShots(a, b);
    const carry = rows.find((r) => r.key === 'carry');
    expect(carry?.delta).toBe(0);
    expect(carry?.score).toBe(0);
    const carryIndex = rows.findIndex((r) => r.key === 'carry');
    const firstNullIndex = rows.findIndex((r) => r.score === null);
    expect(carryIndex).toBeLessThan(firstNullIndex);
  });

  test('non-finite numbers are treated as missing', () => {
    const a = { ...blank(), carry: Number.NaN, spin: Number.POSITIVE_INFINITY };
    const b = { ...blank(), carry: 200, spin: 2500 };
    const rows = compareShots(a, b);
    for (const key of ['carry', 'spin'] as const) {
      const row = rows.find((r) => r.key === key);
      expect(row?.delta).toBeNull();
      expect(row?.score).toBeNull();
    }
  });

  test('has a positive scale for every key', () => {
    for (const k of MEASUREMENT_KEYS) expect(COMPARE_SCALE[k]).toBeGreaterThan(0);
  });
});
