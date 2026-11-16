import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { DispersionStats } from '@fsa/analytics';
import { SpreadPlot, spreadBounds } from './SpreadPlot';

// x = lateral (right +), y = distance from the tee.
const base: DispersionStats = {
  mode: 'carry',
  kind: 'sd1',
  points: [
    { shotId: 'a', x: -4, y: 150 },
    { shotId: 'b', x: 0, y: 155 },
    { shotId: 'c', x: 4, y: 160 },
  ],
  excluded: 0,
  centroid: { x: 0, y: 155 },
  meanAbsLateral: 3,
  sdX: 4,
  sdY: 5,
  ellipse: { cx: 0, cy: 155, rx: 8, ry: 4, angleDeg: 0, halfX: 8, halfY: 20 },
  observedInside: 2,
  expectedCoverage: 0.39,
};
const noEllipse: DispersionStats = { ...base, points: [{ shotId: 'w', x: 1, y: 100 }], centroid: { x: 1, y: 100 }, ellipse: null };
const empty: DispersionStats = { ...base, points: [], centroid: null, ellipse: null };

const groups = [
  { key: 's1', label: 'Session 1', color: '#C98500', stats: base },
  { key: 's2', label: 'Session 2', color: '#E66767', stats: noEllipse },
];
const circle = (c: HTMLElement, id: string) => c.querySelector(`circle[data-shot-id="${id}"]`)!;

test('spreadBounds covers an ellipse that reaches past the points', () => {
  const b = spreadBounds([base])!;
  expect(b.distMin).toBeLessThanOrEqual(135); // 155 - halfY 20
  expect(b.distMax).toBeGreaterThanOrEqual(175);
  expect(b.latMin).toBeLessThanOrEqual(-8);
  expect(b.latMax).toBeGreaterThanOrEqual(8);
});

test('spreadBounds keeps the lateral span at the aspect times the distance span', () => {
  for (const s of [[base], [noEllipse], [base, noEllipse]]) {
    const b = spreadBounds(s)!;
    expect(b.latMax - b.latMin).toBeCloseTo(0.75 * (b.distMax - b.distMin), 6);
  }
  const b = spreadBounds([base], 0.5)!;
  expect(b.latMax - b.latMin).toBeCloseTo(0.5 * (b.distMax - b.distMin), 6);
});

test('spreadBounds spans at least 10 yd per axis and is null with no points', () => {
  const one = spreadBounds([{ ...noEllipse, points: [{ shotId: 'w', x: 0, y: 100 }] }])!;
  expect(one.distMax - one.distMin).toBeGreaterThanOrEqual(10);
  expect(one.latMax - one.latMin).toBeGreaterThanOrEqual(7.5);
  expect(spreadBounds([empty])).toBeNull();
  expect(spreadBounds([])).toBeNull();
});

test('SpreadPlot draws one ellipse per group that has one, in its colour', () => {
  const bounds = spreadBounds([base, noEllipse])!;
  const { container } = render(<SpreadPlot groups={groups} bounds={bounds} width={400} ariaLabel="Spread" />);
  const ellipses = container.querySelectorAll('[data-testid="ellipse"]');
  expect(ellipses).toHaveLength(1);
  expect(ellipses[0]).toHaveAttribute('data-key', 's1');
  expect(ellipses[0]).toHaveAttribute('stroke', '#C98500');
});

test("dots take each group's colour; distance runs right, left of target is above", () => {
  const bounds = spreadBounds([base, noEllipse])!;
  const { container } = render(<SpreadPlot groups={groups} bounds={bounds} width={400} ariaLabel="Spread" />);
  expect(circle(container, 'a').parentElement).toHaveAttribute('fill', '#C98500');
  expect(circle(container, 'w').parentElement).toHaveAttribute('fill', '#E66767');
  expect(Number(circle(container, 'c').getAttribute('cx'))).toBeGreaterThan(Number(circle(container, 'a').getAttribute('cx')));
  expect(Number(circle(container, 'a').getAttribute('cy'))).toBeLessThan(Number(circle(container, 'c').getAttribute('cy')));
});

test('one yard is one pixel length on both axes', () => {
  const bounds = spreadBounds([base])!;
  const { container } = render(<SpreadPlot groups={[groups[0]!]} bounds={bounds} width={400} ariaLabel="Spread" />);
  const dx = Number(circle(container, 'c').getAttribute('cx')) - Number(circle(container, 'b').getAttribute('cx'));
  const dy = Number(circle(container, 'c').getAttribute('cy')) - Number(circle(container, 'b').getAttribute('cy'));
  expect(dx / 5).toBeCloseTo(dy / 4, 1);
});

test('the given aria-label is used, and a target line shows only when 0 is in range', () => {
  const bounds = spreadBounds([base])!;
  const { container } = render(<SpreadPlot groups={[groups[0]!]} bounds={bounds} width={400} ariaLabel="Spread of 7 Iron" />);
  expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Spread of 7 Iron');
  expect(container.querySelector('[data-testid="target-line"]')).not.toBeNull();
  const off = { distMin: 100, distMax: 140, latMin: 20, latMax: 50 };
  const r = render(<SpreadPlot groups={[]} bounds={off} width={400} ariaLabel="x" />);
  expect(r.container.querySelector('[data-testid="target-line"]')).toBeNull();
});

test('two plots with the same bounds and width share a viewBox', () => {
  const bounds = spreadBounds([base, noEllipse])!;
  const one = render(<SpreadPlot groups={[groups[0]!]} bounds={bounds} width={300} ariaLabel="a" />);
  const two = render(<SpreadPlot groups={[groups[1]!]} bounds={bounds} width={300} ariaLabel="b" />);
  expect(one.container.querySelector('svg')!.getAttribute('viewBox')).toBe(two.container.querySelector('svg')!.getAttribute('viewBox'));
});
