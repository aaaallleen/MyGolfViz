import { describe, expect, test } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { cameraFor, projectPoint, type CameraPreset } from './camera';

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
    const c = cameraFor(p, scene, 800);
    expect(c.focal).toBeGreaterThan(0);
    expect(Number.isFinite(c.focal)).toBe(true);
    const r = projectPoint(c.target, c, vp)!;
    expect(r.x).toBeCloseTo(400, 6);
    expect(r.y).toBeCloseTo(300, 6);
  });
  test.each(['dtl', 'perspective', 'side'] as CameraPreset[])('right and up directions (%s)', (p) => {
    const c = cameraFor(p, scene, 800);
    const f = norm(sub(c.target, c.eye));
    const r = norm(cross(f, c.up));
    expect(projectPoint(add(c.target, r), c, vp)!.x).toBeGreaterThan(400);
    expect(projectPoint(add(c.target, [0, 0, 1]), c, vp)!.y).toBeLessThan(300);
  });
  test('point behind the eye returns null', () => {
    const c = cameraFor('dtl', scene, 800);
    const f = norm(sub(c.target, c.eye));
    expect(projectPoint(sub(c.eye, f), c, vp)).toBeNull();
  });
  test('handedness and top up', () => {
    expect(cameraFor('dtl', scene, 800).eye[0]).toBeLessThan(0);
    expect(cameraFor('dtl', buildReplayScene(shot, 'left'), 800).eye[0]).toBeGreaterThan(0);
    expect(cameraFor('top', scene, 800).up).toEqual([0, 1, 0]);
  });
});

const wedge = {
  id: 'w', fileId: 'f', sourceRow: 2,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 110, lateral: -4, launchH: -1, height: 90, launchV: 30, descentV: 50 },
} as unknown as Shot;

describe('framing: ball, flight apex and landing inside 800×480 with ≥2% margin', () => {
  const cases: [string, Shot][] = [['driver', shot], ['wedge', wedge]];
  for (const [name, s] of cases) {
    for (const hand of ['right', 'left'] as const) {
      test.each(presets)(`${name} ${hand} (%s)`, (p) => {
        const sc = buildReplayScene(s, hand);
        const fl = sc.ballFlight!;
        const apex = fl.reduce((a, b) => (b[2] > a[2] ? b : a));
        const c = cameraFor(p, sc, 800);
        for (const [label, pt] of [['ball', [0, 0, 0]], ['apex', apex], ['landing', sc.landing!]] as const) {
          const r = projectPoint(pt as [number, number, number], c, vp480);
          expect(r, `${label} visible`).not.toBeNull();
          expect(r!.x, `${label} x`).toBeGreaterThanOrEqual(16);
          expect(r!.x, `${label} x`).toBeLessThanOrEqual(784);
          expect(r!.y, `${label} y`).toBeGreaterThanOrEqual(9.6);
          expect(r!.y, `${label} y`).toBeLessThanOrEqual(470.4);
        }
      });
    }
  }
  test.each(presets)('no flight: ball and club arc framed (%s)', (p) => {
    const sc = buildReplayScene({ ...shot, m: { ...shot.m, carry: null } } as unknown as Shot, 'right');
    expect(sc.ballFlight).toBeNull();
    const c = cameraFor(p, sc, 800);
    for (const pt of [[0, 0, 0] as [number, number, number], ...sc.clubArc!]) {
      const r = projectPoint(pt, c, vp480)!;
      expect(r).not.toBeNull();
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x).toBeLessThanOrEqual(800);
      expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y).toBeLessThanOrEqual(480);
    }
  });
});
