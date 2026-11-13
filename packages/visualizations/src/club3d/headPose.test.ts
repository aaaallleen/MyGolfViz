import { describe, expect, test } from 'vitest';
import { CLUB_ARC_RADIUS_YD } from '@fsa/analytics';
import { arcCenter, headPose, parseOutline } from './headPose';
import { REF_M, dot, mOf, rad, sceneOf } from './testFixtures';

const H = { loftDeg: 33, lieDeg: 62.5 };

describe('headPose', () => {
  test('face normal for ftt 11.8 R, loft 40.9: heading 11.8° right of +y, 40.9° up', () => {
    const { faceNormal: n } = headPose(REF_M, sceneOf(REF_M), H);
    expect(Math.atan2(n[0], n[1]) * 180 / Math.PI).toBeCloseTo(11.8, 6);
    expect(Math.asin(n[2]) * 180 / Math.PI).toBeCloseTo(40.9, 6);
  });

  test('right-handed toe points +x, left-handed toe points −x', () => {
    expect(headPose(REF_M, sceneOf(REF_M, 'right'), H).toeDir[0]).toBeGreaterThan(0.9);
    expect(headPose(REF_M, sceneOf(REF_M, 'left'), H).toeDir[0]).toBeLessThan(-0.9);
  });

  test('shaft runs up the swing plane toward the golfer', () => {
    const p = headPose(REF_M, sceneOf(REF_M), H);
    expect(Math.asin(p.shaftDir[2]) * 180 / Math.PI).toBeCloseTo(60.7, 4);
    expect(p.shaftDir[0]).toBeLessThan(0);
  });

  test('left-handed with no plane: the shaft leans toward the golfer (+x) and the toe lies in the face', () => {
    const m = mOf({});
    const p = headPose(m, sceneOf(m, 'left'), H);
    expect(p.shaftDir[0]).toBeGreaterThan(0);
    expect(dot(p.toeDir, p.faceNormal)).toBeCloseTo(0, 6);
  });

  test('measured loft and face angle give that face normal', () => {
    const p = headPose(mOf({ ftt: 11.8, dynamicLoft: 40.9 }), sceneOf(REF_M), H);
    expect(p.faceNormal[2]).toBeCloseTo(Math.sin(rad(40.9)), 6);
    expect(Math.atan2(p.faceNormal[0], p.faceNormal[1])).toBeCloseTo(rad(11.8), 6);
    expect(p.flat).toBe(false);
  });

  test('missing loft uses the static loft and is flat; missing face angle is square', () => {
    const p = headPose(mOf({}), sceneOf(mOf({})), H);
    expect(p.faceNormal[0]).toBeCloseTo(0, 9);
    expect(p.faceNormal[2]).toBeCloseTo(Math.sin(rad(33)), 6);
    expect(p.flat).toBe(true);
  });

  test('no swing plane and no Swing V: the shaft stands at the head lie', () => {
    const p = headPose(mOf({}), sceneOf(mOf({})), H);
    expect(Math.atan2(p.shaftDir[2], Math.abs(p.shaftDir[0]))).toBeCloseTo(rad(62.5), 6);
  });

  test('strike needs both impact values', () => {
    expect(headPose(mOf({ impactLateral: 0.65, impactVertical: -0.02 }), sceneOf(REF_M), H).strike).toEqual({ lateralIn: 0.65, verticalIn: -0.02 });
    expect(headPose(mOf({ impactLateral: 0.65 }), sceneOf(REF_M), H).strike).toBeNull();
    expect(headPose(mOf({ impactVertical: 0.3 }), sceneOf(REF_M), H).strike).toBeNull();
  });
});

describe('headPose with only V-plane measured', () => {
  test('the shaft rises at the measured V-plane, matching the Down the line wedge, not the default lie', () => {
    const m = mOf({ swingV: 70 });
    const p = headPose(m, sceneOf(m), H);
    expect(Math.asin(p.shaftDir[2]) * 180 / Math.PI).toBeCloseTo(70, 6);
    expect(p.shaftDir[0]).toBeLessThan(0);
  });
});

describe('arcCenter', () => {
  test('is the swing radius away from every arc point', () => {
    const arc = sceneOf(REF_M).clubArc!;
    const c = arcCenter(arc);
    for (const p of arc) expect(Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])).toBeCloseTo(CLUB_ARC_RADIUS_YD, 6);
  });
});

describe('parseOutline', () => {
  test('reads M, L, C and Z commands into absolute segments', () => {
    expect(parseOutline('M45 150 C45 95 90 66 200 62 L10 20 Z')).toEqual([
      { op: 'M', pts: [[45, 150]] },
      { op: 'C', pts: [[45, 95], [90, 66], [200, 62]] },
      { op: 'L', pts: [[10, 20]] },
      { op: 'Z', pts: [] },
    ]);
  });
});
