import { describe, expect, test } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { cameraFor, projectPoint, type CameraPreset } from './camera';

const shot = {
  id: 's', fileId: 'f', sourceRow: 1,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 198.9, lateral: 10.4, launchH: 2.2, height: 149.7, launchV: 19.1, descentV: 54.6 },
} as unknown as Shot;
const vp = { width: 800, height: 600 };
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
    expect(c.focal).toBeCloseTo(720, 9);
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
