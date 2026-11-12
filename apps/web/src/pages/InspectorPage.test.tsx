import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { summarize } from '@fsa/analytics';
import { formatMeasurement } from '@fsa/domain';
import { renderWithData } from '../test/renderWithData';

const F1 = 'FlightScope Golf Session Sept 19 2022.csv';
const F2 = 'FlightScope Golf Session Sept 19.csv';
const F3 = 'FlightScope Golf Session.csv';
const ALL = [F1, F2, F3];

type Api = ReturnType<ReturnType<typeof renderWithData>['store']>;
function shotId(api: Api, ordinal: number, row: number, club?: string): string {
  const file = api.workingSet!.files.find((f) => f.ordinal === ordinal)!;
  return api.workingSet!.shots.find((s) => s.fileId === file.id && s.sourceRow === row && (!club || s.club === club))!.id;
}
function open(fixtures = ALL, opts: Parameters<typeof renderWithData>[1] = {}) {
  return renderWithData(fixtures, { route: '/inspect', ...opts });
}
function pick(view: ReturnType<typeof open>, ordinal: number, row: number) {
  act(() => view.store().select(shotId(view.store(), ordinal, row)));
}
const panel = () => screen.getByRole('tabpanel');
const tab = (name: string) => screen.getByRole('tab', { name });
const checks = (root: HTMLElement) =>
  Array.from(within(within(root).getByRole('group', { name: 'Show' })).getAllByRole('checkbox')).map((c) => [
    c.closest('label')!.textContent, (c as HTMLInputElement).checked,
  ]);

