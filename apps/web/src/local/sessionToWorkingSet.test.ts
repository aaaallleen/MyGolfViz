import { describe, expect, test } from 'vitest';
import { exclusionKey } from '@fsa/analytics';
import type { ImportRow, SessionRow, ShotOut } from './api';
import { sessionToWorkingSet } from './sessionToWorkingSet';

const session = { id: 's1', name: 'Range day', date: '2026-01-02', notes: 'windy', handedness: 'left' } as SessionRow;

function imp(id: string, ordinal: number, over: Partial<ImportRow> = {}): ImportRow {
  return { id, ordinal, originalFilename: `${id}.csv`, displayName: null, sha256: `sha-${id}`, byteLength: 10 + ordinal, parserVersion: 'p1', sessionId: 's1', importedAt: '', shotCount: 0, summaryRowCount: 0, warnings: [], ...over };
}
function shot(id: string, importId: string, sourceRow: number, over: Partial<ShotOut> = {}): ShotOut {
  return { id, importId, sourceRow, club: 'Driver', excluded: false, flags: [], location: null, m: { carry: 200, spin: null }, mode: null, raw: {}, shotLabel: null, shotType: null, ...over };
}

describe('sessionToWorkingSet', () => {
  test('orders files by ordinal and shots by import ordinal then source row', () => {
    const { workingSet } = sessionToWorkingSet(session, [imp('b', 2), imp('a', 1)], [shot('s3', 'b', 1), shot('s2', 'a', 9), shot('s1', 'a', 2)]);
    expect(workingSet.files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(workingSet.shots.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(workingSet.shots[2]!.fileId).toBe('b');
    expect(workingSet.files[0]).toEqual({ id: 'a', name: 'a.csv', ordinal: 1, sha256: 'sha-a', byteLength: 11, parserVersion: 'p1' });
  });

  test('displayName overrides originalFilename', () => {
    const { workingSet } = sessionToWorkingSet(session, [imp('a', 1, { displayName: 'Nice name' })], []);
    expect(workingSet.files[0]!.name).toBe('Nice name');
  });

  test('excluded keys use the import sha256', () => {
    const { excluded } = sessionToWorkingSet(session, [imp('a', 1)], [shot('x', 'a', 4, { excluded: true }), shot('y', 'a', 5)]);
    expect([...excluded]).toEqual([exclusionKey('sha-a', 4)]);
  });

  test('m nulls stay null and details come from the session', () => {
    const { workingSet, details } = sessionToWorkingSet(session, [imp('a', 1)], [shot('x', 'a', 1)]);
    expect(workingSet.shots[0]!.m.spin).toBeNull();
    expect(details).toEqual({ name: 'Range day', date: '2026-01-02', notes: 'windy', handedness: 'left' });
  });
});
