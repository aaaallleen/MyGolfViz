import { useId } from 'react';
import type { GappingRow } from '@fsa/analytics';
import { shotsTitle } from './gappingScope';

const yards = (v: number) => Math.round(v).toLocaleString('en-US');
const yd = (v: number) => `${yards(v)} yd`;
/** Lateral as on the plot: `8 L`, `6 R`, `0` on the line. */
const lateral = (v: number) => {
  const r = Math.round(v);
  return r === 0 ? '0' : `${Math.abs(r)} ${r < 0 ? 'L' : 'R'}`;
};
const range = (r: [number, number] | null, f: (v: number) => string) => (r ? `${f(r[0])} – ${f(r[1])}` : '—');

export interface GappingTableProps {
  /** Longest stock carry first. */
  rows: readonly GappingRow[];
  colors: ReadonlyMap<string, string>;
  /** Every session, oldest first, to say where each club's shots came from. */
  sessions: readonly { id: string; date: string }[];
  /** The club whose row is hovered or focused, or null when none is. */
  onHighlight(club: string | null): void;
}

/** Stock yardages, one row per club; hovering or focusing a row highlights the club in the plot. */
export function GappingTable({ rows, colors, sessions, onHighlight }: GappingTableProps) {
  const id = useId();
  return (
    <div className="gapping-table__scroll">
      <table className="gapping-table">
        <caption>
          Consistency scores how tight a club's landings are, distance and direction together, against its carry: 100 is a
          3% spread, 0 is 15%. The ± is how much the score could still move; it shrinks as you hit more shots. Needs more
          than 5 shots.
        </caption>
        <thead>
          <tr>
            <th scope="col">Club</th>
            <th scope="col">Stock carry</th>
            <th scope="col">Total</th>
            <th scope="col">Short – long</th>
            <th scope="col">Left – right</th>
            <th scope="col">Gap to next</th>
            <th scope="col">Consistency</th>
            <th scope="col">Shots</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const dates = sessions.filter((s) => r.sessionIds.includes(s.id)).map((s) => s.date);
            const title = shotsTitle(r.n, dates);
            const sourceId = `${id}-shots-${i}`;
            const leave = () => onHighlight(null);
            return (
              <tr
                key={r.club}
                tabIndex={0}
                // Where the club's shots came from, for keyboard and screen reader users (the title is hover only).
                aria-describedby={sourceId}
                onMouseEnter={() => onHighlight(r.club)}
                onMouseLeave={leave}
                onFocus={() => onHighlight(r.club)}
                onBlur={leave}
              >
                <th scope="row">
                  <span className="gapping-table__dot" style={{ background: colors.get(r.club) }} aria-hidden="true" />
                  {r.club}
                </th>
                <td><strong>{yd(r.stockCarry)}</strong></td>
                <td>{r.total === null ? '—' : yd(r.total)}</td>
                <td>{range(r.shortLong, yards)}</td>
                <td>{range(r.leftRight, lateral)}</td>
                <td>
                  {r.gapToNext === null ? '—' : yd(r.gapToNext)}
                  {r.overlapsNext !== null && <span className="gapping-table__flag">{`overlaps ${r.overlapsNext}`}</span>}
                  {r.hole && <span className="gapping-table__flag gapping-table__flag--hole">hole</span>}
                </td>
                <td>
                  {r.consistency
                    ? `${Math.round(r.consistency.score)} ± ${Math.round(r.consistency.plusMinus)}`
                    : <>—<span className="gapping-table__few">few shots</span></>}
                </td>
                <td title={title}>
                  {r.n}
                  {r.few && <span className="gapping-table__few">few shots</span>}
                  <span id={sourceId} className="visually-hidden">{title}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
