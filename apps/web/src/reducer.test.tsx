import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_SESSION_DETAILS } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import { filterShots, displayOrder } from '@fsa/analytics';
import { initialState, reducer, tableOf, visibleOf } from './state/reducer';
import { WorkingSetProvider, useWorkingSet } from './state/store';
import { buildWorkingSet } from './state/staging';

const FIXTURE = join(__dirname, '../../../fixtures/flightscope/FlightScope Golf Session Sept 19 2022.csv');

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const FIXTURE_B = join(__dirname, '../../../fixtures/flightscope/FlightScope Golf Session Sept 19.csv');

async function incomingOf(path: string, name: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const { text } = decodeCsvBytes(bytes);
  return { name, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes), parse: parseFlightScopeCsv(text, name) };
}

// Two files with different clubs (Driver, 4 Hybrid).
async function stage() {
  let n = 0;
  return { type: 'stage' as const, makeKey: () => `k${++n}`, incoming: [await incomingOf(FIXTURE, 'a.csv'), await incomingOf(FIXTURE_B, 'b.csv')] };
}

describe('reducer', () => {
  test('analyze selects nothing; setClub moves selection to that club’s first shot; clear → initialState', async () => {
    let s = reducer(initialState, await stage());
    s = reducer(s, { type: 'analyze' });
    const ws = s.workingSet!;
    const first = displayOrder(filterShots(ws, s.filters))[0]!;
    expect(s.selectedId).toBeNull();
    const other = ws.shots.find((x) => x.club !== first.club)!;
    s = reducer(s, { type: 'setClub', club: other.club });
    expect(s.selectedId).toBe(displayOrder(filterShots(ws, s.filters))[0]!.id);
    expect(s.selectedId).not.toBe(first.id);
    expect(reducer(s, { type: 'clear' })).toEqual(initialState);
  });

  test('setClub lands on the first shot of that club even when the selected shot is already in it; All clears the selection', async () => {
    let s = reducer(initialState, await stage());
    s = reducer(s, { type: 'analyze' });
    const club = s.workingSet!.shots[0]!.club;
    const ofClub = () => displayOrder(filterShots(s.workingSet!, s.filters));
    s = reducer(s, { type: 'setClub', club });
    const third = ofClub()[2]!;
    s = reducer(s, { type: 'select', id: third.id });
    s = reducer(s, { type: 'setClub', club: null });
    expect(s.selectedId).toBeNull();
    s = reducer(s, { type: 'setClub', club });
    expect(s.selectedId).toBe(ofClub()[0]!.id);
  });

  test('select(null) clears the selection; a filter change keeps a still-visible shot and never picks one', async () => {
    let s = reducer(initialState, await stage());
    s = reducer(s, { type: 'analyze' });
    const [fileA, fileB] = s.workingSet!.files;
    s = reducer(s, { type: 'setFile', fileId: fileA!.id });
    expect(s.selectedId).toBeNull();
    const inA = displayOrder(filterShots(s.workingSet!, s.filters))[1]!;
    s = reducer(s, { type: 'select', id: inA.id });
    s = reducer(s, { type: 'setFile', fileId: null });
    expect(s.selectedId).toBe(inA.id);
    s = reducer(s, { type: 'setFile', fileId: fileB!.id });
    expect(s.selectedId).toBeNull();
    s = reducer(s, { type: 'step', delta: 1 });
    expect(s.selectedId).toBe(displayOrder(filterShots(s.workingSet!, s.filters))[0]!.id);
    s = reducer(s, { type: 'select', id: null });
    expect(s.selectedId).toBeNull();
  });

  test('setDetails survives analyze and filter changes; clear resets details', async () => {
    let s = reducer(initialState, { type: 'setDetails', patch: { name: 'Range day', date: '2026-11-07' } });
    s = reducer(s, await stage());
    s = reducer(s, { type: 'analyze' });
    s = reducer(s, { type: 'setClub', club: s.workingSet!.shots[0]!.club });
    s = reducer(s, { type: 'setFile', fileId: null });
    expect(s.details).toMatchObject({ name: 'Range day', date: '2026-11-07' });
    expect(reducer(s, { type: 'clear' }).details).toEqual(DEFAULT_SESSION_DETAILS);
  });
});

async function analyzed() {
  return reducer(reducer(initialState, await stage()), { type: 'analyze' });
}

