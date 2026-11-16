import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkingSetProvider, useWorkingSet } from '../state/store';
import { ELLIPSE_KEY, useEllipsePreference } from './useEllipsePreference';

vi.mock('./api', () => ({ getSetting: vi.fn(), putSetting: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from './api';
import { toast } from 'sonner';

const getSetting = vi.mocked(api.getSetting);
const putSetting = vi.mocked(api.putSetting);
const wrapper = ({ children }: { children: ReactNode }) => <WorkingSetProvider>{children}</WorkingSetProvider>;
const setup = () => renderHook(() => { useEllipsePreference(); return useWorkingSet(); }, { wrapper });
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  getSetting.mockReset();
  putSetting.mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.error).mockReset();
});

describe('useEllipsePreference', () => {
  test('applies the saved value without saving it back, then saves later changes', async () => {
    getSetting.mockResolvedValue('all');
    const { result } = setup();
    await flush();
    expect(getSetting).toHaveBeenCalledWith(ELLIPSE_KEY);
    expect(result.current.ellipseKind).toBe('all');
    expect(putSetting).not.toHaveBeenCalled();
    act(() => result.current.setEllipseKind('sd1'));
    expect(putSetting).toHaveBeenCalledWith('ellipse.kind', 'sd1');
  });

  test('a junk or missing value leaves 1 SD and saves nothing', async () => {
    getSetting.mockResolvedValue('wide');
    const { result } = setup();
    await flush();
    expect(result.current.ellipseKind).toBe('sd1');
    expect(putSetting).not.toHaveBeenCalled();
  });

  test('a change made while loading wins and is saved; the late answer does not overwrite it', async () => {
    let answer!: (v: string) => void;
    getSetting.mockReturnValue(new Promise((r) => { answer = r as (v: string) => void; }));
    const { result } = setup();
    act(() => result.current.setEllipseKind('all'));
    expect(putSetting).toHaveBeenCalledWith('ellipse.kind', 'all');
    await act(async () => { answer('sd1'); });
    expect(result.current.ellipseKind).toBe('all');
    expect(putSetting).toHaveBeenCalledTimes(1);
  });

  test('a failed save shows a toast', async () => {
    getSetting.mockResolvedValue(null);
    putSetting.mockRejectedValue(new Error('x'));
    const { result } = setup();
    await flush();
    act(() => result.current.setEllipseKind('all'));
    await flush();
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the ellipse choice");
  });
});
