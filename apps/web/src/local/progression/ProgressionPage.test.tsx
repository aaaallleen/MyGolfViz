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
import { toast } from 'sonner';
import { formatChange } from './format';
import ProgressionPage from './ProgressionPage';

const session = (id: string, name: string, day: number, clubs: Record<string, number>): SessionRow =>
  ({
    id, name, date: `2026-01-0${day}`, notes: '', handedness: 'right',
    createdAt: `2026-01-0${day}T10:00:00Z`, updatedAt: '', fileCount: 1,
    shotCount: Object.values(clubs).reduce((a, b) => a + b, 0),
    clubs: Object.entries(clubs).map(([club, count]) => ({ club, count })),
  }) as SessionRow;

// Three sessions, oldest first; Driver in two of them.
const SESSIONS = [
  session('c', 'Late', 3, { Driver: 5 }),
  session('a', 'Early', 1, { Driver: 5 }),
  session('b', 'Irons', 2, { '7 Iron': 3 }),
];

let n = 0;
const shot = (sessionId: string, club: string, carry: number, lateral: number, excluded = false): LibraryShot =>
  ({ id: `x${++n}`, sessionId, importId: 'i', sourceRow: n, club, excluded, shotLabel: null, m: { carry, lateral } }) as LibraryShot;

let SHOTS: LibraryShot[];
function defaultShots(): LibraryShot[] {
  return [
    // Early: carry median 220, |lateral| median 5
    shot('a', 'Driver', 200, -10), shot('a', 'Driver', 210, -5), shot('a', 'Driver', 220, 0),
    shot('a', 'Driver', 230, 5), shot('a', 'Driver', 240, 10, true),
    // Late: carry median 245, |lateral| median 4
    shot('c', 'Driver', 225, 2), shot('c', 'Driver', 235, 4), shot('c', 'Driver', 245, 6),
    shot('c', 'Driver', 250, 8), shot('c', 'Driver', 255, -3, true),
    shot('b', '7 Iron', 150, 1), shot('b', '7 Iron', 155, 2), shot('b', '7 Iron', 160, 3),
  ];
}

beforeEach(() => {
  SHOTS = defaultShots();
  vi.mocked(api.listSessions).mockReset().mockResolvedValue(SESSIONS);
  vi.mocked(api.getSetting).mockReset().mockResolvedValue(null);
  vi.mocked(api.putSetting).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listTargetRanges).mockReset().mockResolvedValue([]);
  vi.mocked(api.listLibraryShots).mockReset().mockImplementation(async ({ club, sessionIds } = {}) =>
    SHOTS.filter((s) => (!club || s.club === club) && (!sessionIds || sessionIds.includes(s.sessionId))));
  vi.mocked(toast.error).mockReset();
});

const renderPage = () => render(<MemoryRouter><ProgressionPage /></MemoryRouter>);
const tile = (name: string) => screen.getByRole('article', { name });
const headline = (t: HTMLElement) => t.querySelector('.prog-tile__value')!.textContent;
const chart = (t: HTMLElement) => within(t).getByRole('img', { name: /by session$/ });
const DEFAULT_TITLES = [
  'Carry', 'Carry variation (SD)', 'Lateral (landing)', 'Face to path', 'Spin', 'Speed & smash', 'Impact location', 'Mishit frequency',
];

function detailsRow(tileName: string, label: string): HTMLElement[] {
  const rows = within(tile(tileName)).getAllByRole('row');
  const row = rows.find((r) => within(r).queryAllByRole('cell')[0]?.textContent === label);
  if (!row) throw new Error(`no details row ${label}`);
  return within(row).getAllByRole('cell');
}

