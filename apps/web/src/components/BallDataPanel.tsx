import type { ReplayScene } from '@fsa/analytics';
import { formatMeasurement, NOT_MEASURED, type MeasurementKey, type Shot } from '@fsa/domain';
import { BallFlight3D, SpinBallDiagram } from '@fsa/visualizations';
import { ValueTag } from './ValueTag';

const LAUNCH: { key: MeasurementKey; label: string }[] = [
  { key: 'ballSpeed', label: 'Ball speed' },
  { key: 'launchV', label: 'Launch V' },
  { key: 'launchH', label: 'Launch H' },
];
const FLIGHT: { key: MeasurementKey; label: string }[] = [
  { key: 'carry', label: 'Carry' },
  { key: 'total', label: 'Total' },
  { key: 'height', label: 'Apex height' },
  { key: 'lateral', label: 'Lateral' },
  { key: 'descentV', label: 'Descent angle' },
  { key: 'curve', label: 'Curve' },
  { key: 'flightTime', label: 'Flight time' },
];

function Readouts({ title, items, shot }: { title: string; items: { key: MeasurementKey; label: string }[]; shot: Shot }) {
  return (
    <div role="group" aria-label={title} className="readouts">
      <h3>{title}</h3>
      <dl>
        {items.map(({ key, label }) => {
          const v = shot.m[key];
          return (
            <div key={key}>
              <dt>{label}</dt>{' '}
              {v === null ? <dd className="is-missing">{NOT_MEASURED}</dd> : <dd>{formatMeasurement(key, v)}{' '}<ValueTag kind="measured" /></dd>}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function BallDataPanel({ shot, scene, others }: { shot: Shot; scene: ReplayScene; others: ReplayScene[] }) {
  return (
    <section className="ball-data" aria-labelledby="ball-data-label">
      <div className="section-label section-label--ball" id="ball-data-label"><span className="section-label__dot" />Ball data</div>
      <div className="ball-data__grid">
        <BallFlight3D selected={scene} others={others} />
        <div className="panel"><SpinBallDiagram spin={shot.m.spin} spinAxis={shot.m.spinAxis} /></div>
      </div>
      <div className="ball-data__readouts">
        <Readouts title="Launch" items={LAUNCH} shot={shot} />
        <Readouts title="Flight" items={FLIGHT} shot={shot} />
      </div>
    </section>
  );
}
