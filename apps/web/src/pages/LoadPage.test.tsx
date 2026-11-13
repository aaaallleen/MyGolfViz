import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
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

  test('Clear analysis empties the list, disables Analyze, focuses the upload zone', async () => {
    const { user, input } = setup();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.click(screen.getByRole('button', { name: 'Clear analysis' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Analyze files' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Drag or upload Session CSV' })).toHaveFocus();
  });

  test('session detail fields opt out of browser autofill history', async () => {
    const { user, input } = setup();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    for (const label of ['Session name', 'Date', 'Notes']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
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

  test('Undo on the cleared toast brings back the files and details', async () => {
    const { user, input } = setup();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.type(screen.getByLabelText('Session name'), 'Range day');
    await user.click(screen.getByRole('button', { name: 'Clear analysis' }));
    expect(screen.getByText('0 files · 0 shots ready')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('1 file · 16 shots ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Session name')).toHaveValue('Range day');
  });

  test('Clear analysis with nothing loaded shows no toast', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Clear analysis' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Analysis cleared')).toBeNull();
  });

  test('a file that cannot be read is named in an error toast; readable files still load', async () => {
    const { user, input } = setup();
    const broken = fixture(F2, 'broken.csv');
    Object.defineProperty(broken, 'arrayBuffer', { value: () => Promise.reject(new Error('NotReadableError')) });
    await user.upload(input(), [broken, fixture(F1)]);
    expect(await screen.findByText("Couldn't read 1 file")).toBeInTheDocument();
    expect(screen.getByText('broken.csv')).toBeInTheDocument();
    expect(screen.getByText('1 file · 16 shots ready')).toBeInTheDocument();
  });

  test('clicking the upload zone opens the file picker', async () => {
    const { user, input } = setup();
    let opened = 0;
    input().addEventListener('click', () => { opened += 1; });
    await user.click(screen.getByRole('button', { name: 'Drag or upload Session CSV' }));
    expect(opened).toBe(1);
  });

  test('dragging over the upload zone highlights it until the drag leaves', () => {
    setup();
    const zone = screen.getByRole('button', { name: 'Drag or upload Session CSV' });
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveClass('is-over');
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(zone).not.toHaveClass('is-over');
  });

  describe('upload zone label by primary pointer', () => {
    afterEach(() => vi.unstubAllGlobals());
    /** Stubs matchMedia so only `matching` matches. */
    const stubMedia = (matching: string) => vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === matching, media: query, addEventListener() {}, removeEventListener() {},
    }));

    test('touch-first device (coarse primary pointer) says Upload Session CSV, without offering drag', () => {
      stubMedia('(pointer: coarse)');
      setup();
      expect(screen.getByRole('button', { name: 'Upload Session CSV' })).toBeInTheDocument();
      expect(screen.queryByText('Drag or upload Session CSV')).toBeNull();
    });

    test('touch-screen laptop (fine primary pointer, any-pointer coarse) still offers drag', () => {
      stubMedia('(any-pointer: coarse)');
      setup();
      expect(screen.getByRole('button', { name: 'Drag or upload Session CSV' })).toBeInTheDocument();
    });

    test('narrow desktop window still offers drag', () => {
      stubMedia('(max-width: 639px)');
      setup();
      expect(screen.getByRole('button', { name: 'Drag or upload Session CSV' })).toBeInTheDocument();
    });
  });

  test('dropping a mix loads the .csv files and names the skipped ones in a toast', async () => {
    setup();
    const zone = screen.getByRole('button', { name: 'Drag or upload Session CSV' });
    fireEvent.drop(zone, { dataTransfer: { files: [fixture(F1), new File(['x'], 'notes.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('Only .csv files can be loaded')).toBeInTheDocument();
    expect(screen.getByText('Skipped notes.pdf')).toBeInTheDocument();
    expect(await screen.findByText('1 file · 16 shots ready')).toBeInTheDocument();
  });
});

describe('LoadPage in local mode', () => {
  const commitImport = vi.fn();
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    commitImport.mockReset();
  });

  /** The lazy local pieces are chosen at module load, so build the page after stubbing the mode. */
  async function setupLocal() {
    vi.stubEnv('VITE_APP_MODE', 'local');
    vi.resetModules();
    vi.doMock('../local/api', () => ({
      listSessions: vi.fn().mockResolvedValue([]),
      checkImports: vi.fn().mockResolvedValue({ results: [] }),
      commitImport,
      ApiError: class extends Error {},
    }));
    const { LoadPage } = await import('./LoadPage');
    const { WorkingSetProvider, useWorkingSet } = await import('../state/store');
    let local: ReturnType<typeof useWorkingSet> | null = null;
    const Where = () => {
      local = useWorkingSet();
      return <div data-testid="where">{useLocation().pathname}</div>;
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/import']}>
        <WorkingSetProvider>
          <Routes>
            <Route path="/import" element={<LoadPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </WorkingSetProvider>
      </MemoryRouter>,
    );
    const input = () => screen.getByLabelText('Load Session CSV', { selector: 'input' });
    return { user, input, ws: () => local! };
  }

  test('shows the destination block and local buttons, not the public extras', async () => {
    await setupLocal();
    expect(await screen.findByRole('radio', { name: 'New session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear files' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import files' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyze files' })).toBeNull();
    expect(screen.queryByText(/Run Local App/)).toBeNull();
    expect(screen.queryByText('Session details')).toBeNull();
  });

  test('Import files is disabled while the new-session name is blank', async () => {
    const { user, input } = await setupLocal();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    const btn = await screen.findByRole('button', { name: 'Import files' });
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText(/^Session name/), 'Range day');
    expect(btn).toBeEnabled();
  });

  test('a successful commit clears the staged list and opens the result', async () => {
    const response = { session: { id: 's9', name: 'Range day' }, results: [] };
    commitImport.mockResolvedValue(response);
    const { user, input, ws } = await setupLocal();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.type(await screen.findByLabelText(/^Session name/), 'Range day');
    await user.click(screen.getByRole('button', { name: 'Import files' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/import/result'));
    expect(ws().staged).toEqual([]);
    expect(commitImport).toHaveBeenCalledTimes(1);
    const [manifest, files] = commitImport.mock.calls[0]!;
    expect(manifest.destination.newSession.name).toBe('Range day');
    expect(manifest.files[0]).toMatchObject({ field: 'file0', acceptCrossSessionDuplicate: false });
    expect(files[0].file).toBeInstanceOf(File);
  });

  test('Import files stays disabled while a commit runs and a failure is not retried', async () => {
    let reject!: (e: Error) => void;
    commitImport.mockReturnValue(new Promise((_, rej) => { reject = rej; }));
    const { user, input } = await setupLocal();
    await user.upload(input(), fixture(F1));
    await screen.findByText('1 file · 16 shots ready');
    await user.type(await screen.findByLabelText(/^Session name/), 'Range day');
    const btn = screen.getByRole('button', { name: 'Import files' });
    await user.click(btn);
    expect(btn).toBeDisabled();
    reject(new Error('boom'));
    await waitFor(() => expect(btn).toBeEnabled());
    expect(commitImport).toHaveBeenCalledTimes(1);
  });
});
