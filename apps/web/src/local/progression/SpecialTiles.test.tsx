import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LibraryShot, SessionRow } from '../api';

vi.mock('../api', () => ({
  listSessions: vi.fn(),
  listLibraryShots: vi.fn(),
  getSetting: vi.fn(),
  putSetting: vi.fn(),
  listTargetRanges: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, detail: string) { super(detail); }
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from '../api';
import ProgressionPage from './ProgressionPage';

const session = (id: string, name: string, day: number, clubs: Record<string, number>): SessionRow =>
  ({
    id, name, date: `2026-01-0${day}`, notes: '', handedness: 'right',
    createdAt: `2026-01-0${day}T10:00:00Z`, updatedAt: '', fileCount: 1,
    shotCount: Object.values(clubs).reduce((a, b) => a + b, 0),
    clubs: Object.entries(clubs).map(([club, count]) => ({ club, count })),
  }) as SessionRow;

let n = 0;
const shot = (sessionId: string, club: string, m: Record<string, number | null>, excluded = false): LibraryShot =>
  ({ id: `x${++n}`, sessionId, importId: 'i', sourceRow: n, club, excluded, shotLabel: null, m }) as LibraryShot;
const times = <T,>(k: number, f: (i: number) => T): T[] => Array.from({ length: k }, (_, i) => f(i));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Early (S1) and Late (S2) have the Driver; Irons has only the 7 Iron.
const SESSIONS = [
  session('a', 'Early', 1, { Driver: 4 }),
  session('b', 'Irons', 2, { '7 Iron': 4 }),
  session('c', 'Late', 3, { Driver: 8 }),
];

let SESSION_ROWS: SessionRow[];
let SHOTS: LibraryShot[];
let settings: Record<string, unknown>;

const fetchShots = async ({ club, sessionIds }: { club?: string; sessionIds?: string[] } = {}) =>
  SHOTS.filter((s) => (!club || s.club === club) && (!sessionIds || sessionIds.includes(s.sessionId)));

beforeEach(() => {
  SESSION_ROWS = SESSIONS;
  settings = {};
  vi.mocked(api.listSessions).mockReset().mockImplementation(async () => SESSION_ROWS);
  vi.mocked(api.getSetting).mockReset().mockImplementation(async (key: string) => (settings[key] ?? null) as never);
  vi.mocked(api.putSetting).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listTargetRanges).mockReset().mockResolvedValue([]);
  vi.mocked(api.listLibraryShots).mockReset().mockImplementation(fetchShots);
});

const renderPage = (tiles: string[]) => {
  settings['progression.layout'] = { tiles };
  render(<MemoryRouter><ProgressionPage /></MemoryRouter>);
};
const tile = (name: string) => screen.getByRole('article', { name });
const headline = (t: HTMLElement) => t.querySelector('.prog-tile__value')!.textContent;
const heatmapTotal = (t: HTMLElement) =>
  within(within(t).getByRole('img', { name: /^Impact heatmap/ }))
    .queryAllByText(/^\d+$/)
    .reduce((sum, el) => sum + Number(el.textContent), 0);

describe('Mishit frequency', () => {
  beforeEach(() => {
    SHOTS = [
      ...times(4, (i) => shot('a', 'Driver', { carry: 200 + i }, i === 0)),
      // Late: 2 of 8 excluded.
      ...times(8, (i) => shot('c', 'Driver', { carry: 220 + i }, i < 2)),
    ];
  });

  test('shows the latest session’s excluded of total and ignores the Shots switch', async () => {
    renderPage(['mishit']);
    const mishit = await screen.findByRole('article', { name: 'Mishit frequency' });
    expect(headline(mishit)).toBe('2 of 8 · 25%');
    expect(within(mishit).getByText('All shots')).toBeInTheDocument();
    expect(within(mishit).getByText('A mishit is a shot you excluded.')).toBeInTheDocument();
    expect(within(mishit).getByRole('img', { name: 'Mishit frequency by session' })).toBeInTheDocument();
    // S1 is 1 of 4: few shots.
    expect(within(mishit).getByText(/^S1 · Early · 1 Jan 2026 · 1 of 4 · few shots · 25%$/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    expect(screen.getByText('Stock shots only · 3 excluded left out')).toBeInTheDocument();
    expect(headline(tile('Mishit frequency'))).toBe('2 of 8 · 25%');
  });
});

describe('Speed & smash', () => {
  test('club and ball speed medians on one chart, smash below, and the latest in the headline', async () => {
    SHOTS = [
      ...times(5, (i) => shot('a', 'Driver', { clubSpeed: 95 + i, ballSpeed: 140 + i, smash: 1.46 })),
      ...times(5, (i) => shot('c', 'Driver', { clubSpeed: 98 + i, ballSpeed: 146 + i, smash: 1.48 })),
    ];
    renderPage(['speed-smash']);
    const t = await screen.findByRole('article', { name: 'Speed & smash' });
    expect(headline(t)).toBe('100.0 → 148.0 mph · smash 1.48');
    const speeds = within(t).getByRole('img', { name: 'Club and ball speed by session' });
    expect(speeds.querySelector('path[data-series="Club speed"]')).not.toBeNull();
    expect(speeds.querySelector('path[data-series="Ball speed"]')).not.toBeNull();
    expect(within(t).getAllByText('Club speed').length).toBeGreaterThan(0);
    expect(within(t).getAllByText('Ball speed').length).toBeGreaterThan(0);
    const smash = within(t).getByRole('img', { name: 'Smash by session' });
    expect(smash.getAttribute('viewBox')).toBe('0 0 360 90');
    // Medians only: no bands.
    expect(speeds.querySelector('path[opacity="0.18"]')).toBeNull();
  });

  test('a part with no values in the latest session reads Not measured', async () => {
    SHOTS = times(5, (i) => shot('c', 'Driver', { clubSpeed: null, ballSpeed: 146 + i, smash: null }));
    SESSION_ROWS = [session('c', 'Late', 3, { Driver: 5 })];
    renderPage(['speed-smash']);
    const t = await screen.findByRole('article', { name: 'Speed & smash' });
    expect(headline(t)).toBe('Not measured → 148.0 mph · smash Not measured');
  });
});

describe('Impact location', () => {
  beforeEach(() => {
    SESSION_ROWS = [session('a', 'Early', 1, { Driver: 2 }), session('c', 'Late', 3, { Driver: 12 })];
    SHOTS = [
      shot('a', 'Driver', { impactLateral: 1, impactVertical: 0.5 }),
      shot('a', 'Driver', { impactLateral: -1, impactVertical: null }),
      // Late: 12 shots, 3 without impact (one with only the lateral axis).
      ...times(9, (i) => shot('c', 'Driver', { impactLateral: (i % 3) * 0.3 - 0.3, impactVertical: 0.2 }, i === 0)),
      shot('c', 'Driver', { impactLateral: null, impactVertical: null }),
      shot('c', 'Driver', { impactLateral: null, impactVertical: null }),
      shot('c', 'Driver', { impactLateral: 0.4, impactVertical: null }),
    ];
  });

  test('shots without impact are counted as not measured and left out of the heatmap (Review Focus 3)', async () => {
    renderPage(['impact']);
    const t = await screen.findByRole('article', { name: 'Impact location' });
    // All shown sessions: 14 shots, 10 measured.
    expect(within(t).getByText('Impact not measured: 4 of 14')).toBeInTheDocument();
    expect(heatmapTotal(t)).toBe(10);

    await userEvent.selectOptions(within(t).getByLabelText('Sessions'), 'S2 · Late');
    expect(within(t).getByText('Impact not measured: 3 of 12')).toBeInTheDocument();
    expect(heatmapTotal(t)).toBe(9);
    expect(within(t).getByRole('img', { name: 'Distance from face centre' })).toBeInTheDocument();
  });

  test('the Sessions select is per tile and resets to all shown sessions when they change', async () => {
    SESSION_ROWS = [...SESSION_ROWS, session('d', 'Range', 4, { Driver: 1 }), session('e', 'Course', 5, { Driver: 1 })];
    settings['progression.scope'] = { club: 'Driver', last: 3, picked: null, shots: 'all', band: 'iqr' };
    renderPage(['impact']);
    const t = await screen.findByRole('article', { name: 'Impact location' });
    const select = within(t).getByLabelText('Sessions');
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['All shown sessions', 'S1 · Late', 'S2 · Range', 'S3 · Course']);
    await userEvent.selectOptions(select, 'S1 · Late');
    expect(within(t).getByText('Impact not measured: 3 of 12')).toBeInTheDocument();

    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Scope' })).getByLabelText('Sessions'), 'All');
    await waitFor(() => expect(within(tile('Impact location')).getAllByRole('option')).toHaveLength(5));
    expect(within(tile('Impact location')).getByLabelText('Sessions')).toHaveValue('all');
    expect(within(tile('Impact location')).getByText('Impact not measured: 4 of 14')).toBeInTheDocument();
  });

  test('the Shots switch applies, and details give each session’s measured count and spread', async () => {
    renderPage(['impact']);
    const t = await screen.findByRole('article', { name: 'Impact location' });
    const cells = (label: string) => {
      const row = within(t).getAllByRole('row').find((r) => within(r).queryAllByRole('cell')[0]?.textContent === label)!;
      return within(row).getAllByRole('cell').map((c) => c.textContent);
    };
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'S', 'Session', 'Date', 'Measured', 'Mean distance', 'SD of distance', 'SD lateral', 'SD vertical',
    ]);
    expect(cells('S1')).toEqual(['S1', 'Early', '1 Jan 2026', '1 of 2 · few shots', '1.12 in', 'Not measured', 'Not measured', 'Not measured']);
    expect(cells('S2')[3]).toBe('9 of 12');

    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    expect(cells('S2')[3]).toBe('8 of 11');
    expect(within(t).getByText('Impact not measured: 4 of 13')).toBeInTheDocument();
  });

  test('no line when every shot has impact data', async () => {
    SHOTS = SHOTS.filter((s) => s.m.impactLateral != null && s.m.impactVertical != null);
    renderPage(['impact']);
    const t = await screen.findByRole('article', { name: 'Impact location' });
    expect(within(t).queryByText(/^Impact not measured/)).not.toBeInTheDocument();
  });
});

