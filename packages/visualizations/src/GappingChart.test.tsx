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
