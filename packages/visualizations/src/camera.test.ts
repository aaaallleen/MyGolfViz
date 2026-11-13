import { describe, expect, test } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { flightCamera, projectPoint, type CameraPreset } from './camera';

const shot = {
  id: 's', fileId: 'f', sourceRow: 1,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 198.9, lateral: 10.4, launchH: 2.2, height: 149.7, launchV: 19.1, descentV: 54.6 },
} as unknown as Shot;
const vp = { width: 800, height: 600 };
const vp480 = { width: 800, height: 480 };
const presets: CameraPreset[] = ['dtl', 'perspective', 'side', 'top'];
const scene = buildReplayScene(shot, 'right');
const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as [number, number, number];
const add = (a: number[], b: number[]) => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!] as [number, number, number];
const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l] as [number, number, number]; };
const cross = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!,
] as [number, number, number];

describe('camera', () => {
  test.each(presets)('target projects to viewport centre (%s)', (p) => {
    const c = flightCamera(p, [scene.ballFlight!], 'right', 800);
    expect(c.focal).toBeGreaterThan(0);
    expect(Number.isFinite(c.focal)).toBe(true);
    const r = projectPoint(c.target, c, vp)!;
    expect(r.x).toBeCloseTo(400, 6);
    expect(r.y).toBeCloseTo(300, 6);
  });
  test.each(['dtl', 'perspective', 'side'] as CameraPreset[])('right and up directions (%s)', (p) => {
    const c = flightCamera(p, [scene.ballFlight!], 'right', 800);
    const f = norm(sub(c.target, c.eye));
    const r = norm(cross(f, c.up));
    expect(projectPoint(add(c.target, r), c, vp)!.x).toBeGreaterThan(400);
    expect(projectPoint(add(c.target, [0, 0, 1]), c, vp)!.y).toBeLessThan(300);
  });
  test('point behind the eye returns null', () => {
    const c = flightCamera('dtl', [scene.ballFlight!], 'right', 800);
    const f = norm(sub(c.target, c.eye));
    expect(projectPoint(sub(c.eye, f), c, vp)).toBeNull();
  });
  test('handedness and top up', () => {
    // DTL sits on the target line for both hands; the perspective camera stands on the golfer's side.
    expect(flightCamera('perspective', [scene.ballFlight!], 'right', 800).eye[0]).toBeLessThan(0);
    expect(flightCamera('perspective', [scene.ballFlight!], 'left', 800).eye[0]).toBeGreaterThan(0);
    expect(flightCamera('top', [scene.ballFlight!], 'right', 800).up).toEqual([0, 1, 0]);
  });
});

const wedge = {
  id: 'w', fileId: 'f', sourceRow: 2,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 110, lateral: -4, launchH: -1, height: 90, launchV: 30, descentV: 50 },
} as unknown as Shot;

describe('flightCamera', () => {
  const flightsOf = (shots: Shot[], hand: 'right' | 'left') => shots.map((s) => buildReplayScene(s, hand).ballFlight!);
  const apexOf = (fl: [number, number, number][]) => fl.reduce((a, b) => (b[2] > a[2] ? b : a));
  for (const hand of ['right', 'left'] as const) {
    test.each(presets)(`frames origin, both apexes and both landings (${hand}, %s)`, (p) => {
      const flights = flightsOf([shot, wedge], hand);
      const c = flightCamera(p, flights, hand, 800);
      const pts = [[0, 0, 0], ...flights.flatMap((f) => [apexOf(f), f[f.length - 1]!])] as [number, number, number][];
      for (const pt of pts) {
        const r = projectPoint(pt, c, vp480);
        expect(r).not.toBeNull();
        expect(r!.x).toBeGreaterThanOrEqual(16); expect(r!.x).toBeLessThanOrEqual(784);
        expect(r!.y).toBeGreaterThanOrEqual(9.6); expect(r!.y).toBeLessThanOrEqual(470.4);
      }
    });
  }
  // dtl/perspective eyes sit near the origin, so their focal fits angular extent and is not monotonic in flight count.
  test.each(['side', 'top'] as CameraPreset[])('wedge alone zooms further than driver+wedge (%s)', (p) => {
    const both = flightCamera(p, flightsOf([shot, wedge], 'right'), 'right', 800);
    const one = flightCamera(p, flightsOf([wedge], 'right'), 'right', 800);
    expect(one.focal).toBeGreaterThan(both.focal);
  });
});

describe('flightCamera at scale', () => {
  test('frames more than 134,000 points without spreading them into Math.min/max', () => {
    const one = scene.ballFlight!;
    const flights = Array.from({ length: 2200 }, () => Array.from({ length: 61 }, (_, i) => one[i % one.length]!));
    const c = flightCamera('perspective', flights, 'right', 800);
    expect(Number.isFinite(c.focal)).toBe(true);
    for (const v of [...c.eye, ...c.target]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('flightCamera DTL is truly down the line', () => {
  const wide = [
    buildReplayScene(shot, 'right').ballFlight!,
    buildReplayScene({ ...shot, id: 'w', m: { ...shot.m, lateral: -35, launchH: -6 } } as unknown as Shot, 'right').ballFlight!,
  ];
  for (const hand of ['right', 'left'] as const) {
    test(`sits on the target line behind the ball at eye height and keeps the target line vertical through the centre (${hand})`, () => {
      const c = flightCamera('dtl', wide, hand, 800);
      expect(c.eye[0]).toBeCloseTo(0, 6);
      expect(c.eye[1]).toBeLessThan(0);
      expect(c.eye[2]).toBeGreaterThan(1);
      expect(c.eye[2]).toBeLessThan(2.5);
      for (const y of [20, 100, 200]) expect(projectPoint([0, y, 0], c, vp480)!.x).toBeCloseTo(400, 3);
      const ball = projectPoint([0, 0, 0], c, vp480)!;
      expect(ball.x).toBeCloseTo(400, 3);
      expect(ball.y).toBeGreaterThan(240); // the ball sits low in the frame, flights rise above it
    });
  }
});
