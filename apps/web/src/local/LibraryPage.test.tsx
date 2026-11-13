import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkingSetProvider } from '../state/store';
import type { SessionRow } from './api';

vi.mock('./api', () => ({ listSessions: vi.fn(), deleteSession: vi.fn() }));
import * as api from './api';
import { LibraryPage } from './LibraryPage';
import { todayLocal } from './library';

const row = (o: Partial<SessionRow> & { id: string }): SessionRow =>
  ({ name: o.id, date: '2026-11-01', notes: '', handedness: 'right', createdAt: '2026-11-01T10:00:00Z', updatedAt: '', shotCount: 10, fileCount: 1, clubs: [], ...o }) as SessionRow;
const old = row({ id: 'old', name: 'Iron work', date: '2026-10-28', shotCount: 71, fileCount: 3, clubs: [{ club: '7 Iron', count: 71 }] });
const recent = row({ id: 'new', name: 'Driver range', date: todayLocal(), shotCount: 48, fileCount: 2, clubs: [{ club: 'Driver', count: 34 }, { club: '3 Wood', count: 14 }] });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
function renderPage(path = '/sessions') {
  return render(
    <WorkingSetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sessions" element={<LibraryPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </WorkingSetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listSessions).mockReset().mockResolvedValue([old, recent]);
  vi.mocked(api.deleteSession).mockReset().mockResolvedValue(undefined);
});

describe('list', () => {
  test('shows the totals and the rows newest first', async () => {
    renderPage();
    expect(await screen.findByText('2 sessions · 119 shots · 5 source files')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Driver range|Iron work/ });
    expect(links.map((l) => l.textContent)).toEqual(['Driver range', 'Iron work']);
    expect(links[1]).toHaveAttribute('href', '/sessions/old');
    expect(screen.getByText('28 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Driver 34')).toBeInTheDocument();
  });

  test('typing a club name filters the rows', async () => {
    renderPage();
    await screen.findByText('Iron work');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a session' }), 'wood');
    expect(screen.queryByText('Iron work')).not.toBeInTheDocument();
    expect(screen.getByText('Driver range')).toBeInTheDocument();
  });

  test('delete asks first, then removes the row', async () => {
    renderPage();
    await screen.findByText('Iron work');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Iron work' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete session' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete “Iron work”?')).toBeInTheDocument();
    expect(within(dialog).getByText('This removes 71 shots and 3 files from MyGolfViz. The original CSVs on your computer are not touched.')).toBeInTheDocument();
    expect(api.deleteSession).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete session' }));
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('old'));
    await waitFor(() => expect(screen.queryByText('Iron work')).not.toBeInTheDocument());
  });
});

describe('calendar', () => {
  test('shows today\'s session on its day and in the side panel', async () => {
    renderPage('/sessions?view=calendar');
    const chip = await screen.findByRole('link', { name: /^Driver range/ });
    expect(chip).toHaveAttribute('href', '/sessions/new');
    expect(screen.getByRole('link', { name: 'Open Driver range' })).toHaveAttribute('href', '/sessions/new');
    expect(screen.getByText('1 session')).toBeInTheDocument();
  });

  test('the segmented control switches to the calendar', async () => {
    renderPage();
    await screen.findByText('Iron work');
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

test('with no sessions it shows the empty state and a way to import', async () => {
  vi.mocked(api.listSessions).mockResolvedValue([]);
  renderPage();
  expect(await screen.findByText('No sessions yet')).toBeInTheDocument();
  expect(screen.getByText('Load one or more FlightScope CSV exports. You choose the session they belong to and what it is called.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Load Session CSV' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/import');
});
