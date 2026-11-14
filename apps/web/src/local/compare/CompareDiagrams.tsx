import { dispersionStats, trajectoryCurve } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { COMPARE_A, COMPARE_B, DeliveryOverlay, DispersionPlot, patternXMax, TrajectoryPlot } from '@fsa/visualizations';

/** Both shots overlaid on the side view, the landing top view and the delivery top view. */
export function CompareDiagrams({ a, b }: { a: Shot; b: Shot }) {
  // Each shot is keyed by its slot, not its id, so a shot compared with itself still draws twice.
  const slots = [
    { slot: 'A', color: COMPARE_A, shot: { ...a, id: 'A' } },
    { slot: 'B', color: COMPARE_B, shot: { ...b, id: 'B' } },
  ] as const;
  const curves = slots.map((s) => ({ ...s, curve: trajectoryCurve(s.shot) }));
  // One distance axis for both views, wide enough for the longer carry.
  const xMax = patternXMax(Math.max(a.m.carry ?? 0, b.m.carry ?? 0));
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
