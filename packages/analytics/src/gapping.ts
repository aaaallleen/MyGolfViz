import { dispersionStats, type DispersionStats, type EllipseKind } from './dispersion';
import { FEW_SHOTS, orderSessions, quantile, type ProgressionShot, type ShotsChoice } from './progression';

export const SCORE_BEST_PCT = 3;
export const SCORE_WORST_PCT = 15;
export const SCORE_MIN_SHOTS = 6;
/** A gap this many times the median positive gap is flagged as a hole in the bag. */
export const HOLE_FACTOR = 1.75;

export type GappingBasis = 'session' | 'latest' | 'last3' | 'last10' | 'all';
export interface GappingSession {
  id: string; date: string; createdAt: string;
  clubs: readonly { club: string; count: number }[];
}

/** Club to its session ids, oldest first. Clubs with no shots in a session skip it. */
export function gappingSessions(
  sessions: readonly GappingSession[], basis: GappingBasis, sessionId: string | null,
): Map<string, string[]> {
  const ordered = orderSessions(sessions);
  const out = new Map<string, string[]>();
  const add = (club: string, id: string) => {
    const list = out.get(club);
    if (list) list.push(id);
    else out.set(club, [id]);
  };
  const single = (s: GappingSession | undefined) => {
    for (const c of s?.clubs ?? []) if (c.count > 0) add(c.club, s!.id);
  };
  if (basis === 'latest') single(ordered[ordered.length - 1]);
  else if (basis === 'session') single(ordered.find((s) => s.id === sessionId) ?? ordered[ordered.length - 1]);
  else {
    for (const s of ordered) for (const c of s.clubs) if (c.count > 0) add(c.club, s.id);
    const keep = basis === 'last3' ? 3 : basis === 'last10' ? 10 : Infinity;
    for (const [club, ids] of out) out.set(club, ids.slice(-keep));
  }
  return out;
}

export function shotsForGapping(
  shots: readonly ProgressionShot[], perClub: ReadonlyMap<string, readonly string[]>, choice: ShotsChoice,
): ProgressionShot[] {
  return shots.filter((s) =>
    s.club !== null && (perClub.get(s.club)?.includes(s.sessionId) ?? false) && !(choice === 'stock' && s.excluded));
}

export interface ConsistencyScore { score: number; plusMinus: number; n: number }

function sampleSd(xs: readonly number[]): number {
  const mean = xs.reduce((a, v) => a + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, v) => a + (v - mean) ** 2, 0) / (xs.length - 1));
}

/** x lateral, y carry. Spread is the combined carry and lateral SD as a percentage of the stock carry. */
export function consistencyScore(points: readonly { x: number; y: number }[], stockCarry: number): ConsistencyScore | null {
  const n = points.length;
  if (n < SCORE_MIN_SHOTS || !(stockCarry > 0)) return null;
  const sdLat = sampleSd(points.map((p) => p.x));
  const sdCarry = sampleSd(points.map((p) => p.y));
  const spreadPct = (100 * Math.hypot(sdCarry, sdLat)) / stockCarry;
  const raw = (100 * (SCORE_WORST_PCT - spreadPct)) / (SCORE_WORST_PCT - SCORE_BEST_PCT);
  return {
    score: Math.min(100, Math.max(0, raw)),
    plusMinus: ((100 / (SCORE_WORST_PCT - SCORE_BEST_PCT)) * spreadPct) / Math.sqrt(2 * (n - 1)),
    n,
  };
}

export interface GappingRow {
  club: string;
  stockCarry: number;
  total: number | null;
  n: number;
  few: boolean;
  sessionIds: string[];
  dispersion: DispersionStats;
  shortLong: [number, number] | null;
  leftRight: [number, number] | null;
  gapToNext: number | null;
  overlapsNext: string | null;
  hole: boolean;
  consistency: ConsistencyScore | null;
}

const sortedNums = (xs: (number | null)[]) =>
  xs.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);

/** Clubs with at least one carry value, longest stock carry first. */
export function gappingTable(shots: readonly ProgressionShot[], kind: EllipseKind): GappingRow[] {
  const byClub = new Map<string, ProgressionShot[]>();
  for (const s of shots) {
    if (s.club === null || s.m.carry === null || !Number.isFinite(s.m.carry)) continue;
    const list = byClub.get(s.club);
    if (list) list.push(s);
    else byClub.set(s.club, [s]);
  }
  const rows: GappingRow[] = [];
  for (const [club, clubShots] of byClub) {
    const carries = sortedNums(clubShots.map((s) => s.m.carry));
    const dispersion = dispersionStats(clubShots, 'carry', kind);
    const e = dispersion.ellipse;
    rows.push({
      club,
      stockCarry: quantile(carries, 0.5) as number,
      total: quantile(sortedNums(clubShots.map((s) => s.m.total)), 0.5),
      n: carries.length,
      few: carries.length < FEW_SHOTS,
      sessionIds: [...new Set(clubShots.map((s) => s.sessionId))],
      dispersion,
      shortLong: e ? [e.cy - e.halfY, e.cy + e.halfY] : null,
      leftRight: e ? [e.cx - e.halfX, e.cx + e.halfX] : null,
      gapToNext: null, overlapsNext: null, hole: false,
      consistency: null,
    });
  }
  rows.sort((a, b) => b.stockCarry - a.stockCarry || (a.club < b.club ? -1 : a.club > b.club ? 1 : 0));
  rows.forEach((r, i) => {
    r.consistency = consistencyScore(r.dispersion.points, r.stockCarry);
    const next = rows[i + 1];
    if (!next) return;
    r.gapToNext = r.stockCarry - next.stockCarry;
    if (r.shortLong && next.shortLong && r.shortLong[0] < next.shortLong[1]) r.overlapsNext = next.club;
  });
  const gaps = sortedNums(rows.map((r) => r.gapToNext).filter((g) => g !== null && g > 0));
  if (gaps.length >= 3) {
    const limit = HOLE_FACTOR * (quantile(gaps, 0.5) as number);
    for (const r of rows) r.hole = r.gapToNext !== null && r.gapToNext >= limit;
  }
  return rows;
}
