import { formatMeasurement, type Shot, type SourceFile } from '@fsa/domain';
import { rowTitle } from './ShotTable';

export function ShotCards({ shots, files, selectedId, onSelect }: {
  shots: readonly Shot[];
  files: readonly SourceFile[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  return (
    <ul className="shots-cards">
      {shots.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className="shot-card fsa-touch"
            data-shot-id={s.id}
            aria-pressed={s.id === selectedId}
            title={rowTitle(s, files)}
            onClick={() => onSelect(s.id)}
          >
            <span className="shot-card__head">{`${s.club} · shot ${s.shotLabel ?? s.sourceRow}`}</span>
            <span className="shot-card__vals">
              <span>{`Carry ${formatMeasurement('carry', s.m.carry)}`}</span>
              <span>{`Ball ${formatMeasurement('ballSpeed', s.m.ballSpeed)}`}</span>
              <span>{`Lateral ${formatMeasurement('lateral', s.m.lateral)}`}</span>
              <span>{`Path ${formatMeasurement('clubPath', s.m.clubPath)}`}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
