import { describe, expect, test } from 'vitest';
import type { Vec3 } from '@fsa/domain';
import { camera2D, camera3D, projectOrtho, screenBasis } from './cameras';
import { REF_M, dot, mOf, pathDir, rad, sceneOf } from './testFixtures';

const rh = sceneOf(REF_M, 'right');
const lh = sceneOf(REF_M, 'left');
const expectNear = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('camera3D', () => {
  test('top: looks straight down; right-hander target (+y) is screen-left, golfer side (-x) is screen-down', () => {
    const b = screenBasis(camera3D('top', rh, REF_M));
    expectNear(b.forward, [0, 0, -1]);
    expect(dot(b.right, [0, 1, 0])).toBeLessThan(-0.99);
    expect(dot(b.up, [1, 0, 0])).toBeGreaterThan(0.99);
  });

  test('top, left-hander: target is screen-right and the golfer (+x) is screen-down', () => {
    const b = screenBasis(camera3D('top', lh, REF_M));
    expect(dot(b.right, [0, 1, 0])).toBeGreaterThan(0.99);
    expect(dot(b.up, [1, 0, 0])).toBeLessThan(-0.99);
  });

  test('faceOn: horizontal, square to club path 8.3° R; target on the right for a right-hander', () => {
    const b = screenBasis(camera3D('faceOn', rh, REF_M));
    expect(b.forward[2]).toBeCloseTo(0, 6);
    expect(dot(b.forward, pathDir(8.3))).toBeCloseTo(0, 6);
    expect(dot(b.right, [0, 1, 0])).toBeGreaterThan(0.98);
    expectNear(b.up, [0, 0, 1]);
  });

  test('faceOn, left-hander: target on the left', () => {
    const b = screenBasis(camera3D('faceOn', lh, REF_M));
    expect(dot(b.right, [0, 1, 0])).toBeLessThan(-0.98);
  });

  test('dtl: looks along u = (sin 6°, cos 6°, 0), horizontal, same for both hands', () => {
    for (const s of [rh, lh]) expectNear(screenBasis(camera3D('dtl', s, REF_M)).forward, [Math.sin(rad(6)), Math.cos(rad(6)), 0]);
  });

  test('overview: perspective from behind and above, on the side away from the golfer', () => {
    const r = camera3D('overview', rh, REF_M), l = camera3D('overview', lh, REF_M);
    expect(r.kind).toBe('persp');
    expect(r.eye[1]).toBeLessThan(0);
    expect(r.eye[2]).toBeGreaterThan(0);
    expect(r.eye[0]).toBeGreaterThan(0);
    expect(l.eye[0]).toBeLessThan(0);
  });

  test('measuring views are orthographic', () => {
    for (const v of ['top', 'faceOn', 'dtl'] as const) expect(camera3D(v, rh, REF_M).kind).toBe('ortho');
  });

  test('dtl with swingH null looks down the target line; faceOn with clubPath null is square to the target line', () => {
    const m = mOf({ swingV: 60 });
    const s = sceneOf(m);
    expectNear(screenBasis(camera3D('dtl', s, m)).forward, [0, 1, 0]);
    expect(dot(screenBasis(camera3D('faceOn', s, m)).forward, [0, 1, 0])).toBeCloseTo(0, 6);
  });
});

describe('camera2D', () => {
  test('ftt and ftp share the top-down camera; loft matches faceOn; spinAxis looks along +y', () => {
    const top = screenBasis(camera3D('top', rh, REF_M));
    for (const v of ['ftt', 'ftp'] as const) expectNear(screenBasis(camera2D(v, REF_M, 'right')).forward, top.forward);
    expectNear(screenBasis(camera2D('ftt', REF_M, 'right')).right, top.right);
    expectNear(screenBasis(camera2D('loft', REF_M, 'right')).right, screenBasis(camera3D('faceOn', rh, REF_M)).right);
    expectNear(screenBasis(camera2D('spinAxis', REF_M, 'right')).forward, [0, 1, 0]);
    expectNear(screenBasis(camera2D('spinAxis', REF_M, 'left')).forward, [0, 1, 0]);
  });

  test('2D cameras are orthographic and zoomed to the head (size < 0.3 yd)', () => {
    for (const v of ['ftt', 'ftp', 'loft', 'spinAxis'] as const) {
      const c = camera2D(v, REF_M, 'right');
      expect(c.kind).toBe('ortho');
      expect(c.size).toBeLessThan(0.3);
    }
  });

  test('left-handed loft view has the target on the left', () => {
    expect(dot(screenBasis(camera2D('loft', REF_M, 'left')).right, [0, 1, 0])).toBeLessThan(-0.98);
  });
});

describe('projectOrtho', () => {
  test('the ball projects to the slot centre for top, faceOn and dtl', () => {
    for (const v of ['top', 'faceOn', 'dtl'] as const) {
      const p = projectOrtho(camera3D(v, rh, REF_M), [0, 0, 0], 1.6);
      expect(p.x).toBeCloseTo(0.5, 6);
      expect(p.y).toBeCloseTo(0.5, 6);
    }
  });

  test('top, right-hander: a point toward the target lands left of centre; screen y grows downward', () => {
    const cam = camera3D('top', rh, REF_M);
    expect(projectOrtho(cam, [0, 1, 0], 1.6).x).toBeLessThan(0.5);
    expect(projectOrtho(cam, [-1, 0, 0], 1.6).y).toBeGreaterThan(0.5);
  });
});
