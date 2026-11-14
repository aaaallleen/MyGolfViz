import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements } from '@fsa/domain';
import {
  HEATMAP, change, clubGapping, impactHeatmap, impactStats, metricStats, mishitFrequency, orderSessions, quantile,
  seriesForMetric, type ImpactSessionStats, type ProgressionShot,
} from './progression';

let seq = 0;
function shot(sessionId: string, m: Partial<Measurements>, opts: { club?: string | null; excluded?: boolean } = {}): ProgressionShot {
  const full = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements;
  return {
    id: `shot${seq++}`, sessionId, club: opts.club === undefined ? 'Driver' : opts.club,
    m: { ...full, ...m }, excluded: opts.excluded ?? false,
  };
}
const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('quantile', () => {
  test('type 7 on 1..10', () => {
    expect(quantile(ten, 0.1)).toBeCloseTo(1.9, 10);
    expect(quantile(ten, 0.25)).toBeCloseTo(3.25, 10);
    expect(quantile(ten, 0.5)).toBeCloseTo(5.5, 10);
    expect(quantile(ten, 0.75)).toBeCloseTo(7.75, 10);
    expect(quantile(ten, 0.9)).toBeCloseTo(9.1, 10);
  });
  test('empty is null, single value is itself', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([4], 0.1)).toBe(4);
    expect(quantile([4], 0.9)).toBe(4);
  });
});

describe('metricStats', () => {
  test('mean and population sd', () => {
    const s = metricStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.sd).toBe(2);
  });
  test('outlier flagged with the 1.5 IQR fence', () => {
    const s = metricStats([...ten, 100]);
    expect(s.median).toBe(6);
    expect(s.iqr).toBe(5);
    expect(s.outliers).toBe(1);
  });
  test('nulls are missing, never zero', () => {
    const s = metricStats([null, 1, null, 3]);
    expect([s.n, s.missing, s.total, s.median, s.few]).toEqual([2, 2, 4, 2, true]);
  });
  test('empty and tiny samples', () => {
    const s = metricStats([null]);
    expect(s.n).toBe(0);
    expect(s.median).toBeNull();
    expect(s.inRange).toBeNull();
    expect(metricStats([1, 2, 3]).outliers).toBe(0);
    expect(metricStats([5]).sd).toBeNull();
  });
  test('in range, inclusive and one-sided', () => {
    expect(metricStats(ten, { low: 3, high: 7 }).inRange).toEqual({ count: 5, pct: 50 });
    expect(metricStats(ten, { low: 8, high: null }).inRange).toEqual({ count: 3, pct: 30 });
    expect(metricStats(ten).inRange).toBeNull();
    expect(metricStats(ten, { low: null, high: null }).inRange).toBeNull();
    expect(metricStats([null], { low: 1, high: 2 }).inRange).toBeNull();
  });
});

