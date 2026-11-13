import { DEFAULT_SESSION_DETAILS, type SessionDetails, type WorkingSet } from '@fsa/domain';
import type { Mode3D, View2D, View3D } from '@fsa/visualizations/club3d';
import type { Shot } from '@fsa/domain';
import { displayOrder, exclusionKey, excludedShotIds, filterShots, nextAfterExclude, stepAround, type Filters, type LandingMode } from '@fsa/analytics';
import { buildWorkingSet, stageFiles, type IncomingFile, type PreviewFile } from './staging';

export type InspectorTab = 'impact' | '3d' | '2d';

export interface StoreState {
  staged: PreviewFile[];
  workingSet: WorkingSet | null;
  details: SessionDetails;
  filters: Filters;
  selectedId: string | null;
  /** Exclusion keys (`sha256:sourceRow`): tied to file content, so they survive removing and re-adding a file. */
  excluded: ReadonlySet<string>;
  landingMode: LandingMode;
  inspectorTab: InspectorTab;
  /** The large view in each club tab; kept while moving between shots, reset by a reload. */
  clubView3D: View3D;
  clubView2D: View2D;
  /** 3D tab: fixed measuring cameras or the draggable 3D reconstruction. */
  clubMode3D: Mode3D;
  busy: boolean;
}

export type Action =
  | { type: 'stage'; incoming: readonly IncomingFile[]; makeKey: () => string }
  | { type: 'setInclude'; key: string; include: boolean }
  | { type: 'removeStaged'; key: string }
  | { type: 'analyze' }
  | { type: 'clear' }
  | { type: 'restore'; state: StoreState }
  | { type: 'setDetails'; patch: Partial<SessionDetails> }
  | { type: 'setClub'; club: string | null }
  | { type: 'setFile'; fileId: string | null }
  | { type: 'select'; id: string | null }
  | { type: 'step'; delta: 1 | -1 }
  | { type: 'setExcluded'; id: string; excluded: boolean }
  | { type: 'excludeAndAdvance'; id: string }
  | { type: 'includeShots'; ids: readonly string[] }
  | { type: 'setExcludedKeys'; excluded: ReadonlySet<string> }
  | { type: 'reveal'; id: string }
  | { type: 'setLandingMode'; mode: LandingMode }
  | { type: 'setInspectorTab'; tab: InspectorTab }
  | { type: 'setClubView3D'; view: View3D }
  | { type: 'setClubView2D'; view: View2D }
  | { type: 'setClubMode3D'; mode: Mode3D }
  | { type: 'setBusy'; busy: boolean };

const ALL: Filters = { club: null, fileId: null };

export const initialState: StoreState = {
  staged: [],
  workingSet: null,
  details: DEFAULT_SESSION_DETAILS,
  filters: ALL,
  selectedId: null,
  excluded: new Set(),
  landingMode: 'carry',
  inspectorTab: '2d',
  clubView3D: 'faceOn',
  clubView2D: 'ftt',
  clubMode3D: 'views',
  busy: false,
};

/** Every shot in the filter, in display order, excluded ones included. */
export function tableOf(state: Pick<StoreState, 'workingSet' | 'filters'>): Shot[] {
  return state.workingSet ? displayOrder(filterShots(state.workingSet, state.filters)) : [];
}

/** The included shots in the filter, in display order. */
export function visibleOf(state: Pick<StoreState, 'workingSet' | 'filters' | 'excluded'>): Shot[] {
  if (!state.workingSet) return [];
  const ids = excludedShotIds(state.workingSet, state.excluded);
  return tableOf(state).filter((s) => !ids.has(s.id));
}

// The exclusion key of a shot id, or null when the shot is unknown.
function keyOfShot(ws: WorkingSet | null, id: string): string | null {
  const shot = ws?.shots.find((s) => s.id === id);
  const file = shot && ws!.files.find((f) => f.id === shot.fileId);
  return shot && file ? exclusionKey(file.sha256, shot.sourceRow) : null;
}

