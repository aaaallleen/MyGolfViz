import { DEFAULT_SESSION_DETAILS, type SessionDetails, type WorkingSet } from '@fsa/domain';
import { displayOrder, filterShots, reconcileSelection, stepSelection, type Filters, type LandingMode } from '@fsa/analytics';
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
  busy: boolean;
}

export type Action =
  | { type: 'stage'; incoming: readonly IncomingFile[]; makeKey: () => string }
  | { type: 'setInclude'; key: string; include: boolean }
  | { type: 'removeStaged'; key: string }
  | { type: 'analyze' }
  | { type: 'clear' }
  | { type: 'setDetails'; patch: Partial<SessionDetails> }
  | { type: 'setClub'; club: string | null }
  | { type: 'setFile'; fileId: string | null }
  | { type: 'select'; id: string }
  | { type: 'step'; delta: 1 | -1 }
  | { type: 'setLandingMode'; mode: LandingMode }
  | { type: 'setInspectorTab'; tab: InspectorTab }
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
  busy: false,
};

export function visibleOf(state: Pick<StoreState, 'workingSet' | 'filters'>) {
  return state.workingSet ? displayOrder(filterShots(state.workingSet, state.filters)) : [];
}

function withFilters(state: StoreState, filters: Filters): StoreState {
  const next = { ...state, filters };
  return { ...next, selectedId: reconcileSelection(state.selectedId, visibleOf(next)) };
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
      const workingSet = buildWorkingSet(state.staged);
      const next = { ...state, workingSet, filters: ALL };
      return { ...next, selectedId: visibleOf(next)[0]?.id ?? null };
    }
    case 'clear':
      return initialState;
    case 'setDetails':
      return { ...state, details: { ...state.details, ...action.patch } };
    case 'setClub':
      return withFilters(state, { ...state.filters, club: action.club });
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
    case 'setBusy':
      return { ...state, busy: action.busy };
  }
}
