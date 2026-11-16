import { describe, expect, test } from 'vitest';
import {
  basisLabel, chosenSession, DEFAULT_GAPPING_SCOPE, GAPPING_KEY, gappingLine, gappingQueryIds, parseGappingScope, shotsTitle,
} from './gappingScope';

const row = (id: string, date: string) => ({ id, date, createdAt: `${date}T10:00:00Z` });

describe('parseGappingScope', () => {
  test('defaults to Last 3 sessions, no picked session, Stock only', () => {
    expect(GAPPING_KEY).toBe('gapping.scope');
    expect(DEFAULT_GAPPING_SCOPE).toEqual({ basis: 'last3', sessionId: null, shots: 'stock' });
    expect(parseGappingScope(null)).toEqual(DEFAULT_GAPPING_SCOPE);
    expect(parseGappingScope('junk')).toEqual(DEFAULT_GAPPING_SCOPE);
  });

  test('keeps valid fields', () => {
    for (const basis of ['session', 'latest', 'last3', 'last10', 'all'] as const) {
      expect(parseGappingScope({ basis, sessionId: 's1', shots: 'all' })).toEqual({ basis, sessionId: 's1', shots: 'all' });
    }
  });

  test('defaults each junk field on its own', () => {
    expect(parseGappingScope({ basis: 'last6', sessionId: 4, shots: 'some' })).toEqual(DEFAULT_GAPPING_SCOPE);
    expect(parseGappingScope({ basis: 'all', sessionId: '', shots: 7 })).toEqual({ basis: 'all', sessionId: null, shots: 'stock' });
  });
});

describe('chosenSession', () => {
  const rows = [row('b', '2026-01-03'), row('a', '2026-01-01')];
  test('the picked session, else the latest; none for the other bases', () => {
    expect(chosenSession(rows, { basis: 'session', sessionId: 'a', shots: 'stock' })?.id).toBe('a');
    expect(chosenSession(rows, { basis: 'session', sessionId: 'gone', shots: 'stock' })?.id).toBe('b');
    expect(chosenSession(rows, { basis: 'latest', sessionId: 'a', shots: 'stock' })?.id).toBe('b');
    expect(chosenSession(rows, { basis: 'last3', sessionId: 'a', shots: 'stock' })).toBeNull();
    expect(chosenSession([], { basis: 'latest', sessionId: null, shots: 'stock' })).toBeNull();
  });
});

describe('basisLabel and gappingLine', () => {
  test('names the basis, or the session date for one session', () => {
    expect(basisLabel('last3', null)).toBe("Each club's last 3 sessions");
    expect(basisLabel('last10', null)).toBe("Each club's last 10 sessions");
    expect(basisLabel('all', null)).toBe('All time');
    expect(basisLabel('latest', row('b', '2026-11-09'))).toBe('9 Nov 2026');
    expect(basisLabel('session', row('a', '2026-01-01'))).toBe('1 Jan 2026');
  });

  test('adds the excluded count only for Stock only', () => {
    expect(gappingLine("Each club's last 3 sessions", 412, 9, 'stock')).toBe("Each club's last 3 sessions · 412 shots · 9 excluded left out");
    expect(gappingLine('9 Nov 2026', 64, 3, 'all')).toBe('9 Nov 2026 · 64 shots');
  });
});

describe('shotsTitle', () => {
  test('the count, sessions and date range; one session names its date', () => {
    expect(shotsTitle(38, ['2026-01-21', '2026-10-02', '2026-11-09'])).toBe('38 shots from 3 sessions, 21 Jan 2026 – 9 Nov 2026');
    expect(shotsTitle(12, ['2026-11-09'])).toBe('12 shots from 9 Nov 2026');
  });
});

describe('gappingQueryIds', () => {
  const perClub = new Map([['Driver', ['a', 'b']], ['7 Iron', ['b', 'c']]]);
  test('the union of every club’s sessions, none for All time', () => {
    expect(gappingQueryIds('last3', perClub)).toEqual(['a', 'b', 'c']);
    expect(gappingQueryIds('all', perClub)).toBeUndefined();
  });
});