describe('orderSessions', () => {
  test('date, then createdAt', () => {
    const a = { id: 'a', date: '2026-11-07', createdAt: '2026-11-07T10:00:00Z' };
    const b = { id: 'b', date: '2026-10-01', createdAt: '2026-11-08T10:00:00Z' };
    const c = { id: 'c', date: '2026-11-07', createdAt: '2026-11-07T09:00:00Z' };
    expect(orderSessions([a, b, c]).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
  test('id breaks remaining ties and input is not mutated', () => {
    const x = { id: 'y', date: '2026-01-01', createdAt: 't' };
    const z = { id: 'x', date: '2026-01-01', createdAt: 't' };
    const input = [x, z];
    expect(orderSessions(input).map((s) => s.id)).toEqual(['x', 'y']);
    expect(input[0]).toBe(x);
  });
});

describe('seriesForMetric', () => {
  const shots = [
    shot('s1', { carry: 200 }), shot('s1', { carry: 210 }),
    shot('s2', { carry: 150 }, { excluded: true }),
    shot('s3', { carry: 220 }),
    shot('other', { carry: 999 }),
  ];
  test('keeps sessions with no stock shots', () => {
    const r = seriesForMetric(['s1', 's2', 's3'], shots, 'carry', { shots: 'stock' });
    expect(r).toHaveLength(3);
    expect(r[1]!.n).toBe(0);
    expect(r[1]!.median).toBeNull();
    expect(r[0]!.n).toBe(2);
  });
  test('all includes excluded shots', () => {
    const r = seriesForMetric(['s1', 's2', 's3'], shots, 'carry', { shots: 'all' });
    expect(r[1]!.n).toBeGreaterThan(0);
  });
  test('only the given sessions count', () => {
    const r = seriesForMetric(['s1'], shots, 'carry', { shots: 'all' });
    expect(r).toHaveLength(1);
    expect(r[0]!.n).toBe(2);
  });
  test('abs uses magnitude', () => {
    const lat = [-3, 1, 2].map((v) => shot('s1', { impactLateral: null, curve: v }));
    expect(seriesForMetric(['s1'], lat, 'curve', { shots: 'all', abs: true })[0]!.median).toBe(2);
    expect(seriesForMetric(['s1'], lat, 'curve', { shots: 'all' })[0]!.median).toBe(1);
  });
  test('range is passed through', () => {
    const r = seriesForMetric(['s1'], shots, 'carry', { shots: 'all', range: { low: 205, high: null } });
    expect(r[0]!.inRange).toEqual({ count: 1, pct: 50 });
  });
});

describe('mishitFrequency', () => {
  test('rate and empty session', () => {
    const shots = [
      ...Array.from({ length: 6 }, () => shot('s1', {})),
      ...Array.from({ length: 2 }, () => shot('s1', {}, { excluded: true })),
    ];
    expect(mishitFrequency(['s1', 's2'], shots)).toEqual([{ excluded: 2, total: 8, rate: 0.25 }, null]);
  });
});

describe('change', () => {
  test('last vs previous non-null', () => {
    expect(change([230, null, 240])).toEqual({ delta: 10, since: 0 });
    expect(change([230, 235, null, 233])).toEqual({ delta: -2, since: 1 });
  });
  test('null without two values', () => {
    expect(change([230])).toBeNull();
    expect(change([null, 5, null])).toBeNull();
    expect(change([])).toBeNull();
  });
});

describe('impactStats', () => {
  const shots = [
    shot('s1', { impactLateral: null, impactVertical: 0.2 }),
    shot('s1', { impactLateral: null, impactVertical: null }),
    shot('s1', { impactLateral: 0.3, impactVertical: 0.4 }),
    shot('s1', { impactLateral: 0, impactVertical: 0 }),
  ];
  test('unmeasured shots are left out and counted', () => {
    const s = impactStats(['s1'], shots, 'all')[0]!;
    expect(s.measured).toBe(2);
    expect(s.total).toBe(4);
    expect(s.meanDistance).toBeCloseTo(0.25, 10);
    expect(s.sdLateral).toBeCloseTo(0.15, 10);
    expect(s.sdVertical).toBeCloseTo(0.2, 10);
  });
  test('empty session and few measured', () => {
    const [a, b] = impactStats(['s1', 's2'], [shots[2]!], 'all') as [ImpactSessionStats, ImpactSessionStats];
    expect(a.measured).toBe(1);
    expect(a.sdDistance).toBeNull();
    expect(b).toEqual({ measured: 0, total: 0, meanDistance: null, sdDistance: null, sdLateral: null, sdVertical: null });
  });
  test('stock choice drops excluded', () => {
    const s2 = [shot('s1', { impactLateral: 1, impactVertical: 0 }, { excluded: true }), shots[3]!];
    expect(impactStats(['s1'], s2, 'stock')[0]!.total).toBe(1);
  });
});

describe('impactHeatmap', () => {
  test('cells, clamping, and unmeasured', () => {
    const shots = [
      shot('s1', { impactLateral: 0.6, impactVertical: 0.2 }),
      shot('s1', { impactLateral: -2, impactVertical: -3 }),
      shot('s1', { impactLateral: null, impactVertical: 0 }),
    ];
    const h = impactHeatmap(shots, 'all');
    expect(h.counts).toHaveLength(4);
    expect(h.counts[0]).toHaveLength(6);
    expect(h.counts[1]?.[4]).toBe(1);
    expect(h.counts[3]?.[0]).toBe(1);
    expect(h.measured).toBe(2);
    expect(h.total).toBe(3);
    expect(h.counts.flat().reduce((a, b) => a + b, 0)).toBe(2);
    expect(HEATMAP.cell).toBe(0.5);
  });
});

describe('clubGapping', () => {
  const carry = (club: string, vs: (number | null)[]) => vs.map((v) => shot('s1', { carry: v }, { club }));
  test('gap and no overlap', () => {
    const rows = clubGapping([...carry('3 Wood', [220, 230, 245]), ...carry('Driver', [240, 250, 260])], 'all');
    expect(rows.map((r) => r.club)).toEqual(['Driver', '3 Wood']);
    expect(rows[0]!.gapToNext).toBe(20);
    expect(rows[0]!.overlapsNext).toBe(false);
    expect(rows[0]!.few).toBe(true);
  });
  test('overlap', () => {
    const rows = clubGapping([...carry('Driver', [235, 250, 260]), ...carry('3 Wood', [220, 240, 250])], 'all');
    expect(rows[0]!.overlapsNext).toBe(true);
    expect(rows[0]!.gapToNext).toBe(10);
  });
  test('last row has no next; null-carry clubs absent; null club ignored', () => {
    const rows = clubGapping([
      ...carry('Driver', [250]), ...carry('7 Iron', [150, 151, 152]), ...carry('Putter', [null]),
      shot('s1', { carry: 100 }, { club: null }),
    ], 'all');
    expect(rows.map((r) => r.club)).toEqual(['Driver', '7 Iron']);
    expect(rows[1]!.gapToNext).toBeNull();
    expect(rows[1]!.overlapsNext).toBe(false);
  });
  test('stock choice leaves excluded shots out', () => {
    const shots = [...carry('Driver', [250, 250]), shot('s1', { carry: 100 }, { excluded: true })];
    expect(clubGapping(shots, 'stock')[0]!.n).toBe(2);
    expect(clubGapping(shots, 'all')[0]!.n).toBe(3);
  });
});
