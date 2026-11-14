import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type Measurements, type Shot } from '@fsa/domain';
import { WhatChanged } from './WhatChanged';

// Every measurement set, so each row has both sides unless a test blanks one.
const full = (over: Partial<Measurements>): Measurements =>
  ({ ...Object.fromEntries(MEASUREMENT_KEYS.map((k, i) => [k, i + 1])), ...over }) as Measurements;
const shot = (id: string, m: Measurements): Shot =>
  ({ id, fileId: 'f', sourceRow: 1, shotLabel: '1', club: 'Driver', shotType: null, mode: null, location: null, m, raw: {}, flags: [] }) as Shot;

const bodyRows = () => within(screen.getByRole('table', { name: 'What changed · B → A' })).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((c) => c.textContent);
const rowFor = (label: string) => bodyRows().find((r) => cells(r)[0] === label)!;

describe('WhatChanged', () => {
  test('lists every metric with B, A and the change', () => {
    render(<WhatChanged a={shot('a', full({ spin: 2410 }))} b={shot('b', full({ spin: 2980 }))} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Metric', 'B', 'A', 'Δ']);
    expect(bodyRows()).toHaveLength(27);
    expect(cells(rowFor('Spin'))).toEqual(['Spin', '2,980 rpm', '2,410 rpm', '−570 rpm']);
    expect(screen.getByText('Sorted by size of change · missing values are never shown as 0')).toBeInTheDocument();
  });

  test('missing values say n/a and sort last', () => {
    render(<WhatChanged a={shot('a', full({ impactLateral: 0.4 }))} b={shot('b', full({ impactLateral: null }))} />);
    const rows = bodyRows();
    const i = rows.findIndex((r) => cells(r)[0] === 'Lateral impact');
    const row = rows[i]!;
    expect(cells(row)[3]).toBe('n/a');
    expect(row.querySelector('.fsa-missing')).not.toBeNull();
    const numbered = rows.map((r, j) => [j, cells(r)[3]] as const).filter(([, d]) => d !== 'n/a').map(([j]) => j);
    expect(numbered.length).toBe(26);
    expect(Math.max(...numbered)).toBeLessThan(i);
  });

  test('no good/bad colouring', () => {
    const { container } = render(<WhatChanged a={shot('a', full({ spin: 2410, carry: 250 }))} b={shot('b', full({ spin: 2980, carry: 230 }))} />);
    for (const c of container.querySelectorAll('th, td, tr')) {
      expect(c.className).not.toMatch(/up|down|good|bad/);
    }
  });
});
