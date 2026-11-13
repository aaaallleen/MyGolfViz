import type { ReplayScene } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { ClubViews3D } from '@fsa/visualizations';
import { useWorkingSet } from '../state/store';

export function Club3DTab({ shot, scene, others }: { shot: Shot; scene: ReplayScene; others: ReplayScene[] }) {
  const { clubView3D, setClubView3D } = useWorkingSet();
  return (
    <div className="club-3d">
      <ClubViews3D scene={scene} m={shot.m} club={shot.club} others={others} large={clubView3D} onSelect={setClubView3D} />
    </div>
  );
}
