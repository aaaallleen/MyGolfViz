import { describe, expect, test } from 'vitest';
import type { Measurements, Shot } from '@fsa/domain';
import { pairSearch, readPair, rememberedPair, rememberPair, sessionsNewestFirst, shotPickLabel } from './compareState';

function shot(m: Partial<Measurements>): Shot {
  return { id: 'x', fileId: 'f', sourceRow: 3, shotLabel: '7', club: 'Driver', shotType: null, mode: null, location: null, m: m as Measurements, raw: {}, flags: [] };
}

describe('readPair', () => {
  test('reads both ids', () => expect(readPair(new URLSearchParams('?a=x&b=y'))).toEqual({ a: 'x', b: 'y' }));
  test('empty value is null', () => expect(readPair(new URLSearchParams('?a=&b=y'))).toEqual({ a: null, b: 'y' }));
  test('whitespace value is null', () => expect(readPair(new URLSearchParams('?a=%20'))).toEqual({ a: null, b: null }));
});

describe('pairSearch', () => {
  test('one id', () => expect(pairSearch({ a: 'x', b: null })).toBe('?a=x'));
  test('b only', () => expect(pairSearch({ a: null, b: 'y' })).toBe('?b=y'));
  test('none', () => expect(pairSearch({ a: null, b: null })).toBe(''));
  test('encodes ids', () => expect(pairSearch({ a: 'a b', b: 'c' })).toBe('?a=a%20b&b=c'));
});

describe('rememberPair', () => {
  test('stores and clears', () => {
    rememberPair({ a: 'x', b: null });
    expect(rememberedPair()).toEqual({ a: 'x', b: null });
    rememberPair({ a: null, b: null });
    expect(rememberedPair()).toBeNull();
  });
});

describe('sessionsNewestFirst', () => {
  test('orders by date then createdAt, descending', () => {
    const rows = [
      { id: 1, date: '2026-10-01', createdAt: '2026-10-01T10:00' },
      { id: 2, date: '2026-11-07', createdAt: '2026-11-07T09:00' },
      { id: 3, date: '2026-11-07', createdAt: '2026-11-07T12:00' },
    ];
    expect(sessionsNewestFirst(rows).map((r) => r.id)).toEqual([3, 2, 1]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('shotPickLabel', () => {
  const full = shot({ carry: 248.3, clubSpeed: 104.2 });
  test('single file', () => expect(shotPickLabel(full, 1, 1, false)).toBe('Shot 7 · 248.3 yd · 104.2 mph'));
  test('multi file, excluded', () => expect(shotPickLabel(full, 2, 2, true)).toBe('F2 Shot 7 · 248.3 yd · 104.2 mph (excluded)'));
  test('missing carry', () => expect(shotPickLabel(shot({ carry: null, clubSpeed: 104.2 }), 1, 1, false)).toContain('· – ·'));
});
