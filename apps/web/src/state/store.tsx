import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { SessionDetails, Shot } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import type { LandingMode } from '@fsa/analytics';
import type { Mode3D, View2D, View3D } from '@fsa/visualizations/club3d';
import { excludedShotIds } from '@fsa/analytics';
import { initialState, reducer, type Action, tableOf, visibleOf, type InspectorTab, type StoreState } from './reducer';
import { readFileBytes } from './readBytes';
import type { IncomingFile } from './staging';

export { initialState, reducer, type InspectorTab, type StoreState } from './reducer';

export interface WorkingSetApi extends StoreState {
  /** Included shots in the filter, in display order. */
  visibleShots: Shot[];
  /** Every shot in the filter in display order, excluded ones included. */
  tableShots: Shot[];
  /** Shot ids of every excluded shot in the session (not just the filter). */
  excludedIds: ReadonlySet<string>;
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
  setExcluded(id: string, excluded: boolean): void;
  /** Replaces the whole exclusion set (used to roll back a failed save). */
  setExcludedKeys(keys: ReadonlySet<string>): void;
  /** Excludes the shot; when it is the selected one, the selection moves to the next included shot. */
  excludeAndAdvance(id: string): void;
  /** Widens the filter just enough to show the shot, then selects it. */
  reveal(id: string): void;
  /**
   * Includes every excluded shot in scope. Returns the count and an undo, or null when nothing was excluded.
   * The undo does nothing once exclusions have changed since.
   */
  includeAll(scope: 'session' | 'filter'): { count: number; undo: () => void } | null;
  /** Excludes every included shot in the club/file filter (Edit shots). Null when none is left to exclude. */
  excludeAll(): { count: number; undo: () => void } | null;
  setLandingMode(m: LandingMode): void;
  setInspectorTab(t: InspectorTab): void;
  setClubView3D(v: View3D): void;
  setClubView2D(v: View2D): void;
  setClubMode3D(m: Mode3D): void;
  /** Opens a saved session (local build); leaves the staged import files alone. */
  loadSession(args: Omit<Extract<Action, { type: 'loadSession' }>, 'type'>): void;
  /** Empties the staged import files only. */
  clearStaged(): void;
  /** The original File behind each staged key (local build uploads the original bytes). */
  filesByKey: ReadonlyMap<string, File>;
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
  const filesByKey = useRef(new Map<string, File>());

  const addFiles = useCallback(async (files: readonly File[]) => {
    const gen = generation.current;
    setPending((n) => n + 1);
    const incoming: IncomingFile[] = [];
    const sources: File[] = [];
    const failed: string[] = [];
    try {
      for (const f of files) {
        try {
          incoming.push(await readIncoming(f));
          sources.push(f);
        } catch {
          failed.push(f.name);
        }
      }
      if (gen === generation.current && incoming.length > 0) {
        // Keys are fixed up front so each File can be filed under its key. The reducer may run twice (StrictMode), hence the wrap-around cursor.
        const keys = incoming.map(() => `f${++counter.current}`);
        keys.forEach((k, i) => filesByKey.current.set(k, sources[i]!));
        let at = 0;
        dispatch({ type: 'stage', incoming, makeKey: () => keys[at++ % keys.length]! });
      }
    } finally {
      if (gen === generation.current) setPending((n) => n - 1);
    }
    // A clear() while reading discards the whole batch, failures included.
    return { failed: gen === generation.current ? failed : [] };
  }, []);

  const clear = useCallback(() => {
    const before = latest.current;
    const filesBefore = new Map(filesByKey.current);
    filesByKey.current.clear();
    generation.current += 1;
    setPending(0);
    dispatch({ type: 'clear' });
    if (before === initialState) return null;
    // 'clear' yields the initialState object itself, and every later action yields a new object.
    return () => {
      if (latest.current === initialState) {
        filesBefore.forEach((f, k) => filesByKey.current.set(k, f));
        dispatch({ type: 'restore', state: before });
      }
    };
  }, []);

