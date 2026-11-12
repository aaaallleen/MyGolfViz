import { Link } from 'react-router';
import { selectionPosition } from '@fsa/analytics';
import { formatImpact, formatMeasurement, MISSING_MARK, type MeasurementKey, type Shot } from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { shotLabel } from './shotLabel';

const VALUES: { key: MeasurementKey; label: string; accent: 'ball' | 'club' }[] = [
  { key: 'carry', label: 'Carry', accent: 'ball' },
  { key: 'ballSpeed', label: 'Ball speed', accent: 'ball' },
  { key: 'launchV', label: 'Launch', accent: 'ball' },
  { key: 'spin', label: 'Spin', accent: 'ball' },
  { key: 'clubPath', label: 'Club path', accent: 'club' },
  { key: 'ftp', label: 'Face to path', accent: 'club' },
  { key: 'aoa', label: 'Attack angle', accent: 'club' },
];

export function SelectedShotCard({ shots, selectedId, onSelect, onStep, color }: {
  shots: readonly Shot[];
  selectedId: string | null;
  onSelect(id: string): void;
  onStep(delta: 1 | -1): void;
  /** The selected shot's club colour, matching the plots and the Clubs table. */
  color?: string;
}) {
  const shot = shots.find((s) => s.id === selectedId);
  const pos = selectionPosition(selectedId, shots);
  return (
    <div className="panel selected-card">
      <div className="selected-card__head">
        <div className="selected-card__id">
          {/* The shot name is the picker: a native select laid over the heading, so it opens the system list on tap. */}
          <div className="selected-card__picker">
            <h3 className="selected-card__title" aria-hidden="true">
              {shot && color && <span className="selected-card__dot" style={{ background: color }} />}
              <span>
                {shot && `${shot.club} · `}
                <span className="selected-card__nowrap">
                  {shot ? shotLabel(shot) : 'Choose a shot'}
                  <svg className="selected-card__chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </h3>
            <select className="selected-card__select" aria-label="Choose shot" value={shot?.id ?? ''} onChange={(e) => onSelect(e.target.value)}>
              {!shot && <option value="" disabled>Choose a shot</option>}
              {shots.map((s) => (
                <option key={s.id} value={s.id}>{`${s.club} · shot ${s.shotLabel ?? s.sourceRow} · ${s.m.carry === null ? MISSING_MARK : formatMeasurement('carry', s.m.carry)}`}</option>
              ))}
            </select>
          </div>
          <span className="panel__note">{pos ? `${pos.index} of ${pos.total}` : `No shot selected · ${shots.length} shots`}</span>
        </div>
        <div className="selected-card__steps" role="group" aria-label="Step through shots">
          <button type="button" className="fsa-touch selected-card__step" aria-label="Previous shot" onClick={() => onStep(-1)}>‹</button>
          <button type="button" className="fsa-touch selected-card__step" aria-label="Next shot" onClick={() => onStep(1)}>›</button>
        </div>
      </div>
      {shot ? (
        <>
          <dl className="value-grid">
            {VALUES.map(({ key, label, accent }) => (
              <div key={key} className={`value-grid__item value-grid__item--${accent}`}>
                <dt>{label}</dt>
                <dd className={shot.m[key] === null ? 'is-missing' : undefined}>{shot.m[key] === null ? <Missing /> : formatMeasurement(key, shot.m[key])}</dd>
              </div>
            ))}
            <div className="value-grid__item">
              <dt>Impact</dt>
              <dd className={shot.m.impactLateral === null || shot.m.impactVertical === null ? 'is-missing' : undefined}>{shot.m.impactLateral === null || shot.m.impactVertical === null ? <Missing /> : formatImpact(shot.m.impactLateral, shot.m.impactVertical)}</dd>
            </div>
          </dl>
          <div className="selected-card__foot">
            <Link className="fsa-btn fsa-btn--primary fsa-touch link-button selected-card__inspect" to="/inspect">Open shot inspector →</Link>
          </div>
        </>
      ) : (
        <p className="selected-card__empty">Tap a point on the plot, a row in the table or a club, or use › to step through the shots.</p>
      )}
    </div>
  );
}
