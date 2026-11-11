import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { TrajectoryCurve } from '@fsa/analytics';
import { TrajectoryPlot } from './TrajectoryPlot';

const curve = (id: string, c: number): TrajectoryCurve => ({
  shotId: id, p0: [0, 0], p1: [c / 4, 30], p2: [c - c / 4, 30], p3: [c, 0],
});

test('TrajectoryPlot: one path per curve, selected path has data-selected, Illustrative tag present', () => {
  const { container } = render(<TrajectoryPlot curves={[curve('a', 150), curve('b', 160), curve('c', 170)]} selectedId="a" />);
  const paths = container.querySelectorAll('path[data-shot-id]');
  expect(paths).toHaveLength(3);
  const sel = container.querySelectorAll('path[data-selected="true"]');
  expect(sel).toHaveLength(1);
  expect(sel[0]).toBe(paths[paths.length - 1]);
  expect(sel[0]!.getAttribute('data-shot-id')).toBe('a');
  expect(container.textContent).toContain('Illustrative');
  expect(container.textContent).toContain('Drawn from launch angle, apex height, descent angle and carry');
  expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
});

test('empty curves show the empty message', () => {
  const { container } = render(<TrajectoryPlot curves={[]} selectedId={null} />);
  expect(container.textContent).toContain('No shots with launch, apex, descent and carry');
  expect(container.querySelectorAll('path')).toHaveLength(0);
});
