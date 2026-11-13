import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkingSetProvider, useWorkingSet } from '../state/store';
import type { ImportRow, SessionRow, ShotOut } from './api';
import { OpenSessionProvider } from './OpenSession';
import { sessionToWorkingSet } from './sessionToWorkingSet';

vi.mock('./api', () => ({
  getSession: vi.fn(), getShots: vi.fn(), originalUrl: (id: string) => `/api/v1/imports/${id}/original`,
  ApiError: class extends Error {},
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('../routes', async () => {
  const { ImportsPanel } = await import('./ImportsPanel');
  return { OverviewPage: () => <ImportsPanel />, InspectorPage: () => null };
});
import * as api from './api';
import { SessionRoute } from './SessionRoute';

const session = { id: 's1', name: 'Range', date: '2026-01-02', notes: '', handedness: 'right', shotCount: 1, fileCount: 1 } as SessionRow;
const imps = [{ id: 'i1', ordinal: 1, originalFilename: 'a.csv', displayName: null, sha256: 'sha', byteLength: 1, parserVersion: 'p', shotCount: 1, importedAt: '2026-01-02T10:00:00Z', warnings: [], summaryRowCount: 0, sessionId: 's1' }] as ImportRow[];
const shots = [{ id: 'x1', importId: 'i1', sourceRow: 1, club: 'Driver', excluded: false, flags: [], location: null, m: { carry: 1 }, mode: null, raw: {}, shotLabel: null, shotType: null }] as ShotOut[];

beforeEach(() => {
  vi.mocked(api.getSession).mockReset().mockResolvedValue({ session, imports: imps });
  vi.mocked(api.getShots).mockReset().mockResolvedValue(shots);
});

function Preload({ children }: { children: React.ReactNode }) {
  const ws = useWorkingSet();
  useEffect(() => {
    ws.loadSession({ sessionId: 's1', ...sessionToWorkingSet(session, imps, shots), keepView: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ws.sessionId === 's1' ? <>{children}</> : null;
}

const tree = (preload: boolean) => {
  const routes = (
    <Routes>
      <Route path="/sessions" element={<Link to="/sessions/s1">open</Link>} />
      <Route path="/sessions/:id" element={<><Link to="/sessions">back</Link><SessionRoute page="overview" /></>} />
    </Routes>
  );
  return (
    <MemoryRouter initialEntries={['/sessions/s1']}>
      <WorkingSetProvider>
        <OpenSessionProvider>{preload ? <Preload>{routes}</Preload> : routes}</OpenSessionProvider>
      </WorkingSetProvider>
    </MemoryRouter>
  );
};

describe('SessionRoute and the files panel', () => {
  test('the Files panel is back after leaving the session and returning to it', async () => {
    render(tree(false));
    expect(await screen.findByRole('heading', { name: 'Files' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'back' }));
    await userEvent.click(await screen.findByRole('link', { name: 'open' }));
    expect(await screen.findByRole('heading', { name: 'Files' })).toBeInTheDocument();
    expect(vi.mocked(api.getSession).mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('a store that already holds the session but no panel rows is fetched', async () => {
    render(tree(true));
    expect(await screen.findByRole('heading', { name: 'Files' })).toBeInTheDocument();
    await waitFor(() => expect(api.getSession).toHaveBeenCalledTimes(1));
  });
});
