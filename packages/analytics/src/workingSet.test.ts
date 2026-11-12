import { describe, expect, test } from 'vitest';
import type { Shot, WorkingSet } from '@fsa/domain';
import { clubCounts, displayOrder, filterShots, reconcileSelection, selectionPosition, stepSelection } from './workingSet';

const mk = (id: string, fileId: string, club: string, sourceRow: number): Shot => ({
  id, fileId, sourceRow, shotLabel: null, club, shotType: null, mode: null, location: null,
  m: {} as Shot['m'], raw: {}, flags: [],
});
const D1 = mk('D1', 'f1', 'Driver', 2);
const I1 = mk('I1', 'f1', '7 Iron', 3);
const D2 = mk('D2', 'f2', 'Driver', 2);
const I2 = mk('I2', 'f2', '7 Iron', 3);
const shots = [D1, I1, D2, I2];
const ws: WorkingSet = { files: [], shots };
const ids = (s: Shot[]) => s.map((x) => x.id);

describe('working set ops', () => {
  test('filterShots by club and by fileId keeps canonical order', () => {
    expect(ids(filterShots(ws, { club: null, fileId: null }))).toEqual(['D1', 'I1', 'D2', 'I2']);
    expect(ids(filterShots(ws, { club: 'Driver', fileId: null }))).toEqual(['D1', 'D2']);
    expect(ids(filterShots(ws, { club: null, fileId: 'f2' }))).toEqual(['D2', 'I2']);
    expect(ids(filterShots(ws, { club: '7 Iron', fileId: 'f1' }))).toEqual(['I1']);
  });
  test('displayOrder groups by club in first-appearance order: D1,D2,I1,I2', () => {
    expect(ids(displayOrder(shots))).toEqual(['D1', 'D2', 'I1', 'I2']);
  });
  test('clubCounts', () => {
    expect(clubCounts(shots)).toEqual([{ club: 'Driver', count: 2 }, { club: '7 Iron', count: 2 }]);
  });
  test('reconcileSelection: keeps visible id; filtered-out id → first visible; empty → null', () => {
    expect(reconcileSelection('I1', shots)).toBe('I1');
    expect(reconcileSelection('X', [D2, I2])).toBe('D2');
    expect(reconcileSelection(null, [D2, I2])).toBe('D2');
    expect(reconcileSelection('D1', [])).toBeNull();
  });
  test('stepSelection: next/prev, clamps at both ends, unknown id → first', () => {
    expect(stepSelection('D1', shots, 1)).toBe('I1');
    expect(stepSelection('I1', shots, -1)).toBe('D1');
    expect(stepSelection('D1', shots, -1)).toBe('D1');
    expect(stepSelection('I2', shots, 1)).toBe('I2');
    expect(stepSelection('nope', shots, 1)).toBe('D1');
    expect(stepSelection(null, shots, -1)).toBe('D1');
    expect(stepSelection('D1', [], 1)).toBeNull();
  });
  test('selectionPosition', () => {
    expect(selectionPosition('D2', shots)).toEqual({ index: 3, total: 4 });
    expect(selectionPosition('D2', [D1, D2, I1, I2])).toEqual({ index: 2, total: 4 });
    expect(selectionPosition('X', shots)).toBeNull();
    expect(selectionPosition(null, shots)).toBeNull();
  });
});
