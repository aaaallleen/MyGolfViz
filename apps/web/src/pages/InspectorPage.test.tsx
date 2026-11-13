import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { buildReplayScene, summarize } from '@fsa/analytics';
import { formatMeasurement } from '@fsa/domain';
import { shotOptionLabel } from '../components/shotLabel';
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

describe('InspectorPage', () => {
  test('opened with no shot selected, it shows the first visible shot and selects it', () => {
    const v = open();
    const first = v.store().visibleShots[0]!;
    expect(v.store().selectedId).toBe(first.id);
    expect(screen.queryByText('No shots match these filters')).toBeNull();
  });

  test("Club data tabs read 'Face impact', '3D', '2D reconstruction' in order; '2D reconstruction' selected by default; each has a labelled tabpanel", async () => {
    const user = userEvent.setup();
    open();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Face impact', '3D', '2D reconstruction']);
    expect(tab('2D reconstruction')).toHaveAttribute('aria-selected', 'true');
    for (const name of ['2D reconstruction', 'Face impact', '3D']) {
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
    for (const name of ['Face impact', '3D', '2D reconstruction']) {
      await user.click(tab(name));
      const ball = screen.getByRole('region', { name: 'Ball data' });
      expect(ball.querySelector('[data-role="ball-flight"]')).not.toBeNull();
      expect(ball.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Club data' })).toContainElement(screen.getByRole('tablist'));
    }
  });

  test("Ball data has camera buttons DTL, Perspective, Side, Top and 'Other shots' set to the shot's club", () => {
    const v = open();
    const ball = screen.getByRole('region', { name: 'Ball data' });
    for (const n of ['DTL', 'Perspective', 'Side', 'Top']) expect(within(ball).getByRole('button', { name: n })).toBeInTheDocument();
    const others = within(ball).getByRole('group', { name: 'Other shots' });
    expect(within(others).getAllByRole('button').map((b) => b.textContent)).toEqual(['None', v.store().visibleShots[0]!.club, 'All clubs']);
    expect(within(others).getByRole('button', { name: v.store().visibleShots[0]!.club })).toHaveAttribute('aria-pressed', 'true');
  });

  test("File 1 + Driver, Shot 1: 15 other-flight paths; 'None' leaves 0", async () => {
    const user = userEvent.setup();
    const v = open();
    act(() => v.store().setFile(v.store().workingSet!.files.find((f) => f.ordinal === 1)!.id));
    act(() => v.store().setClub('Driver'));
    pick(v, 1, 2);
    expect(document.querySelectorAll('[data-role="other-flight"]')).toHaveLength(15);
    await user.click(screen.getByRole('button', { name: 'None' }));
    expect(document.querySelectorAll('[data-role="other-flight"]')).toHaveLength(0);
  });

  test('with every club in view, the default draws only same-club flights and All clubs draws the rest too', async () => {
    const user = userEvent.setup();
    const v = open();
    const visible = v.store().visibleShots;
    const shot = visible[0]!;
    const flies = (s: (typeof visible)[number]) => buildReplayScene(s, 'right').ballFlight !== null;
    const sameClub = visible.filter((s) => s.id !== shot.id && s.club === shot.club && flies(s)).length;
    const everyClub = visible.filter((s) => s.id !== shot.id && flies(s)).length;
    expect(everyClub).toBeGreaterThan(sameClub); // the fixtures mix clubs
    const flights = () => document.querySelectorAll('[data-role="other-flight"]');
    expect(flights()).toHaveLength(sameClub);
    await user.click(screen.getByRole('button', { name: 'All clubs' }));
    expect(flights()).toHaveLength(everyClub);
    // The choice stays when stepping to another shot.
    act(() => v.store().select(visible[1]!.id));
    expect(screen.getByRole('button', { name: 'All clubs' })).toHaveAttribute('aria-pressed', 'true');
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

  test('3D tab: a gallery of four views opens on Face-on with Top, Down the line and 3/4 overview as thumbnails; no ball flight', async () => {
    const user = userEvent.setup();
    open();
    await user.click(tab('3D'));
    const gallery = within(panel()).getByRole('region', { name: '3D club views' });
    expect(within(gallery.querySelector('.view-gallery__large') as HTMLElement).getByText('Face-on')).toBeInTheDocument();
    expect(within(gallery).getAllByRole('button', { name: /^Show / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Show Top view', 'Show Down the line view', 'Show 3/4 overview view']);
    expect(within(panel()).queryByRole('group', { name: 'Show' })).toBeNull();
    expect(panel().querySelector('[data-role="ball-flight"]')).toBeNull();
    expect(within(panel()).getByText('Illustrative reconstruction')).toBeInTheDocument();
  });

  test('3D tab: clicking "Show Top view" makes Top large, and the choice survives Next shot', async () => {
    const user = userEvent.setup();
    const v = open();
    await user.click(tab('3D'));
    await user.click(within(panel()).getByRole('button', { name: 'Show Top view' }));
    const largeName = () => (panel().querySelector('.view-gallery__large .view-gallery__name') as HTMLElement).textContent;
    expect(largeName()).toBe('Top');
    expect(v.store().clubView3D).toBe('top');
    act(() => v.store().step(1));
    expect(largeName()).toBe('Top');
  });

  test('3D tab: switching to 3D reconstruction shows the draggable viewer, and the mode survives Next shot', async () => {
    const user = userEvent.setup();
    const v = open();
    await user.click(tab('3D'));
    await user.click(within(panel()).getByRole('button', { name: '3D reconstruction' }));
    expect(v.store().clubMode3D).toBe('reconstruction');
    expect(within(panel()).getByRole('region', { name: '3D reconstruction' })).toBeInTheDocument();
    act(() => v.store().step(1));
    expect(within(panel()).getByRole('region', { name: '3D reconstruction' })).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Views' }));
    expect(within(panel()).getByRole('region', { name: '3D club views' })).toBeInTheDocument();
  });

  test("File 1 Shot 14, 3D tab: 'Club delivery not measured for this shot'", async () => {
    const user = userEvent.setup();
    const v = open();
    pick(v, 1, 15);
    await user.click(tab('3D'));
    expect(within(panel()).getAllByText('Club delivery not measured for this shot').length).toBeGreaterThan(0);
  });

  test('2D tab: a gallery opens on Face to target with Face to path, Dynamic loft and Spin axis as thumbnails; no Show fieldset', () => {
    open();
    const gallery = within(panel()).getByRole('region', { name: '2D club views' });
    expect((gallery.querySelector('.view-gallery__large .view-gallery__name') as HTMLElement).textContent).toBe('Face to target');
    expect(within(gallery).getAllByRole('button', { name: /^Show / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Show Face to path view', 'Show Dynamic loft view', 'Show Spin axis view']);
    expect(within(panel()).queryByRole('group', { name: 'Show' })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'True scale' })).toBeNull();
  });

  test("2D tab: measured angles and session average panels stay", () => {
    open();
    const t = panel().textContent!;
    expect(t).toContain('Measured angles');
    expect(t).toContain('Against session average');
    expect(t).toMatch(/Driver averages from \d+ of \d+ shots that have club data\./);
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

  test("File 1 Shot 14, 2D tab: Not measured badges, launch 8.9° R, no zero fallbacks", () => {
    const v = open();
    pick(v, 1, 15);
    const t = () => panel().textContent!.replace(/\s+/g, ' ');
    expect(t()).toContain('Club path –Not measured');
    expect(t()).toContain('Face to target –Not measured');
    expect(t()).toContain('Launch direction 8.9° R');
    expect(t()).not.toContain('0.0°');
    act(() => v.store().setClubView2D('loft'));
    expect(t()).toContain('Spin loft –Not measured');
    expect(t()).not.toContain('0.0°');
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
    const impact = within(tiles).getByText('Impact').closest('.fsa-kpi') as HTMLElement;
    expect(impact.querySelector('.fsa-kpi__value')).toHaveTextContent('0.23in toe');
    expect(impact.querySelector('.fsa-kpi__sub')).toHaveTextContent('0.84 in high');
    for (const l of ['Carry', 'Spin', 'Club path', 'Face to path', 'Attack angle', 'Impact']) expect(within(tiles).getByText(l)).toBeInTheDocument();
  });

  test("breadcrumb 'Untitled session / Shot 15' and 'Range day / Shot 15'", () => {
    const v = open();
    pick(v, 1, 16);
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumb).toHaveTextContent('Untitled session / Shot 15');
    expect(within(crumb).getByRole('link', { name: 'Untitled session' })).toHaveAttribute('href', '/overview');
    // The breadcrumb is the way back; the header has no separate Back to overview button.
    expect(screen.queryByRole('link', { name: 'Back to overview' })).toBeNull();
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
    for (const n of ['Face impact', '3D', '2D reconstruction']) {
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

  test('All measurements starts folded with a visible "Show all" cue that turns into "Hide" when opened', async () => {
    const user = userEvent.setup();
    open();
    const d = screen.getByText(/All measurements/).closest('details')!;
    const summary = d.querySelector('summary')!;
    expect(d.open).toBe(false);
    expect(within(summary).getByText('Show all')).toBeInTheDocument();
    await user.click(summary);
    expect(d.open).toBe(true);
    expect(within(summary).getByText('Hide')).toBeInTheDocument();
    expect(within(summary).queryByText('Show all')).toBeNull();
  });

  test('2D tab: clicking "Show Spin axis view" makes it large, and the choice survives Next shot', async () => {
    const user = userEvent.setup();
    const v = open();
    await user.click(within(panel()).getByRole('button', { name: 'Show Spin axis view' }));
    const largeName = () => (panel().querySelector('.view-gallery__large .view-gallery__name') as HTMLElement).textContent;
    expect(largeName()).toBe('Spin axis');
    act(() => v.store().step(1));
    expect(largeName()).toBe('Spin axis');
  });

  test('legend and provenance copy are present', () => {
    open();
    expect(screen.getByLabelText('Value provenance')).toBeInTheDocument();
  });

  describe('excluded shots', () => {
    const BANNER = "This shot is excluded. It isn't in your averages or comparisons.";

    test('‹ › step onto excluded shots too: they open with the banner and the position', async () => {
      const user = userEvent.setup();
      const v = open();
      const o = v.store().tableShots;
      act(() => { v.store().setExcluded(o[3]!.id, true); v.store().select(o[2]!.id); });
      expect(screen.queryByText(BANNER)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Next shot' }));
      expect(v.store().selectedId).toBe(o[3]!.id);
      expect(screen.getByText(BANNER)).toBeInTheDocument();
      expect(screen.getByText(`4 of ${o.length}`)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Next shot' }));
      expect(v.store().selectedId).toBe(o[4]!.id);
      expect(screen.queryByText(BANNER)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Previous shot' }));
      expect(v.store().selectedId).toBe(o[3]!.id);
      expect(screen.getByText(BANNER)).toBeInTheDocument();
    });

    test('with every shot in the filter excluded, Next moves to the next excluded shot and never empties the page', async () => {
      const user = userEvent.setup();
      const v = open();
      act(() => v.store().setClub('Driver'));
      const ids = v.store().tableShots.map((s) => s.id);
      act(() => { for (const id of ids) v.store().setExcluded(id, true); v.store().select(ids[1]!); });
      await user.click(screen.getByRole('button', { name: 'Next shot' }));
      expect(v.store().selectedId).toBe(ids[2]);
      expect(screen.getByText(BANNER)).toBeInTheDocument();
      expect(screen.queryByText(/shots here are excluded/)).toBeNull();
    });

    test('Exclude shot in the header excludes the open shot and moves on to the next included shot', async () => {
      const user = userEvent.setup();
      const v = open();
      const [target, next] = [v.store().visibleShots[2]!, v.store().visibleShots[3]!];
      act(() => v.store().select(target.id));
      const used = v.store().visibleShots.length;
      await user.click(screen.getByRole('button', { name: 'Exclude shot' }));
      expect(v.store().excludedIds.has(target.id)).toBe(true);
      expect(v.store().selectedId).toBe(next.id);
      expect(v.store().visibleShots).toHaveLength(used - 1);
      expect(screen.queryByText(BANNER)).toBeNull();
      expect(screen.getAllByRole('status').map((n) => n.textContent).join('|')).toContain(`excluded · ${used - 1} shots used`);
    });

    test('the Exclude shot button sits on the title row, not with the ‹ › buttons', () => {
      const v = open();
      act(() => v.store().select(v.store().visibleShots[2]!.id));
      const titleRow = screen.getByRole('heading', { level: 1 }).parentElement!;
      expect(within(titleRow).getByRole('button', { name: 'Exclude shot' })).toBeInTheDocument();
      const nav = screen.getByRole('button', { name: 'Next shot' }).parentElement!;
      expect(within(nav).queryByRole('button', { name: 'Exclude shot' })).toBeNull();
    });

    test('on an excluded open shot the Excluded tag sits on the title and the banner holds the only include button', async () => {
      const user = userEvent.setup();
      const v = open();
      const target = v.store().visibleShots[2]!;
      act(() => { v.store().setExcluded(target.id, true); v.store().select(target.id); });
      const titleRow = screen.getByRole('heading', { level: 1 }).parentElement!;
      expect(within(titleRow).getByText('Excluded')).toBeInTheDocument();
      const nav = screen.getByRole('button', { name: 'Next shot' }).parentElement!;
      expect(within(nav).queryByText('Excluded')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Exclude shot' })).toBeNull();
      expect(screen.getAllByRole('button', { name: /^Include/ }).map((b) => b.textContent)).toEqual(['Include it again']);
      await user.click(screen.getByRole('button', { name: 'Include it again' }));
      expect(v.store().excludedIds.has(target.id)).toBe(false);
      expect(v.store().selectedId).toBe(target.id);
      expect(screen.queryByText(BANNER)).toBeNull();
    });

    test('Include it again removes the banner', async () => {
      const user = userEvent.setup();
      const v = open();
      const target = v.store().visibleShots[2]!;
      act(() => { v.store().setExcluded(target.id, true); v.store().select(target.id); });
      await user.click(screen.getByRole('button', { name: 'Include it again' }));
      expect(screen.queryByText(BANNER)).toBeNull();
      expect(v.store().selectedId).toBe(target.id);
      expect(v.store().excludedIds.has(target.id)).toBe(false);
    });

    test('Include it again announces through a polite live region', async () => {
      const user = userEvent.setup();
      const v = open();
      const target = v.store().visibleShots[2]!;
      act(() => { v.store().setExcluded(target.id, true); v.store().select(target.id); });
      await user.click(screen.getByRole('button', { name: 'Include it again' }));
      expect(screen.getAllByRole('status').map((n) => n.textContent).join('|')).toMatch(/included · \d+ shots used/);
    });

    test('an excluded open shot sits at its display-order position in the picker, marked excluded', () => {
      const v = open();
      const ordered = v.store().tableShots;
      const target = ordered[3]!;
      act(() => { v.store().setExcluded(target.id, true); v.store().select(target.id); });
      const files = v.store().workingSet!.files;
      const names = within(screen.getByRole('combobox', { name: 'Choose shot' })).getAllByRole('option').map((o) => o.textContent);
      expect(names[3]).toBe(`${shotOptionLabel(target, files)} (excluded)`);
      expect(names[2]).toBe(shotOptionLabel(ordered[2]!, files));
      expect(names[4]).toBe(shotOptionLabel(ordered[4]!, files));
    });

    test('with an included shot open, the picker still lists excluded shots, and picking one opens it', async () => {
      const user = userEvent.setup();
      const v = open();
      const [x, y] = [v.store().visibleShots[1]!, v.store().visibleShots[2]!];
      act(() => { v.store().setExcluded(x.id, true); v.store().select(y.id); });
      const files = v.store().workingSet!.files;
      const picker = screen.getByRole('combobox', { name: 'Choose shot' });
      const names = within(picker).getAllByRole('option').map((o) => o.textContent);
      expect(names).toHaveLength(v.store().tableShots.length);
      expect(names).toContain(`${shotOptionLabel(x, files)} (excluded)`);
      expect(names).toContain(shotOptionLabel(y, files));
      expect(screen.queryByText(BANNER)).toBeNull();
      await user.selectOptions(picker, x.id);
      expect(v.store().selectedId).toBe(x.id);
      expect(screen.getByText(BANNER)).toBeInTheDocument();
      // Stepping off it and back lands on it again; the picker keeps listing it.
      await user.click(screen.getByRole('button', { name: 'Next shot' }));
      expect(v.store().selectedId).toBe(y.id);
      await user.click(screen.getByRole('button', { name: 'Previous shot' }));
      expect(v.store().selectedId).toBe(x.id);
      expect(within(screen.getByRole('combobox', { name: 'Choose shot' })).getAllByRole('option').map((o) => o.textContent))
        .toContain(`${shotOptionLabel(x, files)} (excluded)`);
    });

    test('all shots in the filter excluded: all-excluded empty state with Include all', async () => {
      const user = userEvent.setup();
      const v = open();
      act(() => v.store().setClub('Driver'));
      const ids = v.store().tableShots.map((s) => s.id);
      act(() => { for (const id of ids) v.store().setExcluded(id, true); v.store().select(null); });
      expect(screen.getByRole('heading', { name: `All ${ids.length} shots here are excluded` })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to overview' })).toHaveAttribute('href', '/overview');
      await user.click(screen.getByRole('button', { name: 'Include all' }));
      expect(v.store().visibleShots).toHaveLength(ids.length);
      expect(screen.queryByText(/are excluded/)).toBeNull();
    });
  });
});
