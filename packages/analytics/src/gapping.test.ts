import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements } from '@fsa/domain';
import {
  consistencyScore, gappingSessions, gappingTable, shotsForGapping, type GappingSession,
} from './gapping';
import type { ProgressionShot } from './progression';

// 8, 20 and 50 shots: lateral ±a and carry 160±b alternating, so sample SDs are exactly 8 and 6, median carry 160.
function spreadShots(n: number) {
  const a = 8 * Math.sqrt((n - 1) / n), b = 6 * Math.sqrt((n - 1) / n);
  return Array.from({ length: n }, (_, i) => ({ x: i % 2 ? a : -a, y: 160 + (i % 4 < 2 ? b : -b) }));
}

let seq = 0;
function shot(club: string, sessionId: string, m: Partial<Measurements>, excluded = false): ProgressionShot {
  const full = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements;
  return { id: `s${seq++}`, sessionId, club, m: { ...full, ...m }, excluded };
}
/** n shots around `carry` with lateral and carry scatter. */
function club(name: string, carry: number, n = 8, sessionId = 'a', lat = 6, sd = 4): ProgressionShot[] {
  return Array.from({ length: n }, (_, i) =>
    shot(name, sessionId, { carry: carry + (i % 4 < 2 ? sd : -sd) * (1 + i / 20), total: carry + 8, lateral: (i % 2 ? lat : -lat) * (1 + i / 15) }));
}

describe('consistencyScore', () => {
  test('the worked example: 73 ± 14 / ± 8 / ± 5', () => {
    expect(consistencyScore(spreadShots(8), 160)).toMatchObject({ n: 8 });
    expect(consistencyScore(spreadShots(8), 160)!.score).toBeCloseTo(72.917, 2);
    expect(consistencyScore(spreadShots(8), 160)!.plusMinus).toBeCloseTo(13.92, 2);
    expect(Math.round(consistencyScore(spreadShots(20), 160)!.plusMinus)).toBe(8);
    expect(Math.round(consistencyScore(spreadShots(50), 160)!.plusMinus)).toBe(5);
  });
  test('needs more than 5 shots and a positive stock carry', () => {
    expect(consistencyScore(spreadShots(8).slice(0, 5), 160)).toBeNull();
    expect(consistencyScore(spreadShots(8).slice(0, 6), 160)).not.toBeNull();
    expect(consistencyScore(spreadShots(8), 0)).toBeNull();
  });
  test('clamps to 0-100', () => {
    const tight = spreadShots(8).map((p) => ({ x: p.x / 100, y: 160 + (p.y - 160) / 100 }));
    expect(consistencyScore(tight, 160)!.score).toBe(100);
    const wild = spreadShots(8).map((p) => ({ x: p.x * 10, y: 160 + (p.y - 160) * 10 }));
    const r = consistencyScore(wild, 160)!;
    expect(r.score).toBe(0);
    expect(Number.isFinite(r.plusMinus)).toBe(true);
  });
});

describe('gappingSessions', () => {
  const sessions: GappingSession[] = ['s1', 's2', 's3', 's4', 's5'].map((id, i) => ({
    id, date: `2026-01-0${i + 1}`, createdAt: `2026-01-0${i + 1}T00:00:00Z`,
    clubs: [{ club: '7 Iron', count: 5 }, ...(i < 2 ? [{ club: '4 Hybrid', count: 4 }] : []), { club: 'Wedge', count: 0 }],
  }));
  const shuffled = [sessions[3]!, sessions[0]!, sessions[4]!, sessions[2]!, sessions[1]!];
  test('last3 takes each club\'s own last sessions', () => {
    const m = gappingSessions(shuffled, 'last3', null);
    expect(m.get('7 Iron')).toEqual(['s3', 's4', 's5']);
    expect(m.get('4 Hybrid')).toEqual(['s1', 's2']);
    expect(m.has('Wedge')).toBe(false);
  });
  test('latest gives the clubs of the newest session only', () => {
    const m = gappingSessions(shuffled, 'latest', null);
    expect([...m.keys()]).toEqual(['7 Iron']);
    expect(m.get('7 Iron')).toEqual(['s5']);
  });
  test('session picks that session, unknown or null falls back to latest', () => {
    expect(gappingSessions(sessions, 'session', 's2').get('4 Hybrid')).toEqual(['s2']);
    expect(gappingSessions(sessions, 'session', 'nope')).toEqual(gappingSessions(sessions, 'latest', null));
    expect(gappingSessions(sessions, 'session', null)).toEqual(gappingSessions(sessions, 'latest', null));
  });
  test('all and last10 list every session with the club', () => {
    expect(gappingSessions(sessions, 'all', null).get('7 Iron')).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(gappingSessions(sessions, 'last10', null).get('4 Hybrid')).toEqual(['s1', 's2']);
  });
});

