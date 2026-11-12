import { spinComponents } from '@fsa/analytics';
import { FIELD_DEFS, formatMeasurement, NOT_MEASURED, type FieldGroup, type QualityFlag, type Shot } from '@fsa/domain';
import { ValueTag } from './ValueTag';

const GROUPS: { group: FieldGroup; title: string }[] = [
  { group: 'ball', title: 'Ball' },
  { group: 'club', title: 'Club' },
  { group: 'impact', title: 'Impact' },
  { group: 'environment', title: 'Environment' },
];
const FLAG_COPY: Record<QualityFlag, string> = {
  no_measurements: 'This row has no measurements.',
  check_face_to_path: 'Face to path does not match face to target minus club path. Check the values in the CSV.',
  check_smash: 'Smash factor does not match ball speed divided by club speed. Check the values in the CSV.',
};

function Item({ label, value, kind }: { label: string; value: string | null; kind?: 'derived' }) {
  return (
    <div>
      <dt>{label}</dt>{' '}
      {value === null
        ? <dd className="is-missing">{NOT_MEASURED}{' '}<ValueTag kind="unavailable" /></dd>
        : <dd>{value}{' '}<ValueTag kind={kind ?? 'measured'} /></dd>}
    </div>
  );
}

export function AllMeasurements({ shot }: { shot: Shot }) {
  const available = FIELD_DEFS.filter((d) => shot.m[d.key] !== null).length;
  const onlyEnvironment = FIELD_DEFS.filter((d) => d.group !== 'environment').every((d) => shot.m[d.key] === null);
  const { backspin, sidespin } = spinComponents(shot.m.spin, shot.m.spinAxis);
  const side = sidespin === null ? null : `${formatMeasurement('spin', Math.abs(sidespin))}${sidespin > 0.5 ? ' R' : sidespin < -0.5 ? ' L' : ''}`;
  return (
    <details className="panel all-measurements">
      <summary>{`All measurements · ${available} of ${FIELD_DEFS.length} available`}</summary>
      {onlyEnvironment && <p className="panel__note">No ball or club measurements in this row.</p>}
      {GROUPS.map(({ group, title }) => (
        <div key={group} className="all-measurements__group">
          <h3>{title}</h3>
          <dl>
            {FIELD_DEFS.filter((d) => d.group === group).map((d) => (
              <Item key={d.key} label={d.label} value={shot.m[d.key] === null ? null : formatMeasurement(d.key, shot.m[d.key])} />
            ))}
            {group === 'ball' && (
              <>
                <Item label="Backspin ≈" kind="derived" value={backspin === null ? null : formatMeasurement('spin', backspin)} />
                <Item label="Sidespin ≈" kind="derived" value={side} />
              </>
            )}
          </dl>
        </div>
      ))}
      <div className="all-measurements__group">
        <h3>Shot</h3>
        <dl>
          <Item label="Shot type" value={shot.shotType} />
          <Item label="Mode" value={shot.mode} />
          <Item label="Location" value={shot.location} />
        </dl>
      </div>
      {shot.flags.filter((f) => f !== 'no_measurements').length > 0 && (
        <ul className="all-measurements__flags" aria-label="Quality notes">
          {shot.flags.filter((f) => f !== 'no_measurements').map((f) => <li key={f}>{FLAG_COPY[f]}</li>)}
        </ul>
      )}
    </details>
  );
}
