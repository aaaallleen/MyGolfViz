import { describe, expect, test } from 'vitest';
import type { Measurements, Shot } from '@fsa/domain';
import { nextSlot, rememberedSet, rememberSet, readSet, sessionsNewestFirst, setSearch, shotPickLabel, slotIds, withoutShot, withShot } from './compareState';

function shot(m: Partial<Measurements>): Shot {
  return { id: 'x', fileId: 'f', sourceRow: 3, shotLabel: '7', club: 'Driver', shotType: null, mode: null, location: null, m: m as Measurements, raw: {}, flags: [] };
}

const set = (a: string | null, b: string | null, ...extra: string[]) => ({ a, b, extra });

describe('readSet', () => {
  test('reads a and b', () => expect(readSet(new URLSearchParams('?a=x&b=y'))).toEqual(set('x', 'y')));
  test('reads c and d', () => expect(readSet(new URLSearchParams('?a=x&b=y&c=z&d=w'))).toEqual(set('x', 'y', 'z', 'w')));
  test('empty value is null', () => expect(readSet(new URLSearchParams('?a=&b=y'))).toEqual(set(null, 'y')));
  test('whitespace value is null', () => expect(readSet(new URLSearchParams('?a=%20'))).toEqual(set(null, null)));
  test('a lone d moves up to C', () => expect(readSet(new URLSearchParams('?a=x&b=y&c=&d=w'))).toEqual(set('x', 'y', 'w')));
});

describe('setSearch', () => {
  test('one id', () => expect(setSearch(set('x', null))).toBe('?a=x'));
  test('b only', () => expect(setSearch(set(null, 'y'))).toBe('?b=y'));
  test('none', () => expect(setSearch(set(null, null))).toBe(''));
  test('encodes ids', () => expect(setSearch(set('a b', 'c'))).toBe('?a=a%20b&b=c'));
  test('four shots', () => expect(setSearch(set('x', 'y', 'z', 'w'))).toBe('?a=x&b=y&c=z&d=w'));
  test('round-trips through readSet', () => {
    const p = set('x', 'y', 'z');
    expect(readSet(new URLSearchParams(setSearch(p)))).toEqual(p);
  });
});

describe('adding and removing shots', () => {
  test('a shot can be added only once A and B are chosen, up to four shots', () => {
    expect(nextSlot(set('x', null))).toBeNull();
    expect(nextSlot(set('x', 'y'))).toBe('C');
    expect(nextSlot(set('x', 'y', 'z'))).toBe('D');
    expect(nextSlot(set('x', 'y', 'z', 'w'))).toBeNull();
  });
  test('slotIds lists A and B, then C and D in use', () => {
    expect(slotIds(set(null, 'y')).map((s) => s.slot)).toEqual(['A', 'B']);
    expect(slotIds(set('x', 'y', 'z', 'w'))).toEqual([
      { slot: 'A', id: 'x' }, { slot: 'B', id: 'y' }, { slot: 'C', id: 'z' }, { slot: 'D', id: 'w' },
    ]);
  });
  test('withShot replaces a slot, or adds the next one', () => {
    expect(withShot(set('x', 'y'), 'A', 'n')).toEqual(set('n', 'y'));
    expect(withShot(set('x', 'y'), 'C', 'z')).toEqual(set('x', 'y', 'z'));
    expect(withShot(set('x', 'y', 'z'), 'C', 'n')).toEqual(set('x', 'y', 'n'));
    expect(withShot(set('x', 'y', 'z'), 'D', 'w')).toEqual(set('x', 'y', 'z', 'w'));
  });
  test('removing C moves D up', () => {
    expect(withoutShot(set('x', 'y', 'z', 'w'), 'C')).toEqual(set('x', 'y', 'w'));
    expect(withoutShot(set('x', 'y', 'z', 'w'), 'D')).toEqual(set('x', 'y', 'z'));
  });
});

describe('rememberSet', () => {
  test('stores and clears', () => {
    rememberSet(set('x', null, 'z'));
    expect(rememberedSet()).toEqual(set('x', null, 'z'));
    rememberSet(set(null, null));
    expect(rememberedSet()).toBeNull();
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
