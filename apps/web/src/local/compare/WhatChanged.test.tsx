import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements, type Shot } from '@fsa/domain';
import { CHANGED_CAPTION, WhatChanged } from './WhatChanged';

// Every measurement set, so each row has every side unless a test blanks one.
const full = (over: Partial<Measurements>): Measurements =>
  ({ ...Object.fromEntries(MEASUREMENT_KEYS.map((k, i) => [k, i + 1])), ...over }) as Measurements;
const shot = (id: string, m: Measurements): Shot =>
  ({ id, fileId: 'f', sourceRow: 1, shotLabel: '1', club: 'Driver', shotType: null, mode: null, location: null, m, raw: {}, flags: [] }) as Shot;

const bodyRows = () => within(screen.getByRole('table', { name: CHANGED_CAPTION })).getAllByRole('row').slice(1);
const label = (row: HTMLElement) => row.querySelector('th')!.textContent;
const rowFor = (l: string) => bodyRows().find((r) => label(r) === l)!;
/** The baseline value, then each other shot as [value, change]. */
const read = (row: HTMLElement) => {
  const [base, ...rest] = [...row.querySelectorAll('td')];
  return { base: base!.textContent, others: rest.map((c) => [c.querySelector('.compare-table__value')!.textContent, c.querySelector('.compare-table__delta')!.textContent]) };
};

describe('WhatChanged', () => {
  test('two shots: A is the baseline column, B shows its value and its change from A', () => {
    render(<WhatChanged base={shot('a', full({ spin: 2410 }))} others={[{ slot: 'B', shot: shot('b', full({ spin: 2980 })) }]} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'A Baseline', 'B']);
    expect(bodyRows()).toHaveLength(27);
    expect(read(rowFor('Spin'))).toEqual({ base: '2,410 rpm', others: [['2,980 rpm', '+570 rpm']] });
    expect(screen.getByText(/that shot − A · sorted by biggest change · missing values are never shown as 0/)).toBeInTheDocument();
  });

  test('four shots: one column per shot, each change measured from A', () => {
    render(
      <WhatChanged
        base={shot('a', full({ carry: 240 }))}
        others={[
          { slot: 'B', shot: shot('b', full({ carry: 236 })) },
          { slot: 'C', shot: shot('c', full({ carry: 252.5 })) },
          { slot: 'D', shot: shot('d', full({ carry: 240 })) },
        ]}
      />,
    );
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'A Baseline', 'B', 'C', 'D']);
    expect(read(rowFor('Carry'))).toEqual({
      base: '240.0 yd',
      others: [['236.0 yd', '−4.0 yd'], ['252.5 yd', '+12.5 yd'], ['240.0 yd', '0.0 yd']],
    });
  });

  test('the row with the biggest change from A in any shot comes first', () => {
    render(
      <WhatChanged
        base={shot('a', full({ spin: 2500, carry: 200 }))}
        others={[
          { slot: 'B', shot: shot('b', full({ spin: 2500, carry: 200 })) },
          { slot: 'C', shot: shot('c', full({ spin: 4100, carry: 200 })) },
        ]}
      />,
    );
    expect(label(bodyRows()[0]!)).toBe('Spin');
  });

  test('missing values say n/a and sort last', () => {
    render(<WhatChanged base={shot('a', full({ impactLateral: null }))} others={[{ slot: 'B', shot: shot('b', full({ impactLateral: 0.4 })) }]} />);
    const rows = bodyRows();
    const i = rows.findIndex((r) => label(r) === 'Lateral impact');
    const row = rows[i]!;
    expect(read(row).others[0]![1]).toBe('n/a');
    expect(row.querySelector('.fsa-missing')).not.toBeNull();
    const numbered = rows.map((r, j) => [j, read(r).others[0]![1]] as const).filter(([, d]) => d !== 'n/a').map(([j]) => j);
    expect(numbered.length).toBe(26);
    expect(Math.max(...numbered)).toBeLessThan(i);
  });

  test('no good/bad colouring', () => {
    const { container } = render(<WhatChanged base={shot('a', full({ spin: 2410, carry: 250 }))} others={[{ slot: 'B', shot: shot('b', full({ spin: 2980, carry: 230 })) }]} />);
    for (const c of container.querySelectorAll('th, td, tr, span')) {
      expect(c.className).not.toMatch(/up|down|good|bad/);
    }
  });
});