function withExcluded(state: StoreState, id: string, excluded: boolean): ReadonlySet<string> {
  const key = keyOfShot(state.workingSet, id);
  if (key === null || state.excluded.has(key) === excluded) return state.excluded;
  const next = new Set(state.excluded);
  if (excluded) next.add(key);
  else next.delete(key);
  return next;
}

// A filter change keeps the selected shot while it is still in the table (excluded or not); otherwise nothing is selected.
function withFilters(state: StoreState, filters: Filters): StoreState {
  const next = { ...state, filters };
  const keep = state.selectedId !== null && tableOf(next).some((s) => s.id === state.selectedId);
  return { ...next, selectedId: keep ? state.selectedId : null };
}

function excludedIdsOf(state: StoreState): Set<string> {
  return state.workingSet ? excludedShotIds(state.workingSet, state.excluded) : new Set();
}

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'stage':
      return { ...state, staged: stageFiles(state.staged, action.incoming, action.makeKey) };
    case 'setInclude':
      return { ...state, staged: state.staged.map((f) => (f.key === action.key ? { ...f, include: action.include && f.parse.ok } : f)) };
    case 'removeStaged':
      return { ...state, staged: state.staged.filter((f) => f.key !== action.key) };
    case 'analyze': {
      // A fresh analysis opens with no shot selected.
      return { ...state, workingSet: buildWorkingSet(state.staged), filters: ALL, selectedId: null };
    }
    case 'clear':
      return initialState;
    case 'restore':
      return action.state;
    case 'setDetails':
      return { ...state, details: { ...state.details, ...action.patch } };
    case 'setClub': {
      // Picking a club starts at its first shot; going back to All clears the selection.
      if (action.club === null) return { ...state, filters: { ...state.filters, club: null }, selectedId: null };
      const next = { ...state, filters: { ...state.filters, club: action.club } };
      return { ...next, selectedId: visibleOf(next)[0]?.id ?? null };
    }
    case 'setFile':
      return withFilters(state, { ...state.filters, fileId: action.fileId });
    case 'select':
      return { ...state, selectedId: action.id };
    case 'step': {
      const table = tableOf(state);
      // With nothing included to step to, stay on the shot that is open (it may be excluded on purpose).
      const stay = table.some((s) => s.id === state.selectedId) ? state.selectedId : null;
      return { ...state, selectedId: stepAround(state.selectedId, table, excludedIdsOf(state), action.delta) ?? stay };
    }
    case 'setExcluded':
      return { ...state, excluded: withExcluded(state, action.id, action.excluded) };
    case 'excludeAndAdvance': {
      const next = { ...state, excluded: withExcluded(state, action.id, true) };
      if (action.id !== state.selectedId) return next;
      return { ...next, selectedId: nextAfterExclude(action.id, tableOf(next), excludedIdsOf(next)) };
    }
    case 'includeShots': {
      const keys = new Set(state.excluded);
      for (const id of action.ids) {
        const key = keyOfShot(state.workingSet, id);
        if (key !== null) keys.delete(key);
      }
      return { ...state, excluded: keys };
    }
    case 'setExcludedKeys':
      return { ...state, excluded: action.excluded };
    case 'reveal': {
      const shot = state.workingSet?.shots.find((s) => s.id === action.id);
      if (!shot) return state;
      const { club, fileId } = state.filters;
      const filters = {
        club: club !== null && club !== shot.club ? shot.club : club,
        fileId: fileId !== null && fileId !== shot.fileId ? null : fileId,
      };
      return { ...state, filters, selectedId: action.id };
    }
    case 'setLandingMode':
      return { ...state, landingMode: action.mode };
    case 'setInspectorTab':
      return { ...state, inspectorTab: action.tab };
    case 'setClubView3D':
      return { ...state, clubView3D: action.view };
    case 'setClubView2D':
      return { ...state, clubView2D: action.view };
    case 'setClubMode3D':
      return { ...state, clubMode3D: action.mode };
    case 'setBusy':
      return { ...state, busy: action.busy };
  }
}
