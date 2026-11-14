import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements } from '@fsa/domain';
import { COMPARE_SCALE, compareShots } from './compare';

function blank(): Measurements {
  return Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements;
}

describe('compareShots', () => {
  test('returns one row per measurement', () => {
    const m = blank();
    expect(compareShots(m, [m]).length).toBe(27);
  });

  test('each delta is that shot minus the baseline', () => {
    const base = { ...blank(), spin: 2410 };
    const b = { ...blank(), spin: 2980 };
    const c = { ...blank(), spin: 2300 };
    const row = compareShots(base, [b, c]).find((r) => r.key === 'spin')!;
    expect(row.base).toBe(2410);
    expect(row.values).toEqual([2980, 2300]);
    expect(row.deltas).toEqual([570, -110]);
  });

  test('sorts by change relative to the metric scale', () => {
    const base = { ...blank(), spin: 2410, carry: 248, clubPath: 2.1 };
    const b = { ...blank(), spin: 2980, carry: 236, clubPath: -1.8 };
    const keys = compareShots(base, [b]).map((r) => r.key);
    expect(keys.slice(0, 3)).toEqual(['clubPath', 'carry', 'spin']);
  });

  test('with several shots, the row score is the biggest scaled change from the baseline', () => {
    const base = { ...blank(), carry: 200, spin: 2500 };
    const b = { ...blank(), carry: 204, spin: 2600 }; // carry 0.5, spin 0.25
    const c = { ...blank(), carry: 201, spin: 3700 }; // carry 0.125, spin 3
    const rows = compareShots(base, [b, c]);
    expect(rows.map((r) => r.key).slice(0, 2)).toEqual(['spin', 'carry']);
    expect(rows[0]?.score).toBe(3);
    expect(rows[1]?.score).toBe(0.5);
  });

  test('a shot missing a value gets no delta, but the others still score the row', () => {
    const base = { ...blank(), carry: 200 };
    const b = { ...blank(), carry: null };
    const c = { ...blank(), carry: 216 };
    const row = compareShots(base, [b, c]).find((r) => r.key === 'carry')!;
    expect(row.deltas).toEqual([null, 16]);
    expect(row.score).toBe(2);
  });

  test('a missing baseline gives no deltas and sorts last', () => {
    const base = { ...blank(), impactLateral: null, carry: 200 };
    const b = { ...blank(), impactLateral: 0.31, carry: 190 };
    const rows = compareShots(base, [b]);
    const missing = rows.find((r) => r.key === 'impactLateral')!;
    expect(missing.deltas).toEqual([null]);
    expect(missing.score).toBeNull();
    const lastScoredIndex = rows.reduce((acc, r, i) => (r.score !== null ? i : acc), -1);
    expect(rows.indexOf(missing)).toBeGreaterThan(lastScoredIndex);
  });

  test('rows without a score keep field order', () => {
    const m = blank();
    expect(compareShots(m, [m, m]).map((r) => r.key)).toEqual([...MEASUREMENT_KEYS]);
  });

  test('zero change is a real row', () => {
    const base = { ...blank(), carry: 200 };
    const rows = compareShots(base, [{ ...blank(), carry: 200 }]);
    const carry = rows.find((r) => r.key === 'carry')!;
    expect(carry.deltas).toEqual([0]);
    expect(carry.score).toBe(0);
    expect(rows.indexOf(carry)).toBeLessThan(rows.findIndex((r) => r.score === null));
  });

  test('non-finite numbers are treated as missing', () => {
    const base = { ...blank(), carry: Number.NaN, spin: 2500 };
    const b = { ...blank(), carry: 200, spin: Number.POSITIVE_INFINITY };
    const rows = compareShots(base, [b]);
    const carry = rows.find((r) => r.key === 'carry')!;
    const spin = rows.find((r) => r.key === 'spin')!;
    expect(carry.base).toBeNull();
    expect(spin.values).toEqual([null]);
    for (const row of [carry, spin]) {
      expect(row.deltas).toEqual([null]);
      expect(row.score).toBeNull();
    }
  });

  test('has a positive scale for every key', () => {
    for (const k of MEASUREMENT_KEYS) expect(COMPARE_SCALE[k]).toBeGreaterThan(0);
  });
});
