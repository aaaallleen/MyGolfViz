import { useState } from 'react';
import { summarize } from '@fsa/analytics';
import { clubCategory, formatImpact, formatMeasurement, NOT_MEASURED, type ClubCategory, type Handedness, type Shot } from '@fsa/domain';
import { FaceImpactDiagram } from '@fsa/visualizations';
import { ValueTag } from './ValueTag';

const NAME: Record<ClubCategory, string> = { driver: 'Driver', wood: 'Wood/hybrid', iron: 'Iron' };
const hasImpact = (s: Shot) => s.m.impactLateral !== null && s.m.impactVertical !== null;

export function ImpactTab({ shot, visibleShots, handedness }: { shot: Shot; visibleShots: readonly Shot[]; handedness: Handedness }) {
  const [showOthers, setShowOthers] = useState(true);
  const category = clubCategory(shot.club);
  const sameClub = visibleShots.filter((s) => s.club === shot.club);
  const measured = sameClub.filter(hasImpact);
  const others = measured.filter((s) => s.id !== shot.id).map((s) => ({ x: s.m.impactLateral!, y: s.m.impactVertical! }));
  const selected = hasImpact(shot) ? { x: shot.m.impactLateral!, y: shot.m.impactVertical! } : null;

  const lat = summarize(measured.map((s) => s.m.impactLateral));
  const vert = summarize(measured.map((s) => s.m.impactVertical));
  const average = lat.mean === null || vert.mean === null ? NOT_MEASURED : formatImpact(lat.mean, vert.mean);
  const spread = lat.sd === null || vert.sd === null ? NOT_MEASURED
    : `± ${lat.sd.toFixed(2)} · ± ${vert.sd.toFixed(2)} in`;

  return (
    <div className="impact-tab">
      <div className="panel impact-tab__main">
        <div className="panel__head">
          <h2>{`Face impact · ${NAME[category]} face`}</h2>
          <label className="show-toggles__opt">
            <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />Show session impacts
          </label>
        </div>
        <FaceImpactDiagram category={category} handedness={handedness} selected={selected} others={others} showOthers={showOthers} />
        {selected === null ? (
          <div className="impact-tab__missing">
            <strong>Impact not measured for this shot</strong>
            <p className="panel__note">{`CSV row ${shot.sourceRow} has no impact values. No marker is drawn and nothing is estimated.`}</p>
          </div>
        ) : (
          <dl className="stat-list">
            <div><dt>Lateral impact</dt>{' '}<dd>{formatMeasurement('impactLateral', shot.m.impactLateral)}</dd></div>
            <div><dt>Vertical impact</dt>{' '}<dd>{formatMeasurement('impactVertical', shot.m.impactVertical)}</dd></div>
          </dl>
        )}
      </div>
      <div className="panel impact-tab__side">
        <h2>{`Session pattern · ${shot.club}`}</h2>
        <dl className="stat-list stat-list--stack">
          <div><dt>Shots with impact data</dt>{' '}<dd>{`${measured.length} of ${sameClub.length}`}</dd></div>
          <div><dt>Average strike <ValueTag kind="derived" /></dt>{' '}<dd>{average}</dd></div>
          <div><dt>Spread <ValueTag kind="derived" /></dt>{' '}<dd>{spread}</dd></div>
        </dl>
        <p className="panel__note">
          Impact was measured on {measured.length} of {sameClub.length} {shot.club} shots in the current view. A shot without it shows only the session impacts, with no marker for that shot.
        </p>
      </div>
    </div>
  );
}