describe('ProgressionPage', () => {
  test('renders the default tiles with the latest median and the change since the earlier session', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Progression', level: 1 })).toBeInTheDocument();
    for (const t of DEFAULT_TITLES) expect(await screen.findByRole('heading', { name: t })).toBeInTheDocument();
    expect(api.listLibraryShots).toHaveBeenLastCalledWith({ club: 'Driver', sessionIds: ['a', 'c'] });

    const carry = tile('Carry');
    expect(within(carry).getByText('Distance')).toBeInTheDocument();
    expect(headline(carry)).toBe('245.0 yd');
    expect(within(carry).getByText('↑ +25.0 yd since S1')).toBeInTheDocument();
    // S1…Sn are positions within the shown sessions; the tooltip names the session.
    expect(within(chart(carry)).getByText('S1')).toBeInTheDocument();
    expect(within(chart(carry)).getByText('S2')).toBeInTheDocument();
    expect(within(chart(carry)).getByText(/^S2 · Late · 3 Jan 2026 · n 5 · /)).toBeInTheDocument();
    expect(screen.getByText('All 10 shots')).toBeInTheDocument();
  });

  test('accuracy tiles use the distance from the line and show the signed median as bias', async () => {
    renderPage();
    const lateral = await screen.findByRole('article', { name: 'Lateral (landing)' });
    await waitFor(() => expect(headline(lateral)).toBe('4.0 yd'));
    expect(within(lateral).getByText('↓ −1.0 yd since S1')).toBeInTheDocument();
    expect(within(lateral).getAllByText('Bias (signed median)').length).toBeGreaterThan(0);
    expect(detailsRow('Lateral (landing)', 'S2')).toHaveLength(13);
  });

  test('variation tiles plot the SD and word the change as consistency', async () => {
    renderPage();
    const sd = await screen.findByRole('article', { name: 'Carry variation (SD)' });
    await waitFor(() => expect(within(sd).getByText('Lower = more consistent')).toBeInTheDocument());
    expect(within(sd).getByText(/^↓ −\d+\.\d yd since S1 · more consistent$/)).toBeInTheDocument();
  });

  test('switching to Stock shots only updates the scope line and saves the scope', async () => {
    renderPage();
    expect(await screen.findByText('All 10 shots')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    expect(screen.getByText('Stock shots only · 2 excluded left out')).toBeInTheDocument();
    expect(api.putSetting).toHaveBeenCalledWith('progression.scope', expect.objectContaining({ shots: 'stock' }));
  });

  test('a failed scope save keeps the choice for this visit and tells the user', async () => {
    vi.mocked(api.putSetting).mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('All 10 shots');
    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the dashboard"));
    expect(screen.getByText('Stock shots only · 2 excluded left out')).toBeInTheDocument();
  });

  test('changing the club fetches that club’s shots and clears a hand-picked set', async () => {
    vi.mocked(api.getSetting).mockImplementation(async (key: string) =>
      key === 'progression.scope' ? { club: 'Driver', last: 6, picked: ['c'], shots: 'all', band: 'iqr' } : null);
    renderPage();
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenCalledWith({ club: 'Driver', sessionIds: ['c'] }));
    await userEvent.selectOptions(screen.getByLabelText('Club'), '7 Iron');
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenLastCalledWith({ club: '7 Iron', sessionIds: ['b'] }));
    expect(api.putSetting).toHaveBeenLastCalledWith('progression.scope', expect.objectContaining({ club: '7 Iron', picked: null }));
    expect(await screen.findByText('All 3 shots')).toBeInTheDocument();
  });

  test('a late answer for the previous club is ignored', async () => {
    let releaseDriver: () => void = () => {};
    const impl = vi.mocked(api.listLibraryShots).getMockImplementation()!;
    vi.mocked(api.listLibraryShots).mockImplementationOnce((opts) =>
      new Promise((resolve) => { releaseDriver = () => resolve(impl(opts)); }));
    renderPage();
    await userEvent.selectOptions(await screen.findByLabelText('Club'), '7 Iron');
    expect(await screen.findByText('All 3 shots')).toBeInTheDocument();
    releaseDriver();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('All 3 shots')).toBeInTheDocument();
    expect(screen.queryByText('All 10 shots')).not.toBeInTheDocument();
  });

  test('the club picker lists each club with its shot count', async () => {
    renderPage();
    const club = await screen.findByLabelText('Club');
    expect(within(club).getAllByRole('option').map((o) => o.textContent)).toEqual(['Driver · 10 shots', '7 Iron · 3 shots']);
  });

  test('Choose… picks sessions from a checklist; Apply needs at least one', async () => {
    renderPage();
    await screen.findByText('All 10 shots');
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Scope' })).getByLabelText('Sessions'), 'Choose…');
    const list = screen.getByRole('group', { name: 'Choose sessions' });
    const boxes = within(list).getAllByRole('checkbox');
    // Newest first, with name and the club's shot count.
    expect(boxes.map((b) => b.closest('label')!.textContent)).toEqual(['3 Jan 2026Late5', '1 Jan 2026Early5']);
    for (const b of boxes) if ((b as HTMLInputElement).checked) await userEvent.click(b);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await userEvent.click(boxes[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenLastCalledWith({ club: 'Driver', sessionIds: ['c'] }));
    expect(api.putSetting).toHaveBeenLastCalledWith('progression.scope', expect.objectContaining({ picked: ['c'] }));
    expect(screen.queryByRole('group', { name: 'Choose sessions' })).not.toBeInTheDocument();
  });

  test('a session whose shots are all excluded keeps its S label under Stock shots only, with n 0', async () => {
    SHOTS = SHOTS.map((s) => (s.sessionId === 'a' ? { ...s, excluded: true } : s));
    renderPage();
    await screen.findByText('All 10 shots');
    await userEvent.click(screen.getByRole('button', { name: 'Stock shots only' }));
    const carry = tile('Carry');
    expect(within(chart(carry)).getByText('S1')).toBeInTheDocument();
    expect(within(chart(carry)).getByText('S2')).toBeInTheDocument();
    const s1 = detailsRow('Carry', 'S1');
    expect(s1[1]).toHaveTextContent('Early');
    // n 0 is not "few shots": there are none.
    expect(s1[3]!.textContent).toBe('0');
    expect(s1[6]).toHaveTextContent('Not measured');
    expect(detailsRow('Carry', 'S2')[3]!.textContent).toMatch(/^4\b.*few shots/);
    expect(within(chart(carry)).getByText(/^S2 · Late · 3 Jan 2026 · n 4 · few shots · /)).toBeInTheDocument();
    expect(within(carry).getByText('First session shown')).toBeInTheDocument();
  });

  test('no sessions shows the empty state with a link to load a CSV', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No sessions yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Load Session CSV' })).toHaveAttribute('href', '/import');
  });

  test('a failed load shows Retry, which loads again', async () => {
    vi.mocked(api.listSessions).mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(await screen.findByText("Couldn't load your sessions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('All 10 shots')).toBeInTheDocument();
    expect(api.listSessions).toHaveBeenCalledTimes(2);
  });

  test('a saved layout is used in its order', async () => {
    vi.mocked(api.getSetting).mockImplementation(async (key: string) =>
      key === 'progression.layout' ? { tiles: ['spin', 'carry'] } : null);
    renderPage();
    await screen.findByText('All 10 shots');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label') ?? within(a).getByRole('heading').textContent))
      .toEqual(['Spin', 'Carry']);
  });
});

describe('formatChange', () => {
  test('arrow, signed value with U+2212 and the unit without a direction word', () => {
    expect(formatChange('carry', 4.24)).toBe('↑ +4.2 yd');
    expect(formatChange('clubPath', -1.26)).toBe('↓ −1.3°');
    expect(formatChange('carry', 0.04)).toBe('→ 0.0 yd');
    expect(formatChange('carry', -0.04)).toBe('→ 0.0 yd');
    expect(formatChange('spin', 120)).toBe('↑ +120 rpm');
  });
});
