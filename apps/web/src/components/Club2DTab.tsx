import { summarize, type ReplayScene } from '@fsa/analytics';
import { FIELD_DEFS, formatMeasurement, type Handedness, type MeasurementKey, type Shot } from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { ClubViews2D } from '@fsa/visualizations/club3d';
import { useWorkingSet } from '../state/store';

const ANGLES: { key: MeasurementKey; label: string }[] = [
  { key: 'dynamicLoft', label: 'Dynamic loft' },
  { key: 'launchV', label: 'Launch' },
  { key: 'aoa', label: 'Attack angle' },
];
const CLUB_KEYS = FIELD_DEFS.filter((d) => d.group === 'club').map((d) => d.key);

export function Club2DTab({ shot, scene, visibleShots, handedness }: {
  shot: Shot; scene: ReplayScene; visibleShots: readonly Shot[]; handedness: Handedness;
}) {
  const { clubView2D, setClubView2D } = useWorkingSet();
  const m = shot.m;

  const sameClub = visibleShots.filter((s) => s.club === shot.club);
  const withClubData = sameClub.filter((s) => CLUB_KEYS.some((k) => s.m[k] !== null));

  return (
    <div className="club-2d">
      <ClubViews2D scene={scene} m={m} club={shot.club} handedness={handedness} large={clubView2D} onSelect={setClubView2D} />
      <div className="club-2d__angles">
        <div className="panel">
          <h3>Measured angles</h3>
          <dl className="stat-list">
            {ANGLES.map(({ key, label }) => <div key={key}><dt>{label}</dt>{' '}<dd className={m[key] === null ? 'is-missing' : undefined}>{m[key] === null ? <Missing /> : formatMeasurement(key, m[key])}</dd></div>)}
          </dl>
        </div>
        <div className="panel">
          <h3>Against session average</h3>
          <dl className="stat-list">
            {ANGLES.map(({ key, label }) => {
              const mean = summarize(sameClub.map((s) => s.m[key])).mean;
              const v = m[key];
              return (
                <div key={key}>
                  <dt>{label}</dt>{' '}
                  <dd className={v === null ? 'is-missing' : undefined}>
                    {v === null ? <Missing /> : formatMeasurement(key, v)}
                    <span className="stat-list__delta">{` vs ${mean === null ? `no ${shot.club} average` : formatMeasurement(key, mean)}`}</span>
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
