import { Link } from 'react-router';
import { selectionPosition } from '@fsa/analytics';
import { Button } from '@fsa/ui';
import { handednessLabel, sessionTitle, type Handedness, type SessionDetails, type Shot, type SourceFile } from '@fsa/domain';
import { pickerShots, shotOptionLabel } from './shotLabel';

const HANDEDNESS: Handedness[] = ['right', 'left'];

export function ShotHeader({ shot, shots, ordered, excluded, files, details, onSelect, onStep, onHandedness, onExclude, onInclude }: {
  shot: Shot;
  /** The included shots, in display order. */
  shots: readonly Shot[];
  /** Every shot in the filter, excluded ones too, in display order. */
  ordered: readonly Shot[];
  excluded: boolean;
  files: readonly SourceFile[];
  details: SessionDetails;
  onSelect(id: string): void;
  onStep(delta: 1 | -1): void;
  onHandedness(h: Handedness): void;
  /** Excludes the open shot; the caller moves on to the next included shot, as the Overview card does. */
  onExclude(): void;
  onInclude(): void;
}) {
  const file = files.find((f) => f.id === shot.fileId);
  const label = shot.shotLabel ?? shot.sourceRow;
  const pos = excluded ? null : selectionPosition(shot.id, shots);
  const options = pickerShots(shots, excluded ? shot : undefined, ordered);
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
            {/* Native select: Escape, outside click and focus return for free, and the system picker on phones. */}
            <select className="fsa-select fsa-touch inspector-head__chip-select" aria-label="Handedness"
              value={details.handedness} onChange={(e) => onHandedness(e.target.value as Handedness)}>
              {HANDEDNESS.map((h) => <option key={h} value={h}>{handednessLabel(h)}</option>)}
            </select>
          </li>
        </ul>
      </div>
      <div className="inspector-head__nav">
        <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Previous shot" onClick={() => onStep(-1)}>‹</button>
        <select className="fsa-select fsa-touch" aria-label="Choose shot" value={shot.id} onChange={(e) => onSelect(e.target.value)}>
          {options.map((s) => (
            <option key={s.id} value={s.id}>{shotOptionLabel(s, files)}</option>
          ))}
        </select>
        <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Next shot" onClick={() => onStep(1)}>›</button>
        {excluded && <span className="excluded-tag">Excluded</span>}
        {pos && <span className="panel__note">{`${pos.index} of ${pos.total}`}</span>}
        {excluded
          ? <Button onClick={onInclude}>Include shot</Button>
          : <Button onClick={onExclude}>Exclude shot</Button>}
        <Link className="fsa-btn fsa-touch link-button" to="/overview">Back to overview</Link>
      </div>
    </section>
  );
}
