import { dispersionStats, trajectoryCurve } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { COMPARE_A, COMPARE_B, COMPARE_C, COMPARE_D, DeliveryOverlay, DispersionPlot, patternXMax, TrajectoryPlot } from '@fsa/visualizations';
import type { Slot } from './compareState';

/** Each slot's colour on the diagrams; the page uses the same values for its slot cards and table. */
export const SLOT_COLORS: Record<Slot, string> = { A: COMPARE_A, B: COMPARE_B, C: COMPARE_C, D: COMPARE_D };

/** Every shot overlaid on the side view, the landing top view and the delivery top view, in slot order. */
export function CompareDiagrams({ shots }: { shots: { slot: Slot; shot: Shot }[] }) {
  // Each shot is keyed by its slot, not its id, so a shot compared with itself still draws twice.
  const slots = shots.map((s) => ({ slot: s.slot, color: SLOT_COLORS[s.slot], shot: { ...s.shot, id: s.slot } }));
  const curves = slots.map((s) => ({ ...s, curve: trajectoryCurve(s.shot) }));
  // One distance axis for every view, wide enough for the longest carry.
  const xMax = patternXMax(Math.max(...slots.map((s) => s.shot.m.carry ?? 0)));
  const noLanding = slots.filter((s) => s.shot.m.lateral === null || s.shot.m.carry === null);

  return (
    <div className="compare-diagrams">
      <section className="compare-diagram">
        <h2>Side view</h2>
        <TrajectoryPlot
          groups={curves.map((s) => ({ club: s.slot, color: s.color, curves: s.curve ? [s.curve] : [] }))}
          selectedId={null}
          xMax={xMax}
          allOn
          endLabels
        />
        {curves.filter((s) => s.curve === null).map((s) => (
          <p key={s.slot} className="compare-note">{`Shot ${s.slot} has no trajectory data`}</p>
        ))}
      </section>
      <section className="compare-diagram">
        <h2>Landing (top view)</h2>
        <DispersionPlot
          mode="carry"
          groups={slots.map((s) => ({ club: s.slot, color: s.color, stats: dispersionStats([s.shot], 'carry') }))}
          xMax={xMax}
          selectedId={null}
          highlightClub={null}
          allOn
          labelFor={(id) => `Shot ${id}`}
        />
        {noLanding.map((s) => (
          <p key={s.slot} className="compare-note">{`Shot ${s.slot} has no landing position`}</p>
        ))}
      </section>
      <section className="compare-diagram">
        <h2>Delivery (top view)</h2>
        <DeliveryOverlay
          shots={slots.map((s) => ({ id: s.slot, label: `Shot ${s.slot}`, color: s.color, clubPath: s.shot.m.clubPath, ftt: s.shot.m.ftt }))}
        />
      </section>
    </div>
  );
}