describe('reducer: excluding shots', () => {
  test('excluded shots leave visibleOf but stay in tableOf; analyze keeps them; clear empties them', async () => {
    let s = await analyzed();
    const x = s.workingSet!.shots[0]!;
    s = reducer(s, { type: 'setExcluded', id: x.id, excluded: true });
    expect(visibleOf(s).some((v) => v.id === x.id)).toBe(false);
    expect(tableOf(s).some((v) => v.id === x.id)).toBe(true);
    s = reducer(reducer(s, await stage()), { type: 'analyze' });
    const again = s.workingSet!.shots.find((v) => v.sourceRow === x.sourceRow && v.fileId === x.fileId)!;
    expect(visibleOf(s).some((v) => v.id === again.id)).toBe(false);
    expect(reducer(s, { type: 'clear' })).toEqual(initialState);
  });

  test('removing a file and adding it back keeps its exclusions', async () => {
    let s = await analyzed();
    const fileB = s.workingSet!.files[1]!;
    const x = s.workingSet!.shots.find((v) => v.fileId === fileB.id)!;
    s = reducer(s, { type: 'setExcluded', id: x.id, excluded: true });
    const key = s.staged[1]!.key;
    s = reducer(s, { type: 'removeStaged', key });
    s = reducer(s, { type: 'stage', makeKey: () => 'again', incoming: [await incomingOf(FIXTURE_B, 'b.csv')] });
    s = reducer(s, { type: 'analyze' });
    const back = s.workingSet!.shots.find((v) => v.sourceRow === x.sourceRow && v.club === x.club)!;
    expect(visibleOf(s).some((v) => v.id === back.id)).toBe(false);
  });

  test('excludeAndAdvance moves the selection to the next included shot; setExcluded keeps it', async () => {
    let s = await analyzed();
    const order = tableOf(s);
    s = reducer(s, { type: 'select', id: order[1]!.id });
    s = reducer(s, { type: 'setExcluded', id: order[1]!.id, excluded: true });
    expect(s.selectedId).toBe(order[1]!.id);
    s = reducer(s, { type: 'setExcluded', id: order[1]!.id, excluded: false });
    s = reducer(s, { type: 'excludeAndAdvance', id: order[1]!.id });
    expect(s.selectedId).toBe(order[2]!.id);
    s = reducer(s, { type: 'excludeAndAdvance', id: order[5]!.id });
    expect(s.selectedId).toBe(order[2]!.id);
  });

  test('step from an excluded selection goes to the nearest included shot each way', async () => {
    let s = await analyzed();
    const o = tableOf(s);
    s = reducer(s, { type: 'setExcluded', id: o[2]!.id, excluded: true });
    s = reducer(s, { type: 'select', id: o[2]!.id });
    expect(reducer(s, { type: 'step', delta: 1 }).selectedId).toBe(o[3]!.id);
    expect(reducer(s, { type: 'step', delta: -1 }).selectedId).toBe(o[1]!.id);
  });

  test('a filter change keeps an excluded selection while it is still in the table', async () => {
    let s = await analyzed();
    const driver = s.workingSet!.shots.find((v) => v.club === 'Driver')!;
    s = reducer(s, { type: 'setExcluded', id: driver.id, excluded: true });
    s = reducer(s, { type: 'select', id: driver.id });
    s = reducer(s, { type: 'setFile', fileId: driver.fileId });
    expect(s.selectedId).toBe(driver.id);
    const other = s.workingSet!.shots.find((v) => v.club !== 'Driver')!.club;
    s = reducer(s, { type: 'setClub', club: other });
    expect(s.selectedId).toBe(visibleOf(s)[0]?.id ?? null);
    expect(s.selectedId).not.toBe(driver.id);
  });

  test('reveal widens the filter to show the shot', async () => {
    let s = await analyzed();
    const [fileA, fileB] = s.workingSet!.files;
    const shot = s.workingSet!.shots.find((v) => v.fileId === fileA!.id)!;
    const otherClub = s.workingSet!.shots.find((v) => v.club !== shot.club)!.club;
    s = reducer(s, { type: 'setFile', fileId: fileB!.id });
    s = reducer(s, { type: 'setClub', club: otherClub });
    s = reducer(s, { type: 'reveal', id: shot.id });
    expect(s.filters).toEqual({ club: shot.club, fileId: null });
    expect(s.selectedId).toBe(shot.id);
  });
});

