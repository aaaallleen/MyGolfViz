import { Link } from 'react-router';
import { useAppPaths } from '../paths';
import { selectionPosition } from '@fsa/analytics';
import { Button } from '@fsa/ui';
import { handednessLabel, sessionTitle, type Handedness, type SessionDetails, type Shot, type SourceFile } from '@fsa/domain';
import { pickerOptionLabel } from './shotLabel';

const HANDEDNESS: Handedness[] = ['right', 'left'];

export function ShotHeader({ shot, shots, ordered, excludedIds, excluded, files, details, onSelect, onStep, onHandedness, onExclude }: {
  shot: Shot;
  /** The included shots, in display order. */
  shots: readonly Shot[];
  /** Every shot in the filter, excluded ones too, in display order: the picker lists them all. */
  ordered: readonly Shot[];
  excludedIds: ReadonlySet<string>;
  excluded: boolean;
  files: readonly SourceFile[];
  details: SessionDetails;
  onSelect(id: string): void;
  onStep(delta: 1 | -1): void;
  onHandedness(h: Handedness): void;
  /** Excludes the open shot; the caller moves on to the next included shot, as the Overview card does. */
  onExclude(): void;
}) {
  const paths = useAppPaths();
  const file = files.find((f) => f.id === shot.fileId);
  const label = shot.shotLabel ?? shot.sourceRow;
  // Position in the same list the picker and ‹ › walk: every shot in the filter.
  const pos = selectionPosition(shot.id, ordered);
  return (
    <section className="inspector-head">
      <div className="inspector-head__title">
        {/* The breadcrumb's session link is the way back to the Overview. */}
        <nav aria-label="Breadcrumb" className="inspector-head__crumb">
          <Link to={paths.overview}><span className="inspector-head__back" aria-hidden="true">←</span>{sessionTitle(details)}</Link>{' / '}Shot {label}
        </nav>
        {/* An excluded shot shows its tag here; the banner below holds the one Include action. */}
        <div className="inspector-head__title-row">
          <h1>{`Shot ${label} · ${shot.club}`}</h1>
          {excluded ? <span className="excluded-tag">Excluded</span> : <Button onClick={onExclude}>Exclude shot</Button>}
          {paths.compare !== null && (
            <Link className="fsa-btn fsa-btn--secondary fsa-touch" to={{ pathname: paths.compare, search: `?a=${encodeURIComponent(shot.id)}` }} state={{ pickB: true }}>Compare…</Link>
          )}
        </div>
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
          {ordered.map((s) => (
            <option key={s.id} value={s.id}>{pickerOptionLabel(s, files, excludedIds)}</option>
          ))}
        </select>
        <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch selected-card__step" aria-label="Next shot" onClick={() => onStep(1)}>›</button>
        {pos && <span className="panel__note">{`${pos.index} of ${pos.total}`}</span>}
      </div>
    </section>
  );
}
