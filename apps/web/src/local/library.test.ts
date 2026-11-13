import { describe, expect, test } from 'vitest';
import type { SessionRow } from './api';
import { filterSessions, monthGrid, nextSort, readSort, sessionsByDate, sortSessions, todayLocal } from './library';

const row = (o: Partial<SessionRow> & { id: string }): SessionRow =>
  ({ name: o.id, date: '2026-11-01', notes: '', handedness: 'right', createdAt: '2026-11-01T10:00:00Z', updatedAt: '', shotCount: 10, fileCount: 1, clubs: [], ...o }) as SessionRow;

const a = row({ id: 'a', name: 'Alpha', date: '2026-11-07', shotCount: 48, notes: 'windy day', clubs: [{ club: 'Driver', count: 48 }], createdAt: '2026-11-07T10:00:00Z' });
const b = row({ id: 'b', name: 'Bravo', date: '2026-10-28', shotCount: 71, clubs: [{ club: '7 Iron', count: 71 }], createdAt: '2026-10-28T10:00:00Z' });
const c = row({ id: 'c', name: 'Charlie', date: '2026-10-28', shotCount: 71, createdAt: '2026-10-29T10:00:00Z' });
const ids = (rs: SessionRow[]) => rs.map((r) => r.id);

describe('filterSessions', () => {
  test('matches a club name, a note and a name, ignoring case', () => {
    expect(ids(filterSessions([a, b, c], 'iron'))).toEqual(['b']);
    expect(ids(filterSessions([a, b, c], 'WINDY'))).toEqual(['a']);
    expect(ids(filterSessions([a, b, c], 'charl'))).toEqual(['c']);
  });
  test('an empty query keeps everything', () => {
    expect(filterSessions([a, b, c], '  ')).toHaveLength(3);
  });
});

describe('sortSessions', () => {
  test('date, newest first, ties by createdAt descending', () => {
    expect(ids(sortSessions([b, c, a], 'date-desc'))).toEqual(['a', 'c', 'b']);
  });
  test('date, oldest first, ties by createdAt descending', () => {
    expect(ids(sortSessions([a, b, c], 'date-asc'))).toEqual(['c', 'b', 'a']);
  });
  test('shots both ways', () => {
    expect(ids(sortSessions([a, b, c], 'shots-desc'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortSessions([a, b, c], 'shots-asc'))).toEqual(['a', 'c', 'b']);
  });
  test('name both ways', () => {
    expect(ids(sortSessions([c, a, b], 'name-asc'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortSessions([c, a, b], 'name-desc'))).toEqual(['c', 'b', 'a']);
  });
  test('files both ways', () => {
    const files = (id: string, fileCount: number) => ({ ...a, id, fileCount });
    const [x, y, z] = [files('x', 2), files('y', 5), files('z', 1)];
    expect(ids(sortSessions([x, y, z], 'files-desc'))).toEqual(['y', 'x', 'z']);
    expect(ids(sortSessions([x, y, z], 'files-asc'))).toEqual(['z', 'x', 'y']);
  });
  test('does not change the input', () => {
    const input = [a, b, c];
    sortSessions(input, 'name-desc');
    expect(ids(input)).toEqual(['a', 'b', 'c']);
  });
});

describe('monthGrid', () => {
  test('November 2026 has 42 cells starting on Monday 26 October', () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(g.find((d) => d.inMonth)?.date).toBe('2026-11-01');
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
  });
  test('a month that starts on Monday has no leading days', () => {
    expect(monthGrid(2026, 5)[0]).toEqual({ date: '2026-06-01', inMonth: true });
  });
});

test('sessionsByDate groups by date', () => {
  const m = sessionsByDate([b, c, a]);
  expect(ids(m.get('2026-10-28') ?? [])).toEqual(['b', 'c']);
  expect(m.get('2026-11-07')).toEqual([a]);
});

test('todayLocal uses the local calendar fields', () => {
  expect(todayLocal(new Date(2026, 10, 12, 23, 30))).toBe('2026-11-12');
  expect(todayLocal(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
});

describe('nextSort (clicking a column header)', () => {
  test('a new column starts in its natural direction: names A to Z, dates and counts biggest first', () => {
    expect(nextSort('date-desc', 'name')).toBe('name-asc');
    expect(nextSort('name-asc', 'date')).toBe('date-desc');
    expect(nextSort('date-desc', 'shots')).toBe('shots-desc');
    expect(nextSort('date-desc', 'files')).toBe('files-desc');
  });
  test('the sorted column flips direction', () => {
    expect(nextSort('date-desc', 'date')).toBe('date-asc');
    expect(nextSort('date-asc', 'date')).toBe('date-desc');
    expect(nextSort('name-asc', 'name')).toBe('name-desc');
  });
});

describe('readSort', () => {
  test('accepts a known sort and falls back to newest first otherwise', () => {
    expect(readSort('shots-asc')).toBe('shots-asc');
    expect(readSort(null)).toBe('date-desc');
    expect(readSort('clubs-asc')).toBe('date-desc');
  });
});