describe('shotsForGapping', () => {
  test('keeps shots of the listed sessions and drops excluded for stock', () => {
    const shots = [shot('7 Iron', 'a', {}), shot('7 Iron', 'b', {}), shot('7 Iron', 'a', {}, true), shot('6 Iron', 'a', {})];
    const per = new Map([['7 Iron', ['a']]]);
    expect(shotsForGapping(shots, per, 'all')).toHaveLength(2);
    expect(shotsForGapping(shots, per, 'stock')).toHaveLength(1);
  });
});

describe('gappingTable', () => {
  test('sorts by stock carry and computes gaps', () => {
    const rows = gappingTable([...club('9 Iron', 120), ...club('7 Iron', 150), ...club('5 Iron', 160)], 'sd1');
    expect(rows.map((r) => r.club)).toEqual(['5 Iron', '7 Iron', '9 Iron']);
    expect(rows.map((r) => r.gapToNext)).toEqual([expect.closeTo(10, 0), expect.closeTo(30, 0), null]);
    expect(rows[0]!.stockCarry).toBeGreaterThan(155);
    expect(rows[0]!.total).toBe(168);
    expect(rows[0]!.consistency).not.toBeNull();
    expect(rows[0]!.few).toBe(false);
  });
  test('n counts only shots with a carry value; clubs without carry are dropped', () => {
    const shots = [...club('7 Iron', 150, 6), shot('7 Iron', 'a', { lateral: 3 }), shot('PW', 'a', { lateral: 3 })];
    const rows = gappingTable(shots, 'sd1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.n).toBe(6);
  });
  test('overlapsNext depends on the ellipse kind', () => {
    // Long iron short edge sits between the 1 SD and the every-shot edge of the next club.
    const tight = (name: string, carry: number) => [
      ...Array.from({ length: 12 }, (_, i) => shot(name, 'a', { carry: carry + (i % 2 ? 1 : -1), lateral: i % 3 - 1 })),
      shot(name, 'a', { carry: carry - 12, lateral: 1 }), shot(name, 'a', { carry: carry + 12, lateral: -1 }),
    ];
    const shots = [...tight('5 Iron', 150), ...tight('6 Iron', 130)];
    const sd1 = gappingTable(shots, 'sd1');
    const all = gappingTable(shots, 'all');
    expect(sd1[0]!.overlapsNext).toBeNull();
    expect(all[0]!.overlapsNext).toBe('6 Iron');
    expect(all[1]!.overlapsNext).toBeNull();
  });
  test('hole needs 3 positive gaps and a gap of 1.75x the median', () => {
    const carries = [200, 190, 180, 170, 130];
    const rows = gappingTable(carries.flatMap((c, i) => club(`C${i}`, c, 6)), 'sd1');
    expect(rows.map((r) => r.hole)).toEqual([false, false, false, true, false]);
    const few = gappingTable([200, 190, 150].flatMap((c, i) => club(`C${i}`, c, 6)), 'sd1');
    expect(few.every((r) => !r.hole)).toBe(true);
  });
  test('a club with 2 shots has no ranges, no score and is few', () => {
    const rows = gappingTable([...club('7 Iron', 150, 8), ...club('8 Iron', 140, 2)], 'sd1');
    const small = rows.find((r) => r.club === '8 Iron')!;
    expect(small).toMatchObject({ shortLong: null, leftRight: null, consistency: null, few: true, n: 2 });
    expect(rows.find((r) => r.club === '7 Iron')!.overlapsNext).toBeNull();
  });
  test('sessionIds lists distinct sessions by appearance', () => {
    const rows = gappingTable([...club('7 Iron', 150, 3, 'x'), ...club('7 Iron', 150, 3, 'y'), ...club('7 Iron', 150, 2, 'x')], 'sd1');
    expect(rows[0]!.sessionIds).toEqual(['x', 'y']);
  });
});
