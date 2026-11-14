import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PreviewFile } from '../state/staging';
import type { ImportResponse, SessionRow } from './api';

vi.mock('./api', () => ({ listSessions: vi.fn(), checkImports: vi.fn() }));
import * as api from './api';
import { WorkingSetProvider } from '../state/store';
import { ImportActions, ImportDestination, type ImportDestinationValue } from './ImportDestination';
import { ImportResultPage } from './ImportResultPage';
import { OpenSessionProvider } from './OpenSession';

const row = (o: Partial<SessionRow> & { id: string }): SessionRow =>
  ({ name: o.id, date: '2026-11-01', notes: '', handedness: 'right', createdAt: '2026-11-01T10:00:00Z', updatedAt: '', shotCount: 10, fileCount: 1, clubs: [], ...o }) as SessionRow;
const s1 = row({ id: 's1', name: 'Driver range', date: '2026-11-01' });
const s2 = row({ id: 's2', name: 'Wedges', date: '2026-10-01' });

const file = (name: string, sha256: string): PreviewFile =>
  ({ key: name, name, byteLength: 1, sha256, parse: { ok: true, shots: [] }, duplicateOf: null, include: true }) as unknown as PreviewFile;

let latest: ImportDestinationValue | null = null;
function Harness({ staged }: { staged: PreviewFile[] }) {
  const [value, setValue] = useState<ImportDestinationValue>({ newSession: { name: '', date: '', notes: '', handedness: 'right' }, accept: {} });
  latest = value;
  return <ImportDestination staged={staged} value={value} onChange={setValue} />;
}
const renderIt = (staged: PreviewFile[] = [], path = '/import') =>
  render(<MemoryRouter initialEntries={[path]}><Harness staged={staged} /></MemoryRouter>);

beforeEach(() => {
  latest = null;
  vi.mocked(api.listSessions).mockReset().mockResolvedValue([s2, s1]);
  vi.mocked(api.checkImports).mockReset().mockResolvedValue({ results: [] });
});
afterEach(() => vi.useRealTimers());

describe('ImportDestination', () => {
  test('the new-session date is pre-filled with the local calendar date', async () => {
    // Ruling 7: process.env.TZ cannot be changed reliably inside a jsdom worker, so fake a time whose LOCAL date is known
    // (21:00 on the 12th local time, which is already the 13th in UTC for any zone behind UTC).
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 12, 21, 0) });
    renderIt();
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue('2026-11-12'));
    expect(screen.getByLabelText(/^Session name/)).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'New session' })).toBeChecked();
  });

  test('?session=s1 preselects Existing session and that session', async () => {
    renderIt([], '/import?session=s1');
    expect(await screen.findByRole('radio', { name: 'Existing session' })).toBeChecked();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Existing session' })).toHaveValue('s1'));
    expect(latest).toMatchObject({ sessionId: 's1' });
  });

  test('a stale ?session id selects nothing and says so', async () => {
    renderIt([], '/import?session=gone');
    expect(await screen.findByText('That session no longer exists. Choose another.')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Existing session' });
    expect(select).toHaveValue('');
    expect(latest).toMatchObject({ sessionId: '' });
  });

  test('choosing Existing session without ?session never auto-picks one', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('radio', { name: 'Existing session' }));
    const select = await screen.findByRole('combobox', { name: 'Existing session' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Driver range' })).toBeInTheDocument());
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Choose a session' })).toBeInTheDocument();
    expect(latest).toMatchObject({ sessionId: '' });
    expect(screen.queryByText('That session no longer exists. Choose another.')).toBeNull();
    await user.selectOptions(select, 's2');
    expect(latest).toMatchObject({ sessionId: 's2' });
  });

  test('sessions are listed newest first', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('radio', { name: 'Existing session' }));
    const select = await screen.findByRole('combobox', { name: 'Existing session' });
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3));
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Choose a session', 'Driver range', 'Wedges']);
  });

  test('from ?session, switching to New session fills the date with the local calendar date', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 12, 21, 0) });
    const user = userEvent.setup();
    renderIt([], '/import?session=s1');
    expect(await screen.findByRole('radio', { name: 'Existing session' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'New session' }));
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-12');
    expect(latest).toMatchObject({ newSession: { date: '2026-11-12' } });
  });

  test('duplicate statuses render and ticking Import anyway sets accept', async () => {
    const user = userEvent.setup();
    vi.mocked(api.checkImports).mockResolvedValue({
      results: [
        { sha256: 'a', inDestination: true, otherSessions: [] },
        { sha256: 'b', inDestination: false, otherSessions: [{ id: 's2', name: 'Wedges' }] },
      ],
    });
    renderIt([file('a.csv', 'a'), file('b.csv', 'b')], '/import?session=s1');
    expect(await screen.findByText('Already in this session — will be skipped')).toBeInTheDocument();
    expect(await screen.findByText('Also in “Wedges”')).toBeInTheDocument();
    expect(api.checkImports).toHaveBeenLastCalledWith(['a', 'b'], 's1');
    await user.click(screen.getByRole('checkbox', { name: 'Import anyway' }));
    expect(latest!.accept).toEqual({ b: true });
  });
});

