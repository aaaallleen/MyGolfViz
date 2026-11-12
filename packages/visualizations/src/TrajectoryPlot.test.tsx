import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { TrajectoryCurve } from '@fsa/analytics';
import { TrajectoryPlot, type TrajectoryPlotProps } from './TrajectoryPlot';

const curve = (id: string, c: number): TrajectoryCurve => ({
  shotId: id, p0: [0, 0], p1: [c / 4, 30], p2: [c - c / 4, 30], p3: [c, 0],
});
const groups: TrajectoryPlotProps['groups'] = [
  { club: '7 Iron', color: '#C98500', curves: [curve('a', 150), curve('b', 160)] },
  { club: 'Gap Wedge', color: '#E66767', curves: [curve('c', 100)] },
];
const path = (c: HTMLElement, id: string) => c.querySelector(`path[data-shot-id="${id}"]`)!;
const endX = (d: string) => Number(d.trim().split(/[ C]+/).slice(-2)[0]);

test('one path per curve in its club colour; the selected one is white, on top, with data-selected; Illustrative tag present', () => {
  const { container } = render(<TrajectoryPlot groups={groups} selectedId="a" />);
  const paths = container.querySelectorAll('path[data-shot-id]');
  expect(paths).toHaveLength(3);
  expect(path(container, 'c').parentElement).toHaveAttribute('stroke', '#E66767');
  const sel = container.querySelectorAll('path[data-selected="true"]');
  expect(sel).toHaveLength(1);
  expect(sel[0]).toBe(paths[paths.length - 1]);
  expect(sel[0]!.getAttribute('data-shot-id')).toBe('a');
  expect(sel[0]).toHaveAttribute('stroke', '#EAF0EC');
  expect(container.textContent).toContain('Illustrative');
  expect(container.textContent).toContain('Drawn from launch angle, apex height, descent angle and carry');
  expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
});

test('highlighting a club makes its curves solid and fades the others', () => {
  const { container, rerender } = render(<TrajectoryPlot groups={groups} selectedId={null} />);
  const op = (id: string) => Number(path(container, id).parentElement!.getAttribute('stroke-opacity'));
  expect(op('a')).toBe(op('c'));
  rerender(<TrajectoryPlot groups={groups} selectedId={null} highlightClub="Gap Wedge" />);
  expect(op('c')).toBeGreaterThan(0.8);
  expect(op('a')).toBeLessThan(0.2);
});

test('xMax and width set the distance axis, so a shared value lines the side view up with the top view', () => {
  const a = render(<TrajectoryPlot groups={groups} selectedId={null} xMax={200} width={720} />);
  const at200 = endX(path(a.container, 'b').getAttribute('d')!);
  a.unmount();
  const b = render(<TrajectoryPlot groups={groups} selectedId={null} xMax={320} width={720} />);
  expect(endX(path(b.container, 'b').getAttribute('d')!)).toBeLessThan(at200);
});

test('empty curves show the empty message', () => {
  const { container } = render(<TrajectoryPlot groups={[{ club: 'X', color: '#000', curves: [] }]} selectedId={null} />);
  expect(container.textContent).toContain('No shots with launch, apex, descent and carry');
  expect(container.querySelectorAll('path')).toHaveLength(0);
});
