import { expect, test } from 'vitest';
import { niceTicks } from './scale';

test('niceTicks(0,100,5) → [0,20,40,60,80,100]; (−30,30,4) → [−20,0,20]; (193.6,255.4,4) → [200,220,240]', () => {
  expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  expect(niceTicks(-30, 30, 4)).toEqual([-20, 0, 20]);
  expect(niceTicks(193.6, 255.4, 4)).toEqual([200, 220, 240]);
});
