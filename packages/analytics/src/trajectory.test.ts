import { describe, expect, test } from 'vitest';
import { trajectoryCurve } from './trajectory';
import { SEPT_19_2022, fixtureShots } from '../test/fixtureShots';

describe('trajectoryCurve', () => {
  test('Sept 19 2022 row 2', () => {
    const shot = fixtureShots(SEPT_19_2022).find((s) => s.sourceRow === 2)!;
    const c = trajectoryCurve(shot)!;
    expect(c.shotId).toBe(shot.id);
    expect(c.p0).toEqual([0, 0]);
    expect(c.p3[0]).toBeCloseTo(198.9, 6);
    expect(c.p3[1]).toBe(0);
    let peak = 0;
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000, u = 1 - t;
      peak = Math.max(peak, 3 * u * u * t * c.p1[1] + 3 * u * t * t * c.p2[1]);
    }
    expect(Math.abs(peak - 49.9) / 49.9).toBeLessThan(0.01);
    const deg = (r: number) => (r * 180) / Math.PI;
    expect(deg(Math.atan2(c.p1[1], c.p1[0]))).toBeCloseTo(19.1, 1);
    expect(deg(Math.atan2(c.p2[1], c.p3[0] - c.p2[0]))).toBeCloseTo(54.6, 1);
  });
  test('null when descentV is null', () => {
    const shot = fixtureShots(SEPT_19_2022).find((s) => s.sourceRow === 2)!;
    expect(trajectoryCurve({ ...shot, m: { ...shot.m, descentV: null } })).toBeNull();
  });
});
