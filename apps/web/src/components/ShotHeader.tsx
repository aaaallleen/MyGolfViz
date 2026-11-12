import { useState } from 'react';
import { Link } from 'react-router';
import { selectionPosition } from '@fsa/analytics';
import { formatMeasurement, handednessLabel, sessionTitle, type Handedness, type SessionDetails, type Shot, type SourceFile } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';

export function ShotHeader({ shot, shots, files, details, onSelect, onStep, onHandedness }: {
  shot: Shot;
  shots: readonly Shot[];
  files: readonly SourceFile[];
  details: SessionDetails;
  onSelect(id: string): void;
  onStep(delta: 1 | -1): void;
  onHandedness(h: Handedness): void;
}) {
  const [choosing, setChoosing] = useState(false);
  const file = files.find((f) => f.id === shot.fileId);
  const label = shot.shotLabel ?? shot.sourceRow;
  const pos = selectionPosition(shot.id, shots);
  return (
    <section className="inspector-head">
      <div className="inspector-head__title">
        <nav aria-label="Breadcrumb" className="inspector-head__crumb">
          <Link to="/overview">{sessionTitle(details)}</Link>{' / '}Shot {label}
        </nav>
        <h1>{`Shot ${label} · ${shot.club}`}</h1>
        <ul className="inspector-head__chips" aria-label="Shot details">
          <li>{`File ${file?.ordinal ?? '?'} · ${file?.name ?? ''}`}</li>
          <li>{`CSV row ${shot.sourceRow}`}</li>
          {shot.mode !== null && <li>{shot.mode}</li>}
          <li>
            <button type="button" className="inspector-head__chip-button fsa-touch" aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
              {handednessLabel(details.handedness)}
            </button>
          </li>
        </ul>
        {choosing && (
          <SegmentedControl<Handedness>
            label="Handedness"
            value={details.handedness}
            onChange={(h) => { onHandedness(h); setChoosing(false); }}
            options={[{ value: 'right', label: 'Right-handed' }, { value: 'left', label: 'Left-handed' }]}
          />
        )}
      </div>
      <div className="inspector-head__nav">
        <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Previous shot" onClick={() => onStep(-1)}>‹</button>
        <select className="fsa-select fsa-touch" aria-label="Choose shot" value={shot.id} onChange={(e) => onSelect(e.target.value)}>
          {shots.map((s) => (
            <option key={s.id} value={s.id}>{`${s.club} · shot ${s.shotLabel ?? s.sourceRow} · ${formatMeasurement('carry', s.m.carry)}`}</option>
          ))}
        </select>
        <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Next shot" onClick={() => onStep(1)}>›</button>
        {pos && <span className="panel__note">{`${pos.index} of ${pos.total}`}</span>}
        <Link className="fsa-btn fsa-touch link-button" to="/overview">Back to overview</Link>
      </div>
    </section>
  );
}
