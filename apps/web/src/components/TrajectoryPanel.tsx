import { trajectoryCurve, type TrajectoryCurve } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { TrajectoryPlot } from '@fsa/visualizations';

export function TrajectoryPanel({ shots, selectedId }: { shots: readonly Shot[]; selectedId: string | null }) {
  const curves = shots.map(trajectoryCurve).filter((c): c is TrajectoryCurve => c !== null);
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Trajectory · side view</h2>
        <span className="panel__note">{`n ${curves.length} of ${shots.length} shots`}</span>
      </div>
      <TrajectoryPlot curves={curves} selectedId={selectedId} />
    </div>
  );
}
