import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { SessionDetails, Shot } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import type { LandingMode } from '@fsa/analytics';
import type { View2D, View3D } from '@fsa/visualizations';
import { initialState, reducer, visibleOf, type InspectorTab, type StoreState } from './reducer';
import { readFileBytes } from './readBytes';
import type { IncomingFile } from './staging';

export { initialState, reducer, type InspectorTab, type StoreState } from './reducer';

export interface WorkingSetApi extends StoreState {
  visibleShots: Shot[];
  /** Reads and stages each file independently; resolves with the names of files that could not be read. */
  addFiles(files: readonly File[]): Promise<{ failed: string[] }>;
  setInclude(key: string, include: boolean): void;
  removeStaged(key: string): void;
  analyze(): void;
  /**
   * Empties the working set. Returns an undo that puts back what was cleared, or null when there was
   * nothing to clear. The undo does nothing once anything has changed since, so it never overwrites newer work.
   */
  clear(): (() => void) | null;
  setDetails(patch: Partial<SessionDetails>): void;
  setClub(club: string | null): void;
  setFile(fileId: string | null): void;
  /** Select a shot, or pass null to select none. */
  select(id: string | null): void;
  step(delta: 1 | -1): void;
  setLandingMode(m: LandingMode): void;
  setInspectorTab(t: InspectorTab): void;
  setClubView3D(v: View3D): void;
  setClubView2D(v: View2D): void;
}

const Ctx = createContext<WorkingSetApi | null>(null);

async function readIncoming(file: File): Promise<IncomingFile> {
  const bytes = await readFileBytes(file);
  const { text, encoding } = decodeCsvBytes(bytes);
  const parse = parseFlightScopeCsv(text, file.name);
  if (encoding === 'windows-1252') {
    parse.warnings.push({ code: 'decoded_as_windows_1252', message: 'The file was not valid UTF-8 and was read as Windows-1252' });
  }
  return { name: file.name, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes), parse };
}

export function WorkingSetProvider({ children, initial }: { children: ReactNode; initial?: StoreState }) {
  const [state, dispatch] = useReducer(reducer, initial ?? initialState);
  const counter = useRef(0);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });

  // Bumped by clear(): in-flight addFiles calls from an older generation drop their results.
  const generation = useRef(0);
  const [pending, setPending] = useState(0);

  const addFiles = useCallback(async (files: readonly File[]) => {
    const gen = generation.current;
    setPending((n) => n + 1);
    const incoming: IncomingFile[] = [];
    const failed: string[] = [];
    try {
      for (const f of files) {
        try {
          incoming.push(await readIncoming(f));
        } catch {
          failed.push(f.name);
        }
      }
      if (gen === generation.current && incoming.length > 0) dispatch({ type: 'stage', incoming, makeKey: () => `f${++counter.current}` });
    } finally {
      if (gen === generation.current) setPending((n) => n - 1);
    }
    // A clear() while reading discards the whole batch, failures included.
    return { failed: gen === generation.current ? failed : [] };
  }, []);

  const clear = useCallback(() => {
    const before = latest.current;
    generation.current += 1;
    setPending(0);
    dispatch({ type: 'clear' });
    if (before === initialState) return null;
    // 'clear' yields the initialState object itself, and every later action yields a new object.
    return () => {
      if (latest.current === initialState) dispatch({ type: 'restore', state: before });
    };
  }, []);

  // Same array until the shots or filters change, so tables and charts keyed on it don't redo work on every selection.
  const { workingSet, filters } = state;
  const visibleShots = useMemo(() => visibleOf({ workingSet, filters }), [workingSet, filters]);
  const value = useMemo<WorkingSetApi>(
    () => ({
      ...state,
      busy: pending > 0,
      visibleShots,
      addFiles,
      setInclude: (key, include) => dispatch({ type: 'setInclude', key, include }),
      removeStaged: (key) => dispatch({ type: 'removeStaged', key }),
      analyze: () => dispatch({ type: 'analyze' }),
      clear,
      setDetails: (patch) => dispatch({ type: 'setDetails', patch }),
      setClub: (club) => dispatch({ type: 'setClub', club }),
      setFile: (fileId) => dispatch({ type: 'setFile', fileId }),
      select: (id) => dispatch({ type: 'select', id }),
      step: (delta) => dispatch({ type: 'step', delta }),
      setLandingMode: (mode) => dispatch({ type: 'setLandingMode', mode }),
      setInspectorTab: (tab) => dispatch({ type: 'setInspectorTab', tab }),
      setClubView3D: (view) => dispatch({ type: 'setClubView3D', view }),
      setClubView2D: (view) => dispatch({ type: 'setClubView2D', view }),
    }),
    [state, visibleShots, pending, addFiles, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkingSet(): WorkingSetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkingSet must be used inside WorkingSetProvider');
  return v;
}