describe('InspectorPage', () => {
  test("Club data tabs read 'Face impact', '3D reconstruction', '2D reconstruction' in order; '2D reconstruction' selected by default; each has a labelled tabpanel", async () => {
    const user = userEvent.setup();
    open();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Face impact', '3D reconstruction', '2D reconstruction']);
    expect(tab('2D reconstruction')).toHaveAttribute('aria-selected', 'true');
    for (const name of ['2D reconstruction', 'Face impact', '3D reconstruction']) {
      await user.click(tab(name));
      const p = screen.getByRole('tabpanel');
      expect(p).toHaveAttribute('aria-labelledby', tab(name).id);
      expect(tab(name)).toHaveAttribute('aria-controls', p.id);
      expect(screen.getByRole('tabpanel', { name })).toBe(p);
    }
  });

  test("'Ball data' section precedes the 'Club data' tablist and stays rendered on all three tabs", async () => {
    const user = userEvent.setup();
    open();
    for (const name of ['Face impact', '3D reconstruction', '2D reconstruction']) {
      await user.click(tab(name));
      const ball = screen.getByRole('region', { name: 'Ball data' });
      expect(ball.querySelector('[data-role="ball-flight"]')).not.toBeNull();
      expect(ball.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Club data' })).toContainElement(screen.getByRole('tablist'));
    }
  });

  test("Ball data has camera buttons DTL, Perspective, Side, Top and a checked 'Show other shots'", () => {
    open();
    const ball = screen.getByRole('region', { name: 'Ball data' });
    for (const n of ['DTL', 'Perspective', 'Side', 'Top']) expect(within(ball).getByRole('button', { name: n })).toBeInTheDocument();
    expect(within(ball).getByRole('checkbox', { name: 'Show other shots' })).toBeChecked();
  });

  test("File 1 + Driver, Shot 1: 15 other-flight paths; unchecking 'Show other shots' leaves 0", async () => {
    const user = userEvent.setup();
    const v = open();
    act(() => v.store().setFile(v.store().workingSet!.files.find((f) => f.ordinal === 1)!.id));
    act(() => v.store().setClub('Driver'));
    pick(v, 1, 2);
    expect(document.querySelectorAll('[data-role="other-flight"]')).toHaveLength(15);
    await user.click(screen.getByRole('checkbox', { name: 'Show other shots' }));
    expect(document.querySelectorAll('[data-role="other-flight"]')).toHaveLength(0);
  });

  test("File 1 Shot 1 Ball data: spin, derived spin components, launch and flight readouts", () => {
    const v = open();
    pick(v, 1, 2);
    const ball = screen.getByRole('region', { name: 'Ball data' });
    const text = ball.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Total spin 5,162 rpm');
    expect(text).toContain('Spin axis 1.0° R');
    expect(text).toContain('Backspin ≈ 5,161 rpm');
    expect(text).toContain('Sidespin ≈ 90 rpm R');
    expect(text).toContain('Launch V 19.1° measured');
    expect(text).toContain('Flight time 7.6 s measured');
  });

  test("Session row 78 Ball data: not-measured copy and every Launch/Flight readout 'Not measured'", () => {
    const v = open();
    pick(v, 3, 78);
    const ball = screen.getByRole('region', { name: 'Ball data' });
    expect(within(ball).getByText('Ball flight not measured for this shot')).toBeInTheDocument();
    expect(within(ball).getByText('Ball spin not measured for this shot')).toBeInTheDocument();
    for (const g of ['Launch', 'Flight']) {
      const group = within(ball).getByRole('group', { name: g });
      const items = group.querySelectorAll('dd');
      expect(items.length).toBeGreaterThan(0);
      items.forEach((dd) => expect(dd).toHaveTextContent('Not measured'));
    }
  });

  test('3D tab: Show checkboxes exactly Top view, AoA, V-plane, Side view (checked); the Club data panel has no ball flight', async () => {
    const user = userEvent.setup();
    open();
    await user.click(tab('3D reconstruction'));
    expect(checks(panel())).toEqual([['Top view', true], ['AoA', true], ['V-plane', true], ['Side view', true]]);
    expect(panel().querySelector('[data-role="ball-flight"]')).toBeNull();
    expect(within(panel()).getByText('Illustrative reconstruction')).toBeInTheDocument();
  });

  test("3D tab: unchecking Top view / V-plane / Side view removes their elements", async () => {
    const user = userEvent.setup();
    open();
    await user.click(tab('3D reconstruction'));
    expect(within(panel()).getByText('Top view · face to path')).toBeInTheDocument();
    expect(within(panel()).getByText('Side view · everything')).toBeInTheDocument();
    expect(panel().querySelector('[data-role="v-plane"]')).not.toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'Top view' }));
    expect(within(panel()).queryByText('Top view · face to path')).toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'V-plane' }));
    expect(panel().querySelector('[data-role="v-plane"]')).toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'Side view' }));
    expect(within(panel()).queryByText('Side view · everything')).toBeNull();
  });

  test("File 1 Shot 14, 3D tab: 'Club delivery not measured for this shot'", async () => {
    const user = userEvent.setup();
    const v = open();
    pick(v, 1, 15);
    await user.click(tab('3D reconstruction'));
    expect(within(panel()).getAllByText('Club delivery not measured for this shot').length).toBeGreaterThan(0);
  });

  test('2D tab: Show checkboxes exactly Face to target, Face to path, Dynamic loft, Spin axis (checked); unchecking Spin axis / Dynamic loft removes layers', async () => {
    const user = userEvent.setup();
    open();
    expect(checks(panel())).toEqual([['Face to target', true], ['Face to path', true], ['Dynamic loft', true], ['Spin axis', true]]);
    expect(panel().querySelector('.delivery-spin')).not.toBeNull();
    expect(panel().querySelector('[data-role="loft"]')).not.toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'Spin axis' }));
    expect(panel().querySelector('.delivery-spin')).toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'Dynamic loft' }));
    expect(panel().querySelector('[data-role="loft"]')).toBeNull();
    await user.click(within(panel()).getByRole('checkbox', { name: 'Face to target' }));
    expect(panel().querySelector('[data-role="face"]')).toBeNull();
  });

  test("2D tab: panel titles, measured angles and session average note", () => {
    open();
    const t = panel().textContent!;
    expect(t).toContain('Impact geometry · top view');
    expect(t).toContain('Impact geometry · side view');
    expect(t).toContain('Measured angles');
    expect(t).toContain('Against session average');
    expect(t).toMatch(/Driver averages from \d+ of \d+ shots that have club data\./);
    expect(screen.getByRole('button', { name: 'True scale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exaggerated ×2' })).toBeInTheDocument();
  });

  test('2D tab: session average rows read "{this shot} vs {average}" with no delta', () => {
    const v = open();
    const api = v.store();
    const shot = api.visibleShots.find((s) => s.id === api.selectedId)!;
    const same = api.visibleShots.filter((s) => s.club === shot.club);
    expect(shot.m.dynamicLoft).not.toBeNull();
    const mean = summarize(same.map((s) => s.m.dynamicLoft)).mean;
    const heading = within(panel()).getByRole('heading', { name: 'Against session average' });
    const row = within(heading.parentElement!).getByText('Dynamic loft').parentElement!;
    expect(row.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      `Dynamic loft ${formatMeasurement('dynamicLoft', shot.m.dynamicLoft)} vs ${formatMeasurement('dynamicLoft', mean)}`);
    expect(panel().textContent).not.toContain('vs this shot');
  });

  test("File 1 Shot 14, 2D tab: Not measured copy, launch 8.9° R, no zero fallbacks", () => {
    const v = open();
    pick(v, 1, 15);
    const t = panel().textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('Club path · Not measured');
    expect(t).toContain('Face to target · Not measured');
    expect(t).toContain('Face to path · Not measured');
    expect(t).toContain('8.9° R');
    expect(t).toContain('Spin loft · Not measured');
    expect(t).not.toContain('0.0°');
  });

  test("File 1 Shot 15: header, chips and Impact tile", () => {
    const v = open();
    pick(v, 1, 16);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shot 15 · Driver');
    const meta = within(screen.getByRole('list', { name: 'Shot details' }));
    for (const c of ['File 1 · FlightScope Golf Session Sept 19 2022.csv', 'CSV row 16', 'Outdoor']) {
      expect(meta.getByText(c)).toBeInTheDocument();
    }
    expect(meta.getByRole('combobox', { name: 'Handedness' })).toHaveDisplayValue('Right-handed');
    const tiles = screen.getByRole('region', { name: 'Headline metrics' });
    expect(tiles).toHaveTextContent('0.23 in toe · 0.84 in high');
    for (const l of ['Carry', 'Spin', 'Club path', 'Face to path', 'Attack angle', 'Impact']) expect(within(tiles).getByText(l)).toBeInTheDocument();
  });

  test("breadcrumb 'Untitled session / Shot 15' and 'Range day / Shot 15'", () => {
    const v = open();
    pick(v, 1, 16);
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumb).toHaveTextContent('Untitled session / Shot 15');
    expect(within(crumb).getByRole('link', { name: 'Untitled session' })).toHaveAttribute('href', '/overview');
    v.unmount();
    const w = open(ALL, { details: { name: 'Range day' } });
    pick(w, 1, 16);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Range day / Shot 15');
  });

  test('Left-handed from the chip sets details.handedness and mirrors the face drawing', async () => {
    const user = userEvent.setup();
    const v = open();
    await user.click(tab('Face impact'));
    const x = (role: string) => Number(document.querySelector(`[data-role="${role}-label"]`)!.getAttribute('x'));
    expect(x('toe')).toBeLessThan(x('heel'));
    const chip = screen.getByRole('combobox', { name: 'Handedness' });
    expect(chip).toHaveDisplayValue('Right-handed');
    await user.selectOptions(chip, 'Left-handed');
    expect(v.store().details.handedness).toBe('left');
    expect(chip).toHaveDisplayValue('Left-handed');
    expect(x('toe')).toBeGreaterThan(x('heel'));
  });

  test('switching tabs keeps selectedId, club filter and file filter unchanged', async () => {
    const user = userEvent.setup();
    const v = open();
    act(() => v.store().setClub('Driver'));
    act(() => v.store().setFile(v.store().workingSet!.files[0]!.id));
    pick(v, 1, 5);
    const before = JSON.stringify([v.store().selectedId, v.store().filters]);
    for (const n of ['Face impact', '3D reconstruction', '2D reconstruction']) {
      await user.click(tab(n));
      expect(JSON.stringify([v.store().selectedId, v.store().filters])).toBe(before);
    }
    expect(v.store().inspectorTab).toBe('2d');
  });

  test('File 1 + Driver, Shot 1, Face impact: not measured copy, 3 other dots, k of N', async () => {
    const user = userEvent.setup();
    const v = open();
    act(() => v.store().setFile(v.store().workingSet!.files.find((f) => f.ordinal === 1)!.id));
    act(() => v.store().setClub('Driver'));
    pick(v, 1, 2);
    await user.click(tab('Face impact'));
    const p = panel();
    expect(within(p).getByText('Impact not measured for this shot')).toBeInTheDocument();
    expect(within(p).getByText('CSV row 2 has no impact values. No marker is drawn and nothing is estimated.')).toBeInTheDocument();
    expect(p.querySelector('[data-role="selected-impact"]')).toBeNull();
    expect(p.querySelectorAll('[data-role="other-impact"]')).toHaveLength(3);
    expect(p).toHaveTextContent('Shots with impact data 3 of 16');
    expect(within(p).getByRole('heading', { name: 'Face impact · Driver face' })).toBeInTheDocument();
    await user.click(within(p).getByRole('checkbox', { name: 'Show session impacts' }));
    expect(p.querySelectorAll('[data-role="other-impact"]')).toHaveLength(0);
  });

  test('club Driver, all files: Next from File 1 Shot 16 goes to File 3 row 2', async () => {
    const user = userEvent.setup();
    const v = open();
    act(() => v.store().setClub('Driver'));
    pick(v, 1, 17);
    await user.click(screen.getByRole('button', { name: 'Next shot' }));
    const meta = within(screen.getByRole('list', { name: 'Shot details' }));
    expect(meta.getByText('File 3 · FlightScope Golf Session.csv')).toBeInTheDocument();
    expect(meta.getByText('CSV row 2')).toBeInTheDocument();
  });

  test("Session row 78: All measurements summary and empty-row copy; Time labelled 'Flight time'", () => {
    const v = open();
    pick(v, 3, 78);
    const d = screen.getByText(/All measurements/).closest('details')!;
    expect(d).toHaveTextContent('All measurements · 1 of 27 available');
    expect(d).toHaveTextContent('No ball or club measurements in this row');
    expect(d).toHaveTextContent('Flight time');
    expect(d).not.toHaveTextContent(/\bTime\b/);
  });

  test('2D tab phone control toggles is-hidden-phone among delivery panels', async () => {
    const user = userEvent.setup();
    open();
    const hidden = () => ['top', 'side', 'spin'].filter((k) => panel().querySelector(`.delivery-${k}`)?.classList.contains('is-hidden-phone'));
    expect(hidden()).toEqual(['side', 'spin']);
    const ctl = within(panel()).getByRole('group', { name: 'Diagram' });
    await user.click(within(ctl).getByRole('button', { name: 'Side view' }));
    expect(hidden()).toEqual(['top', 'spin']);
    await user.click(within(ctl).getByRole('button', { name: 'Spin axis' }));
    expect(hidden()).toEqual(['top', 'side']);
    await user.click(within(panel()).getByRole('checkbox', { name: 'Spin axis' }));
    expect(within(ctl).queryByRole('button', { name: 'Spin axis' })).toBeNull();
    expect(hidden()).toEqual(['side']);
  });

  test('legend and provenance copy are present', () => {
    open();
    expect(screen.getByLabelText('Value provenance')).toBeInTheDocument();
  });
});
