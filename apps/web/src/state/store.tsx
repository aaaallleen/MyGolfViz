import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { SessionDetails, Shot } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import type { LandingMode } from '@fsa/analytics';
import { initialState, reducer, visibleOf, type InspectorTab, type StoreState } from './reducer';
import { readFileBytes } from './readBytes';
import type { IncomingFile } from './staging';

export { initialState, reducer, type InspectorTab, type StoreState } from './reducer';

export interface WorkingSetApi extends StoreState {
  visibleShots: Shot[];
  addFiles(files: readonly File[]): Promise<void>;
  setInclude(key: string, include: boolean): void;
  removeStaged(key: string): void;
  analyze(): void;
  clear(): void;
  setDetails(patch: Partial<SessionDetails>): void;
  setClub(club: string | null): void;
  setFile(fileId: string | null): void;
  select(id: string): void;
  step(delta: 1 | -1): void;
  setLandingMode(m: LandingMode): void;
  setInspectorTab(t: InspectorTab): void;
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

  const addFiles = useCallback(async (files: readonly File[]) => {
    dispatch({ type: 'setBusy', busy: true });
    try {
      const incoming: IncomingFile[] = [];
      for (const f of files) incoming.push(await readIncoming(f));
      dispatch({ type: 'stage', incoming, makeKey: () => `f${++counter.current}` });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }, []);

  const value = useMemo<WorkingSetApi>(
    () => ({
      ...state,
      visibleShots: visibleOf(state),
      addFiles,
      setInclude: (key, include) => dispatch({ type: 'setInclude', key, include }),
      removeStaged: (key) => dispatch({ type: 'removeStaged', key }),
      analyze: () => dispatch({ type: 'analyze' }),
      clear: () => dispatch({ type: 'clear' }),
      setDetails: (patch) => dispatch({ type: 'setDetails', patch }),
      setClub: (club) => dispatch({ type: 'setClub', club }),
      setFile: (fileId) => dispatch({ type: 'setFile', fileId }),
      select: (id) => dispatch({ type: 'select', id }),
      step: (delta) => dispatch({ type: 'step', delta }),
      setLandingMode: (mode) => dispatch({ type: 'setLandingMode', mode }),
      setInspectorTab: (tab) => dispatch({ type: 'setInspectorTab', tab }),
    }),
    [state, addFiles],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkingSet(): WorkingSetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkingSet must be used inside WorkingSetProvider');
  return v;
}
