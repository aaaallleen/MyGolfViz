import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, test } from 'vitest';
import { DEFAULT_SESSION_DETAILS } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import { filterShots, displayOrder } from '@fsa/analytics';
import { initialState, reducer } from './state/reducer';
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
  test('analyze selects first visible; setClub moves selection to that club’s first shot; clear → initialState', async () => {
    let s = reducer(initialState, await stage());
    s = reducer(s, { type: 'analyze' });
    const ws = s.workingSet!;
    const first = displayOrder(filterShots(ws, s.filters))[0]!;
    expect(s.selectedId).toBe(first.id);
    const other = ws.shots.find((x) => x.club !== first.club)!;
    s = reducer(s, { type: 'setClub', club: other.club });
    expect(s.selectedId).toBe(displayOrder(filterShots(ws, s.filters))[0]!.id);
    expect(s.selectedId).not.toBe(first.id);
    expect(reducer(s, { type: 'clear' })).toEqual(initialState);
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
});
