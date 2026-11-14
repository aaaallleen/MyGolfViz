import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LibraryShot, SessionRow, TargetRange } from '../api';

vi.mock('../api', () => ({
  listSessions: vi.fn(),
  listLibraryShots: vi.fn(),
  getSetting: vi.fn(),
  putSetting: vi.fn(),
  listTargetRanges: vi.fn(),
  putTargetRange: vi.fn(),
  deleteTargetRange: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, detail: string) { super(detail); }
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from '../api';
import { toast } from 'sonner';
import ProgressionPage from './ProgressionPage';
import { DEFAULT_LAYOUT } from './tiles';

const session = (id: string, name: string, day: number, clubs: Record<string, number>): SessionRow =>
  ({
    id, name, date: `2026-01-0${day}`, notes: '', handedness: 'right',
    createdAt: `2026-01-0${day}T10:00:00Z`, updatedAt: '', fileCount: 1,
    shotCount: Object.values(clubs).reduce((a, b) => a + b, 0),
    clubs: Object.entries(clubs).map(([club, count]) => ({ club, count })),
  }) as SessionRow;

const SESSIONS = [
  session('a', 'Early', 1, { Driver: 5 }),
  session('c', 'Late', 3, { Driver: 5 }),
  session('b', 'Irons', 2, { '7 Iron': 3 }),
];

let n = 0;
const shot = (sessionId: string, club: string, carry: number, lateral: number): LibraryShot =>
  ({ id: `x${++n}`, sessionId, importId: 'i', sourceRow: n, club, excluded: false, shotLabel: null, m: { carry, lateral } }) as LibraryShot;

const SHOTS: LibraryShot[] = [
  shot('a', 'Driver', 200, -10), shot('a', 'Driver', 210, -5), shot('a', 'Driver', 220, 0),
  shot('a', 'Driver', 230, 5), shot('a', 'Driver', 240, 10),
  // Late: carry 225, 235, 245, 250, 255 → 3 of 5 within 230–250.
  shot('c', 'Driver', 225, 2), shot('c', 'Driver', 235, 4), shot('c', 'Driver', 245, 6),
  shot('c', 'Driver', 250, 8), shot('c', 'Driver', 255, -3),
  shot('b', '7 Iron', 150, 1), shot('b', '7 Iron', 155, 2), shot('b', '7 Iron', 160, 3),
];

const fetchShots = async ({ club, sessionIds }: { club?: string; sessionIds?: string[] } = {}) =>
  SHOTS.filter((s) => (!club || s.club === club) && (!sessionIds || sessionIds.includes(s.sessionId)));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let savedLayout: unknown = null;

beforeEach(() => {
  savedLayout = null;
  vi.mocked(api.listSessions).mockReset().mockResolvedValue(SESSIONS);
  vi.mocked(api.getSetting).mockReset().mockImplementation(async (key: string) =>
    (key === 'progression.layout' ? savedLayout : null) as never);
  vi.mocked(api.putSetting).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listTargetRanges).mockReset().mockResolvedValue([]);
  vi.mocked(api.putTargetRange).mockReset().mockImplementation(async (body) =>
    ({ id: 'r1', club: body.club, metric: body.metric, low: body.low ?? null, high: body.high ?? null, updatedAt: 'now' }));
  vi.mocked(api.deleteTargetRange).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listLibraryShots).mockReset().mockImplementation(fetchShots);
  vi.mocked(toast.error).mockReset();
});

const renderPage = async () => {
  render(<MemoryRouter><ProgressionPage /></MemoryRouter>);
  await screen.findByText('All 10 shots');
};
const tile = (name: string) => screen.getByRole('article', { name });
const queryTile = (name: string) => screen.queryByRole('article', { name });
const titles = () => screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);
const band = (name: string) => tile(name).querySelector('[data-testid="target-band"]');
const DEFAULT_TITLES = [
  'Carry', 'Carry variation (SD)', 'Lateral (landing)', 'Face to path', 'Spin', 'Speed & smash', 'Impact location', 'Mishit frequency',
];
const layoutSaves = () => vi.mocked(api.putSetting).mock.calls.filter(([key]) => key === 'progression.layout');

