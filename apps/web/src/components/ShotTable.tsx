import type { KeyboardEvent } from 'react';
import { formatImpact, formatMeasurement, type MeasurementKey, type Shot, type SourceFile } from '@fsa/domain';

const COLS: { key: MeasurementKey; head: string; accent: 'ball' | 'club' }[] = [
  { key: 'ballSpeed', head: 'Ball mph', accent: 'ball' },
  { key: 'launchV', head: 'Launch', accent: 'ball' },
  { key: 'spin', head: 'Spin', accent: 'ball' },
  { key: 'carry', head: 'Carry', accent: 'ball' },
  { key: 'total', head: 'Total', accent: 'ball' },
  { key: 'lateral', head: 'Lateral', accent: 'ball' },
  { key: 'clubSpeed', head: 'Club mph', accent: 'club' },
  { key: 'smash', head: 'Smash', accent: 'club' },
  { key: 'clubPath', head: 'Path', accent: 'club' },
  { key: 'ftp', head: 'Face to path', accent: 'club' },
];

export function rowTitle(shot: Shot, files: readonly SourceFile[]): string {
  const f = files.find((x) => x.id === shot.fileId);
  return `File ${f?.ordinal ?? '?'} · ${f?.name ?? ''} · CSV row ${shot.sourceRow}`;
}

function groups(shots: readonly Shot[], grouped: boolean): { club: string | null; rows: Shot[] }[] {
  if (!grouped) return [{ club: null, rows: [...shots] }];
  const out: { club: string | null; rows: Shot[] }[] = [];
  for (const s of shots) {
    const g = out[out.length - 1];
    if (g && g.club === s.club) g.rows.push(s); else out.push({ club: s.club, rows: [s] });
  }
  return out;
}

export function ShotTable({ shots, files, selectedId, onSelect, grouped }: {
  shots: readonly Shot[];
  files: readonly SourceFile[];
  selectedId: string | null;
  onSelect(id: string): void;
  grouped: boolean;
}) {
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); }
  };
  return (
    <div className="shots-table">
      <table>
        <thead>
          <tr>
            <th scope="col" className="is-left">Shot</th>
            <th scope="col" className="is-left">Club</th>
            {COLS.map((c) => <th key={c.key} scope="col" className={`col-${c.accent}`}>{c.head}</th>)}
            <th scope="col">Impact (in)</th>
          </tr>
        </thead>
        {groups(shots, grouped).map((g) => (
          <tbody key={g.club ?? 'all'}>
            {g.club !== null && (
              <tr><th scope="rowgroup" colSpan={13} className="is-left">{`${g.club} · ${g.rows.length} shots`}</th></tr>
            )}
            {g.rows.map((s) => (
              <tr
                key={s.id}
                data-shot-id={s.id}
                tabIndex={0}
                aria-selected={s.id === selectedId}
                title={rowTitle(s, files)}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => onKey(e, s.id)}
              >
                <td className="is-left">{s.shotLabel ?? s.sourceRow}</td>
                <td className="is-left">{s.club}</td>
                {COLS.map((c) => <td key={c.key}>{formatMeasurement(c.key, s.m[c.key])}</td>)}
                <td>{formatImpact(s.m.impactLateral, s.m.impactVertical)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
