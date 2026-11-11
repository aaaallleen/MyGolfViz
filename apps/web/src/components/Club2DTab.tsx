import { useState } from 'react';
import { summarize } from '@fsa/analytics';
import { FIELD_DEFS, formatMeasurement, NOT_MEASURED, type MeasurementKey, type Shot } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';
import { HorizontalDeliveryDiagram, SpinAxisDiagram, VerticalDeliveryDiagram } from '@fsa/visualizations';
import { ShowToggles } from './ShowToggles';

const OPTIONS = [
  { key: 'ftt', label: 'Face to target' },
  { key: 'ftp', label: 'Face to path' },
  { key: 'loft', label: 'Dynamic loft' },
  { key: 'spin', label: 'Spin axis' },
] as const;
type Key = (typeof OPTIONS)[number]['key'];
type Pane = 'top' | 'side' | 'spin';

const ANGLES: { key: MeasurementKey; label: string }[] = [
  { key: 'dynamicLoft', label: 'Dynamic loft' },
  { key: 'launchV', label: 'Launch' },
  { key: 'aoa', label: 'Attack angle' },
];
const CLUB_KEYS = FIELD_DEFS.filter((d) => d.group === 'club').map((d) => d.key);

export function Club2DTab({ shot, visibleShots }: { shot: Shot; visibleShots: readonly Shot[] }) {
  const [show, setShow] = useState<Record<Key, boolean>>({ ftt: true, ftp: true, loft: true, spin: true });
  const [scale, setScale] = useState<'true' | 'x2'>('true');
  const [pane, setPane] = useState<Pane>('top');
  const m = shot.m;

  const panes: { value: Pane; label: string }[] = [
    { value: 'top', label: 'Top view' },
    { value: 'side', label: 'Side view' },
    ...(show.spin ? [{ value: 'spin' as const, label: 'Spin axis' }] : []),
  ];
  const activePane = panes.some((p) => p.value === pane) ? pane : 'top';
  const cls = (p: Pane, base: string) => `panel ${base}${p === activePane ? '' : ' is-hidden-phone'}`;

  const sameClub = visibleShots.filter((s) => s.club === shot.club);
  const withClubData = sameClub.filter((s) => CLUB_KEYS.some((k) => s.m[k] !== null));

  return (
    <div className="club-2d">
      <ShowToggles options={[...OPTIONS]} value={show} onChange={(k, on) => setShow((s) => ({ ...s, [k]: on }))} />
      <div className="phone-only">
        <SegmentedControl<Pane> label="Diagram" options={panes} value={activePane} onChange={setPane} />
      </div>
      <div className="club-2d__diagrams">
        <div className={cls('top', 'delivery-top')}>
          <HorizontalDeliveryDiagram title="Impact geometry · top view" clubPath={m.clubPath} faceToTarget={m.ftt} faceToPath={m.ftp}
            launchH={m.launchH} exaggerate={4} layers={{ faceToTarget: show.ftt, faceToPath: show.ftp }} />
        </div>
        <div className={cls('side', 'delivery-side')}>
          <SegmentedControl<'true' | 'x2'> label="Scale" value={scale} onChange={setScale}
            options={[{ value: 'true', label: 'True scale' }, { value: 'x2', label: 'Exaggerated ×2' }]} />
          <VerticalDeliveryDiagram aoa={m.aoa} dynamicLoft={m.dynamicLoft} launchV={m.launchV} spinLoft={m.spinLoft}
            exaggerate={scale === 'true' ? 1 : 2} layers={{ dynamicLoft: show.loft }} />
        </div>
        {show.spin && (
          <div className={cls('spin', 'delivery-spin')}>
            <h3>Spin axis</h3>
            <SpinAxisDiagram spinAxis={m.spinAxis} />
          </div>
        )}
      </div>
      <div className="club-2d__angles">
        <div className="panel">
          <h3>Measured angles</h3>
          <dl className="stat-list">
            {ANGLES.map(({ key, label }) => <div key={key}><dt>{label}</dt>{' '}<dd className={m[key] === null ? 'is-missing' : undefined}>{formatMeasurement(key, m[key])}</dd></div>)}
          </dl>
        </div>
        <div className="panel">
          <h3>Against session average</h3>
          <dl className="stat-list">
            {ANGLES.map(({ key, label }) => {
              const mean = summarize(sameClub.map((s) => s.m[key])).mean;
              const v = m[key];
              const delta = v === null || mean === null ? null : v - mean;
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd className={mean === null ? 'is-missing' : undefined}>
                    {mean === null ? NOT_MEASURED : formatMeasurement(key, mean)}
                    {delta !== null && <span className="stat-list__delta">{` (${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}° vs this shot)`}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="panel__note">{`${shot.club} averages from ${withClubData.length} of ${sameClub.length} shots that have club data.`}</p>
        </div>
      </div>
    </div>
  );
}
