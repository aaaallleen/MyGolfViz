import { describe, expect, test } from 'vitest';
import { annotations2D, annotations3D, apparentWedgeDeg, badges2D, badges3D, type Annotation } from './annotations';
import { camera2D, camera3D } from './cameras';
import { BALL, CLUB, FACE, INK, PLANE } from './palette';
import { REF_M, mOf, sceneOf } from './testFixtures';
import { BALL_RADIUS_YD, VIEWS_2D, VIEWS_3D, type View2D, type View3D } from './types';

const rh = sceneOf(REF_M, 'right');
const lh = sceneOf(REF_M, 'left');
type Wedge = Extract<Annotation, { kind: 'wedge' }>;
const wedge = (list: Annotation[], id: string) => list.find((a): a is Wedge => a.kind === 'wedge' && a.id === id);

describe('3D wedges read true through their own camera', () => {
  test.each([
    ['top', 'path', 8.3], ['top', 'hplane', 6.0], ['top', 'ftp', 3.6],
    ['faceOn', 'aoa', 4.0], ['dtl', 'vplane', 60.7],
  ] as [View3D, string, number][])('%s: wedge %s reads %s° (right- and left-handed)', (view, id, deg) => {
    for (const s of [rh, lh]) {
      const w = wedge(annotations3D(view, s, REF_M), id);
      expect(w, `${view}/${id}`).toBeDefined();
      expect(apparentWedgeDeg(w!, camera3D(view, s, REF_M))).toBeCloseTo(deg, 1);
    }
  });

  test('dtl V-plane reads 52.6° for swingH 13.3 / swingV 52.6 (camera along the swing direction)', () => {
    const m = mOf({ swingH: 13.3, swingV: 52.6, aoa: 2.6, clubPath: 11.3 });
    const s = sceneOf(m);
    expect(apparentWedgeDeg(wedge(annotations3D('dtl', s, m), 'vplane')!, camera3D('dtl', s, m))).toBeCloseTo(52.6, 1);
  });

  test('extremes: path 25° L and V-plane 75° still read true', () => {
    const m = mOf({ swingH: -20, swingV: 75, aoa: -9, clubPath: -25, ftp: -6 });
    const s = sceneOf(m);
    expect(apparentWedgeDeg(wedge(annotations3D('top', s, m), 'path')!, camera3D('top', s, m))).toBeCloseTo(25, 1);
    expect(apparentWedgeDeg(wedge(annotations3D('dtl', s, m), 'vplane')!, camera3D('dtl', s, m))).toBeCloseTo(75, 1);
    expect(apparentWedgeDeg(wedge(annotations3D('faceOn', s, m), 'aoa')!, camera3D('faceOn', s, m))).toBeCloseTo(9, 1);
  });

  test('overview has no wedges but has labels', () => {
    const a = annotations3D('overview', rh, REF_M);
    expect(a.some((x) => x.kind === 'wedge')).toBe(false);
    expect(a.some((x) => x.kind === 'label')).toBe(true);
  });

  test('each wedge has a label naming its value', () => {
    const a = annotations3D('top', rh, REF_M);
    const texts = a.filter((x) => x.kind === 'label').map((x) => (x as { text: string }).text);
    expect(texts).toEqual(expect.arrayContaining(['Club path 8.3° R', 'H-plane 6.0° R', 'Face to path 3.6° R']));
  });
});

describe('2D wedges read true', () => {
  test.each([
    ['ftt', 'ftt', 11.8], ['ftp', 'ftp', 3.6], ['loft', 'launch', 26], ['loft', 'loft', 40.9],
  ] as [View2D, string, number][])('%s: wedge %s reads %s°', (view, id, deg) => {
    for (const h of ['right', 'left'] as const) {
      const w = wedge(annotations2D(view, REF_M), id);
      expect(w).toBeDefined();
      expect(apparentWedgeDeg(w!, camera2D(view, REF_M, h))).toBeCloseTo(deg, 1);
    }
  });

  test('spin axis 2.6 R: the right end of the axis (x > 0) is lower than the left end', () => {
    const axis = annotations2D('spinAxis', REF_M).find((a) => a.id === 'spin-axis') as Extract<Annotation, { kind: 'line' }>;
    const [right, left] = axis.a[0] > axis.b[0] ? [axis.a, axis.b] : [axis.b, axis.a];
    expect(right[2]).toBeLessThan(left[2]);
  });

  test('spin axis and its level line pass through the ball centre', () => {
    const list = annotations2D('spinAxis', REF_M);
    for (const id of ['spin-axis', 'level']) {
      const l = list.find((a) => a.id === id) as Extract<Annotation, { kind: 'line' }>;
      expect((l.a[2] + l.b[2]) / 2).toBeCloseTo(BALL_RADIUS_YD, 9);
    }
  });

  test('2D face lines and the loft wedge sit on the club face, one ball radius behind the ball centre', () => {
    const faceN = [Math.sin(11.8 * Math.PI / 180), Math.cos(11.8 * Math.PI / 180), 0];
    const edge = annotations2D('ftt', REF_M).find((a) => a.id === 'face-edge') as Extract<Annotation, { kind: 'line' }>;
    const mid = [0, 1, 2].map((i) => (edge.a[i]! + edge.b[i]!) / 2);
    expect(mid[0]).toBeCloseTo(-faceN[0]! * BALL_RADIUS_YD, 9);
    expect(mid[1]).toBeCloseTo(-faceN[1]! * BALL_RADIUS_YD, 9);
    const loft = wedge(annotations2D('loft', REF_M), 'loft')!;
    expect(loft.origin[2]).toBeCloseTo(BALL_RADIUS_YD, 9);
    expect(loft.origin[1]).toBeLessThan(0);
  });

  test('loft view: the face plane leans back, away from the target', () => {
    const w = wedge(annotations2D('loft', REF_M), 'loft')!;
    expect(w.to[1]).toBeLessThan(0);
    expect(w.to[2]).toBeGreaterThan(0);
  });

  test('no spin-loft wedge exists', () => {
    expect(wedge(annotations2D('loft', REF_M), 'spinLoft')).toBeUndefined();
  });
});