describe('ImportActions', () => {
  const show = (date: string) =>
    render(
      <MemoryRouter>
        <WorkingSetProvider>
          <OpenSessionProvider>
            <ImportActions dest={{ newSession: { name: 'Range day', date, notes: '', handedness: 'right' }, accept: {} }} shotCount={16} />
          </OpenSessionProvider>
        </WorkingSetProvider>
      </MemoryRouter>,
    );

  test('Import files is disabled while the new-session date is blank', () => {
    show('');
    expect(screen.getByRole('button', { name: 'Import files' })).toBeDisabled();
  });

  test('Import files is enabled with a name and a date', () => {
    show('2026-11-12');
    expect(screen.getByRole('button', { name: 'Import files' })).toBeEnabled();
  });
});

describe('ImportResultPage', () => {
  const resp = (results: ImportResponse['results']): ImportResponse => ({ session: row({ id: 's1', name: 'Driver range' }), results });
  const r = (o: Partial<ImportResponse['results'][number]>) => ({ field: 'file0', name: 'x.csv', status: 'imported', shotCount: 10, warnings: [], ...o }) as ImportResponse['results'][number];
  const show = (state: unknown) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: '/import/result', state }]}>
        <Routes>
          <Route path="/import/result" element={<ImportResultPage />} />
          <Route path="/sessions" element={<div>library</div>} />
        </Routes>
      </MemoryRouter>,
    );

  test('heading, count line, links and per-file rows for a mixed response', () => {
    show(resp([
      r({ name: 'a.csv', shotCount: 10, warnings: [{}, {}] }),
      r({ name: 'b.csv', shotCount: 24 }),
      r({ name: 'c.csv', status: 'skipped_duplicate', shotCount: null }),
      r({ name: 'd.csv', status: 'invalid', shotCount: null, reason: 'in_other_session' }),
    ]));
    expect(screen.getByRole('heading', { level: 1, name: 'Imported into “Driver range”' })).toBeInTheDocument();
    expect(screen.getByText('2 files added · 34 shots added · 1 skipped · 1 not imported')).toBeInTheDocument();
    expect(screen.getByText('2 warnings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open session' })).toHaveAttribute('href', '/sessions/s1');
    expect(screen.getByRole('link', { name: 'Load more files' })).toHaveAttribute('href', '/import');
  });

  test.each([
    ['in_other_session', 'Also in another session — not imported'],
    ['storage_error', "Couldn't save this file"],
    ['not_flightscope', 'Not a valid FlightScope export'],
  ])('invalid reason %s reads %s', (reason, text) => {
    show(resp([r({ status: 'invalid', shotCount: null, reason })]));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('without state it redirects to the library', () => {
    show(undefined);
    expect(screen.getByText('library')).toBeInTheDocument();
  });
});
