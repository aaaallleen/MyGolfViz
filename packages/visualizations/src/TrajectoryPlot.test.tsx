import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
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

test('allOn draws every group at full strength', () => {
  const { container, rerender } = render(<TrajectoryPlot groups={groups} selectedId={null} />);
  const op = (id: string) => path(container, id).parentElement!.getAttribute('stroke-opacity');
  expect(op('a')).toBe('0.4');
  rerender(<TrajectoryPlot groups={groups} selectedId={null} allOn />);
  expect(op('a')).toBe('0.9');
  expect(op('c')).toBe('0.9');
});

test('endLabels shows each carry', () => {
  const odd: TrajectoryPlotProps['groups'] = [{ club: 'Driver', color: '#3987E5', curves: [curve('z', 248.4)] }];
  const { container, rerender } = render(<TrajectoryPlot groups={odd} selectedId={null} />);
  expect(container.textContent).not.toContain('248');
  rerender(<TrajectoryPlot groups={odd} selectedId={null} endLabels />);
  const t = [...container.querySelectorAll('text')].find((e) => e.textContent === '248')!;
  expect(t).toBeTruthy();
  expect(t.parentElement).toHaveAttribute('fill', '#3987E5');
});

describe('end label separation', () => {
  const two = (a: number, b: number): TrajectoryPlotProps['groups'] => [
    { club: 'A', color: '#3987E5', curves: [curve('a', a)] },
    { club: 'B', color: '#E58739', curves: [curve('b', b)] },
  ];
  const labels = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="end-label"]')].map((e) => ({ t: e.textContent, anchor: e.getAttribute('text-anchor'), y: e.getAttribute('y') }));

  test('close carries anchor the shorter at its end and the longer at its start', () => {
    const { container } = render(<TrajectoryPlot groups={two(248, 245)} selectedId={null} endLabels />);
    const l = labels(container);
    expect(l.find((e) => e.t === '245')!.anchor).toBe('end');
    expect(l.find((e) => e.t === '248')!.anchor).toBe('start');
  });

  test('equal carries are stacked', () => {
    const { container } = render(<TrajectoryPlot groups={two(200, 200)} selectedId={null} endLabels />);
    const l = labels(container);
    expect(new Set(l.map((e) => `${e.anchor}/${e.y}`)).size).toBe(2);
  });

  test('distant carries stay centred on one line', () => {
    const { container } = render(<TrajectoryPlot groups={two(250, 150)} selectedId={null} endLabels />);
    const l = labels(container);
    expect(new Set(l.map((e) => e.anchor))).toEqual(new Set(['middle']));
    expect(new Set(l.map((e) => e.y)).size).toBe(1);
  });
});
