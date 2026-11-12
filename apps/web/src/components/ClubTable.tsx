import { clsx } from 'clsx';
import type { LandingMode } from '@fsa/analytics';
import type { ClubGroup } from './ShotPatternPanel';

const yd = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toFixed(1));
const lr = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v === 0 ? '0.0' : `${Math.abs(v).toFixed(1)} ${v < 0 ? 'L' : 'R'}`);

/** Which colour is which club, with each club's landing numbers. Tapping a club highlights it in both views. */
export function ClubTable({ groups, mode, highlightClub, onHighlight }: {
  groups: readonly ClubGroup[];
  mode: LandingMode;
  highlightClub: string | null;
  onHighlight(club: string | null): void;
}) {
  const word = mode === 'carry' ? 'Carry' : 'Total';
  return (
    <section className="panel club-table" aria-labelledby="club-table-h">
      <div className="panel__head">
        <h2 id="club-table-h">Clubs</h2>
        <span className="panel__note">Tap a club to highlight it</span>
      </div>
      <div className="club-table__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" className="is-left">Club</th>
              <th scope="col">Shots</th>
              <th scope="col">{`Avg ${word.toLowerCase()}`}</th>
              <th scope="col">Avg lateral</th>
              <th scope="col">Lateral SD</th>
              <th scope="col">{`${word} SD`}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const on = g.club === highlightClub;
              return (
                <tr key={g.club} className={clsx(on && 'is-on')} data-club={g.club}>
                  <th scope="row" className="is-left">
                    <button type="button" className="club-table__club" aria-pressed={on} onClick={() => onHighlight(on ? null : g.club)}>
                      <span className="club-table__swatch" style={{ background: g.color }} aria-hidden="true" />
                      {g.club}
                    </button>
                  </th>
                  <td>{g.stats.points.length}</td>
                  <td>{yd(g.stats.centroid?.y)}</td>
                  <td>{lr(g.stats.centroid?.x)}</td>
                  <td>{yd(g.stats.sdX)}</td>
                  <td>{yd(g.stats.sdY)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="panel__note">{`Yards · shots with lateral and ${word.toLowerCase()} values · SD needs 2+ shots`}</p>
    </section>
  );
}
