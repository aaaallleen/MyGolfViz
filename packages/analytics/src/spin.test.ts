import { expect, test } from 'vitest';
import { spinAxisVector, spinComponents } from './spin';

test('spinComponents', () => {
  const a = spinComponents(3000, 10);
  expect(a.backspin).toBeCloseTo(2954.42, 2);
  expect(a.sidespin).toBeCloseTo(520.94, 2);
  expect(spinComponents(3000, -10).sidespin).toBeCloseTo(-520.94, 2);
  expect(spinComponents(null, 10)).toEqual({ backspin: null, sidespin: null });
  expect(spinComponents(3000, null)).toEqual({ backspin: null, sidespin: null });
});

test('spinAxisVector', () => {
  const z = spinAxisVector(0);
  expect(z[0]).toBeCloseTo(1, 9);
  expect(z[1]).toBe(0);
  expect(Math.abs(z[2])).toBeCloseTo(0, 9);
  const v = spinAxisVector(10);
  expect(v[0]).toBeCloseTo(0.98481, 5);
  expect(v[1]).toBe(0);
  expect(v[2]).toBeCloseTo(-0.17365, 5);
  // cross(v, (0,1,0)).x = v.y*0 - v.z*1 = -v.z
  const crossX = v[1] * 0 - v[2] * 1;
  expect(crossX).toBeGreaterThan(0);
});
