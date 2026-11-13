import { describe, expect, test } from 'vitest';
import { CLUB_ARC_RADIUS_YD } from '@fsa/analytics';
import { arcCenter, headPose, parseOutline } from './headPose';
import { REF_M, dot, mOf, rad, sceneOf } from './testFixtures';

describe('headPose', () => {
  test('face normal for ftt 11.8 R, loft 40.9: heading 11.8° right of +y, 40.9° up', () => {
    const { faceNormal: n } = headPose(REF_M, sceneOf(REF_M));
    expect(Math.atan2(n[0], n[1]) * 180 / Math.PI).toBeCloseTo(11.8, 6);
    expect(Math.asin(n[2]) * 180 / Math.PI).toBeCloseTo(40.9, 6);
  });

  test('right-handed toe points +x, left-handed toe points −x', () => {
    expect(headPose(REF_M, sceneOf(REF_M, 'right')).toeDir[0]).toBeGreaterThan(0.9);
    expect(headPose(REF_M, sceneOf(REF_M, 'left')).toeDir[0]).toBeLessThan(-0.9);
  });

  test('shaft runs up the swing plane toward the golfer', () => {
    const p = headPose(REF_M, sceneOf(REF_M));
    expect(Math.asin(p.shaftDir[2]) * 180 / Math.PI).toBeCloseTo(60.7, 4);
    expect(p.shaftDir[0]).toBeLessThan(0);
  });

  test('null ftt and loft give face normal [0,1,0]; no plane gives a 60° lie toward the golfer', () => {
    const m = mOf({});
    const p = headPose(m, sceneOf(m, 'left'));
    expect(p.faceNormal).toEqual([0, 1, 0]);
    expect(p.shaftDir[2]).toBeCloseTo(Math.sin(rad(60)), 6);
    expect(p.shaftDir[0]).toBeGreaterThan(0);
    expect(dot(p.toeDir, p.faceNormal)).toBeCloseTo(0, 6);
  });
});

describe('headPose with only V-plane measured', () => {
  test('the shaft rises at the measured V-plane, matching the Down the line wedge, not the default lie', () => {
    const m = mOf({ swingV: 70 });
    const p = headPose(m, sceneOf(m));
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
