import { orderSessions, type ShotsChoice } from '@fsa/analytics';
import { compareClubs } from '@fsa/domain';
import type { SessionRow } from '../api';

export type SessionsChoice = 3 | 6 | 10 | 20 | 'all';

export interface Scope {
  club: string | null;
  last: SessionsChoice;
  picked: string[] | null;
  shots: ShotsChoice;
  band: 'iqr' | 'p10p90';
}

export const DEFAULT_SCOPE: Scope = { club: null, last: 6, picked: null, shots: 'all', band: 'iqr' };

export const SCOPE_KEY = 'progression.scope';

const LASTS: readonly SessionsChoice[] = [3, 6, 10, 20, 'all'];

export function parseScope(value: unknown): Scope {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const picked =
    Array.isArray(v.picked) && v.picked.every((x) => typeof x === 'string') && v.picked.length > 0
      ? (v.picked as string[])
      : null;
  return {
    club: typeof v.club === 'string' ? v.club : DEFAULT_SCOPE.club,
    last: LASTS.includes(v.last as SessionsChoice) ? (v.last as SessionsChoice) : DEFAULT_SCOPE.last,
    picked,
    shots: v.shots === 'all' || v.shots === 'stock' ? v.shots : DEFAULT_SCOPE.shots,
    band: v.band === 'iqr' || v.band === 'p10p90' ? v.band : DEFAULT_SCOPE.band,
  };
}

export function clubsInLibrary(rows: readonly SessionRow[]): { club: string; shots: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.clubs) totals.set(c.club, (totals.get(c.club) ?? 0) + c.count);
  }
  return [...totals]
    .filter(([, shots]) => shots > 0)
    .map(([club, shots]) => ({ club, shots }))
    .sort((a, b) => b.shots - a.shots || compareClubs(a.club, b.club));
}

function hasClub(r: SessionRow, club: string): boolean {
  return r.clubs.some((c) => c.club === club && c.count > 0);
}

export function resolveClub(scope: Scope, rows: readonly SessionRow[]): string | null {
  if (scope.club && rows.some((r) => hasClub(r, scope.club!))) return scope.club;
  return clubsInLibrary(rows)[0]?.club ?? null;
}

function lastN<T>(ordered: T[], last: SessionsChoice): T[] {
  return last === 'all' ? ordered : ordered.slice(-last);
}

/** Sessions shown for the club tiles: picked ∩ sessions with the club (when non-empty), else the last N with the club. */
export function sessionsForClub(rows: readonly SessionRow[], club: string, scope: Scope): SessionRow[] {
  const withClub = orderSessions(rows.filter((r) => hasClub(r, club)));
  if (scope.picked) {
    const picked = new Set(scope.picked);
    const hit = withClub.filter((r) => picked.has(r.id));
    if (hit.length > 0) return hit;
  }
  return lastN(withClub, scope.last);
}

/** Sessions for Club gapping: picked when set, else the last N sessions of any club. */
export function sessionsForGapping(rows: readonly SessionRow[], scope: Scope): SessionRow[] {
  const ordered = orderSessions([...rows]);
  if (scope.picked && scope.picked.length > 0) {
    const picked = new Set(scope.picked);
    return ordered.filter((r) => picked.has(r.id));
  }
  return lastN(ordered, scope.last);
}

export function scopeLine(shots: readonly { excluded: boolean }[], choice: ShotsChoice): string {
  if (choice === 'stock') {
    return `Stock shots only · ${shots.filter((s) => s.excluded).length} excluded left out`;
  }
  return `All ${shots.length} ${shots.length === 1 ? 'shot' : 'shots'}`;
}