describe('Club gapping', () => {
  beforeEach(() => {
    SHOTS = [
      ...times(5, (i) => shot('a', 'Driver', { carry: 240 + i * 5 })),
      ...times(5, (i) => shot('c', 'Driver', { carry: 240 + i * 5 }, i >= 3)),
      ...times(5, (i) => shot('b', '7 Iron', { carry: 150 + i * 5 })),
    ];
  });

  test('loads all clubs for the gapping sessions and shows longest first with the gap', async () => {
    renderPage(['gapping']);
    const t = await screen.findByRole('article', { name: 'Club gapping' });
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenCalledWith({ sessionIds: ['a', 'b', 'c'] }));
    const chart = await within(t).findByRole('img', { name: 'Club gapping' });
    const driver = within(chart).getByText('Driver · 250.0 yd');
    const iron = within(chart).getByText('7 Iron · 160.0 yd');
    expect(driver.compareDocumentPosition(iron) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chart).getByText('90.0 yd gap')).toBeInTheDocument();
    expect(within(t).getByText('Median carry · last 3 sessions of any club')).toBeInTheDocument();
  });

  test('the Shots switch applies to gapping', async () => {
    renderPage(['gapping']);
    const t = await screen.findByRole('article', { name: 'Club gapping' });
    await within(t).findByText('Driver · 250.0 yd');
    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    expect(within(t).getByText('Driver · 247.5 yd')).toBeInTheDocument();
  });

  test('a hand-picked set is used, and the subtitle says so', async () => {
    settings['progression.scope'] = { club: 'Driver', last: 6, picked: ['a', 'c'], shots: 'all', band: 'iqr' };
    renderPage(['gapping']);
    const t = await screen.findByRole('article', { name: 'Club gapping' });
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenCalledWith({ sessionIds: ['a', 'c'] }));
    expect(within(t).getByText('Median carry · 2 chosen sessions')).toBeInTheDocument();
    expect(await within(t).findByText('Driver · 250.0 yd')).toBeInTheDocument();
    expect(within(t).queryByText(/^7 Iron/)).not.toBeInTheDocument();
  });

  test('while new gapping shots load the previous chart stays, dimmed; a late older answer is ignored', async () => {
    SESSION_ROWS = [...SESSIONS, session('d', 'Latest', 4, { Driver: 1 })];
    renderPage(['gapping']);
    const t = await screen.findByRole('article', { name: 'Club gapping' });
    await within(t).findByText('7 Iron · 160.0 yd');
    expect(api.listLibraryShots).toHaveBeenCalledWith({ sessionIds: ['a', 'b', 'c', 'd'] });

    const older = deferred<LibraryShot[]>();
    const newer = deferred<LibraryShot[]>();
    // The club tiles fetch with `club`; the gapping tile fetches without it.
    vi.mocked(api.listLibraryShots).mockImplementation((opts) => {
      if (opts?.club) return fetchShots(opts);
      return opts?.sessionIds?.length === 3 ? older.promise : newer.promise;
    });
    const sessions = within(screen.getByRole('region', { name: 'Scope' })).getByLabelText('Sessions');
    await userEvent.selectOptions(sessions, 'Last 3');
    expect(api.listLibraryShots).toHaveBeenLastCalledWith({ sessionIds: ['b', 'c', 'd'] });
    expect(within(t).getByText('7 Iron · 160.0 yd')).toBeInTheDocument();
    expect(t.querySelector('.prog-gapping')).toHaveAttribute('aria-busy', 'true');
    expect(within(t).getByText('Median carry · last 3 sessions of any club')).toBeInTheDocument();

    await userEvent.selectOptions(sessions, 'All');
    older.resolve([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(within(t).getByText('7 Iron · 160.0 yd')).toBeInTheDocument();
    newer.resolve(await fetchShots({ sessionIds: ['a', 'b', 'c', 'd'] }));
    await waitFor(() => expect(t.querySelector('.prog-gapping')).toHaveAttribute('aria-busy', 'false'));
    expect(within(t).getByText('7 Iron · 160.0 yd')).toBeInTheDocument();
  });

  test('a failed load shows a short message in the tile; the rest of the page stays', async () => {
    vi.mocked(api.listLibraryShots).mockImplementation((opts) =>
      opts?.club ? fetchShots(opts) : Promise.reject(new Error('down')));
    renderPage(['carry', 'gapping']);
    const t = await screen.findByRole('article', { name: 'Club gapping' });
    expect(await within(t).findByText("Couldn't load the shots for gapping.")).toBeInTheDocument();
    expect(tile('Carry')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your sessions")).not.toBeInTheDocument();
  });
});
