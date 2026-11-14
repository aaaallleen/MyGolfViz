import type { MeasurementKey, Measurements } from '@fsa/domain';
import { summarize } from './summary';

export const FEW_SHOTS = 5;

export interface Range { low: number | null; high: number | null }

export interface MetricStats {
  n: number; missing: number; total: number;
  median: number | null; mean: number | null; sd: number | null;
  p10: number | null; p25: number | null; p75: number | null; p90: number | null; iqr: number | null;
  /** Outside [P25 − 1.5·IQR, P75 + 1.5·IQR]; 0 when n < 4. Flagged, never removed. */
  outliers: number;
  inRange: { count: number; pct: number } | null;
  few: boolean;
}

/** Linear interpolation between closest ranks (type 7: numpy default, Excel PERCENTILE.INC). `sorted` ascending. */
export function quantile(sorted: readonly number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const a = sorted[lo] as number;
  return a + ((sorted[hi] as number) - a) * (idx - lo);
}

function finite(values: readonly (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

export function metricStats(values: readonly (number | null)[], range?: Range | null): MetricStats {
  const xs = finite(values);
  const n = xs.length;
  const sorted = [...xs].sort((a, b) => a - b);
  const { mean, sd } = summarize(xs);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  const iqr = p25 !== null && p75 !== null ? p75 - p25 : null;
  let outliers = 0;
  if (n >= 4 && p25 !== null && p75 !== null && iqr !== null) {
    const lo = p25 - 1.5 * iqr;
    const hi = p75 + 1.5 * iqr;
    outliers = sorted.filter((v) => v < lo || v > hi).length;
  }
  let inRange: MetricStats['inRange'] = null;
  if (range && n > 0 && (range.low !== null || range.high !== null)) {
    const count = xs.filter((v) => (range.low === null || v >= range.low) && (range.high === null || v <= range.high)).length;
    inRange = { count, pct: (count / n) * 100 };
  }
  return {
    n, missing: values.length - n, total: values.length,
    median: quantile(sorted, 0.5), mean, sd,
    p10: quantile(sorted, 0.1), p25, p75, p90: quantile(sorted, 0.9), iqr,
    outliers, inRange, few: n < FEW_SHOTS,
  };
}

export interface ProgressionSession { id: string; date: string; createdAt: string }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Date ascending, then createdAt, then id. */
export function orderSessions<T extends ProgressionSession>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => cmp(a.date, b.date) || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
}

export interface ProgressionShot { id: string; sessionId: string; club: string | null; m: Measurements; excluded: boolean }
export type ShotsChoice = 'all' | 'stock';

function pick(shots: readonly ProgressionShot[], choice: ShotsChoice): ProgressionShot[] {
  return choice === 'stock' ? shots.filter((s) => !s.excluded) : [...shots];
}

function bySession(sessionIds: readonly string[], shots: readonly ProgressionShot[]): ProgressionShot[][] {
  const groups = new Map<string, ProgressionShot[]>(sessionIds.map((id) => [id, []]));
  for (const s of shots) groups.get(s.sessionId)?.push(s);
  return sessionIds.map((id) => groups.get(id)!);
}

/** One entry per session, in the given order, even when it has no shots for the metric. `abs` uses |value|. */
export function seriesForMetric(
  sessionIds: readonly string[], shots: readonly ProgressionShot[], key: MeasurementKey,
  opts: { shots: ShotsChoice; abs?: boolean; range?: Range | null },
): MetricStats[] {
  return bySession(sessionIds, shots).map((group) =>
    metricStats(
      pick(group, opts.shots).map((s) => {
        const v = s.m[key];
        return v !== null && opts.abs ? Math.abs(v) : v;
      }),
      opts.range,
    ));
}

/** Ignores the shots choice: mishits are the excluded shots. Null when the session has no shots. */
export function mishitFrequency(
  sessionIds: readonly string[], shots: readonly ProgressionShot[],
): ({ excluded: number; total: number; rate: number } | null)[] {
  return bySession(sessionIds, shots).map((group) => {
    if (group.length === 0) return null;
    const excluded = group.filter((s) => s.excluded).length;
    return { excluded, total: group.length, rate: excluded / group.length };
  });
}

/** Last non-null value against the previous non-null one; `since` is that previous session's 0-based index. */
export function change(values: readonly (number | null)[]): { delta: number; since: number } | null {
  let last = -1;
  let prev = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] === null) continue;
    if (last < 0) last = i;
    else { prev = i; break; }
  }
  if (last < 0 || prev < 0) return null;
  return { delta: (values[last] as number) - (values[prev] as number), since: prev };
}

