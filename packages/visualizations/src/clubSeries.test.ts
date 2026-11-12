import { expect, test } from 'vitest';
import { CLUB_SERIES, clubColors, patternXMax } from './clubSeries';

test('clubColors assigns palette slots in bag order, whatever order clubs arrive in', () => {
  const m = clubColors(['7 Iron', 'Gap Wedge', 'Driver', '7 Iron']);
  expect([...m.keys()]).toEqual(['Driver', '7 Iron', 'Gap Wedge']);
  expect([...m.values()]).toEqual([CLUB_SERIES[0], CLUB_SERIES[1], CLUB_SERIES[2]]);
});

test('past eight clubs the slots repeat, eight clubs apart', () => {
  const bag = ['Driver', '3 Wood', '5 Wood', '4 Hybrid', '5 Iron', '6 Iron', '7 Iron', '8 Iron', '9 Iron', 'Pitching Wedge'];
  const m = clubColors(bag);
  expect(m.get('9 Iron')).toBe(m.get('Driver'));
  expect(m.get('Pitching Wedge')).toBe(m.get('3 Wood'));
  expect(new Set(bag.slice(0, 8).map((c) => m.get(c))).size).toBe(8);
});

test('patternXMax rounds just past the longest shot', () => {
  expect(patternXMax(277.8)).toBe(300);
  expect(patternXMax(96)).toBe(100);
  expect(patternXMax(140)).toBeGreaterThanOrEqual(140 * 1.04);
});
