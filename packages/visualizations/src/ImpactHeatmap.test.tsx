import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ImpactHeatmap } from './ImpactHeatmap';

const counts = Array.from({ length: 4 }, () => Array<number>(6).fill(0));
counts[1]![2] = 3;

test('shows the count and the four edge labels', () => {
  render(<ImpactHeatmap counts={counts} title="Impact" />);
  expect(screen.getByText('3')).toBeTruthy();
  for (const l of ['Heel', 'Toe', 'High', 'Low']) expect(screen.getByText(l)).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Impact' })).toBeTruthy();
});

test('opacity scales by count / max; empty cells only outlined', () => {
  const c = counts.map((r) => [...r]);
  c[0]![0] = 6;
  const { container } = render(<ImpactHeatmap counts={c} title="Impact" />);
  const cells = container.querySelectorAll('rect[data-cell]');
  expect(cells).toHaveLength(24);
  expect(cells[0]!.getAttribute('fill-opacity')).toBe('1');
  expect(cells[8]!.getAttribute('fill-opacity')).toBe('0.5');
  expect(cells[1]!.getAttribute('fill')).toBe('none');
});

test('all zeros does not produce NaN', () => {
  const z = counts.map((r) => r.map(() => 0));
  const { container } = render(<ImpactHeatmap counts={z} title="Impact" />);
  expect(container.innerHTML).not.toMatch(/NaN/);
});
