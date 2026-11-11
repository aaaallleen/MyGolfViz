import { describe, expect, test } from 'vitest';
import { classifyHeader, fieldDef, splitHeader } from '@fsa/domain';
import { parseCell } from '@fsa/csv-parser';
import { HEADLINE_KEYS, headlineMetrics, summarize, type HeadlineKey } from './summary';
import { ALL_FIXTURES, SEPT_19_2022, fixtureParse, fixtureShots } from '../test/fixtureShots';

describe('summarize', () => {
  test('summarize([1,2,null,3]) → n 3, of 4, mean 2, sd 0.8165, min 1, max 3', () => {
    const s = summarize([1, 2, null, 3]);
    expect(s.n).toBe(3);
    expect(s.of).toBe(4);
    expect(s.mean).toBe(2);
    expect(s.sd).toBeCloseTo(0.8165, 4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(3);
  });
  test('summarize([null,null]) → n 0, nulls; summarize([5]) → sd null', () => {
    expect(summarize([null, null])).toEqual({ n: 0, of: 2, mean: null, sd: null, min: null, max: null });
    const s = summarize([5]);
    expect(s.mean).toBe(5);
    expect(s.sd).toBeNull();
  });
  test('HEADLINE_KEYS order', () => {
    expect(HEADLINE_KEYS).toEqual(['carry', 'total', 'ballSpeed', 'clubSpeed', 'smash', 'spin', 'lateral', 'clubPath']);
  });
});

describe('headlineMetrics', () => {
  test('Sept 19 2022 values', () => {
    const h = headlineMetrics(fixtureShots(SEPT_19_2022));
    expect(h.carry.mean).toBeCloseTo(201.406, 3);
    expect(h.carry.sd).toBeCloseTo(38.55, 3);
    expect(h.carry.n).toBe(16);
    expect(h.carry.of).toBe(16);
    expect(h.clubPath.mean).toBeCloseTo(8.429, 3);
    expect(h.clubPath.n).toBe(14);
    expect(h.clubPath.of).toBe(16);
    expect(h.lateral.mean).toBeCloseTo(35.219, 3);
    expect(h.spin.mean).toBeCloseTo(3344.875, 3);
    expect(h.smash.mean).toBeCloseTo(1.2975, 3); // brief's 1.297 is truncated; exact mean is 1.2975
  });
});

function unsigned(raw: string): number | null {
  const t = raw.replace(/[ ″″]/g, ' ').trim();
  if (t === '' || t === '-' || t.toLowerCase() === 'n/a') return null;
  const n = Number(t.split(/\s+/)[0]!.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

describe('export Avg/Dev parity', () => {
  const TOL: Partial<Record<HeadlineKey, number>> = { smash: 0.01, spin: 1 };
  const keys: HeadlineKey[] = ['carry', 'total', 'ballSpeed', 'clubSpeed', 'smash', 'spin', 'lateral', 'clubPath'];
  test.each(ALL_FIXTURES)('matches the export’s own Avg/Dev rows for every club: %s', (name) => {
    const parsed = fixtureParse(name);
    const shots = fixtureShots(name);
    const clubs = new Set(parsed.summaryRows.map((r) => r.club));
    expect(clubs.size).toBeGreaterThan(0);
    let compared = 0;
    for (const club of clubs) {
      const h = headlineMetrics(shots.filter((s) => s.club === club));
      const avg = parsed.summaryRows.find((r) => r.club === club && r.kind === 'Avg');
      const dev = parsed.summaryRows.find((r) => r.club === club && r.kind === 'Dev');
      for (const key of keys) {
        const header = parsed.columns.headers.find((hd) => {
          const c = classifyHeader(hd);
          return c.type === 'measurement' && c.def.key === key;
        });
        if (!header) continue;
        const tol = TOL[key] ?? 0.1;
        if (avg) {
          const r = parseCell(avg.raw[header] ?? '', fieldDef(key), splitHeader(header).unit);
          if (r.ok && r.value !== null && h[key].mean !== null) {
            expect(Math.abs(h[key].mean! - r.value), `${club} ${key} mean`).toBeLessThanOrEqual(tol);
            compared++;
          }
        }
        if (dev) {
          const v = unsigned(dev.raw[header] ?? '');
          if (v !== null && h[key].sd !== null) {
            expect(Math.abs(h[key].sd! - v), `${club} ${key} sd`).toBeLessThanOrEqual(tol);
            compared++;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
