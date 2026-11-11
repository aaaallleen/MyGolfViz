import { expect, test } from 'vitest';
import { toCanonical } from './index';

test.each([
  [100, 'm', 'yd', 109.3613],
  [160, 'km/h', 'mph', 99.4194],
  [25.4, 'mm', 'in', 1],
  [10, 'yds', 'yd', 10],
  [5, '°', 'deg', 5],
  [1.25, null, 'none', 1.25],
  [5, 'furlongs', 'yd', null],
  [5, null, 'rpm', null],
] as const)('toCanonical(%d,%j,%s)', (v, src, canon, expected) => {
  const r = toCanonical(v, src, canon);
  if (expected === null) expect(r).toBeNull();
  else expect(r).toBeCloseTo(expected, 4);
});
