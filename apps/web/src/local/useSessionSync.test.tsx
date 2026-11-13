import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { exclusionKey } from '@fsa/analytics';
import { WorkingSetProvider, useWorkingSet } from '../state/store';
import type { ImportRow, SessionRow, ShotOut } from './api';
import { sessionToWorkingSet } from './sessionToWorkingSet';
import { useSessionSync } from './useSessionSync';

vi.mock('./api', () => ({ patchSession: vi.fn(), patchExclusions: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from './api';
import { toast } from 'sonner';

const session = { id: 's1', name: 'Range', date: '2026-01-02', notes: '', handedness: 'right' } as SessionRow;
const imp = { id: 'a', ordinal: 1, originalFilename: 'a.csv', displayName: null, sha256: 'sha-a', byteLength: 1, parserVersion: 'p' } as ImportRow;
const shot = (id: string, sourceRow: number) =>
  ({ id, importId: 'a', sourceRow, club: 'Driver', excluded: false, flags: [], location: null, m: { carry: 1 }, mode: null, raw: {}, shotLabel: null, shotType: null }) as ShotOut;
const shots = [shot('x1', 1), shot('x2', 2), shot('x3', 3)];
const key = (row: number) => exclusionKey('sha-a', row);

const wrapper = ({ children }: { children: ReactNode }) => <WorkingSetProvider>{children}</WorkingSetProvider>;
function setup() {
  const hook = renderHook(() => { useSessionSync(); return useWorkingSet(); }, { wrapper });
  act(() => {
    const loaded = sessionToWorkingSet(session, [imp], shots);
    hook.result.current.loadSession({ sessionId: 's1', ...loaded, keepView: false });
  });
  return hook;
}
const patchSession = vi.mocked(api.patchSession);
const patchExclusions = vi.mocked(api.patchExclusions);
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers();
  patchSession.mockReset().mockResolvedValue(session);
  patchExclusions.mockReset().mockResolvedValue({ excludedShotIds: [] });
  vi.mocked(toast.error).mockReset();
});
afterEach(() => vi.useRealTimers());

describe('details', () => {
  test('a fresh load sends nothing', async () => {
    setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(patchSession).not.toHaveBeenCalled();
    expect(patchExclusions).not.toHaveBeenCalled();
  });

  test('details are saved once after 400 ms of no typing', async () => {
    const { result } = setup();
    act(() => result.current.setDetails({ notes: 'w' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.setDetails({ notes: 'wi' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(patchSession).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(patchSession).toHaveBeenCalledTimes(1);
    expect(patchSession).toHaveBeenCalledWith('s1', { notes: 'wi' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(patchSession).toHaveBeenCalledTimes(1);
  });

  test('a blank name is not sent; the other changed fields are', async () => {
    const { result } = setup();
    act(() => result.current.setDetails({ name: '   ', notes: 'n' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(patchSession).toHaveBeenCalledWith('s1', { notes: 'n' });
  });

  test('a failed details save rolls back and toasts', async () => {
    patchSession.mockRejectedValue(new Error('boom'));
    const { result } = setup();
    act(() => result.current.setDetails({ notes: 'n' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(toast.error).toHaveBeenCalledWith("Couldn't save session details");
    expect(result.current.details.notes).toBe('');
  });
});

describe('exclusions', () => {
  test('fast exclude/include/exclude sends requests one at a time and ends at the final state', async () => {
    const server = new Set<string>();
    const apply = (b: { exclude: string[]; include: string[] }) => {
      b.exclude.forEach((i) => server.add(i));
      b.include.forEach((i) => server.delete(i));
    };
    let release!: () => void;
    let inflight = 0;
    let maxInflight = 0;
    patchExclusions.mockImplementationOnce(async (_id, b) => {
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      await new Promise<void>((r) => { release = r; });
      apply(b); inflight--;
      return { excludedShotIds: [...server] };
    });
    patchExclusions.mockImplementation(async (_id, b) => {
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      apply(b); inflight--;
      return { excludedShotIds: [...server] };
    });
    const { result } = setup();
    act(() => result.current.setExcluded('x1', true));
    await flush();
    expect(patchExclusions).toHaveBeenCalledTimes(1);
    act(() => result.current.setExcluded('x1', false));
    act(() => result.current.setExcluded('x2', true));
    await flush();
    expect(patchExclusions).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
    expect(patchExclusions).toHaveBeenCalledTimes(2);
    expect(patchExclusions).toHaveBeenLastCalledWith('s1', { exclude: ['x2'], include: ['x1'] });
    await flush();
    expect(maxInflight).toBe(1);
    expect(server).toEqual(new Set(['x2']));
    expect(result.current.excludedIds).toEqual(server);
    expect(result.current.excluded).toEqual(new Set([key(2)]));
  });

  test('a failed exclusion save rolls back to the last saved set', async () => {
    patchExclusions.mockRejectedValue(new Error('boom'));
    const { result } = setup();
    act(() => result.current.setExcluded('x3', true));
    await flush();
    await flush();
    expect(toast.error).toHaveBeenCalledWith("Couldn't save exclusions");
    expect(result.current.excluded.size).toBe(0);
  });
});
