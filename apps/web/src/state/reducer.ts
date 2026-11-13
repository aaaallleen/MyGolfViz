import { DEFAULT_SESSION_DETAILS, type SessionDetails, type WorkingSet } from '@fsa/domain';
import type { View2D, View3D } from '@fsa/visualizations/club3d';
import { displayOrder, filterShots, stepSelection, type Filters, type LandingMode } from '@fsa/analytics';
import { buildWorkingSet, stageFiles, type IncomingFile, type PreviewFile } from './staging';

export type InspectorTab = 'impact' | '3d' | '2d';

export interface StoreState {
  staged: PreviewFile[];
  workingSet: WorkingSet | null;
  details: SessionDetails;
  filters: Filters;
  selectedId: string | null;
  landingMode: LandingMode;
  inspectorTab: InspectorTab;
  /** The large view in each club tab; kept while moving between shots, reset by a reload. */
  clubView3D: View3D;
  clubView2D: View2D;
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
  | { type: 'setLandingMode'; mode: LandingMode }
  | { type: 'setInspectorTab'; tab: InspectorTab }
  | { type: 'setClubView3D'; view: View3D }
  | { type: 'setClubView2D'; view: View2D }
  | { type: 'setBusy'; busy: boolean };

const ALL: Filters = { club: null, fileId: null };

export const initialState: StoreState = {
  staged: [],
  workingSet: null,
  details: DEFAULT_SESSION_DETAILS,
  filters: ALL,
  selectedId: null,
  landingMode: 'carry',
  inspectorTab: '2d',
  clubView3D: 'faceOn',
  clubView2D: 'ftt',
  busy: false,
};

export function visibleOf(state: Pick<StoreState, 'workingSet' | 'filters'>) {
  return state.workingSet ? displayOrder(filterShots(state.workingSet, state.filters)) : [];
}

// A filter change keeps the selected shot while it is still visible; otherwise nothing is selected.
function withFilters(state: StoreState, filters: Filters): StoreState {
  const next = { ...state, filters };
  const keep = state.selectedId !== null && visibleOf(next).some((s) => s.id === state.selectedId);
  return { ...next, selectedId: keep ? state.selectedId : null };
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
    case 'step':
      return { ...state, selectedId: stepSelection(state.selectedId, visibleOf(state), action.delta) };
    case 'setLandingMode':
      return { ...state, landingMode: action.mode };
    case 'setInspectorTab':
      return { ...state, inspectorTab: action.tab };
    case 'setClubView3D':
      return { ...state, clubView3D: action.view };
    case 'setClubView2D':
      return { ...state, clubView2D: action.view };
    case 'setBusy':
      return { ...state, busy: action.busy };
  }
}
