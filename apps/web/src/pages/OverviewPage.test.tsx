import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
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
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Total' }));
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
    expect(r.container.querySelector(`.shots-cards [data-shot-id="${target.id}"]`)).toHaveAttribute('aria-current', 'true');
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

  test('File 1 Shot 14: Not measured in Path and Face to path; row title', () => {
    const r = renderWithData(ALL);
    const row = tableRows(r.container).find((x) => x.title === `File 1 · ${F1} · CSV row 15`)!;
    expect(row).toBeTruthy();
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('14');
    expect(cells[10]).toHaveTextContent('Not measured');
    expect(cells[11]).toHaveTextContent('Not measured');
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
    expect(screen.getByText(/^1σ covariance ellipse · about 39% expected coverage if shots were bivariate normal · observed: \d+ of \d+ shots inside\. Cross: mean landing\.$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/holds? (about )?39%/);
  });

  test('both .shots-table and .shots-cards render the same shot ids', () => {
    const r = renderWithData(ALL);
    const a = tableRows(r.container).map((x) => x.dataset.shotId);
    const b = Array.from(r.container.querySelectorAll('.shots-cards [data-shot-id]')).map((x) => (x as HTMLElement).dataset.shotId);
    expect(a).toHaveLength(133);
    expect(b).toEqual(a);
  });
});
