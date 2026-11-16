import { useMemo } from 'react';
import { dispersionBySession, FEW_SHOTS, type DispersionStats, type EllipseKind } from '@fsa/analytics';
import { formatSessionDate, NUMBER_LOCALE } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';
import { CLUB_SERIES, SpreadPlot, spreadBounds } from '@fsa/visualizations';
import { useWorkingSet } from '../../state/store';
import { TileFrame } from './MetricTile';
import type { SpecialTileProps } from './SpecialTiles';

const MAX_OVERLAID = 8;
/** Overlaid: the one plot's viewBox width. */
const OVERLAID_WIDTH = 300;
/**
 * Side by side: the smallest cell (px) and each plot's viewBox width, kept equal so a plot is never drawn below
 * its own scale (its 11-unit text stays at least 11 px).
 */
const CELL_WIDTH = 180;
const GRID_COLUMNS = { gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_WIDTH}px, 1fr))` };

const dateOf = (date: string) => formatSessionDate(date, { setByYou: false });
const yards = (v: number) => Math.round(v).toLocaleString(NUMBER_LOCALE);
/** Under 3 landed shots there is no ellipse to draw. */
const needsShots = (st: DispersionStats) => st.points.length < 3;
const size = (st: DispersionStats) =>
  st.ellipse ? { w: yards(2 * st.ellipse.halfX), d: yards(2 * st.ellipse.halfY) } : null;

/** Dispersion by session: each session's carry landing spread, side by side or overlaid on one plot. */
export function DispersionTile({ def, sessions, shots, scope, controls, onScope }: SpecialTileProps) {
  const { ellipseKind, setEllipseKind } = useWorkingSet();
  const overlaid = scope.view === 'overlaid';
  const shown = useMemo(() => (overlaid ? sessions.slice(-MAX_OVERLAID) : sessions), [overlaid, sessions]);
  const ids = useMemo(() => shown.map((s) => s.id), [shown]);
  const stats = useMemo(
    () => dispersionBySession(ids, shots, scope.shots, ellipseKind).map((r) => r.stats),
    [ids, shots, scope.shots, ellipseKind],
  );
  // One window for every plot, so sizes compare across sessions.
  const bounds = useMemo(() => spreadBounds(stats), [stats]);

  const control = (
    <div className="prog-dispersion__controls">
      <SegmentedControl<EllipseKind>
        label="Ellipse"
        value={ellipseKind}
        options={[{ value: 'sd1', label: '1 SD' }, { value: 'all', label: 'Every shot' }]}
        onChange={setEllipseKind}
      />
      <SegmentedControl
        label="View"
        value={scope.view}
        options={[{ value: 'side', label: 'Side by side' }, { value: 'overlaid', label: 'Overlaid' }]}
        onChange={(view) => onScope({ ...scope, view })}
      />
    </div>
  );

  const few = (st: DispersionStats) => st.points.length > 0 && st.points.length < FEW_SHOTS;
  const colorOf = (i: number) => CLUB_SERIES[i % CLUB_SERIES.length]!;

  let body;
  if (!bounds) {
    body = <p className="prog-tile__note">No shots with carry and lateral in these sessions.</p>;
  } else if (overlaid) {
    body = (
      <div className="prog-dispersion__overlaid">
        <div className="prog-dispersion__plot">
          <SpreadPlot
            groups={shown.map((s, i) => ({ key: s.id, label: dateOf(s.date), color: colorOf(i), stats: stats[i]! }))}
            bounds={bounds}
            width={OVERLAID_WIDTH}
            ariaLabel="Dispersion, sessions overlaid"
          />
        </div>
        <table className="prog-dispersion__legend">
          <thead>
            <tr><th scope="col">Session</th><th scope="col">Width</th><th scope="col">Depth</th></tr>
          </thead>
          <tbody>
            {shown.map((s, i) => {
              const z = size(stats[i]!);
              return (
                <tr key={s.id}>
                  <td>
                    <span className="prog-legend__dot" style={{ background: colorOf(i) }} aria-hidden="true" />
                    {dateOf(s.date)}{few(stats[i]!) && ' · few shots'}
                  </td>
                  {needsShots(stats[i]!) ? (
                    <td colSpan={2}>Needs 3 shots for an ellipse</td>
                  ) : (
                    <>
                      <td>{z ? `${z.w} yd` : '—'}</td>
                      <td>{z ? `${z.d} yd` : '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <ul className="prog-dispersion__grid" style={GRID_COLUMNS}>
        {shown.map((s, i) => {
          const st = stats[i]!;
          const z = size(st);
          return (
            <li key={s.id} className="prog-dispersion__cell">
              <p className="prog-dispersion__date">{dateOf(s.date)}{few(st) && ' · few shots'}</p>
              <SpreadPlot
                groups={[{ key: s.id, label: dateOf(s.date), color: colorOf(0), stats: st }]}
                bounds={bounds}
                width={CELL_WIDTH}
                ariaLabel={`Dispersion, ${dateOf(s.date)}`}
              />
              {z ? (
                <p className="prog-dispersion__size">
                  {`${z.w} × ${z.d} yd`}
                  {ellipseKind === 'sd1' && <span>{` · ${st.observedInside} of ${st.points.length} inside`}</span>}
                </p>
              ) : (
                <p className="prog-dispersion__size">{needsShots(st) ? 'Needs 3 shots for an ellipse' : '—'}</p>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <TileFrame
      def={def}
      controls={controls}
      className="prog-tile--wide"
      subtitle="Carry landing"
      body={<div className="prog-dispersion">{control}{body}</div>}
      notes={overlaid && sessions.length > MAX_OVERLAID && (
        <p className="prog-tile__caption">{`Overlaid shows the latest ${MAX_OVERLAID} of ${sessions.length} sessions`}</p>
      )}
    />
  );
}
