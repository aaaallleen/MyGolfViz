import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, test } from 'vitest';
import { AppRoutes } from '../routes';
import { WorkingSetProvider, useWorkingSet } from '../state/store';

const DIR = join(__dirname, '../../../../fixtures/flightscope');
const F1 = 'FlightScope Golf Session Sept 19 2022.csv';
const F2 = 'FlightScope Golf Session Sept 19.csv';
const F3 = 'FlightScope Golf Session.csv';
const bytes = (n: string) => new Uint8Array(readFileSync(join(DIR, n)));
const fixture = (n: string, as = n) => new File([bytes(n)], as, { type: 'text/csv' });

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

let probe: ReturnType<typeof useWorkingSet> | null = null;
function Probe() {
  probe = useWorkingSet();
  return null;
}
function setup() {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <WorkingSetProvider>
        <AppRoutes />
        <Probe />
      </WorkingSetProvider>
    </MemoryRouter>,
  );
  const input = () => screen.getByLabelText('Load Session CSV', { selector: 'input' }) as HTMLInputElement;
  return { user, input, ...utils };
}

describe('LoadPage', () => {
  test('file input has multiple and accept including .csv', () => {
    const { input } = setup();
    expect(input()).toHaveAttribute('type', 'file');
    expect(input()).toHaveAttribute('multiple');
    expect(input().getAttribute('accept')).toContain('.csv');
  });

  test('uploading the three fixtures shows per-file counts and the footer total', async () => {
    const { user, input } = setup();
    await user.upload(input(), [fixture(F1), fixture(F2), fixture(F3)]);
    expect(await screen.findByText('16 shots · 2 summary rows excluded')).toBeInTheDocument();
    expect(screen.getByText('26 shots · 6 summary rows excluded')).toBeInTheDocument();
    expect(screen.getByText('91 shots · 14 summary rows excluded')).toBeInTheDocument();
    expect(screen.getByText('3 files · 133 shots ready')).toBeInTheDocument();
  });

  test('byte-identical duplicate is not included until ticked', async () => {
    const { user, input } = setup();
    await user.upload(input(), [fixture(F1, 'a.csv'), fixture(F1, 'b.csv')]);
    expect(await screen.findByText('Byte-identical to a.csv · not included')).toBeInTheDocument();
    expect(screen.getByText('1 file · 16 shots ready')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Include b.csv' }));
    expect(screen.getByText('2 files · 32 shots ready')).toBeInTheDocument();
  });

  test('invalid file shows the error, a disabled checkbox, and is excluded from the footer', async () => {
    const { user, input } = setup();
    await user.upload(input(), [new File(['name,email\nA,b'], 'bad.csv', { type: 'text/csv' }), fixture(F1, 'ok.csv')]);
    expect(await screen.findByText(/^Cannot analyze:/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include bad.csv' })).toBeDisabled();
    expect(screen.getByText('1 file · 16 shots ready')).toBeInTheDocument();
  });

  test('missing columns are listed by label', async () => {
    const text = new TextDecoder().decode(bytes(F1)).replace(/^﻿/, '');
    const rows = text.split(/\r?\n/).map((l) => l.split(','));
    const header = rows.findIndex((r) => r.includes('Lateral Impact (in)'));
    const drop = new Set(['Lateral Impact (in)', 'Vertical Impact (in)'].map((h) => rows[header]!.indexOf(h)));
    const csv = rows.map((r, i) => (i < header ? r : r.filter((_, c) => !drop.has(c))).join(',')).join('\n');
    const { user, input } = setup();
    await user.upload(input(), new File([csv], 'm.csv', { type: 'text/csv' }));
    expect(await screen.findByText('Missing columns: Lateral impact, Vertical impact')).toBeInTheDocument();
  });

  test('Analyze files navigates to /overview with 133 shots in the store', async () => {
    const { user, input } = setup();
    await user.upload(input(), [fixture(F1), fixture(F2), fixture(F3)]);
    await screen.findByText('3 files · 133 shots ready');
    await user.click(screen.getByRole('button', { name: 'Analyze files' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Untitled session' })).toBeInTheDocument();
    expect(probe!.workingSet!.shots).toHaveLength(133);
  });

  test('Clear analysis empties the list, disables Analyze, focuses the Load button', async () => {
    const { user, input } = setup();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.click(screen.getByRole('button', { name: 'Clear analysis' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Analyze files' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load Session CSV' })).toHaveFocus();
  });

  test('details are never prefilled from files', async () => {
    const { user, input } = setup();
    await user.upload(input(), [fixture(F1), fixture(F2)]);
    await screen.findByText('2 files · 42 shots ready');
    expect(screen.getByLabelText('Session name')).toHaveValue('');
    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Right-handed' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('typed details reach the store on Analyze', async () => {
    const { user, input } = setup();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.type(screen.getByLabelText('Session name'), 'Range day');
    await user.type(screen.getByLabelText('Date'), '2026-11-07');
    await user.click(screen.getByRole('button', { name: 'Analyze files' }));
    expect(probe!.details).toEqual({ name: 'Range day', date: '2026-11-07', notes: '', handedness: 'right' });
  });

  test('Clear analysis resets the details fields', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Session name'), 'Range day');
    await user.click(screen.getByRole('button', { name: 'Left-handed' }));
    await user.click(screen.getByRole('button', { name: 'Clear analysis' }));
    await waitFor(() => expect(screen.getByLabelText('Session name')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Right-handed' })).toHaveAttribute('aria-pressed', 'true');
  });
});