describe('badges', () => {
  test('top: Club path 8.3° R, H-plane 6.0° R, Face to path 3.6° R with matching colors', () => {
    expect(badges3D('top', REF_M).map((b) => [b.label, b.text, b.color])).toEqual([
      ['Club path', '8.3° R', CLUB], ['H-plane', '6.0° R', PLANE], ['Face to path', '3.6° R', FACE],
    ]);
  });

  test('faceOn, dtl and overview badges', () => {
    expect(badges3D('faceOn', REF_M).map((b) => b.label)).toEqual(['Attack angle', 'Low point']);
    expect(badges3D('dtl', REF_M).map((b) => [b.label, b.text])).toEqual([['V-plane', '60.7°']]);
    expect(badges3D('overview', REF_M).map((b) => b.label)).toEqual(['Club path', 'H-plane', 'V-plane', 'Attack angle', 'Face to path']);
  });

  test('2D badges', () => {
    expect(badges2D('ftt', REF_M).map((b) => [b.label, b.text, b.color])).toEqual([
      ['Face to target', '11.8° R', FACE], ['Launch direction', '5.7° R', BALL], ['Club path', '8.3° R', CLUB],
    ]);
    expect(badges2D('ftp', REF_M)[0]).toMatchObject({ label: 'Face to path', text: '3.6° R' });
    expect(badges2D('loft', REF_M).map((b) => b.label)).toEqual(['Dynamic loft', 'Launch angle', 'Attack angle', 'Spin loft']);
    expect(badges2D('loft', REF_M)[3]).toMatchObject({ note: 'as reported', text: '44.9°' });
    expect(badges2D('spinAxis', REF_M).map((b) => [b.label, b.color])).toEqual([['Spin', INK], ['Spin axis', INK]]);
  });

  test('every wedge color equals the color of a badge in the same view', () => {
    for (const v of VIEWS_3D) {
      const colors = new Set(badges3D(v, REF_M).map((b) => b.color));
      for (const a of annotations3D(v, rh, REF_M)) if (a.kind === 'wedge') expect(colors.has(a.color), `${v}/${a.id}`).toBe(true);
    }
    for (const v of VIEWS_2D) {
      const colors = new Set(badges2D(v, REF_M).map((b) => b.color));
      for (const a of annotations2D(v, REF_M)) if (a.kind === 'wedge') expect(colors.has(a.color), `${v}/${a.id}`).toBe(true);
    }
  });
});

describe('missing data', () => {
  test('swingH/swingV null: no hplane or vplane wedges; their badges have null text', () => {
    const m = mOf({ aoa: -3, clubPath: 2, ftp: 1, ftt: 3 });
    const s = sceneOf(m);
    expect(wedge(annotations3D('top', s, m), 'hplane')).toBeUndefined();
    expect(wedge(annotations3D('dtl', s, m), 'vplane')).toBeUndefined();
    expect(wedge(annotations3D('top', s, m), 'path')).toBeDefined();
    expect(badges3D('top', m).find((b) => b.label === 'H-plane')!.text).toBeNull();
    expect(badges3D('dtl', m)[0]!.text).toBeNull();
  });

  test('an all-null shot never throws and draws no wedge in any view', () => {
    const m = mOf({});
    for (const h of ['right', 'left'] as const) {
      const s = sceneOf(m, h);
      for (const v of VIEWS_3D) {
        expect(annotations3D(v, s, m).some((a) => a.kind === 'wedge')).toBe(false);
        expect(badges3D(v, m).every((b) => b.text === null)).toBe(true);
      }
      for (const v of VIEWS_2D) {
        expect(annotations2D(v, m).some((a) => a.kind === 'wedge')).toBe(false);
        expect(badges2D(v, m).every((b) => b.text === null)).toBe(true);
      }
    }
  });
});
