import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { consistencyScore, gappingTable } from '@fsa/analytics';
import { useWorkingSet, WorkingSetProvider } from '../../state/store';
import type { LibraryShot, SessionRow } from '../api';

vi.mock('../api', () => ({
  listSessions: vi.fn(),
  listLibraryShots: vi.fn(),
  getSetting: vi.fn(),
  putSetting: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, detail: string) { super(detail); }
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
import * as api from '../api';
import { toast } from 'sonner';
import { toProgressionShot } from '../progression/scope';
import GappingPage from './GappingPage';

const session = (id: string, name: string, date: string, clubs: Record<string, number>): SessionRow =>
  ({
    id, name, date, notes: '', handedness: 'right',
    createdAt: `${date}T10:00:00Z`, updatedAt: '', fileCount: 1,
    shotCount: Object.values(clubs).reduce((a, b) => a + b, 0),
    clubs: Object.entries(clubs).map(([club, count]) => ({ club, count })),
  }) as SessionRow;

// s1 (1 Jan): Driver ×4, 3 Wood ×5, Pitching Wedge ×6. s2 (3 Jan): Driver ×3 (one excluded), 7 Iron ×3.
const SESSIONS = [
  session('s2', 'Late', '2026-01-03', { Driver: 3, '7 Iron': 3 }),
  session('s1', 'Early', '2026-01-01', { Driver: 4, '3 Wood': 5, 'Pitching Wedge': 6 }),
];

let n = 0;
const shot = (sessionId: string, club: string, carry: number | null, lateral: number | null, excluded = false, total: number | null = null): LibraryShot =>
  ({ id: `x${++n}`, sessionId, importId: 'i', sourceRow: n, club, excluded, shotLabel: null, m: { carry, lateral, total } }) as LibraryShot;

let SHOTS: LibraryShot[];
function defaultShots(): LibraryShot[] {
  return [
    // Driver: stock carry 247.5, wide enough to reach into the 3 Wood's ellipse.
    shot('s1', 'Driver', 230, -8, false, 250), shot('s1', 'Driver', 240, -4, false, 262), shot('s1', 'Driver', 245, 0, false, 268),
    shot('s1', 'Driver', 250, 2, false, 270), shot('s2', 'Driver', 255, 5, false, 276), shot('s2', 'Driver', 260, 9, false, 280),
    shot('s2', 'Driver', 180, 30, true),
    // 3 Wood: 5 shots, stock 235; the 80 yd gap to the 7 Iron is a hole.
    shot('s1', '3 Wood', 225, -6), shot('s1', '3 Wood', 230, -2), shot('s1', '3 Wood', 235, 0), shot('s1', '3 Wood', 240, 3), shot('s1', '3 Wood', 245, 6),
    // 7 Iron: 3 shots, stock 155.
    shot('s2', '7 Iron', 150, -2), shot('s2', '7 Iron', 155, 0), shot('s2', '7 Iron', 160, 3),
    // Pitching Wedge: 6 shots, stock 120.5.
    shot('s1', 'Pitching Wedge', 115, -3), shot('s1', 'Pitching Wedge', 118, -1), shot('s1', 'Pitching Wedge', 120, 0),
    shot('s1', 'Pitching Wedge', 121, 1), shot('s1', 'Pitching Wedge', 122, 2), shot('s1', 'Pitching Wedge', 124, 4),
  ];
}

beforeEach(() => {
  SHOTS = defaultShots();
  vi.mocked(api.listSessions).mockReset().mockResolvedValue(SESSIONS);
  vi.mocked(api.getSetting).mockReset().mockResolvedValue(null);
  vi.mocked(api.putSetting).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listLibraryShots).mockReset().mockImplementation(async ({ sessionIds } = {}) =>
    SHOTS.filter((s) => !sessionIds || sessionIds.includes(s.sessionId)));
  vi.mocked(toast.error).mockReset();
});

function EllipseProbe() {
  return <output data-testid="ellipse-kind">{useWorkingSet().ellipseKind}</output>;
}
const renderPage = () =>
  render(<WorkingSetProvider><MemoryRouter><GappingPage /><EllipseProbe /></MemoryRouter></WorkingSetProvider>);

const LINE_LAST3 = "Each club's last 3 sessions · 20 shots · 1 excluded left out";
const table = () => screen.getByRole('table');
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const rowOf = (club: string) => bodyRows().find((r) => within(r).queryByRole('rowheader')?.textContent?.includes(club))!;
const COLUMNS = ['Club', 'Stock carry', 'Total', 'Short – long', 'Left – right', 'Gap to next', 'Consistency', 'Shots'];
const cell = (club: string, column: string) => {
  const cells = rowOf(club).querySelectorAll<HTMLElement>('th, td');
  return cells[COLUMNS.indexOf(column)]!;
};
const ellipseOpacity = (container: HTMLElement, club: string) =>
  Number(container.querySelector(`[data-testid="ellipse"][data-club="${club}"]`)!.getAttribute('stroke-opacity'));

describe('GappingPage', () => {
  test('loads the sessions and shots with Last 3 sessions and Stock only by default', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Gapping', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(LINE_LAST3)).toBeInTheDocument();
    const basis = screen.getByLabelText('Based on') as HTMLSelectElement;
    expect(within(basis).getAllByRole('option').map((o) => o.textContent)).toEqual(
      ['Selected session…', 'Latest session', 'Last 3 sessions', 'Last 10 sessions', 'All time']);
    expect(basis.selectedOptions[0]!.textContent).toBe('Last 3 sessions');
    expect(screen.queryByLabelText('Session')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stock only' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All shots' })).toHaveAttribute('aria-pressed', 'false');
    expect(api.listLibraryShots).toHaveBeenCalledWith({ sessionIds: expect.arrayContaining(['s1', 's2']) });
    expect(vi.mocked(api.listLibraryShots).mock.calls[0]![0]!.sessionIds).toHaveLength(2);
  });

  test('the table: columns in order, one row per club longest first, bold stock carry', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(COLUMNS);
    expect(bodyRows().map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Driver', '3 Wood', '7 Iron', 'Pitching Wedge']);
    expect(cell('Driver', 'Stock carry').querySelector('strong')!.textContent).toBe('248 yd');
    expect(cell('Driver', 'Total').textContent).toBe('269 yd');
    expect(cell('3 Wood', 'Total').textContent).toBe('—');
    expect(cell('Driver', 'Left – right').textContent).toMatch(/^\d+ L – \d+ R$/);
    expect(cell('Pitching Wedge', 'Gap to next').textContent).toBe('—');
    expect(table().querySelector('caption')!.textContent).toBe(
      "Consistency scores how tight a club's landings are, distance and direction together, against its carry: 100 is a 3% spread, 0 is 15%. The ± is how much the score could still move; it shrinks as you hit more shots. Needs more than 5 shots.");
  });

  test('overlap and hole flags in Gap to next', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    expect(cell('Driver', 'Gap to next')).toHaveTextContent(/^13 yd\s*overlaps 3 Wood$/);
    expect(cell('3 Wood', 'Gap to next')).toHaveTextContent(/^80 yd\s*hole$/);
    expect(cell('7 Iron', 'Gap to next')).toHaveTextContent(/^35 yd$/);
  });

  test('consistency: a score ± for 6+ shots, — and few shots below; few shots in Shots for 0 < n < 5', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    const driverPoints = SHOTS.filter((s) => s.club === 'Driver' && !s.excluded).map((s) => ({ x: s.m.lateral as number, y: s.m.carry as number }));
    const expected = consistencyScore(driverPoints, 247.5)!;
    expect(cell('Driver', 'Consistency').textContent).toBe(`${Math.round(expected.score)} ± ${Math.round(expected.plusMinus)}`);
    expect(cell('Pitching Wedge', 'Consistency').textContent).toMatch(/^\d+ ± \d+$/);
    expect(cell('3 Wood', 'Consistency')).toHaveTextContent(/^—\s*few shots$/);
    expect(cell('7 Iron', 'Consistency')).toHaveTextContent(/^—\s*few shots$/);
    expect(cell('7 Iron', 'Shots')).toHaveTextContent(/^3\s*few shots\s*3 shots from 3 Jan 2026$/);
    expect(cell('3 Wood', 'Shots').firstChild!.textContent).toBe('5');
    expect(cell('3 Wood', 'Shots').querySelector('.gapping-table__few')).toBeNull();
    expect(cell('Driver', 'Shots')).toHaveAttribute('title', '6 shots from 2 sessions, 1 Jan 2026 – 3 Jan 2026');
    expect(cell('7 Iron', 'Shots')).toHaveAttribute('title', '3 shots from 3 Jan 2026');
  });

  test('a focused row exposes where its shots came from, not only on hover', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    rowOf('Driver').focus();
    expect(rowOf('Driver')).toHaveFocus();
    expect(rowOf('Driver')).toHaveAccessibleDescription('6 shots from 2 sessions, 1 Jan 2026 – 3 Jan 2026');
    expect(rowOf('7 Iron')).toHaveAccessibleDescription('3 shots from 3 Jan 2026');
  });

  test('Selected session… shows the Session picker, newest first with the latest chosen', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    await userEvent.selectOptions(screen.getByLabelText('Based on'), 'Selected session…');
    const picker = screen.getByLabelText('Session') as HTMLSelectElement;
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['3 Jan 2026 · Late', '1 Jan 2026 · Early']);
    expect(picker.value).toBe('s2');
    expect(await screen.findByText('3 Jan 2026 · 5 shots · 1 excluded left out')).toBeInTheDocument();
    expect(api.putSetting).toHaveBeenLastCalledWith('gapping.scope', { basis: 'session', sessionId: 's2', shots: 'stock' });

    await userEvent.selectOptions(picker, 's1');
    expect(await screen.findByText('1 Jan 2026 · 15 shots · 0 excluded left out')).toBeInTheDocument();
    await waitFor(() => expect(api.listLibraryShots).toHaveBeenLastCalledWith({ sessionIds: ['s1'] }));
    expect(bodyRows().map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Driver', '3 Wood', 'Pitching Wedge']);
    expect(api.putSetting).toHaveBeenLastCalledWith('gapping.scope', { basis: 'session', sessionId: 's1', shots: 'stock' });
  });

  test('a saved session that is no longer in the library falls back to the latest session', async () => {
    vi.mocked(api.getSetting).mockResolvedValue({ basis: 'session', sessionId: 'gone', shots: 'stock' });
    renderPage();
    expect(await screen.findByText('3 Jan 2026 · 5 shots · 1 excluded left out')).toBeInTheDocument();
    expect((screen.getByLabelText('Session') as HTMLSelectElement).value).toBe('s2');
    expect(bodyRows().map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Driver', '7 Iron']);
  });

  test('Latest session and All time; All time asks for every session’s shots without listing them', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    await userEvent.selectOptions(screen.getByLabelText('Based on'), 'Latest session');
    expect(await screen.findByText('3 Jan 2026 · 5 shots · 1 excluded left out')).toBeInTheDocument();
    expect(screen.queryByLabelText('Session')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Based on'), 'All time');
    expect(await screen.findByText('All time · 20 shots · 1 excluded left out')).toBeInTheDocument();
    expect(api.listLibraryShots).toHaveBeenLastCalledWith({});
  });

  test('switching Ellipse to Every shot changes the shared choice and the Short – long cells', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    const used = SHOTS.filter((s) => !s.excluded).map(toProgressionShot);
    const fmt = (r: [number, number]) => `${Math.round(r[0])} – ${Math.round(r[1])}`;
    const sd1 = gappingTable(used, 'sd1').find((r) => r.club === 'Driver')!.shortLong!;
    const all = gappingTable(used, 'all').find((r) => r.club === 'Driver')!.shortLong!;
    expect(fmt(sd1)).not.toBe(fmt(all));
    expect(screen.getByTestId('ellipse-kind').textContent).toBe('sd1');
    expect(cell('Driver', 'Short – long').textContent).toBe(fmt(sd1));
    expect(cell('7 Iron', 'Short – long').textContent).toMatch(/^\d+ – \d+$/);

    await userEvent.click(within(screen.getByRole('group', { name: 'Ellipse' })).getByRole('button', { name: 'Every shot' }));
    expect(screen.getByTestId('ellipse-kind').textContent).toBe('all');
    expect(cell('Driver', 'Short – long').textContent).toBe(fmt(all));
  });

  test('hovering or focusing a row highlights that club in the plot', async () => {
    const { container } = renderPage();
    await screen.findByText(LINE_LAST3);
    const normal = ellipseOpacity(container, '3 Wood');
    await userEvent.hover(rowOf('Driver'));
    expect(ellipseOpacity(container, 'Driver')).toBeGreaterThan(normal);
    expect(ellipseOpacity(container, '3 Wood')).toBeLessThan(normal);
    expect(screen.getByRole('img', { name: /Driver highlighted\./ })).toBeInTheDocument();
    await userEvent.unhover(rowOf('Driver'));
    expect(ellipseOpacity(container, '3 Wood')).toBe(normal);

    rowOf('7 Iron').focus();
    await waitFor(() => expect(screen.getByRole('img', { name: /7 Iron highlighted\./ })).toBeInTheDocument());
    expect(ellipseOpacity(container, 'Driver')).toBeLessThan(normal);
    rowOf('7 Iron').blur();
    await waitFor(() => expect(ellipseOpacity(container, 'Driver')).toBe(normal));
  });

  test('changing Shots saves the scope and drops the excluded count from the line', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    await userEvent.click(screen.getByRole('button', { name: 'All shots' }));
    expect(screen.getByText("Each club's last 3 sessions · 21 shots")).toBeInTheDocument();
    expect(api.putSetting).toHaveBeenCalledWith('gapping.scope', { basis: 'last3', sessionId: null, shots: 'all' });
    expect(cell('Driver', 'Shots').firstChild!.textContent).toBe('7');
  });

  test('a failed save keeps the choice for this visit and tells the user', async () => {
    vi.mocked(api.putSetting).mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText(LINE_LAST3);
    await userEvent.click(screen.getByRole('button', { name: 'All shots' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the gapping choices"));
    expect(screen.getByText("Each club's last 3 sessions · 21 shots")).toBeInTheDocument();
  });

  test('no saved sessions: the load-a-CSV empty state', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No saved sessions yet' })).toBeInTheDocument();
    expect(screen.getByText('Load a session CSV to see your gapping.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Load Session CSV' })).toHaveAttribute('href', '/import');
    expect(api.listLibraryShots).not.toHaveBeenCalled();
  });

  test('shots without carry: a sentence instead of the plot and table', async () => {
    SHOTS = SHOTS.map((s) => ({ ...s, m: { ...s.m, carry: null } }) as LibraryShot);
    renderPage();
    expect(await screen.findByText('None of these shots have carry values.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('a stale table stays on screen, dimmed, while the next shots load', async () => {
    renderPage();
    await screen.findByText(LINE_LAST3);
    let release: () => void = () => {};
    const impl = vi.mocked(api.listLibraryShots).getMockImplementation()!;
    vi.mocked(api.listLibraryShots).mockImplementationOnce((opts) => new Promise((resolve) => { release = () => resolve(impl(opts)); }));
    await userEvent.selectOptions(screen.getByLabelText('Based on'), 'Latest session');
    expect(table().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    expect(bodyRows()).toHaveLength(4);
    release();
    expect(await screen.findByText('3 Jan 2026 · 5 shots · 1 excluded left out')).toBeInTheDocument();
    expect(table().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    expect(bodyRows()).toHaveLength(2);
  });
});

test('the plot’s distance axis reaches past an every-shot ellipse, not just the dots', async () => {
  // A topped Driver at 120 yd stretches its Every-shot ellipse past 300 yd, beyond the 260 yd dots' 300 yd axis.
  SHOTS.push(shot('s2', 'Driver', 120, 0));
  renderPage();
  await screen.findByRole('table');
  await userEvent.click(within(screen.getByRole('group', { name: 'Ellipse' })).getByRole('button', { name: 'Every shot' }));
  const used = SHOTS.filter((s) => !s.excluded).map(toProgressionShot);
  const e = gappingTable(used, 'all').find((r) => r.club === 'Driver')!.dispersion.ellipse!;
  expect(e.cy + e.halfY).toBeGreaterThan(300);
  const plot = document.querySelector('.gapping-plot')!;
  const ticks = Array.from(plot.querySelectorAll('text[text-anchor="middle"]')).map((t) => Number(t.textContent));
  expect(Math.max(...ticks)).toBeGreaterThanOrEqual(e.cy + e.halfY);
});
