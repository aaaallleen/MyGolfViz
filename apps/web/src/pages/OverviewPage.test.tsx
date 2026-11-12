import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { FIELD_DEFS } from '@fsa/domain';
import { renderWithData } from '../test/renderWithData';

const F1 = 'FlightScope Golf Session Sept 19 2022.csv';
const F2 = 'FlightScope Golf Session Sept 19.csv';
const F3 = 'FlightScope Golf Session.csv';
const ALL = [F1, F2, F3];
const tableRows = (c: HTMLElement) => Array.from(c.querySelectorAll('.shots-table tr[data-shot-id]')) as HTMLElement[];
const chip = (label: string) => (Array.from(document.querySelectorAll('.fsa-chip')) as HTMLElement[]).find((b) => b.firstElementChild?.textContent === label)!;
const chipTexts = () => Array.from(document.querySelectorAll('.fsa-chip')).map((b) => Array.from(b.children).map((x) => x.textContent).join(' '));

describe('OverviewPage', () => {
  test("no details set: header copy and no file-name fragments in h1/h2", () => {
    renderWithData(ALL);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Untitled session');
    expect(screen.getByText('No date set')).toBeInTheDocument();
    expect(screen.getByText('3 source files')).toBeInTheDocument();
    expect(screen.getByText('133 shots')).toBeInTheDocument();
    expect(within(document.querySelector('.overview__meta') as HTMLElement).getByText('Outdoor')).toBeInTheDocument();
    expect(screen.getByText('In this browser only')).toBeInTheDocument();
    for (const h of screen.getAllByRole('heading', { level: 1 }).concat(screen.getAllByRole('heading', { level: 2 }))) {
      expect(h.textContent).not.toMatch(/Sept|2022/);
    }
  });

  test('details show the title, the date and the notes', () => {
    renderWithData(ALL, { details: { name: 'Range day', date: '2026-11-07', notes: 'Shallowing AoA' } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Range day');
    expect(screen.getByText('7 Nov 2026 (set by you)')).toBeInTheDocument();
    expect(screen.getByText('Shallowing AoA')).toBeInTheDocument();
  });

  test('Edit details: changing the name updates the h1 immediately', async () => {
    const user = userEvent.setup();
    // One 16-shot file: every keystroke re-renders the whole Overview, and with all 133 shots this
    // test alone ran 2–5 s on CI, against the 5 s default timeout. The shot count doesn't matter here.
    renderWithData([F1]);
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const input = screen.getByLabelText('Session name');
    await user.clear(input);
    await user.type(input, 'Wedges');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wedges');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Session name')).toBeNull();
  });

  test('dispersion title follows the mode and never says Total Dispersion', async () => {
    const user = userEvent.setup();
    renderWithData(ALL);
    expect(screen.getByRole('heading', { level: 2, name: 'Landing dispersion · top view' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Landing position' })).getByRole('button', { name: 'Total' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Total Distance vs. Landing Offset' })).toBeInTheDocument();
    expect(screen.getByText('Total SD')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Total Dispersion');
  });

  test('club chips in order with counts', () => {
    renderWithData(ALL);
    expect(chipTexts()).toEqual(['All 133', 'Driver 34', '4 Hybrid 3', '7 Iron 39', '8 Iron 15', '6 Iron 7', '9 Iron 7', 'Pitching Wedge 12', 'Gap Wedge 16']);
  });

  test('Driver chip: heading and n/of subs', async () => {
    const user = userEvent.setup();
    renderWithData(ALL);
    await user.click(chip('Driver'));
    expect(screen.getByRole('heading', { level: 2, name: 'Averages · Driver · 34 shots' })).toBeInTheDocument();
    const tile = (label: string) => screen.getByText(label, { selector: '.fsa-kpi__label' }).closest('.fsa-kpi') as HTMLElement;
    expect(tile('Club path')).toHaveTextContent(/n 32 of 34$/);
    expect(tile('Carry')).toHaveTextContent(/n 34$/);
  });

  test('eight KPI labels in order, with Mean lateral', () => {
    renderWithData(ALL);
    expect(Array.from(document.querySelectorAll('.fsa-kpi__label')).map((x) => x.textContent)).toEqual(
      ['Carry', 'Total', 'Ball speed', 'Club speed', 'Smash factor', 'Spin', 'Mean lateral', 'Club path'],
    );
  });

  test('chips have accessible names like "Driver, 34 shots"', () => {
    renderWithData(ALL);
    expect(screen.getByRole('button', { name: 'All, 133 shots' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Driver, 34 shots' })).toBeInTheDocument();
  });

  test('All clubs: Carry n 132 of 133', () => {
    renderWithData(ALL);
    const carry = screen.getByText('Carry', { selector: '.fsa-kpi__label' }).closest('.fsa-kpi') as HTMLElement;
    expect(carry).toHaveTextContent(/n 132 of 133$/);
    expect(carry.querySelector('.fsa-kpi__unit')).toHaveTextContent('yd');
  });

  test('source select: File 1 with Driver gives observed 6 of 16', async () => {
    const user = userEvent.setup();
    renderWithData(ALL);
    await user.click(chip('Driver'));
    await user.selectOptions(screen.getByLabelText('Source file'), `File 1 · ${F1} · 16`);
    expect(screen.getByText(/observed: 6 of 16 shots inside/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Averages · Driver · File 1 · 16 shots' })).toBeInTheDocument();
  });

  test('clicking a dispersion point selects that shot everywhere', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const target = r.store().visibleShots[5]!;
    await user.click(document.querySelector(`circle[data-shot-id="${target.id}"]`)!);
    expect(r.store().selectedId).toBe(target.id);
    const row = tableRows(r.container).find((x) => x.dataset.shotId === target.id)!;
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(tableRows(r.container).filter((x) => x.hasAttribute('aria-selected'))).toHaveLength(0)
    expect(tableRows(r.container).filter((x) => x.hasAttribute('aria-current'))).toHaveLength(1)
    expect(screen.getByLabelText('Choose shot')).toHaveValue(target.id);
  });

  test('Enter on a row selects it; Next shot steps; position text', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    await user.click(chip('Driver'));
    const rows = tableRows(r.container);
    act(() => rows[0]!.focus());
    await user.keyboard('{Enter}');
    expect(r.store().selectedId).toBe(rows[0]!.dataset.shotId);
    await user.click(screen.getByRole('button', { name: 'Next shot' }));
    expect(r.store().selectedId).toBe(rows[1]!.dataset.shotId);
    expect(screen.getByText('2 of 34')).toBeInTheDocument();
  });

  test('File 1 Shot 14: Path and Face to path show a dash that still reads and hovers as Not measured; row title', () => {
    const r = renderWithData(ALL);
    const row = tableRows(r.container).find((x) => x.title === `File 1 · ${F1} · CSV row 15`)!;
    expect(row).toBeTruthy();
    const cell = (col: string) => row.querySelector(`td[data-col="${col}"]`)!;
    expect(cell('shot')).toHaveTextContent('14');
    for (const col of ['clubPath', 'ftp']) {
      expect(cell(col).querySelector('[aria-hidden="true"]')).toHaveTextContent(/^–$/);
      expect(cell(col)).toHaveTextContent(/^–Not measured$/); // the words are visually hidden, still read aloud
      expect(cell(col).querySelector('[title="Not measured"]')).not.toBeNull();
      expect(cell(col)).toHaveClass('is-missing');
    }
  });

  test('empty filter: message, and Show all clubs resets club', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    await user.click(chip('Driver'));
    await user.selectOptions(screen.getByLabelText('Source file'), `File 2 · ${F2} · 26`);
    expect(screen.getByText('No shots match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all clubs' }));
    expect(r.store().filters.club).toBeNull();
    expect(tableRows(r.container)).toHaveLength(26);
  });

  test('a 2-shot filter shows no ellipse and the needs-3-shots caption', async () => {
    const lines = readFileSync(join(__dirname, '../../../../fixtures/flightscope', F2), 'utf8').split(/\r?\n/);
    const shots = lines.slice(1).filter((l) => l.startsWith('4 Hybrid,') && !/^4 Hybrid,(Avg|Dev),/.test(l)).slice(0, 2);
    expect(shots).toHaveLength(2);
    const path = join(mkdtempSync(join(tmpdir(), 'fsa-')), 'two-shots.csv');
    writeFileSync(path, [lines[0]!, ...shots].join('\n'));
    renderWithData([path]);
    expect(screen.queryByTestId('ellipse')).toBeNull();
    expect(screen.getByText('Ellipse needs at least 3 shots with lateral and carry values.')).toBeInTheDocument();
  });

  test('ellipse caption exact', () => {
    renderWithData(ALL);
    expect(screen.getByText(/^1σ covariance ellipse per club · about 39% expected coverage if shots were bivariate normal · observed: \d+ of \d+ shots inside\. Cross: each club's mean landing\.$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/holds? (about )?39%/);
  });

  test('Clubs table: one row per club in bag order, each with its colour swatch; one ellipse per club', () => {
    renderWithData(ALL);
    const table = screen.getByRole('region', { name: 'Clubs' });
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];
    expect(rows.map((r) => r.dataset.club)).toEqual(['Driver', '4 Hybrid', '6 Iron', '7 Iron', '8 Iron', '9 Iron', 'Pitching Wedge', 'Gap Wedge']);
    const swatch = (club: string) => (table.querySelector(`tr[data-club="${club}"] .club-table__swatch`) as HTMLElement).style.background;
    expect(new Set(rows.map((r) => swatch(r.dataset.club!))).size).toBe(8);
    expect(document.querySelectorAll('[data-testid="ellipse"]')).toHaveLength(8);
    // The table and the plot agree on each club's colour.
    const plotFill = (club: string) => document.querySelector(`circle[data-shot-id][data-club="${club}"]`)!.parentElement!.getAttribute('fill')!.toLowerCase();
    const hex = (rgb: string) => `#${rgb.match(/\d+/g)!.map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    for (const club of ['Driver', '7 Iron', 'Gap Wedge']) expect(hex(swatch(club))).toBe(plotFill(club));
  });

  test('club colours do not change when a filter hides other clubs', async () => {
    const user = userEvent.setup();
    renderWithData(ALL);
    const fill = () => document.querySelector('circle[data-shot-id][data-club="7 Iron"]')!.parentElement!.getAttribute('fill');
    const before = fill();
    await user.click(chip('7 Iron'));
    expect(fill()).toBe(before);
  });

  test('two highlight levels: the analysis opens with no club highlighted; picking a shot highlights its club and whitens the shot; tapping the club again clears the club and the shot', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const pressed = () => screen.queryAllByRole('button', { pressed: true }).filter((b) => b.classList.contains('club-table__club')).map((b) => b.textContent);
    expect(pressed()).toEqual([]);
    expect(r.store().selectedId).toBeNull();
    const target = r.store().visibleShots.find((s) => s.club === 'Gap Wedge')!;
    await user.click(document.querySelector(`circle[data-shot-id="${target.id}"]`)!);
    expect(pressed()).toEqual(['Gap Wedge']);
    expect(document.querySelector(`circle[data-shot-id="${target.id}"]`)).toHaveAttribute('fill', '#EAF0EC');
    expect(document.querySelector('[data-testid="ellipse"][data-club="Gap Wedge"]')!.getAttribute('stroke-opacity')).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Gap Wedge', pressed: true }));
    expect(pressed()).toEqual([]);
    expect(r.store().selectedId).toBeNull();
    expect(document.querySelectorAll('[data-shot-id][aria-current]')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Driver', pressed: false }));
    expect(pressed()).toEqual(['Driver']);
  });

  test('tapping a club in the Clubs table jumps the shot picker to that club’s first shot', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const firstOf = (club: string) => r.store().visibleShots.find((s) => s.club === club)!;
    await user.click(screen.getByRole('button', { name: 'Gap Wedge', pressed: false }));
    expect(r.store().selectedId).toBe(firstOf('Gap Wedge').id);
    expect(screen.getByLabelText('Choose shot')).toHaveValue(firstOf('Gap Wedge').id);
    // Step on, then pick the same club again from the table: back to its first shot.
    await user.click(screen.getByRole('button', { name: 'Next shot' }));
    await user.click(screen.getByRole('button', { name: 'Gap Wedge', pressed: true })); // clears the highlight and the shot
    expect(r.store().selectedId).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Gap Wedge', pressed: false }));
    expect(r.store().selectedId).toBe(firstOf('Gap Wedge').id);
  });

  test('shot card opens with no shot: a prompt, the picker and the stepper, no values or inspector button', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const card = document.querySelector('.selected-card') as HTMLElement;
    expect(card.querySelector('.selected-card__title')).toHaveTextContent('Choose a shot');
    expect(within(card).getByText(`No shot selected · ${r.store().visibleShots.length} shots`)).toBeInTheDocument();
    expect(within(card).getByLabelText('Choose shot')).toHaveValue('');
    expect(card.querySelector('.selected-card__dot')).toBeNull();
    expect(card.querySelector('.value-grid')).toBeNull();
    expect(within(card).queryAllByRole('link')).toHaveLength(0);
    await user.click(within(card).getByRole('button', { name: 'Next shot' }));
    expect(r.store().selectedId).toBe(r.store().visibleShots[0]!.id);
  });

  test('shot card: the name is the picker, with the club colour dot, a ‹ › stepper, the count, and the inspector button last', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const card = document.querySelector('.selected-card') as HTMLElement;
    const shot = r.store().visibleShots[0]!;
    act(() => r.store().select(shot.id));
    expect(card.querySelector('.selected-card__title')).toHaveTextContent(`${shot.club} · Shot ${shot.shotLabel ?? shot.sourceRow}`);
    const tableSwatch = (document.querySelector(`.club-table tr[data-club="${shot.club}"] .club-table__swatch`) as HTMLElement).style.background;
    expect((card.querySelector('.selected-card__dot') as HTMLElement).style.background).toBe(tableSwatch);
    expect(within(card).queryAllByRole('heading')).toHaveLength(0); // the visible name is decoration over the select
    const picker = within(card).getByLabelText('Choose shot');
    const target = r.store().visibleShots[7]!;
    await user.selectOptions(picker, target.id);
    expect(r.store().selectedId).toBe(target.id);
    expect(card.querySelector('.selected-card__title')).toHaveTextContent(target.club);
    expect(within(card).getByRole('group', { name: 'Step through shots' })).toContainElement(within(card).getByRole('button', { name: 'Next shot' }));
    expect(within(card).getByText(`8 of ${r.store().visibleShots.length}`)).toBeInTheDocument();
    const links = within(card).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Open shot inspector →']);
  });

  test('the side view shares the top view distance scale', () => {
    renderWithData(ALL);
    const texts = (sel: string) => Array.from(document.querySelectorAll(`${sel} svg text`)).map((t) => t.textContent).filter((t) => /^\d+$/.test(t ?? ''));
    expect(texts('.fsa-dispersion')).toEqual(texts('.fsa-trajectory'));
    expect(screen.getByRole('heading', { level: 3, name: 'Trajectory · side view' })).toBeInTheDocument();
  });

  test('Shots table shows every CSV column: all measurements in Ball / Club / Impact / Environment groups, then the text columns', () => {
    const r = renderWithData(ALL);
    expect(tableRows(r.container)).toHaveLength(133);
    const groups = Array.from(document.querySelectorAll('.shots-table__groups th[scope="colgroup"]')).map((t) => t.textContent);
    expect(groups).toEqual(['Ball', 'Club', 'Impact', 'Environment', 'Other']);
    const cols = Array.from(document.querySelectorAll('.shots-table thead th[data-col]')).map((t) => (t as HTMLElement).dataset.col);
    for (const def of FIELD_DEFS) expect(cols).toContain(def.key);
    expect(cols.slice(0, 2)).toEqual(['shot', 'club']);
    expect(cols.slice(-3)).toEqual(['shotType', 'mode', 'location']);
    expect(cols).toHaveLength(2 + FIELD_DEFS.length + 3); // the fixtures have no columns the parser can't read
  });

  test('Shot and Club are pinned: sticky with the model offsets, and the Columns menu cannot hide them', async () => {
    const user = userEvent.setup();
    renderWithData([F1]);
    const head = (col: string) => document.querySelector(`.shots-table thead th[data-col="${col}"]`) as HTMLElement;
    expect(head('shot')).toHaveClass('is-pinned');
    expect(head('club')).toHaveClass('is-pinned', 'is-pinned-last');
    expect(head('shot').style.insetInlineStart).toBe('0px');
    expect(head('club').style.insetInlineStart).toBe(head('shot').style.width);
    expect(head('carry')).not.toHaveClass('is-pinned');
    await user.click(screen.getByRole('button', { name: /^Columns · / }));
    expect(screen.queryByRole('checkbox', { name: 'Shot' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Club' })).toBeNull();
  });

  test('sorting: tapping a header sorts within each club, again reverses, a third time restores the file order; missing values go last', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    await user.click(chip('Driver'));
    const carries = () => tableRows(r.container).map((x) => r.store().visibleShots.find((s) => s.id === x.dataset.shotId)!.m.carry);
    const original = tableRows(r.container).map((x) => x.dataset.shotId);
    const sortBtn = within(document.querySelector('.shots-table thead th[data-col="carry"]') as HTMLElement).getByRole('button');
    await user.click(sortBtn);
    const th = () => document.querySelector('.shots-table thead th[data-col="carry"]')!;
    const asc = carries();
    const known = asc.filter((c): c is number => c !== null);
    expect(['ascending', 'descending']).toContain(th().getAttribute('aria-sort'));
    const dir = th().getAttribute('aria-sort') === 'ascending' ? 1 : -1;
    expect(known).toEqual([...known].sort((a, b) => dir * (a - b)));
    expect(asc.slice(known.length).every((c) => c === null)).toBe(true);
    await user.click(sortBtn);
    expect(th().getAttribute('aria-sort')).toBe(dir === 1 ? 'descending' : 'ascending');
    await user.click(sortBtn);
    expect(th()).not.toHaveAttribute('aria-sort');
    expect(tableRows(r.container).map((x) => x.dataset.shotId)).toEqual(original);
  });

  test('with all clubs showing, rows sit under collapsible club headings; sorting keeps each club together', async () => {
    const user = userEvent.setup();
    const r = renderWithData(ALL);
    const headings = () => Array.from(document.querySelectorAll('.shots-table__club-toggle')).map((b) => b.textContent);
    expect(headings()[0]).toMatch(/Driver · 34 shots$/);
    await user.click(within(document.querySelector('.shots-table thead th[data-col="carry"]') as HTMLElement).getByRole('button'));
    const clubsInOrder = tableRows(r.container).map((x) => x.querySelector('td[data-col="club"]')!.textContent);
    const runs = clubsInOrder.filter((c, i) => i === 0 || c !== clubsInOrder[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
    const driver = screen.getByRole('button', { name: /Driver · 34 shots$/ });
    expect(driver).toHaveAttribute('aria-expanded', 'true');
    await user.click(driver);
    expect(driver).toHaveAttribute('aria-expanded', 'false');
    expect(tableRows(r.container)).toHaveLength(133 - 34);
  });

  test('Columns menu hides and shows columns; Key columns only and Show all are shortcuts', async () => {
    const user = userEvent.setup();
    renderWithData([F1]);
    const visible = () => Array.from(document.querySelectorAll('.shots-table thead th[data-col]')).map((t) => (t as HTMLElement).dataset.col);
    const total = visible().length;
    const trigger = screen.getByRole('button', { name: /^Columns · / });
    expect(trigger).toHaveTextContent(`Columns · ${total - 2} of ${total - 2}`);
    await user.click(trigger);
    await user.click(screen.getByRole('checkbox', { name: 'Apex height' }));
    expect(visible()).not.toContain('height');
    expect(trigger).toHaveTextContent(`Columns · ${total - 3} of ${total - 2}`);
    await user.click(screen.getByRole('button', { name: 'Key columns only' }));
    expect(visible()).toEqual(['shot', 'club', 'ballSpeed', 'launchV', 'spin', 'carry', 'total', 'lateral', 'clubSpeed', 'smash', 'clubPath', 'ftp', 'impactLateral', 'impactVertical']);
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(visible()).toHaveLength(total);
  });
});