describe('store', () => {
  test('addFiles with the Sept 19 2022 fixture File stages one ready file with 16 shots', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <WorkingSetProvider>{children}</WorkingSetProvider>;
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    const file = new File([new Uint8Array(readFileSync(FIXTURE))], 'x.csv', { type: 'text/csv' });
    await act(async () => { await result.current.addFiles([file]); });
    expect(result.current.staged).toHaveLength(1);
    expect(result.current.staged[0]).toMatchObject({ include: true, duplicateOf: null });
    expect(result.current.staged[0]!.parse.shots).toHaveLength(16);
    expect(buildWorkingSet(result.current.staged).shots).toHaveLength(16);
  });

  const wrapper = ({ children }: { children: ReactNode }) => <WorkingSetProvider>{children}</WorkingSetProvider>;
  const mkFile = () => new File([new Uint8Array(readFileSync(FIXTURE))], 'x.csv', { type: 'text/csv' });

  test('clear() during an in-flight addFiles leaves nothing staged', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    let p!: Promise<unknown>;
    act(() => { p = result.current.addFiles([mkFile()]); });
    act(() => { result.current.clear(); });
    await act(async () => { await p; });
    expect(result.current.staged).toEqual([]);
    expect(result.current.workingSet).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  test('busy stays true until all overlapping addFiles calls finish', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    let pA!: Promise<unknown>;
    let pB!: Promise<unknown>;
    act(() => {
      pA = result.current.addFiles([mkFile()]);
      pB = result.current.addFiles([mkFile(), mkFile(), mkFile()]);
    });
    expect(result.current.busy).toBe(true);
    let bDone = false;
    void pB.then(() => { bDone = true; });
    await act(async () => { await pA; });
    expect(bDone).toBe(false);
    expect(result.current.busy).toBe(true);
    await act(async () => { await pB; });
    expect(result.current.busy).toBe(false);
  });

  test('addFiles stages the readable files and reports the unreadable ones by name', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    const broken = new File(['x'], 'broken.csv', { type: 'text/csv' });
    Object.defineProperty(broken, 'arrayBuffer', { value: () => Promise.reject(new Error('NotReadableError')) });
    let out!: { failed: string[] };
    await act(async () => { out = await result.current.addFiles([broken, mkFile()]); });
    expect(out.failed).toEqual(['broken.csv']);
    expect(result.current.staged.map((f) => f.name)).toEqual(['x.csv']);
  });

  test('the undo from clear() restores everything, but only while nothing has changed since', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    await act(async () => { await result.current.addFiles([mkFile()]); });
    act(() => { result.current.setDetails({ name: 'Range day' }); });

    let undo: (() => void) | null = null;
    act(() => { undo = result.current.clear(); });
    expect(result.current.staged).toEqual([]);
    act(() => { undo!(); });
    expect(result.current.staged).toHaveLength(1);
    expect(result.current.details.name).toBe('Range day');

    act(() => { undo = result.current.clear(); });
    act(() => { result.current.setDetails({ name: 'New session' }); });
    act(() => { undo!(); });
    expect(result.current.staged).toEqual([]);
    expect(result.current.details.name).toBe('New session');
  });

  test('clear() with nothing to clear returns no undo', () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    let undo: (() => void) | null = () => {};
    act(() => { undo = result.current.clear(); });
    expect(undo).toBeNull();
  });

  test('includeAll returns a count and an undo that only works if nothing changed since', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    await act(async () => { await result.current.addFiles([mkFile()]); });
    act(() => { result.current.analyze(); });
    const [a, b, c] = result.current.tableShots;
    act(() => { result.current.setExcluded(a!.id, true); result.current.setExcluded(b!.id, true); });
    expect(result.current.excludedIds.size).toBe(2);
    let out: ReturnType<typeof result.current.includeAll> = null;
    act(() => { out = result.current.includeAll('session'); });
    expect(out!.count).toBe(2);
    expect(result.current.excludedIds.size).toBe(0);
    act(() => { out!.undo(); });
    expect(result.current.excludedIds.size).toBe(2);

    act(() => { out = result.current.includeAll('session'); });
    act(() => { result.current.setExcluded(c!.id, true); });
    act(() => { out!.undo(); });
    expect([...result.current.excludedIds]).toEqual([c!.id]);
    act(() => { result.current.includeAll('session'); });
    expect(result.current.includeAll('session')).toBeNull();
  });

  test('includeAll(filter) only includes the shots of the filtered club', async () => {
    const { result } = renderHook(() => useWorkingSet(), { wrapper });
    await act(async () => { await result.current.addFiles([mkFile(), new File([new Uint8Array(readFileSync(FIXTURE_B))], 'y.csv', { type: 'text/csv' })]); });
    act(() => { result.current.analyze(); });
    const shots = result.current.tableShots;
    const club = shots[0]!.club;
    const other = shots.find((v) => v.club !== club)!;
    act(() => { result.current.setExcluded(shots[0]!.id, true); result.current.setExcluded(other.id, true); });
    act(() => { result.current.setClub(club); });
    let out: ReturnType<typeof result.current.includeAll> = null;
    act(() => { out = result.current.includeAll('filter'); });
    expect(out!.count).toBe(1);
    expect([...result.current.excludedIds]).toEqual([other.id]);
  });
});