export interface ImpactSessionStats {
  measured: number; total: number;
  meanDistance: number | null; sdDistance: number | null; sdLateral: number | null; sdVertical: number | null;
}

interface Impact { lat: number; vert: number }

/** Both axes must be present; a shot with one axis is "not measured", never a centred strike. */
function measuredImpacts(shots: readonly ProgressionShot[]): Impact[] {
  const out: Impact[] = [];
  for (const s of shots) {
    const lat = s.m.impactLateral;
    const vert = s.m.impactVertical;
    if (lat !== null && vert !== null && Number.isFinite(lat) && Number.isFinite(vert)) out.push({ lat, vert });
  }
  return out;
}

export function impactStats(
  sessionIds: readonly string[], shots: readonly ProgressionShot[], choice: ShotsChoice,
): ImpactSessionStats[] {
  return bySession(sessionIds, shots).map((group) => {
    const picked = pick(group, choice);
    const hits = measuredImpacts(picked);
    const dist = summarize(hits.map((h) => Math.hypot(h.lat, h.vert)));
    return {
      measured: hits.length, total: picked.length,
      meanDistance: dist.mean, sdDistance: dist.sd,
      sdLateral: summarize(hits.map((h) => h.lat)).sd,
      sdVertical: summarize(hits.map((h) => h.vert)).sd,
    };
  });
}

/** Inches from the sweet spot; 6 columns × 4 rows. */
export const HEATMAP = { lateral: [-1.5, 1.5], vertical: [-1, 1], cell: 0.5 } as const;

/** counts[row][col]: row 0 = highest, col 0 = most heel (−lateral). Out-of-range values clamp into the edge cell. */
export function impactHeatmap(
  shots: readonly ProgressionShot[], choice: ShotsChoice,
): { counts: number[][]; measured: number; total: number } {
  const cols = Math.round((HEATMAP.lateral[1] - HEATMAP.lateral[0]) / HEATMAP.cell);
  const rows = Math.round((HEATMAP.vertical[1] - HEATMAP.vertical[0]) / HEATMAP.cell);
  const counts = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const picked = pick(shots, choice);
  const hits = measuredImpacts(picked);
  const clamp = (i: number, max: number) => Math.min(Math.max(i, 0), max - 1);
  for (const h of hits) {
    const col = clamp(Math.floor((h.lat - HEATMAP.lateral[0]) / HEATMAP.cell), cols);
    const row = clamp(Math.floor((HEATMAP.vertical[1] - h.vert) / HEATMAP.cell), rows);
    const line = counts[row] as number[];
    line[col] = (line[col] as number) + 1;
  }
  return { counts, measured: hits.length, total: picked.length };
}

export interface GapRow {
  club: string; median: number; p25: number; p75: number; n: number; few: boolean;
  gapToNext: number | null; overlapsNext: boolean;
}

/** Carry per club, longest first. "Next" is the next shorter club; overlap when this P25 is below the next P75. */
export function clubGapping(shots: readonly ProgressionShot[], choice: ShotsChoice): GapRow[] {
  const byClub = new Map<string, number[]>();
  for (const s of pick(shots, choice)) {
    const v = s.m.carry;
    if (s.club === null || v === null || !Number.isFinite(v)) continue;
    const list = byClub.get(s.club);
    if (list) list.push(v); else byClub.set(s.club, [v]);
  }
  const rows = [...byClub].map(([club, vs]) => {
    const st = metricStats(vs);
    return { club, median: st.median as number, p25: st.p25 as number, p75: st.p75 as number, n: st.n, few: st.few };
  }).sort((a, b) => b.median - a.median || cmp(a.club, b.club));
  return rows.map((r, i) => {
    const next = rows[i + 1];
    return { ...r, gapToNext: next ? r.median - next.median : null, overlapsNext: next ? r.p25 < next.p75 : false };
  });
}