describe('editing the dashboard', () => {
  test('Remove Spin takes the tile away and saves the layout without it', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Spin' }));
    expect(queryTile('Spin')).not.toBeInTheDocument();
    expect(api.putSetting).toHaveBeenCalledWith('progression.layout', { tiles: DEFAULT_LAYOUT.filter((id) => id !== 'spin') });
  });

  test('a failed save brings the tile back and says so', async () => {
    vi.mocked(api.putSetting).mockRejectedValue(new Error('down'));
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Spin' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the dashboard"));
    expect(tile('Spin')).toBeInTheDocument();
    expect(titles()).toEqual(DEFAULT_TITLES);
  });

  test('a newer change supersedes a pending one; a failure restores the last layout the server confirmed', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    vi.mocked(api.putSetting).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Spin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mishit frequency' }));
    // Only one save is in flight; the newest change waits for it.
    expect(layoutSaves()).toHaveLength(1);
    first.resolve();
    await waitFor(() => expect(layoutSaves()).toHaveLength(2));
    expect(layoutSaves()[1]![1]).toEqual({ tiles: DEFAULT_LAYOUT.filter((id) => id !== 'spin' && id !== 'mishit') });
    second.reject(new Error('down'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the dashboard"));
    // Spin's removal was confirmed; only Mishit comes back.
    expect(queryTile('Spin')).not.toBeInTheDocument();
    expect(tile('Mishit frequency')).toBeInTheDocument();
  });

  test('changes made while a save is pending are sent once, as the newest layout', async () => {
    const first = deferred<void>();
    vi.mocked(api.putSetting).mockReturnValueOnce(first.promise);
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Spin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mishit frequency' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Impact location' }));
    first.reject(new Error('down'));
    await waitFor(() => expect(layoutSaves()).toHaveLength(2));
    expect(layoutSaves()[1]![1]).toEqual({ tiles: ['carry', 'carry-sd', 'lateral', 'ftp', 'speed-smash'] });
    await new Promise((r) => setTimeout(r, 0));
    // The superseded failure is not reported: the newest layout saved.
    expect(toast.error).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Carry', 'Carry variation (SD)', 'Lateral (landing)', 'Face to path', 'Speed & smash']);
  });

  test('Move Carry later swaps the first two tiles', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Move Carry later' }));
    expect(titles().slice(0, 2)).toEqual(['Carry variation (SD)', 'Carry']);
    expect(api.putSetting).toHaveBeenCalledWith('progression.layout', { tiles: ['carry-sd', 'carry', ...DEFAULT_LAYOUT.slice(2)] });
    expect(screen.getByRole('button', { name: 'Move Carry variation (SD) earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Mishit frequency later' })).toBeDisabled();
  });

  test('every tile has move and remove controls, placeholders included', async () => {
    await renderPage();
    for (const t of DEFAULT_TITLES) {
      const article = tile(t);
      expect(within(article).getByRole('button', { name: `Move ${t} earlier` })).toBeInTheDocument();
      expect(within(article).getByRole('button', { name: `Move ${t} later` })).toBeInTheDocument();
      expect(within(article).getByRole('button', { name: `Remove ${t}` })).toBeInTheDocument();
    }
  });

  test('Add tile lists the tiles not on the dashboard by category and appends the one picked', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    const distance = await screen.findByRole('group', { name: 'Distance' });
    const items = within(distance).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toContain('Total');
    expect(items).not.toContain('Carry');
    await userEvent.click(within(distance).getByRole('menuitem', { name: 'Total' }));
    expect(titles()).toEqual([...DEFAULT_TITLES, 'Total']);
    expect(api.putSetting).toHaveBeenCalledWith('progression.layout', { tiles: [...DEFAULT_LAYOUT, 'total'] });
  });

  test('Reset to default restores the 8 default tiles', async () => {
    savedLayout = { tiles: ['spin', 'total'] };
    await renderPage();
    expect(titles()).toEqual(['Spin', 'Total']);
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(titles()).toEqual(DEFAULT_TITLES);
    expect(api.putSetting).toHaveBeenCalledWith('progression.layout', { tiles: [...DEFAULT_LAYOUT] });
  });

  test('an empty dashboard shows its empty state with Add tile', async () => {
    savedLayout = { tiles: [] };
    await renderPage();
    expect(screen.getByText('No tiles on the dashboard')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Carry' }));
    expect(titles()).toEqual(['Carry']);
    expect(screen.queryByText('No tiles on the dashboard')).not.toBeInTheDocument();
  });
});

