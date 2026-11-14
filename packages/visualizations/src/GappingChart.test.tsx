import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { GapRow } from '@fsa/analytics';
import { GappingChart } from './GappingChart';

const row = (o: Partial<GapRow>): GapRow => ({
  club: '7 Iron', median: 150, p25: 145, p75: 155, n: 10, few: false, gapToNext: 20, overlapsNext: false, ...o,
});
const fmt = (v: number) => `${v.toFixed(1)} yd`;

test('renders each club label and the gap', () => {
  render(<GappingChart rows={[row({}), row({ club: '8 Iron', median: 130, gapToNext: null })]} formatValue={fmt} />);
  expect(screen.getByText('7 Iron · 150.0 yd')).toBeTruthy();
  expect(screen.getByText('8 Iron · 130.0 yd')).toBeTruthy();
  expect(screen.getByText('20.0 yd gap')).toBeTruthy();
});

test('shows overlaps instead of a gap', () => {
  render(<GappingChart rows={[row({ overlapsNext: true, gapToNext: 3 }), row({ club: '8 Iron', gapToNext: null })]} formatValue={fmt} />);
  expect(screen.getByText('overlaps')).toBeTruthy();
  expect(screen.queryByText(/gap$/)).toBeNull();
});

test('few-shot bar is outlined, not filled', () => {
  const { container } = render(<GappingChart rows={[row({ few: true, gapToNext: null })]} formatValue={fmt} />);
  expect(container.querySelector('rect[data-testid="gap-bar"]')!.getAttribute('fill')).toBe('none');
});

test('renders nothing harmful with no rows', () => {
  const { container } = render(<GappingChart rows={[]} formatValue={fmt} />);
  expect(container.innerHTML).not.toMatch(/NaN/);
});

test('axis labels at either end stay inside the svg', () => {
  // 9 px labels; a character is at most about 0.6 em wide.
  const est = (s: string) => s.length * 9 * 0.6;
  const long = (v: number) => `${v.toFixed(1)} yd of carry`;
  const { container } = render(
    <GappingChart rows={[row({ median: 160, p25: 150, p75: 170 }), row({ club: 'Gap Wedge', median: 100, p25: 95, p75: 105, gapToNext: null })]} formatValue={long} />,
  );
  const ticks = [...container.querySelectorAll('text[text-anchor="middle"]')];
  expect(ticks.length).toBeGreaterThan(1);
  for (const t of ticks) {
    const x = Number(t.getAttribute('x'));
    const half = est(t.textContent!) / 2;
    expect(x - half).toBeGreaterThanOrEqual(0);
    expect(x + half).toBeLessThanOrEqual(360);
  }
});
