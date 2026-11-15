import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import type { ProgressionShot } from '@fsa/analytics';
import type { Measurements } from '@fsa/domain';
import { CLUB_SERIES } from '@fsa/visualizations';
import type { SessionRow } from '../api';
import { WorkingSetProvider, useWorkingSet } from '../../state/store';
import { DispersionTile } from './DispersionTile';
import { DEFAULT_SCOPE, type Scope } from './scope';
import { TILES } from './tiles';

const def = TILES.find((t) => t.id === 'dispersion')!;
const session = (i: number): SessionRow =>
  ({ id: `s${i}`, name: `Session ${i}`, date: `2026-01-${String(i).padStart(2, '0')}` }) as SessionRow;

let n = 0;
/** `count` shots with spread landings; every shot has carry and lateral. */
const shotsFor = (sessionId: string, count: number): ProgressionShot[] =>
  Array.from({ length: count }, (_, k) => ({
    id: `x${++n}`, sessionId, club: '7 Iron', excluded: false,
    m: { carry: 140 + ((k * 7) % 11), lateral: ((k * 5) % 9) - 4 } as unknown as Measurements,
  }));

const Mode = () => <span data-testid="kind">{useWorkingSet().ellipseKind}</span>;

function setup(opts: { sessions: SessionRow[]; shots: ProgressionShot[]; scope?: Partial<Scope> }) {
  const onScope = vi.fn();
  const scope: Scope = { ...DEFAULT_SCOPE, ...opts.scope };
  const wrap = (node: ReactNode) => <WorkingSetProvider>{node}<Mode /></WorkingSetProvider>;
  render(wrap(
    <DispersionTile
      def={def} rows={opts.sessions} sessions={opts.sessions} shots={opts.shots} scope={scope}
      controls={null} onScope={onScope}
    />,
  ));
  return { onScope };
}

const three = [session(1), session(2), session(3)];
const threeShots = three.flatMap((s) => shotsFor(s.id, 8));

describe('DispersionTile', () => {
  test('side by side: one plot per session, oldest first, same viewBox, size and inside text', () => {
    setup({ sessions: three, shots: threeShots });
    const plots = screen.getAllByRole('img');
    expect(plots).toHaveLength(3);
    expect(new Set(plots.map((p) => p.getAttribute('viewBox'))).size).toBe(1);
    const cells = screen.getAllByRole('listitem');
    const dates = cells.map((c) => c.querySelector('.prog-dispersion__date')!.textContent!);
    expect(dates[0]).toMatch(/^1 Jan/);
    expect(dates[2]).toMatch(/^3 Jan/);
    for (const c of cells) {
      expect(c.textContent).toMatch(/\d+ × \d+ yd/);
      expect(c.textContent).toMatch(/\d+ of 8 inside/);
    }
  });

  test('Every shot sets the store and hides the inside text', async () => {
    setup({ sessions: three, shots: threeShots });
    expect(screen.getByTestId('kind')).toHaveTextContent('sd1');
    await userEvent.click(within(screen.getByRole('group', { name: 'Ellipse' })).getByRole('button', { name: 'Every shot' }));
    expect(screen.getByTestId('kind')).toHaveTextContent('all');
    expect(screen.queryByText(/inside/)).toBeNull();
    expect(screen.getAllByText(/\d+ × \d+ yd/)).toHaveLength(3);
  });

  test('Overlaid calls onScope with view overlaid', async () => {
    const { onScope } = setup({ sessions: three, shots: threeShots });
    await userEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Overlaid' }));
    expect(onScope).toHaveBeenCalledWith({ ...DEFAULT_SCOPE, view: 'overlaid' });
  });

  test('overlaid: one plot, one ellipse per session in palette colours, legend table', () => {
    setup({ sessions: three, shots: threeShots, scope: { view: 'overlaid' } });
    expect(screen.getAllByRole('img')).toHaveLength(1);
    const ellipses = screen.getAllByTestId('ellipse');
    expect(ellipses).toHaveLength(3);
    ellipses.forEach((e, i) => expect(e.getAttribute('stroke')).toBe(CLUB_SERIES[i]));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Width' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Depth' })).toBeInTheDocument();
    expect(screen.queryByText(/Overlaid shows the latest/)).toBeNull();
  });

  test('ten sessions overlaid: latest 8 and the note', () => {
    const ten = Array.from({ length: 10 }, (_, i) => session(i + 1));
    setup({ sessions: ten, shots: ten.flatMap((s) => shotsFor(s.id, 8)), scope: { view: 'overlaid' } });
    expect(screen.getAllByTestId('ellipse')).toHaveLength(8);
    expect(screen.getByText('Overlaid shows the latest 8 of 10 sessions')).toBeInTheDocument();
    expect(screen.getAllByTestId('ellipse')[0]!.getAttribute('data-key')).toBe('s3');
  });

  test('a session under 3 shots shows dots, the note and few shots; 6 shots does not', () => {
    const sessions = [session(1), session(2)];
    setup({ sessions, shots: [...shotsFor('s1', 2), ...shotsFor('s2', 6)] });
    const [a, b] = screen.getAllByRole('listitem');
    expect(within(a!).getByText('Needs 3 shots for an ellipse')).toBeInTheDocument();
    expect(a!.querySelectorAll('circle[data-shot-id]')).toHaveLength(2);
    expect(a!.querySelector('.prog-dispersion__date')!.textContent).toContain(' · few shots');
    expect(b!.querySelector('.prog-dispersion__date')!.textContent).not.toContain('few shots');
    expect(within(b!).queryByText('Needs 3 shots for an ellipse')).toBeNull();
  });
});
