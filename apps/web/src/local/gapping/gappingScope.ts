import { orderSessions, type GappingBasis, type ShotsChoice } from '@fsa/analytics';
import { formatSessionDate } from '@fsa/domain';

export interface GappingScope { basis: GappingBasis; sessionId: string | null; shots: ShotsChoice }

export const DEFAULT_GAPPING_SCOPE: GappingScope = { basis: 'last3', sessionId: null, shots: 'stock' };

export const GAPPING_KEY = 'gapping.scope';

const BASES: readonly GappingBasis[] = ['session', 'latest', 'last3', 'last10', 'all'];

export function parseGappingScope(value: unknown): GappingScope {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    basis: BASES.includes(v.basis as GappingBasis) ? (v.basis as GappingBasis) : DEFAULT_GAPPING_SCOPE.basis,
    sessionId: typeof v.sessionId === 'string' && v.sessionId !== '' ? v.sessionId : DEFAULT_GAPPING_SCOPE.sessionId,
    shots: v.shots === 'all' || v.shots === 'stock' ? v.shots : DEFAULT_GAPPING_SCOPE.shots,
  };
}

type Dated = { id: string; date: string; createdAt: string };

/**
 * The one session a Latest or Selected session basis uses: the picked one while it still exists, else the
 * newest (the same fallback `gappingSessions` applies). Null for the per-club bases or an empty library.
 */
export function chosenSession<T extends Dated>(rows: readonly T[], scope: GappingScope): T | null {
  if (scope.basis !== 'session' && scope.basis !== 'latest') return null;
  const ordered = orderSessions(rows);
  const latest = ordered[ordered.length - 1] ?? null;
  if (scope.basis === 'latest') return latest;
  return ordered.find((s) => s.id === scope.sessionId) ?? latest;
}

const dateOf = (date: string) => formatSessionDate(date, { setByYou: false });

/** What the shots are based on, for the line under the controls. */
export function basisLabel(basis: GappingBasis, session: { date: string } | null): string {
  if (basis === 'last3') return "Each club's last 3 sessions";
  if (basis === 'last10') return "Each club's last 10 sessions";
  if (basis === 'all') return 'All time';
  return session ? dateOf(session.date) : '';
}

const shotsLabel = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;

/** e.g. `Each club's last 3 sessions · 412 shots · 9 excluded left out`; the excluded part only for Stock only. */
export function gappingLine(label: string, shots: number, excluded: number, choice: ShotsChoice): string {
  return `${label} · ${shotsLabel(shots)}${choice === 'stock' ? ` · ${excluded} excluded left out` : ''}`;
}

/** The Shots cell's hover text; `dates` are the club's session dates, oldest first. */
export function shotsTitle(n: number, dates: readonly string[]): string {
  if (dates.length === 1) return `${shotsLabel(n)} from ${dateOf(dates[0]!)}`;
  return `${shotsLabel(n)} from ${dates.length} sessions, ${dateOf(dates[0]!)} – ${dateOf(dates[dates.length - 1]!)}`;
}

/**
 * `sessionIds` for `GET /shots`: the union of every club's sessions. None for All time, whose sessions are
 * every session: leaving the ids out asks once instead of in many chunked requests, as Progression's `shotsQueryIds` does.
 */
export function gappingQueryIds(basis: GappingBasis, perClub: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  if (basis === 'all') return undefined;
  return [...new Set([...perClub.values()].flat())];
}