describe('target ranges', () => {
  async function openForm(tileName: string) {
    await userEvent.click(within(tile(tileName)).getByRole('button', { name: 'Set target range' }));
    return within(tile(tileName));
  }

  test('saving 230–250 on Carry sends it, then shows the target band and % in range', async () => {
    await renderPage();
    expect(band('Carry')).toBeNull();
    const form = await openForm('Carry');
    expect(form.getAllByText('yd').length).toBeGreaterThanOrEqual(2);
    await userEvent.type(form.getByLabelText('Low'), '230');
    await userEvent.type(form.getByLabelText('High'), '250');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(api.putTargetRange).toHaveBeenCalledWith({ club: 'Driver', metric: 'carry', low: 230, high: 250 });
    expect(band('Carry')).not.toBeNull();
    expect(within(tile('Carry')).getByText('60% in range')).toBeInTheDocument();
    // The details gain a % in range column.
    expect(within(tile('Carry')).getByRole('columnheader', { name: '% in range' })).toBeInTheDocument();
    // Variation tiles of the same metric take no range.
    expect(band('Carry variation (SD)')).toBeNull();
    expect(within(tile('Carry variation (SD)')).queryByRole('button', { name: 'Set target range' })).not.toBeInTheDocument();
  });

  test('low above high shows an inline error and sends nothing', async () => {
    await renderPage();
    const form = await openForm('Carry');
    await userEvent.type(form.getByLabelText('Low'), '260');
    await userEvent.type(form.getByLabelText('High'), '250');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(form.getByRole('alert')).toBeInTheDocument();
    expect(api.putTargetRange).not.toHaveBeenCalled();
  });

  test('a range needs at least one bound', async () => {
    await renderPage();
    const form = await openForm('Carry');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(form.getByRole('alert')).toBeInTheDocument();
    expect(api.putTargetRange).not.toHaveBeenCalled();
  });

  test('text a number field cannot read (such as "-") shows Enter numbers only. and sends nothing', async () => {
    await renderPage();
    const form = await openForm('Carry');
    // Browsers report '' for unreadable text in a number field and flag it as bad input.
    const low = form.getByLabelText('Low') as HTMLInputElement;
    Object.defineProperty(low, 'validity', { configurable: true, get: () => ({ badInput: true, valid: false }) });
    await userEvent.type(form.getByLabelText('High'), '250');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(form.getByRole('alert')).toHaveTextContent('Enter numbers only.');
    expect(api.putTargetRange).not.toHaveBeenCalled();
  });

  test('accuracy tiles take only bounds of 0 or more', async () => {
    await renderPage();
    const form = await openForm('Lateral (landing)');
    await userEvent.type(form.getByLabelText('Low'), '-5');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(form.getByRole('alert')).toBeInTheDocument();
    expect(api.putTargetRange).not.toHaveBeenCalled();
  });

  test('a rejected save removes the band and says so', async () => {
    const save = deferred<TargetRange>();
    vi.mocked(api.putTargetRange).mockReturnValueOnce(save.promise);
    await renderPage();
    const form = await openForm('Carry');
    await userEvent.type(form.getByLabelText('High'), '250');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(api.putTargetRange).toHaveBeenCalledWith({ club: 'Driver', metric: 'carry', low: null, high: 250 });
    expect(band('Carry')).not.toBeNull();
    // While the save is in flight the range cannot be edited again.
    const again = within(tile('Carry')).getByRole('button', { name: 'Set target range' });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(again);
    expect(within(tile('Carry')).queryByLabelText('Low')).not.toBeInTheDocument();
    save.reject(new Error('down'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the target range"));
    expect(band('Carry')).toBeNull();
    expect(within(tile('Carry')).queryByText(/% in range$/)).not.toBeInTheDocument();
    expect(within(tile('Carry')).getByRole('button', { name: 'Set target range' })).toHaveAttribute('aria-disabled', 'false');
  });

  test('Clear deletes a saved range; a failure puts it back', async () => {
    vi.mocked(api.listTargetRanges).mockResolvedValue([
      { id: 'r9', club: 'Driver', metric: 'carry', low: 230, high: 250, updatedAt: 'then' },
    ]);
    vi.mocked(api.deleteTargetRange).mockRejectedValueOnce(new Error('down'));
    await renderPage();
    expect(band('Carry')).not.toBeNull();
    let form = await openForm('Carry');
    expect((form.getByLabelText('Low') as HTMLInputElement).value).toBe('230');
    await userEvent.click(form.getByRole('button', { name: 'Clear' }));
    expect(api.deleteTargetRange).toHaveBeenCalledWith('r9');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the target range"));
    expect(band('Carry')).not.toBeNull();

    form = await openForm('Carry');
    await userEvent.click(form.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(band('Carry')).toBeNull());
    expect(api.deleteTargetRange).toHaveBeenCalledTimes(2);
  });

  test('Cancel closes the form without sending; Clear is offered only when a range exists', async () => {
    await renderPage();
    const form = await openForm('Carry');
    expect(form.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(form.getByLabelText('Low')).toHaveFocus();
    await userEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect(form.queryByLabelText('Low')).not.toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Set target range' })).toHaveFocus();
    expect(api.putTargetRange).not.toHaveBeenCalled();
  });
});

describe('scope bar and loading', () => {
  test('the scope line sits in the sticky scope bar', async () => {
    await renderPage();
    expect(screen.getByText('All 10 shots').closest('.prog-scope--sticky')).not.toBeNull();
  });

  test('while another club loads the previous tiles stay on screen, dimmed', async () => {
    const iron = deferred<LibraryShot[]>();
    await renderPage();
    vi.mocked(api.listLibraryShots).mockReturnValueOnce(iron.promise);
    await userEvent.selectOptions(screen.getByLabelText('Club'), '7 Iron');
    const grid = tile('Carry').closest('.prog-grid')!;
    expect(grid).toHaveAttribute('aria-busy', 'true');
    expect(grid).toHaveClass('progression__grid--loading');
    iron.resolve(await fetchShots({ club: '7 Iron', sessionIds: ['b'] }));
    expect(await screen.findByText('All 3 shots')).toBeInTheDocument();
    expect(tile('Carry').closest('.prog-grid')).toHaveAttribute('aria-busy', 'false');
    expect(tile('Carry').closest('.prog-grid')).not.toHaveClass('progression__grid--loading');
  });
});
