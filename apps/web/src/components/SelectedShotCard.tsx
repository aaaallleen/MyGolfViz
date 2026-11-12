import { Link } from 'react-router';
import { selectionPosition } from '@fsa/analytics';
import { formatImpact, formatMeasurement, type MeasurementKey, type Shot } from '@fsa/domain';
import { shotLabel } from './DispersionPanel';

const VALUES: { key: MeasurementKey; label: string; accent: 'ball' | 'club' }[] = [
  { key: 'carry', label: 'Carry', accent: 'ball' },
  { key: 'ballSpeed', label: 'Ball speed', accent: 'ball' },
  { key: 'launchV', label: 'Launch', accent: 'ball' },
  { key: 'spin', label: 'Spin', accent: 'ball' },
  { key: 'clubPath', label: 'Club path', accent: 'club' },
  { key: 'ftp', label: 'Face to path', accent: 'club' },
  { key: 'aoa', label: 'Attack angle', accent: 'club' },
];

export function SelectedShotCard({ shots, selectedId, onSelect, onStep }: {
  shots: readonly Shot[];
  selectedId: string | null;
  onSelect(id: string): void;
  onStep(delta: 1 | -1): void;
}) {
  const shot = shots.find((s) => s.id === selectedId);
  if (!shot) return null;
  const pos = selectionPosition(selectedId, shots);
  return (
    <div className="panel selected-card">
      <div className="panel__head">
        <div className="selected-card__nav">
          <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Previous shot" onClick={() => onStep(-1)}>‹</button>
          <select className="fsa-select fsa-touch" aria-label="Choose shot" value={shot.id} onChange={(e) => onSelect(e.target.value)}>
            {shots.map((s) => (
              <option key={s.id} value={s.id}>{`${s.club} · shot ${s.shotLabel ?? s.sourceRow} · ${formatMeasurement('carry', s.m.carry)}`}</option>
            ))}
          </select>
          <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Next shot" onClick={() => onStep(1)}>›</button>
          {pos && <span className="panel__note">{`${pos.index} of ${pos.total}`}</span>}
        </div>
        <Link className="fsa-btn fsa-btn--primary fsa-touch link-button" to="/inspect">Open shot inspector</Link>
      </div>
      <h3 className="selected-card__title">{`${shot.club} · ${shotLabel(shot)}`}</h3>
      <dl className="value-grid">
        {VALUES.map(({ key, label, accent }) => (
          <div key={key} className={`value-grid__item value-grid__item--${accent}`}>
            <dt>{label}</dt>
            <dd className={shot.m[key] === null ? 'is-missing' : undefined}>{formatMeasurement(key, shot.m[key])}</dd>
          </div>
        ))}
        <div className="value-grid__item">
          <dt>Impact</dt>
          <dd className={shot.m.impactLateral === null || shot.m.impactVertical === null ? 'is-missing' : undefined}>{formatImpact(shot.m.impactLateral, shot.m.impactVertical)}</dd>
        </div>
      </dl>
    </div>
  );
}
