import { describe, expect, test } from 'vitest';
import type { Measurements, Shot } from '@fsa/domain';
import { EXPECTED_1SIGMA_COVERAGE, dispersionByClub, dispersionStats } from './dispersion';
import { SEPT_19_2022, fixtureShots } from '../test/fixtureShots';

function synth(points: [number | null, number | null][], club = 'X'): Shot[] {
  return points.map(([x, y], i) => ({
    id: `${club}${i}`, fileId: 'f', sourceRow: i + 2, shotLabel: null, club, shotType: null, mode: null,
    location: null, raw: {}, flags: [],
    m: { lateral: x, carry: y, total: y } as Measurements,
  }));
}

describe('dispersionStats', () => {
  test('Sept 19 2022 carry', () => {
    const d = dispersionStats(fixtureShots(SEPT_19_2022), 'carry');
    expect(d.points).toHaveLength(16);
    expect(d.excluded).toBe(0);
    expect(d.centroid!.x).toBeCloseTo(35.219, 3);
    expect(d.centroid!.y).toBeCloseTo(201.406, 3);
    expect(d.meanAbsLateral!).toBeCloseTo(42.294, 3);
    expect(d.sdX!).toBeCloseTo(33.815, 3);
    expect(d.sdY!).toBeCloseTo(38.55, 3);
    expect(d.ellipse!.rx).toBeCloseTo(39.672, 3);
    expect(d.ellipse!.ry).toBeCloseTo(32.492, 3);
    expect(Math.abs(d.ellipse!.angleDeg - 65.7)).toBeLessThanOrEqual(0.05);
    expect(d.observedInside).toBe(6);
    expect(d.expectedCoverage).toBeCloseTo(0.3935, 3);
    expect(EXPECTED_1SIGMA_COVERAGE).toBeCloseTo(0.3935, 3);
  });
  test('Sept 19 2022 total', () => {
    const d = dispersionStats(fixtureShots(SEPT_19_2022), 'total');
    expect(d.centroid!.y).toBeCloseTo(211.931, 3);
    expect(d.ellipse!.rx).toBeCloseTo(38.93, 3);
    expect(d.ellipse!.ry).toBeCloseTo(32.35, 3);
    expect(Math.abs(d.ellipse!.angleDeg - 62.96)).toBeLessThanOrEqual(0.05);
    expect(d.observedInside).toBe(6);
  });
  test('synthetic (−1,0),(1,0),(0,−2),(0,2)', () => {
    const d = dispersionStats(synth([[-1, 0], [1, 0], [0, -2], [0, 2]]), 'carry');
    expect(d.ellipse!.rx).toBeCloseTo(Math.SQRT2, 6);
    expect(d.ellipse!.ry).toBeCloseTo(Math.sqrt(0.5), 6);
    expect(d.ellipse!.angleDeg).toBeCloseTo(90, 6);
  });
  test('fewer than 3 points or collinear → ellipse null; all-null lateral → empty', () => {
    expect(dispersionStats(synth([[0, 1], [1, 2]]), 'carry').ellipse).toBeNull();
    expect(dispersionStats(synth([[0, 0], [1, 1], [2, 2], [3, 3]]), 'carry').ellipse).toBeNull();
    const d = dispersionStats(synth([[null, 5], [null, 6]]), 'carry');
    expect(d.points).toEqual([]);
    expect(d.centroid).toBeNull();
    expect(d.excluded).toBe(2);
  });
});

describe('dispersionByClub', () => {
  test('one entry per club in bag order, each with its own stats', () => {
    const shots = [
      ...synth([[1, 150], [3, 160], [-2, 155]], '7 Iron'),
      ...synth([[10, 240], [-10, 250], [5, 260], [0, 245]], 'Driver'),
      ...synth([[2, 100]], 'Gap Wedge'),
    ];
    const by = dispersionByClub(shots, 'carry');
    expect(by.map((g) => g.club)).toEqual(['Driver', '7 Iron', 'Gap Wedge']);
    expect(by[0]!.stats.points).toHaveLength(4);
    expect(by[0]!.stats.centroid!.y).toBeCloseTo(248.75, 6);
    expect(by[1]!.stats.centroid!.y).toBeCloseTo(155, 6);
    expect(by[1]!.stats.ellipse).not.toBeNull();
    expect(by[2]!.stats.ellipse).toBeNull();
  });

  test('a club with no usable landing still gets an entry, with no points', () => {
    const by = dispersionByClub([...synth([[null, 150]], '8 Iron'), ...synth([[1, 160]], '7 Iron')], 'carry');
    expect(by.map((g) => [g.club, g.stats.points.length])).toEqual([['7 Iron', 1], ['8 Iron', 0]]);
  });
});
