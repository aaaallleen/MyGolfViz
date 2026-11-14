import type { MetricStats } from '@fsa/analytics';
import { formatMeasurement, formatSessionDate, NOT_MEASURED, type MeasurementKey } from '@fsa/domain';
import type { SessionRow } from '../api';
import { formatPlain } from './format';

/** `few shots` only when there are some: n 0 is no shots at all. */
export const isFew = (s: MetricStats) => s.few && s.n > 0;

export interface TileDetailsProps {
  metric: MeasurementKey;
  /** Shown sessions, oldest first (S1…Sn). */
  sessions: readonly SessionRow[];
  /** One per session, same order. */
  stats: readonly MetricStats[];
  /** True when the stats are of |value| (accuracy tiles): values have no direction word. */
  abs?: boolean;
  /** Accuracy tiles: the signed stats, for the signed-median column. */
  signed?: readonly MetricStats[] | null;
  /** A target range is set: adds the `% in range` column. */
  hasRange?: boolean;
}

function spread(fmt: (v: number | null) => string, lo: number | null, hi: number | null): string {
  return lo === null || hi === null ? NOT_MEASURED : `${fmt(lo)} – ${fmt(hi)}`;
}

/** The full per-session numbers behind a tile (spec §8.2). */
export function TileDetails({ metric, sessions, stats, abs = false, signed = null, hasRange = false }: TileDetailsProps) {
  const fmt = (v: number | null) => (abs ? formatPlain(metric, v) : formatMeasurement(metric, v));
  return (
    <details className="prog-details">
      <summary>Details</summary>
      <div className="prog-details__scroll">
        <table className="prog-details__table">
          <thead>
            <tr>
              <th scope="col">S</th>
              <th scope="col">Session</th>
              <th scope="col">Date</th>
              <th scope="col">n</th>
              <th scope="col">Missing</th>
              <th scope="col">Total</th>
              <th scope="col">Median</th>
              <th scope="col">Mean</th>
              <th scope="col">SD</th>
              <th scope="col">P25–P75</th>
              <th scope="col">P10–P90</th>
              <th scope="col">Potential outliers</th>
              {signed && <th scope="col">Signed median</th>}
              {hasRange && <th scope="col">% in range</th>}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const st = stats[i]!;
              return (
                <tr key={s.id}>
                  <td>{`S${i + 1}`}</td>
                  <td>{s.name}</td>
                  <td>{formatSessionDate(s.date, { setByYou: false })}</td>
                  <td>
                    {st.n}
                    {isFew(st) && <span className="prog-few"> · few shots</span>}
                  </td>
                  <td>{st.missing}</td>
                  <td>{st.total}</td>
                  <td>{fmt(st.median)}</td>
                  <td>{fmt(st.mean)}</td>
                  <td>{formatPlain(metric, st.sd)}</td>
                  <td>{spread(fmt, st.p25, st.p75)}</td>
                  <td>{spread(fmt, st.p10, st.p90)}</td>
                  <td>{st.outliers}</td>
                  {signed && <td>{formatMeasurement(metric, signed[i]?.median ?? null)}</td>}
                  {hasRange && <td>{st.inRange ? `${Math.round(st.inRange.pct)}%` : NOT_MEASURED}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