  // Same array until the shots or filters change, so tables and charts keyed on it don't redo work on every selection.
  const { workingSet, filters, excluded } = state;
  const visibleShots = useMemo(() => visibleOf({ workingSet, filters, excluded }), [workingSet, filters, excluded]);
  const tableShots = useMemo(() => tableOf({ workingSet, filters }), [workingSet, filters]);
  const excludedIds = useMemo(() => (workingSet ? excludedShotIds(workingSet, excluded) : new Set<string>()), [workingSet, excluded]);

  // Applies one bulk change to the exclusion set and returns an undo that works only while nothing has touched the set since.
  const bulk = useCallback((type: 'includeShots' | 'excludeShots', ids: readonly string[]) => {
    if (ids.length === 0) return null;
    const cur = latest.current;
    const before = cur.excluded;
    const after = reducer(cur, { type, ids }).excluded;
    dispatch({ type: 'setExcludedKeys', excluded: after });
    return {
      count: ids.length,
      undo: () => {
        if (latest.current.excluded === after) dispatch({ type: 'setExcludedKeys', excluded: before });
      },
    };
  }, []);
  const includeAll = useCallback((scope: 'session' | 'filter') => {
    const cur = latest.current;
    const all = cur.workingSet ? excludedShotIds(cur.workingSet, cur.excluded) : new Set<string>();
    return bulk('includeShots', scope === 'session' ? [...all] : tableOf(cur).filter((s) => all.has(s.id)).map((s) => s.id));
  }, [bulk]);
  const excludeAll = useCallback(() => bulk('excludeShots', visibleOf(latest.current).map((s) => s.id)), [bulk]);
  const value = useMemo<WorkingSetApi>(
    () => ({
      ...state,
      busy: pending > 0,
      visibleShots,
      tableShots,
      excludedIds,
      addFiles,
      setInclude: (key, include) => dispatch({ type: 'setInclude', key, include }),
      removeStaged: (key) => {
        filesByKey.current.delete(key);
        dispatch({ type: 'removeStaged', key });
      },
      analyze: () => dispatch({ type: 'analyze' }),
      clear,
      setDetails: (patch) => dispatch({ type: 'setDetails', patch }),
      setClub: (club) => dispatch({ type: 'setClub', club }),
      setFile: (fileId) => dispatch({ type: 'setFile', fileId }),
      select: (id) => dispatch({ type: 'select', id }),
      step: (delta) => dispatch({ type: 'step', delta }),
      setExcluded: (id, excl) => dispatch({ type: 'setExcluded', id, excluded: excl }),
      setExcludedKeys: (keys) => dispatch({ type: 'setExcludedKeys', excluded: keys }),
      excludeAndAdvance: (id) => dispatch({ type: 'excludeAndAdvance', id }),
      reveal: (id) => dispatch({ type: 'reveal', id }),
      includeAll,
      excludeAll,
      setLandingMode: (mode) => dispatch({ type: 'setLandingMode', mode }),
      setInspectorTab: (tab) => dispatch({ type: 'setInspectorTab', tab }),
      setClubView3D: (view) => dispatch({ type: 'setClubView3D', view }),
      setClubView2D: (view) => dispatch({ type: 'setClubView2D', view }),
      setClubMode3D: (mode) => dispatch({ type: 'setClubMode3D', mode }),
      loadSession: (args) => dispatch({ type: 'loadSession', ...args }),
      clearStaged: () => {
        filesByKey.current.clear();
        dispatch({ type: 'clearStaged' });
      },
      filesByKey: filesByKey.current,
    }),
    [state, visibleShots, tableShots, excludedIds, pending, addFiles, clear, includeAll, excludeAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkingSet(): WorkingSetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkingSet must be used inside WorkingSetProvider');
  return v;
}
