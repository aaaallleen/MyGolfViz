import { fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { DispersionStats } from '@fsa/analytics';
import { DispersionPlot } from './DispersionPlot';

const base: DispersionStats = {
  mode: 'carry',
  points: [
    { shotId: 'a', x: -20, y: 150 },
    { shotId: 'b', x: 0, y: 160 },
    { shotId: 'c', x: 10, y: 170 },
  ],
  excluded: 0,
  centroid: { x: -3, y: 160 },
  meanAbsLateral: 10,
  sdX: 12,
  sdY: 8,
  ellipse: { cx: -3, cy: 160, rx: 20, ry: 5, angleDeg: 45 },
  observedInside: 2,
  expectedCoverage: 0.39,
};
const labelFor = (id: string) => `Shot ${id}`;
const renderPlot = (stats: DispersionStats = base, selectedId: string | null = null, onSelect = vi.fn()) =>
  render(<DispersionPlot stats={stats} selectedId={selectedId} onSelect={onSelect} labelFor={labelFor} />);
const circle = (c: HTMLElement, id: string) => c.querySelector(`circle[data-shot-id="${id}"]`)!;

test('one circle per point; clicking a point calls onSelect with its id', () => {
  const onSelect = vi.fn();
  const { container } = renderPlot(base, null, onSelect);
  expect(container.querySelectorAll('circle[data-shot-id]')).toHaveLength(3);
  fireEvent.click(circle(container, 'b'));
  expect(onSelect).toHaveBeenCalledWith('b');
});

test('selected point has aria-current=true; svg aria-label mentions the selected shot', () => {
  const { container } = renderPlot(base, 'c');
  expect(circle(container, 'c')).toHaveAttribute('aria-current', 'true');
  expect(circle(container, 'a')).not.toHaveAttribute('aria-current');
  const label = container.querySelector('svg')!.getAttribute('aria-label')!;
  expect(label).toContain('Shot c lands at 170 yards, 10 yards right');
});

test('positive x is drawn right of the target line; larger y has smaller cy', () => {
  const { container } = renderPlot();
  const cx = (id: string) => Number(circle(container, id).getAttribute('cx'));
  const cy = (id: string) => Number(circle(container, id).getAttribute('cy'));
  expect(cx('c')).toBeGreaterThan(cx('b'));
  expect(cx('a')).toBeLessThan(cx('b'));
  expect(cy('c')).toBeLessThan(cy('a'));
});

test("x tick labels use L/R and the centre reads 'Target'", () => {
  const { container } = renderPlot();
  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
  expect(texts).toContain('Target');
  expect(texts).toContain('20 L');
  expect(texts).toContain('10 R');
});

test('ellipse rendered iff stats.ellipse non-null; centroid cross iff centroid non-null', () => {
  const { container, unmount } = renderPlot();
  expect(container.querySelector('[data-testid="ellipse"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="centroid"]')).not.toBeNull();
  unmount();
  const r = renderPlot({ ...base, ellipse: null, centroid: null });
  expect(r.container.querySelector('[data-testid="ellipse"]')).toBeNull();
  expect(r.container.querySelector('[data-testid="centroid"]')).toBeNull();
});

test('a positively correlated cloud draws an ellipse tilted toward the upper right', () => {
  const { container } = renderPlot();
  const m = container.querySelector('[data-testid="ellipse"]')!.getAttribute('transform')!;
  const [a = 0, b = 0] = m.match(/matrix\(([^)]+)\)/)![1]!.split(/[ ,]+/).map(Number);
  // major-axis image of the unit x vector: right (a > 0) and up (SVG b < 0)
  expect(a).toBeGreaterThan(0);
  expect(b).toBeLessThan(0);
});

test('carry mode labels', () => {
  const { container } = renderPlot();
  expect(container.textContent).toContain('Carry distance (yd)');
  expect(container.textContent).toContain('Lateral landing (yd) · right positive');
  expect(container.textContent).toContain('Actual reported landing position');
  expect(container.textContent).not.toContain('Total Dispersion');
});

test('total mode labels', () => {
  const { container } = renderPlot({ ...base, mode: 'total' });
  expect(container.textContent).toContain('Total distance (yd)');
  expect(container.textContent).toContain('Hybrid plot, not actual resting position');
  expect(container.textContent).not.toContain('Total Dispersion');
});

test('empty points render the empty message, no circles', () => {
  const { container } = renderPlot({ ...base, points: [], centroid: null, ellipse: null });
  expect(container.textContent).toContain('No shots with both lateral and carry values');
  expect(container.querySelectorAll('circle')).toHaveLength(0);
});
