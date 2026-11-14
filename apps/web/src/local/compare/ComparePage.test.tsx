import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate, type InitialEntry, type NavigateFunction } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ImportRow, SessionDetail, SessionRow, ShotDetail, ShotOut } from '../api';

vi.mock('../api', () => ({
  getShot: vi.fn(),
  listSessions: vi.fn(),
  getSession: vi.fn(),
  getShots: vi.fn(),
}));
import * as api from '../api';
import { EMPTY_SET, rememberedSet, rememberSet } from './compareState';
import ComparePage, { forgetLoadedShots } from './ComparePage';
import { CHANGED_CAPTION } from './WhatChanged';

const session = (id: string, name: string, date: string, clubs: string[]): SessionRow =>
  ({ id, name, date, notes: '', handedness: 'right', createdAt: `${date}T10:00:00Z`, updatedAt: '', shotCount: 3, fileCount: 1, clubs: clubs.map((club) => ({ club, count: 1 })) }) as SessionRow;
const LATER = session('later', 'Later', '2026-11-07', ['7 Iron', 'Driver']);
const EARLIER = session('earlier', 'Earlier', '2026-10-01', ['7 Iron']);
// The newest session, so a picker that ignored its starting session would land here instead.
const NEWEST = session('newest', 'Newest', '2026-11-10', ['Wedge']);

const M = { carry: 248, height: 95, launchV: 12, descentV: 38, lateral: 4, clubPath: 2.1, ftt: 1.2, spin: 2410 };
const shotOut = (id: string, club: string, label: string, m: Record<string, number | null>, excluded = false): ShotOut =>
  ({ id, importId: 'imp', sourceRow: 1, shotLabel: label, club, excluded, shotType: null, mode: null, location: null, raw: {}, flags: [], m }) as unknown as ShotOut;
const detail = (shot: ShotOut, s: SessionRow): ShotDetail => ({ shot, session: s, import: { id: 'imp', ordinal: 1 } as ImportRow });

const A = detail(shotOut('A', 'Driver', '7', M), LATER);
const B = detail(shotOut('B', '7 Iron', '3', { ...M, carry: 160, height: 80, spin: 2980 }), EARLIER);
const A_LABEL = 'A · Driver · Shot 7 · Later · 7 Nov 2026';
const B_LABEL = 'B · 7 Iron · Shot 3 · Earlier · 1 Oct 2026';
// A slot label holds its date in a nowrap span, so match the whole label's text.
const lbl = (t: string) => (_: string, el: Element | null) => !!el?.classList.contains('compare-slot__label') && el.textContent === t;
const C = detail(shotOut('C', 'Driver', '9', { ...M, carry: 255 }), LATER);
const D = detail(shotOut('D', '7 Iron', '4', { ...M, carry: 165, height: 82 }), EARLIER);
const C_LABEL = 'C · Driver · Shot 9 · Later · 7 Nov 2026';
const D_LABEL = 'D · 7 Iron · Shot 4 · Earlier · 1 Oct 2026';
const TABLE = CHANGED_CAPTION;

let FIXTURES: Record<string, ShotDetail>;

beforeEach(() => {
  rememberSet(EMPTY_SET);
  forgetLoadedShots();
  FIXTURES = { A, B, C, D };
  vi.mocked(api.getShot).mockReset().mockImplementation(async (id) => FIXTURES[id] ?? null);
  vi.mocked(api.listSessions).mockReset().mockResolvedValue([EARLIER, LATER, NEWEST]);
  vi.mocked(api.getSession).mockReset().mockImplementation(async (id) => ({ session: [LATER, EARLIER, NEWEST].find((s) => s.id === id)!, imports: [{ id: 'imp', ordinal: 1 }] }) as SessionDetail);
  vi.mocked(api.getShots).mockReset().mockImplementation(async (id) => (id === 'later' ? [A.shot] : id === 'earlier' ? [B.shot] : []));
});

let nav: NavigateFunction;
function Probe() {
  const loc = useLocation();
  nav = useNavigate();
  return <output data-testid="loc" data-state={JSON.stringify(loc.state ?? null)}>{`${loc.pathname}${loc.search}`}</output>;
}

