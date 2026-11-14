import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { TrendChart, type TrendChartProps } from './TrendChart';

const sessions = [
  { label: 'S1', tooltip: 'S1 · Range practice · 1 Nov 2026 · n 20' },
  { label: 'S2', tooltip: 'S2 · Range practice · 4 Nov 2026 · n 0' },
  { label: 'S3', tooltip: 'S3 · Range practice · 7 Nov 2026 · n 34' },
];
const base: TrendChartProps = {
  title: 'Carry',
  sessions,
  series: [{ name: 'Median', color: '#62B6F7', values: [1, null, 3] }],
  formatTick: (v) => `${v} yd`,
};

test('a null value breaks the line and draws no point', () => {
  const { container } = render(<TrendChart {...base} />);
  expect(container.querySelectorAll('circle')).toHaveLength(2);
  const d = container.querySelector('path[data-series="Median"]')!.getAttribute('d')!;
  expect(d.match(/M/g)).toHaveLength(2);
  expect(d).not.toMatch(/L/);
});

test('consecutive values are joined within one run', () => {
  const { container } = render(
    <TrendChart {...base} series={[{ name: 'Median', color: '#fff', values: [1, 2, null] }]} />,
  );
  const d = container.querySelector('path[data-series="Median"]')!.getAttribute('d')!;
  expect(d.match(/M/g)).toHaveLength(1);
  expect(d.match(/L/g)).toHaveLength(1);
});

test('few-shot point is hollow', () => {
  const { container } = render(
    <TrendChart {...base} series={[{ ...base.series[0]!, values: [1, 2, 3], few: [true, false, false] }]} />,
  );
  const c = container.querySelectorAll('circle');
  expect(c[0]!.getAttribute('fill')).toBe('none');
  expect(c[0]!.getAttribute('stroke')).toBe('#62B6F7');
  expect(c[1]!.getAttribute('fill')).toBe('#62B6F7');
});

test('points carry the session tooltip and value', () => {
  render(<TrendChart {...base} />);
  expect(screen.getByText(/S3 · Range practice.* · 3 yd/)).toBeTruthy();
});

test('open-ended target renders a band', () => {
  render(<TrendChart {...base} target={{ low: 2, high: null }} />);
  expect(screen.getByTestId('target-band')).toBeTruthy();
});

test('no target band without a target', () => {
  render(<TrendChart {...base} />);
  expect(screen.queryByTestId('target-band')).toBeNull();
});

test('has an accessible name', () => {
  render(<TrendChart {...base} />);
  expect(screen.getByRole('img', { name: 'Carry' })).toBeTruthy();
});

test('flat values do not collapse the domain', () => {
  const { container } = render(
    <TrendChart {...base} series={[{ name: 'Median', color: '#fff', values: [5, 5, 5] }]} />,
  );
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});

test('bands render as a translucent path', () => {
  const { container } = render(
    <TrendChart {...base} series={[{ ...base.series[0]!, values: [1, 2, 3], bands: [[0, 2], null, [2, 4]] }]} />,
  );
  expect(container.querySelector('path[opacity="0.18"]')).toBeTruthy();
});
