import { describe, expect, test } from 'vitest';
import type { Shot } from '@fsa/domain';
import { CLUB_ARC_RADIUS_YD, buildReplayScene, clubFrame, clubPhase, flightFrame, flightPhase, replayFrame, replayPhase, type ReplayPhase } from './replay';
import { SEPT_19_2022, fixtureShots } from '../test/fixtureShots';

const shot = (): Shot => fixtureShots(SEPT_19_2022).find((s) => s.sourceRow === 2)!;
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]): number[] => [
  a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!,
];
const deg = (r: number) => (r * 180) / Math.PI;

describe('buildReplayScene', () => {
  test('clubArc has 41 points and clubArc[impactIndex] is the origin (±1e-9)', () => {
    const s = buildReplayScene(shot(), 'right');
    expect(s.clubArc).toHaveLength(41);
    expect(s.impactIndex).toBe(25);
    for (const c of s.clubArc![s.impactIndex]!) expect(Math.abs(c)).toBeLessThan(1e-9);
    expect(CLUB_ARC_RADIUS_YD).toBe(1.7);
  });
  test('every arc point lies in the swing plane', () => {
    const s = buildReplayScene(shot(), 'right');
    const n = cross(s.plane!.u, s.plane!.w);
    for (const p of s.clubArc!) expect(Math.abs(dot(p, n))).toBeLessThan(1e-9);
  });
  test('unit tangent at impact has vertical component sin(-1.3 deg)', () => {
    const a = buildReplayScene(shot(), 'right').clubArc!;
    const d = [a[26]![0] - a[24]![0], a[26]![1] - a[24]![1], a[26]![2] - a[24]![2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    expect(d[2]! / len).toBeCloseTo(Math.sin((-1.3 * Math.PI) / 180), 6);
  });
  test('handedness mirrors w; arc start is behind the ball and up the plane', () => {
    const r = buildReplayScene(shot(), 'right');
    const l = buildReplayScene(shot(), 'left');
    expect(r.plane!.w[0]).toBeLessThan(0);
    expect(l.plane!.w[0]).toBeGreaterThan(0);
    expect(r.clubArc![0]![1]).toBeLessThan(0);
    expect(r.clubArc![0]![2]).toBeGreaterThan(0.5);
  });
  test('swingV null gives null plane and clubArc, ballFlight still built', () => {
    const b = shot();
    const s = buildReplayScene({ ...b, m: { ...b.m, swingV: null } }, 'right');
    expect(s.plane).toBeNull();
    expect(s.clubArc).toBeNull();
    expect(s.ballFlight).not.toBeNull();
  });
  test('faceDirection', () => {
    const s = buildReplayScene(shot(), 'right');
    const f = (8.6 * Math.PI) / 180;
    expect(s.faceDirection![0]).toBeCloseTo(Math.sin(f), 9);
    expect(s.faceDirection![1]).toBeCloseTo(Math.cos(f), 9);
    const b = shot();
    expect(buildReplayScene({ ...b, m: { ...b.m, ftt: null } }, 'right').faceDirection).toBeNull();
  });
  test('ballFlight geometry', () => {
    const s = buildReplayScene(shot(), 'right');
    const f = s.ballFlight!;
    expect(f).toHaveLength(61);
    expect(f[0]).toEqual([0, 0, 0]);
    expect(s.landing![0]).toBeCloseTo(10.4, 3);
    expect(s.landing![1]).toBeCloseTo(198.628, 3);
    expect(s.landing![2]).toBe(0);
    expect(f[60]![0]).toBeCloseTo(10.4, 3);
    expect(f[60]![1]).toBeCloseTo(198.628, 3);
    expect(Math.abs(f[60]![2])).toBeLessThan(1e-9);
    const peak = Math.max(...f.map((p) => p[2]));
    expect(Math.abs(peak - 49.9) / 49.9).toBeLessThan(0.01);
    expect(deg(Math.atan2(f[1]![0], f[1]![1]))).toBeCloseTo(2.2, 0);
  });
  test('carry null gives null ballFlight and landing', () => {
    const b = shot();
    const s = buildReplayScene({ ...b, m: { ...b.m, carry: null } }, 'right');
    expect(s.ballFlight).toBeNull();
    expect(s.landing).toBeNull();
  });
});

describe('replay phases and frames', () => {
  test.each<[number, ReplayPhase]>([
    [0, 'Downswing'], [0.29, 'Downswing'], [0.3, 'Impact'], [0.33, 'Impact'],
    [0.34, 'Ball flight'], [0.94, 'Ball flight'], [0.95, 'Landing'], [1, 'Landing'],
  ])('replayPhase(%d)', (p, expected) => expect(replayPhase(p)).toBe(expected));

  test('replayFrame endpoints', () => {
    const s = buildReplayScene(shot(), 'right');
    expect(replayFrame(s, 0).clubHead).toEqual(s.clubArc![0]);
    expect(replayFrame(s, 0).ball).toEqual([0, 0, 0]);
    const mid = replayFrame(s, 0.3);
    expect(mid.clubHead).toEqual([0, 0, 0]);
    expect(mid.ball).toEqual([0, 0, 0]);
    expect(replayFrame(s, 1).ball).toEqual(s.landing);
    expect(replayFrame(s, 0.5).clubHead).toEqual(s.clubArc![40]);
  });
});

describe('club timeline', () => {
  test.each([[0, 'Downswing'], [0.59, 'Downswing'], [0.6, 'Impact'], [0.65, 'Impact'], [0.66, 'Follow-through'], [1, 'Follow-through']] as const)('clubPhase(%d)', (p, want) => {
    expect(clubPhase(p)).toBe(want);
  });
  test('clubFrame: 0 -> clubArc[0]; 0.6 -> origin; 1 -> last arc point; null arc -> null', () => {
    const s = buildReplayScene(shot(), 'right');
    expect(clubFrame(s, 0)).toEqual(s.clubArc![0]);
    expect(clubFrame(s, 0.6)).toEqual([0, 0, 0]);
    expect(clubFrame(s, 1)).toEqual(s.clubArc![40]);
    const mid = clubFrame(s, 0.3)!;
    for (const c of mid) expect(Number.isFinite(c)).toBe(true);
    expect(clubFrame({ ...s, clubArc: null }, 0.5)).toBeNull();
  });
});

describe('flight timeline', () => {
  test.each([[0, 'Launch'], [0.04, 'Launch'], [0.05, 'Ball flight'], [0.94, 'Ball flight'], [0.95, 'Landing'], [1, 'Landing']] as const)('flightPhase(%d)', (p, want) => {
    expect(flightPhase(p)).toBe(want);
  });
  test('flightFrame: 0 -> origin; 1 -> landing; mid-flight on polyline; null flight -> origin', () => {
    const s = buildReplayScene(shot(), 'right');
    expect(flightFrame(s, 0)).toEqual([0, 0, 0]);
    expect(flightFrame(s, 1)).toEqual(s.landing);
    const fl = s.ballFlight!;
    const p = flightFrame(s, 0.5);
    let best = Infinity;
    for (let i = 0; i < fl.length - 1; i++) {
      const a = fl[i]!, b = fl[i + 1]!;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t = Math.min(1, Math.max(0, dot(ap, ab) / dot(ab, ab)));
      best = Math.min(best, Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!));
    }
    expect(best).toBeLessThan(1e-9);
    expect(flightFrame({ ...s, ballFlight: null }, 0.5)).toEqual([0, 0, 0]);
  });
});
