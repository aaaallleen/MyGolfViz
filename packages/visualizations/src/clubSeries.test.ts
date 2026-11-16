import { expect, test } from 'vitest';
import type { DispersionStats } from '@fsa/analytics';
import { CLUB_SERIES, clubColors, patternReach, patternXMax } from './clubSeries';

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

test('patternReach counts each ellipse box as well as the dots, on both axes', () => {
  const stats = (points: { x: number; y: number }[], ellipse: DispersionStats['ellipse']) =>
    ({ points: points.map((p, i) => ({ shotId: `p${i}`, ...p })), ellipse }) as DispersionStats;
  // Dots reach 255 yd and 12 yd left; the ellipse box reaches 230 + 60 = 290 yd and |−5| + 20 = 25 yd.
  const far = stats([{ x: -12, y: 255 }, { x: 4, y: 120 }], { cx: -5, cy: 230, rx: 60, ry: 20, angleDeg: 0, halfX: 20, halfY: 60 });
  // A short club: dots only, no ellipse.
  const wedge = stats([{ x: 3, y: 100 }], null);
  expect(patternReach([{ stats: far }, { stats: wedge }])).toEqual({ distance: 290, lateral: 25 });
  expect(patternReach([{ stats: wedge }])).toEqual({ distance: 100, lateral: 3 });
  expect(patternReach([])).toEqual({ distance: 0, lateral: 0 });
});
