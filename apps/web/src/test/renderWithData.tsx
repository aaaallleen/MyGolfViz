import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { decodeCsvBytes, parseFlightScopeCsv } from '@fsa/csv-parser';
import type { SessionDetails } from '@fsa/domain';
import { AppShell } from '../layout/AppShell';
import { AppRoutes } from '../routes';
import { initialState, reducer } from '../state/reducer';
import { WorkingSetProvider, useWorkingSet, type WorkingSetApi } from '../state/store';

const DIR = join(__dirname, '../../../../fixtures/flightscope');

let latest: WorkingSetApi | null = null;
function Probe() {
  latest = useWorkingSet();
  return null;
}

/** Parse the named fixtures in order, stage and analyze them with the real reducer, then render the app. */
export function renderWithData(
  fixtures: string[],
  opts: { route?: string; details?: Partial<SessionDetails>; shellRoutes?: ReactNode } = {},
): RenderResult & { store(): WorkingSetApi } {
  const incoming = fixtures.map((name) => {
    const bytes = new Uint8Array(readFileSync(isAbsolute(name) ? name : join(DIR, name)));
    const { text } = decodeCsvBytes(bytes);
    const label = basename(name);
    return { name: label, byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), parse: parseFlightScopeCsv(text, label) };
  });
  let n = 0;
  let state = reducer(initialState, { type: 'stage', incoming, makeKey: () => `k${++n}` });
  state = reducer(state, { type: 'analyze' });
  if (opts.details) state = reducer(state, { type: 'setDetails', patch: opts.details });
  const result = render(
    <MemoryRouter initialEntries={[opts.route ?? '/overview']}>
      <WorkingSetProvider initial={state}>
        {opts.shellRoutes ? <AppShell>{opts.shellRoutes}</AppShell> : <AppRoutes />}
        <Probe />
      </WorkingSetProvider>
    </MemoryRouter>,
  );
  return Object.assign(result, { store: () => latest! });
}
