import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkingSetProvider, useWorkingSet } from '../state/store';
import type { ImportRow, SessionRow, ShotOut } from './api';
import { OpenSessionContext, type OpenSession } from './OpenSession';
import { sessionToWorkingSet } from './sessionToWorkingSet';

vi.mock('./api', () => ({
  getSession: vi.fn(), getShots: vi.fn(), reorderImports: vi.fn(), renameImport: vi.fn(), deleteImport: vi.fn(),
  deleteSession: vi.fn(), originalUrl: (id: string) => `/api/v1/imports/${id}/original`,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from './api';
import { toast } from 'sonner';
import { EmptySession } from './EmptySession';
import { ImportsPanel } from './ImportsPanel';

const session = { id: 's1', name: 'Range', date: '2026-01-02', notes: '', handedness: 'right', shotCount: 2, fileCount: 2 } as SessionRow;
const imp = (id: string, ordinal: number, name: string): ImportRow =>
  ({ id, ordinal, originalFilename: name, displayName: null, sha256: `sha-${id}`, byteLength: 1, parserVersion: 'p', shotCount: 1, importedAt: '2026-01-02T10:00:00Z', warnings: [], summaryRowCount: 0, sessionId: 's1' }) as ImportRow;
const shot = (id: string, importId: string) =>
  ({ id, importId, sourceRow: 1, club: 'Driver', excluded: false, flags: [], location: null, m: { carry: 1 }, mode: null, raw: {}, shotLabel: null, shotType: null }) as ShotOut;

let server: { imports: ImportRow[]; shots: ShotOut[] };
beforeEach(() => {
  server = { imports: [imp('i1', 1, 'a.csv'), imp('i2', 2, 'b.csv')], shots: [shot('x1', 'i1'), shot('x2', 'i2')] };
  vi.mocked(api.getSession).mockReset().mockImplementation(async () => ({ session, imports: server.imports }));
  vi.mocked(api.getShots).mockReset().mockImplementation(async () => server.shots);
  vi.mocked(api.reorderImports).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(api.renameImport).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(api.deleteImport).mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.error).mockReset();
});

function Screen() {
  const ws = useWorkingSet();
  const [open, setOpen] = useState<OpenSession | null>(null);
  useEffect(() => {
    setOpen({ session, imports: server.imports });
    ws.loadSession({ sessionId: 's1', ...sessionToWorkingSet(session, server.imports, server.shots), keepView: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ws.workingSet) return null;
  return (
    <OpenSessionContext.Provider value={{ open, setOpen }}>
      {ws.workingSet.shots.length === 0 ? <EmptySession /> : <><p data-testid="count">{ws.workingSet.shots.length} shots in session</p><ImportsPanel /></>}
    </OpenSessionContext.Provider>
  );
}
const renderIt = () => render(<MemoryRouter><WorkingSetProvider><Screen /></WorkingSetProvider></MemoryRouter>);

describe('ImportsPanel', () => {
  test('lists files with controls and a download link to the original', async () => {
    renderIt();
    expect(await screen.findByRole('heading', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up a.csv' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down b.csv' })).toBeDisabled();
    const link = screen.getByRole('link', { name: /Download original a\.csv/ });
    expect(link).toHaveAttribute('href', '/api/v1/imports/i1/original');
    expect(link).toHaveAttribute('download');
    expect(screen.getByRole('link', { name: 'Load Session CSV' })).toHaveAttribute('href', '/import?session=s1');
  });

  test('Move down on F1 reorders then reloads', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Move down a.csv' }));
    expect(api.reorderImports).toHaveBeenCalledWith('s1', ['i2', 'i1']);
    await waitFor(() => expect(api.getShots).toHaveBeenCalledTimes(1));
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });

  test('controls stay disabled while a change is in flight and a second click sends nothing', async () => {
    let release: () => void = () => {};
    vi.mocked(api.reorderImports).mockImplementation(() => new Promise<never>((r) => { release = () => r(undefined as never); }));
    renderIt();
    const down = await screen.findByRole('button', { name: 'Move down a.csv' });
    await userEvent.click(down);
    await waitFor(() => expect(down).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Remove file b.csv' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete session' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Rename b.csv' })).toBeDisabled();
    await userEvent.click(down);
    expect(api.reorderImports).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove file b.csv' })).toBeEnabled());
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });

  test('renaming to blank sends null', async () => {
    renderIt();
    const input = await screen.findByRole('textbox', { name: 'Rename a.csv' });
    await userEvent.clear(input);
    await userEvent.tab();
    expect(api.renameImport).toHaveBeenCalledWith('i1', null);
  });

  test('a failure shows the server detail', async () => {
    vi.mocked(api.reorderImports).mockRejectedValue(Object.assign(new Error('x'), { detail: 'Nope' }));
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Move down a.csv' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nope'));
  });

  test('removing a file confirms, deletes, reloads and updates the count', async () => {
    renderIt();
    expect(await screen.findByTestId('count')).toHaveTextContent('2 shots in session');
    await userEvent.click(screen.getByRole('button', { name: 'Remove file a.csv' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Remove “a.csv”?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Its 1 shots leave this session\. Exclusions you set on them are kept/)).toBeInTheDocument();
    server = { imports: [imp('i2', 2, 'b.csv')], shots: [shot('x2', 'i2')] };
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove file' }));
    expect(api.deleteImport).toHaveBeenCalledWith('i1');
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1 shots in session'));
  });

  test('removing the last file shows the empty session', async () => {
    server = { imports: [imp('i1', 1, 'a.csv')], shots: [shot('x1', 'i1')] };
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove file a.csv' }));
    server = { imports: [], shots: [] };
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove file' }));
    expect(await screen.findByText('No shots in this session')).toBeInTheDocument();
    expect(screen.getByText('Load one or more CSV exports into it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete session' })).toBeInTheDocument();
  });
});