function renderAt(entries: InitialEntry[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/elsewhere" element={<Link to="/compare">Compare</Link>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}
const where = () => screen.getByTestId('loc').textContent;
const sideView = () => screen.getByRole('img', { name: /^Side-view trajectories/ });

describe('ComparePage', () => {
  test('empty page offers two pickers and the hint', () => {
    renderAt(['/compare']);
    expect(screen.getAllByRole('button', { name: 'Choose shot…' })).toHaveLength(2);
    expect(screen.getByText('Pick two shots to see what changed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear comparison' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(api.getShot).not.toHaveBeenCalled();
  });

  test("only A shows its label and B's Choose shot…", async () => {
    renderAt(['/compare?a=A']);
    expect(await screen.findByText(lbl(A_LABEL))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Choose shot…' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Change shot…' })).toBeInTheDocument();
    // A is already the baseline.
    expect(screen.queryByRole('button', { name: 'Make baseline' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Pick two shots to see what changed')).toBeNull();
  });

  test('an excluded shot says so in its label', async () => {
    FIXTURES.A = detail(shotOut('A', 'Driver', '7', M, true), LATER);
    renderAt(['/compare?a=A']);
    expect(await screen.findByText(lbl(`${A_LABEL} · excluded`))).toBeInTheDocument();
  });

  test('both show labels, diagrams and the table', async () => {
    const { container } = renderAt(['/compare?a=A&b=B']);
    expect(await screen.findByText(lbl(A_LABEL))).toBeInTheDocument();
    expect(screen.getByText(lbl(B_LABEL))).toBeInTheDocument();
    expect(sideView()).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Top-down dispersion/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Top view of club path/ })).toBeInTheDocument();
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(3);
    expect(screen.getByRole('table', { name: TABLE })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Change shot…' })).toHaveLength(2);
  });

  test("B's Make baseline trades places with A, at once, with no loading flash; there is no Swap", async () => {
    renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(B_LABEL));
    expect(screen.queryByRole('button', { name: 'Swap' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Make baseline' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Make baseline' }));
    expect(where()).toBe('/compare?a=B&b=A');
    expect(screen.getByText(lbl('A · 7 Iron · Shot 3 · Earlier · 1 Oct 2026'))).toBeInTheDocument();
    expect(screen.queryByText('Loading shot…')).toBeNull();
  });

  test('A is marked as the baseline, in its slot and in the table', async () => {
    renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(B_LABEL));
    const slotA = screen.getByText(lbl(A_LABEL)).closest('.compare-slot')!;
    expect(within(slotA as HTMLElement).getByText('Baseline')).toBeInTheDocument();
    const slotB = screen.getByText(lbl(B_LABEL)).closest('.compare-slot')!;
    expect(within(slotB as HTMLElement).queryByText('Baseline')).toBeNull();
    const table = screen.getByRole('table', { name: TABLE });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'A Baseline', 'B']);
  });

  test('Add shot is there from the first visit, so C can be chosen before A and B', async () => {
    renderAt(['/compare']);
    await userEvent.click(screen.getByRole('button', { name: '+ Add shot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose shot C' });
    // Nothing is chosen yet, so the picker starts at the newest session; pick the one with shots.
    await userEvent.selectOptions(within(dialog).getByLabelText('Session'), await within(dialog).findByRole('option', { name: 'Later · 7 Nov 2026' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Shot'), await within(dialog).findByRole('option', { name: /^Shot 7/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose' }));
    expect(where()).toBe('/compare?c=A');
    expect(screen.getAllByRole('button', { name: 'Choose shot…' })).toHaveLength(2);
    expect(screen.getByText('Choose shot A, the baseline, to see what changed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('A and C are enough for the diagrams and the table', async () => {
    renderAt(['/compare?a=A&c=C']);
    await screen.findByText(lbl(C_LABEL));
    const table = screen.getByRole('table', { name: TABLE });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'A Baseline', 'C']);
    expect(sideView().querySelectorAll('path[data-shot-id]')).toHaveLength(2);
  });

  test("C's Make baseline puts C in A and A in C", async () => {
    renderAt(['/compare?a=A&b=B&c=C&d=D']);
    await screen.findByText(lbl(D_LABEL));
    expect(screen.getAllByRole('button', { name: 'Make baseline' })).toHaveLength(3);
    const slotC = screen.getByText(lbl(C_LABEL)).closest('.compare-slot') as HTMLElement;
    await userEvent.click(within(slotC).getByRole('button', { name: 'Make baseline' }));
    expect(where()).toBe('/compare?a=C&b=B&c=A&d=D');
    expect(screen.getByText(lbl('A · Driver · Shot 9 · Later · 7 Nov 2026'))).toBeInTheDocument();
  });

  test('Clear comparison empties the page, and the Compare tab no longer brings it back', async () => {
    renderAt(['/compare?a=A&b=B&c=C']);
    await screen.findByText(lbl(C_LABEL));
    await userEvent.click(screen.getByRole('button', { name: 'Clear comparison' }));
    expect(where()).toBe('/compare');
    expect(screen.getByText('Pick two shots to see what changed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear comparison' })).toBeNull();
    expect(rememberedSet()).toBeNull();
    act(() => { void nav('/elsewhere'); });
    await userEvent.click(screen.getByRole('link', { name: 'Compare' }));
    expect(where()).toBe('/compare');
  });

  test("Add shot opens C's picker from A's session and club, and picking adds C", async () => {
    renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(B_LABEL));
    await userEvent.click(screen.getByRole('button', { name: '+ Add shot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose shot C' });
    await waitFor(() => expect(within(dialog).getByLabelText('Session')).toHaveDisplayValue('Later · 7 Nov 2026'));
    expect(within(dialog).getByLabelText('Club')).toHaveDisplayValue('Driver');
    await userEvent.selectOptions(within(dialog).getByLabelText('Shot'), await within(dialog).findByRole('option', { name: /^Shot 7/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose' }));
    expect(where()).toBe('/compare?a=A&b=B&c=A');
    expect(await screen.findByText(lbl('C · Driver · Shot 7 · Later · 7 Nov 2026'))).toBeInTheDocument();
    // Cancelling an Add shot picker adds nothing.
    await userEvent.click(screen.getByRole('button', { name: '+ Add shot' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/compare?a=A&b=B&c=A');
  });

  test('four shots: every slot, every diagram and a column per shot; no more can be added', async () => {
    renderAt(['/compare?a=A&b=B&c=C&d=D']);
    for (const l of [A_LABEL, B_LABEL, C_LABEL, D_LABEL]) expect(await screen.findByText(lbl(l))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add shot' })).toBeNull();
    expect(sideView().querySelectorAll('path[data-shot-id]')).toHaveLength(4);
    expect(screen.getByRole('img', { name: /^Top view of club path/ }).querySelectorAll('[data-kind="path"]')).toHaveLength(4);
    const table = screen.getByRole('table', { name: TABLE });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'A Baseline', 'B', 'C', 'D']);
    // Only C and D can be removed.
    expect(screen.queryByRole('button', { name: 'Remove shot A' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove shot B' })).toBeNull();
  });

  test('removing C moves D up to C, and Add shot comes back', async () => {
    renderAt(['/compare?a=A&b=B&c=C&d=D']);
    await screen.findByText(lbl(D_LABEL));
    await userEvent.click(screen.getByRole('button', { name: 'Remove shot C' }));
    expect(where()).toBe('/compare?a=A&b=B&c=D');
    expect(screen.getByText(lbl('C · 7 Iron · Shot 4 · Earlier · 1 Oct 2026'))).toBeInTheDocument();
    expect(screen.queryByText('Loading shot…')).toBeNull();
    expect(screen.getByRole('button', { name: '+ Add shot' })).toBeInTheDocument();
  });

  test("B's Make baseline keeps C and D", async () => {
    renderAt(['/compare?a=A&b=B&c=C']);
    await screen.findByText(lbl(C_LABEL));
    const slotB = screen.getByText(lbl(B_LABEL)).closest('.compare-slot') as HTMLElement;
    await userEvent.click(within(slotB).getByRole('button', { name: 'Make baseline' }));
    expect(where()).toBe('/compare?a=B&b=A&c=C');
  });

  test("a C that no longer exists says so, can be removed, and isn't remembered", async () => {
    renderAt(['/compare?a=A&b=B&c=gone']);
    expect(await screen.findByText('That shot is no longer in your library')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: TABLE })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('columnheader')).toHaveLength(3);
    expect(rememberedSet()).toEqual({ a: 'A', b: 'B', extra: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Remove shot C' }));
    expect(where()).toBe('/compare?a=A&b=B');
  });

  test('choosing a shot puts it in the URL', async () => {
    renderAt(['/compare?b=B']);
    await screen.findByText(lbl(B_LABEL));
    await userEvent.click(screen.getByRole('button', { name: 'Choose shot…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose shot A' });
    // B is set and A is empty, so A's picker starts from B's session and club.
    await waitFor(() => expect(within(dialog).getByLabelText('Session')).toHaveDisplayValue('Earlier · 1 Oct 2026'));
    await userEvent.selectOptions(within(dialog).getByLabelText('Shot'), await within(dialog).findByRole('option', { name: /^Shot 3/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose' }));
    expect(where()).toBe('/compare?a=B&b=B');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test("Change shot… on a filled slot starts from that slot's own session, club and shot", async () => {
    renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(B_LABEL));
    await userEvent.click(screen.getAllByRole('button', { name: 'Change shot…' })[1]!);
    const dialog = await screen.findByRole('dialog', { name: 'Choose shot B' });
    await waitFor(() => expect(within(dialog).getByLabelText('Session')).toHaveDisplayValue('Earlier · 1 Oct 2026'));
    expect(within(dialog).getByLabelText('Club')).toHaveDisplayValue('7 Iron');
    await waitFor(() => expect(within(dialog).getByLabelText('Shot')).toHaveDisplayValue(/^Shot 3/));
    expect(within(dialog).getByRole('button', { name: 'Choose' })).toBeEnabled();
  });

  test('a session with several files shows the file badge in the slot label', async () => {
    FIXTURES.A = { ...A, session: { ...LATER, fileCount: 2 }, import: { id: 'imp', ordinal: 2 } as ImportRow };
    renderAt(['/compare?a=A']);
    expect(await screen.findByText(lbl('A · Driver · F2 Shot 7 · Later · 7 Nov 2026'))).toBeInTheDocument();
  });

  test('a shot that no longer exists leaves its slot empty and keeps the other', async () => {
    renderAt(['/compare?a=gone&b=B']);
    expect(await screen.findByText('That shot is no longer in your library')).toBeInTheDocument();
    expect(await screen.findByText(lbl(B_LABEL))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose shot…' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(rememberedSet()).toEqual({ a: null, b: 'B', extra: [] });
  });

  test('a failed load offers Retry', async () => {
    vi.mocked(api.getShot).mockRejectedValueOnce(new Error('boom'));
    renderAt(['/compare?a=A']);
    expect(await screen.findByText("Couldn't load that shot")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(lbl(A_LABEL))).toBeInTheDocument();
  });

  test('empty id counts as absent', async () => {
    renderAt(['/compare?a=&b=B']);
    expect(await screen.findByText(lbl(B_LABEL))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose shot…' })).toBeInTheDocument();
    expect(screen.queryByText('That shot is no longer in your library')).toBeNull();
    expect(api.getShot).toHaveBeenCalledTimes(1);
    expect(api.getShot).toHaveBeenCalledWith('B');
  });

  test("a stale answer doesn't overwrite a newer one", async () => {
    const pending: Record<string, (d: ShotDetail) => void> = {};
    vi.mocked(api.getShot).mockImplementation((id) => new Promise((resolve) => { pending[id] = resolve; }));
    renderAt(['/compare?a=A1']);
    await waitFor(() => expect(pending.A1).toBeDefined());
    act(() => { void nav('/compare?a=A2'); });
    await waitFor(() => expect(pending.A2).toBeDefined());
    await act(async () => pending.A2!(detail(shotOut('A2', 'Driver', '2', M), LATER)));
    expect(screen.getByText(lbl('A · Driver · Shot 2 · Later · 7 Nov 2026'))).toBeInTheDocument();
    await act(async () => pending.A1!(detail(shotOut('A1', 'Driver', '1', M), LATER)));
    expect(screen.getByText(lbl('A · Driver · Shot 2 · Later · 7 Nov 2026'))).toBeInTheDocument();
    expect(screen.queryByText(lbl('A · Driver · Shot 1 · Later · 7 Nov 2026'))).toBeNull();
  });

  test('different clubs share one distance axis', async () => {
    FIXTURES.B = detail(shotOut('B', 'Wedge', '3', { ...M, carry: 90, height: 60, lateral: -2 }), EARLIER);
    renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(A_LABEL));
    const ticks = [...sideView().querySelectorAll('text')].map((t) => t.textContent ?? '').filter((t) => /^\d+$/.test(t)).map(Number);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(248);
    expect(sideView().querySelectorAll('path[data-shot-id]')).toHaveLength(2);
    expect(within(screen.getByRole('table', { name: TABLE })).getAllByRole('row')).toHaveLength(28);
  });

  test('a shot without trajectory data is noted, the other still drawn', async () => {
    FIXTURES.B = detail(shotOut('B', '7 Iron', '3', { ...M, carry: 160, height: null }), EARLIER);
    renderAt(['/compare?a=A&b=B']);
    expect(await screen.findByText('Shot B has no trajectory data')).toBeInTheDocument();
    expect(screen.queryByText('Shot A has no trajectory data')).toBeNull();
    expect(sideView().querySelectorAll('path[data-shot-id]')).toHaveLength(1);
  });

  test('the top view draws each shot\'s ball flight in its colour, and notes a straight one', async () => {
    FIXTURES.B = detail(shotOut('B', '7 Iron', '3', { ...M, carry: 160, launchH: null }), EARLIER);
    FIXTURES.A = detail(shotOut('A', 'Driver', '7', { ...M, launchH: 2.5 }), LATER);
    FIXTURES.C = detail(shotOut('C', 'Driver', '9', { ...M, carry: 255, launchH: null }), LATER);
    renderAt(['/compare?a=A&b=B&c=C']);
    await screen.findByText(lbl(C_LABEL));
    const top = screen.getByRole('img', { name: /^Top-down dispersion/ });
    expect([...top.querySelectorAll('[data-testid="flight-path"]')].map((p) => p.getAttribute('data-shot-id'))).toEqual(['A', 'B', 'C']);
    expect(screen.getByRole('heading', { name: 'Ball flight (top view)' })).toBeInTheDocument();
    expect(screen.getByText(/^Flight paths are illustrative/)).toBeInTheDocument();
    expect(screen.getByText('Shot B has no launch direction, so its path is drawn straight')).toBeInTheDocument();
    expect(screen.getByText('Shot C has no launch direction, so its path is drawn straight')).toBeInTheDocument();
    expect(screen.queryByText(/Shot A has no launch direction/)).toBeNull();
  });

  test('a shot without a landing position is noted', async () => {
    FIXTURES.A = detail(shotOut('A', 'Driver', '7', { ...M, lateral: null }), LATER);
    renderAt(['/compare?a=A&b=B']);
    expect(await screen.findByText('Shot A has no landing position')).toBeInTheDocument();
    expect(screen.queryByText('Shot B has no landing position')).toBeNull();
  });

  test('nav click restores the last comparison, Back does not', async () => {
    const first = renderAt(['/compare?a=A&b=B']);
    await screen.findByText(lbl(B_LABEL));
    act(() => { void nav('/elsewhere'); });
    await userEvent.click(screen.getByRole('link', { name: 'Compare' }));
    await waitFor(() => expect(where()).toBe('/compare?a=A&b=B'));
    await screen.findByText(lbl(B_LABEL));
    first.unmount();

    rememberSet(EMPTY_SET);
    renderAt(['/compare', '/compare?a=A']);
    await screen.findByText(lbl(A_LABEL));
    expect(rememberedSet()).toEqual({ a: 'A', b: null, extra: [] });
    act(() => { void nav(-1); });
    expect(where()).toBe('/compare');
    expect(screen.getByText('Pick two shots to see what changed')).toBeInTheDocument();
    expect(where()).toBe('/compare');
  });

  test("arriving from the Inspector opens B's picker", async () => {
    renderAt([{ pathname: '/compare', search: '?a=A', state: { pickB: true } }]);
    const dialog = await screen.findByRole('dialog', { name: 'Choose shot B' });
    await waitFor(() => expect(within(dialog).getByLabelText('Session')).toHaveDisplayValue('Later · 7 Nov 2026'));
    expect(within(dialog).getByLabelText('Club')).toHaveDisplayValue('Driver');
    expect(screen.getByTestId('loc')).toHaveAttribute('data-state', 'null');
    expect(where()).toBe('/compare?a=A');
    await waitFor(() => expect(within(dialog).getByLabelText('Shot')).toBeEnabled());
  });
});
