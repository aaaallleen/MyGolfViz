import { describe, expect, it } from 'vitest';
import type { SessionRow } from '../api';
import {
  clubsInLibrary, DEFAULT_SCOPE, parseScope, resolveClub, scopeLine, sessionsForClub, sessionsForGapping,
} from './scope';

function row(id: string, day: number, clubs: Record<string, number>): SessionRow {
  return {
    id, name: id, date: `2026-01-${String(day).padStart(2, '0')}`,
    createdAt: `2026-01-${String(day).padStart(2, '0')}T10:00:00Z`,
    shotCount: 0, fileCount: 1,
    clubs: Object.entries(clubs).map(([club, count]) => ({ club, count })),
  } as SessionRow;
}

const rows = [
  row('s1', 1, { Driver: 5 }), row('s2', 2, { Driver: 5, '7 Iron': 3 }), row('s3', 3, { '7 Iron': 4 }),
  row('s4', 4, { Driver: 5 }), row('s5', 5, { Driver: 5 }), row('s6', 6, { Driver: 5 }),
  row('s7', 7, { Driver: 5 }), row('s8', 8, { Driver: 5, '7 Iron': 1 }),
];

describe('parseScope', () => {
  it('uses defaults for invalid fields', () => {
    expect(parseScope({ club: 7, last: 4, shots: 'stock' })).toEqual({ ...DEFAULT_SCOPE, shots: 'stock' });
    expect(parseScope(undefined)).toEqual(DEFAULT_SCOPE);
  });
  it('parses valid fields and picked', () => {
    expect(parseScope({ club: 'Driver', last: 'all', picked: ['a'], band: 'p10p90' })).toEqual({
      club: 'Driver', last: 'all', picked: ['a'], shots: 'all', band: 'p10p90',
    });
    expect(parseScope({ picked: [1] }).picked).toBeNull();
    expect(parseScope({ picked: 'a' }).picked).toBeNull();
    expect(parseScope({ picked: [] }).picked).toBeNull();
  });
});

describe('clubs', () => {
  it('lists clubs by shots and resolves the club', () => {
    expect(clubsInLibrary(rows)[0]).toEqual({ club: 'Driver', shots: 35 });
    expect(resolveClub({ ...DEFAULT_SCOPE, club: '7 Iron' }, rows)).toBe('7 Iron');
    expect(resolveClub({ ...DEFAULT_SCOPE, club: 'Putter' }, rows)).toBe('Driver');
    expect(resolveClub(DEFAULT_SCOPE, [])).toBeNull();
  });
});

describe('sessionsForClub', () => {
  it('returns the last N with the club, oldest first', () => {
    expect(sessionsForClub(rows, 'Driver', DEFAULT_SCOPE).map((r) => r.id)).toEqual(['s2', 's4', 's5', 's6', 's7', 's8']);
    expect(sessionsForClub(rows, 'Driver', { ...DEFAULT_SCOPE, last: 'all' })).toHaveLength(7);
  });
  it('uses picked ∩ club sessions', () => {
    const scope = { ...DEFAULT_SCOPE, picked: ['s8', 's3', 's1'] };
    expect(sessionsForClub(rows, 'Driver', scope).map((r) => r.id)).toEqual(['s1', 's8']);
  });
  it('falls back to last N when picked has no club sessions', () => {
    const scope = { ...DEFAULT_SCOPE, last: 3 as const, picked: ['s3'] };
    expect(sessionsForClub(rows, 'Driver', scope).map((r) => r.id)).toEqual(['s6', 's7', 's8']);
  });
});

describe('sessionsForGapping', () => {
  it('ignores the club', () => {
    expect(sessionsForGapping(rows, { ...DEFAULT_SCOPE, last: 3 }).map((r) => r.id)).toEqual(['s6', 's7', 's8']);
    expect(sessionsForGapping(rows, { ...DEFAULT_SCOPE, picked: ['s3', 's1'] }).map((r) => r.id)).toEqual(['s1', 's3']);
  });
  it('falls back to last N when none of the picked sessions exist any more', () => {
    const scope = { ...DEFAULT_SCOPE, last: 3 as const, picked: ['deleted'] };
    expect(sessionsForGapping(rows, scope).map((r) => r.id)).toEqual(['s6', 's7', 's8']);
  });
});

describe('scopeLine', () => {
  it('words the shots choice', () => {
    expect(scopeLine([{ excluded: false }], 'all')).toBe('All 1 shot');
    expect(scopeLine([{ excluded: false }, { excluded: true }], 'all')).toBe('All 2 shots');
    const shots = Array.from({ length: 214 }, (_, i) => ({ excluded: i < 23 }));
    expect(scopeLine(shots, 'stock')).toBe('Stock shots only · 23 excluded left out');
  });
});
