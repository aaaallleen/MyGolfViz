import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ImportRow, SessionDetail, SessionRow, ShotOut } from '../api';

vi.mock('../api', () => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  getShots: vi.fn(),
}));
import * as api from '../api';
import { ShotPicker } from './ShotPicker';

const session = (o: Partial<SessionRow> & { id: string }): SessionRow =>
  ({ name: o.id, date: '2026-11-01', notes: '', handedness: 'right', createdAt: '2026-11-01T10:00:00Z', updatedAt: '', shotCount: 3, fileCount: 1, clubs: [], ...o }) as SessionRow;
const later = session({ id: 'later', name: 'Later', date: '2026-11-07', fileCount: 2, clubs: [{ club: '7 Iron', count: 1 }, { club: 'Driver', count: 2 }] });
const earlier = session({ id: 'earlier', name: 'Earlier', date: '2026-10-01', fileCount: 1, clubs: [{ club: 'Driver', count: 1 }] });

const shot = (id: string, importId: string, club: string, sourceRow: number, carry: number, speed: number, excluded = false): ShotOut =>
  ({ id, importId, club, sourceRow, excluded, shotLabel: '1', shotType: null, mode: null, location: null, raw: {}, flags: [], m: { carry, clubSpeed: speed } }) as unknown as ShotOut;

const LATER_SHOTS = [
  shot('l2', 'i2', 'Driver', 1, 240, 108, true),
  shot('l1', 'i1', 'Driver', 1, 250, 110),
  shot('l7', 'i1', '7 Iron', 2, 150, 80),
];
const EARLIER_SHOTS = [shot('e1', 'ie', 'Driver', 1, 230, 100)];

function setup() {
  vi.mocked(api.listSessions).mockReset().mockResolvedValue([earlier, later]);
  vi.mocked(api.getSession).mockReset().mockImplementation(async (id) => ({
    session: id === 'later' ? later : earlier,
    imports: (id === 'later'
      ? [{ id: 'i1', ordinal: 1 }, { id: 'i2', ordinal: 2 }]
      : [{ id: 'ie', ordinal: 1 }]) as ImportRow[],
  }) as SessionDetail);
  vi.mocked(api.getShots).mockReset().mockImplementation(async (id) => (id === 'later' ? LATER_SHOTS : EARLIER_SHOTS));
}

function renderPicker(initial: { sessionId: string; club: string } | null = null) {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter>
      <ShotPicker slot="A" open onOpenChange={onOpenChange} initial={initial} onPick={onPick} />
    </MemoryRouter>,
  );
  return { onPick, onOpenChange };
}

beforeEach(setup);

describe('ShotPicker', () => {
  test('defaults to the newest session and its first club', async () => {
    renderPicker();
    expect(screen.getByRole('dialog', { name: 'Choose shot A' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Session')).toHaveDisplayValue('Later · 7 Nov 2026'));
    expect(screen.getByLabelText('Club')).toHaveDisplayValue('Driver');
  });

  test('starts from the given session and club', async () => {
    renderPicker({ sessionId: 'earlier', club: 'Driver' });
    await waitFor(() => expect(screen.getByLabelText('Session')).toHaveDisplayValue('Earlier · 1 Oct 2026'));
    expect(screen.getByLabelText('Club')).toHaveDisplayValue('Driver');
  });

  test('lists shots with file badge, carry, club speed and excluded mark', async () => {
    renderPicker();
    expect(await screen.findByRole('option', { name: 'F1 Shot 1 · 250.0 yd · 110.0 mph' })).toBeInTheDocument();
    const names = screen.getAllByRole('option', { name: /Shot|Choose a shot/ }).map((o) => o.textContent);
    expect(names).toEqual(['Choose a shot', 'F1 Shot 1 · 250.0 yd · 110.0 mph', 'F2 Shot 1 · 240.0 yd · 108.0 mph (excluded)']);
  });

  test('Choose is disabled until a shot is picked, then reports it', async () => {
    const { onPick, onOpenChange } = renderPicker();
    const choose = await screen.findByRole('button', { name: 'Choose' });
    expect(choose).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Shot'), await screen.findByRole('option', { name: /F2 Shot 1/ }));
    expect(choose).toBeEnabled();
    await userEvent.click(choose);
    expect(onPick).toHaveBeenCalledWith('l2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('changing session keeps the club if it has one', async () => {
    renderPicker({ sessionId: 'later', club: '7 Iron' });
    await waitFor(() => expect(screen.getByLabelText('Club')).toHaveDisplayValue('7 Iron'));
    await userEvent.selectOptions(screen.getByLabelText('Shot'), await screen.findByRole('option', { name: /Shot 1/ }));
    await userEvent.selectOptions(screen.getByLabelText('Session'), 'Earlier · 1 Oct 2026');
    expect(screen.getByLabelText('Club')).toHaveDisplayValue('Driver');
    expect(screen.getByLabelText('Shot')).toHaveDisplayValue('Choose a shot');
    expect(screen.getByRole('button', { name: 'Choose' })).toBeDisabled();
  });

  test('changing session keeps the same club when the new session has it', async () => {
    renderPicker({ sessionId: 'later', club: 'Driver' });
    await screen.findByRole('option', { name: /F1 Shot 1/ });
    await userEvent.selectOptions(screen.getByLabelText('Session'), 'Earlier · 1 Oct 2026');
    expect(screen.getByLabelText('Club')).toHaveDisplayValue('Driver');
    expect(await screen.findByRole('option', { name: 'Shot 1 · 230.0 yd · 100.0 mph' })).toBeInTheDocument();
  });

  test('unknown initial session falls back to the newest', async () => {
    renderPicker({ sessionId: 'gone', club: 'Driver' });
    await waitFor(() => expect(screen.getByLabelText('Session')).toHaveDisplayValue('Later · 7 Nov 2026'));
  });

  test('no sessions shows the import link', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([]);
    renderPicker();
    expect(await screen.findByText('No saved sessions yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import/i })).toHaveAttribute('href', '/import');
  });

  test('a failed load offers Retry', async () => {
    vi.mocked(api.listSessions).mockReset().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue([earlier, later]);
    renderPicker();
    expect(await screen.findByText("Couldn't load your sessions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByLabelText('Session')).toHaveDisplayValue('Later · 7 Nov 2026'));
    expect(screen.queryByText("Couldn't load your sessions")).toBeNull();
  });
});
