import { useState } from 'react';
import type { ReplayScene } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { ClubReplay3D, HorizontalDeliveryDiagram, VerticalDeliveryDiagram } from '@fsa/visualizations';
import { ShowToggles } from './ShowToggles';

const OPTIONS = [
  { key: 'top', label: 'Top view' },
  { key: 'aoa', label: 'AoA' },
  { key: 'vPlane', label: 'V-plane' },
  { key: 'side', label: 'Side view' },
] as const;
type Key = (typeof OPTIONS)[number]['key'];

export function Club3DTab({ shot, scene }: { shot: Shot; scene: ReplayScene }) {
  const [show, setShow] = useState<Record<Key, boolean>>({ top: true, aoa: true, vPlane: true, side: true });
  const m = shot.m;
  return (
    <div className="club-3d">
      <ShowToggles options={[...OPTIONS]} value={show} onChange={(k, on) => setShow((s) => ({ ...s, [k]: on }))} />
      <ClubReplay3D scene={scene} aoa={m.aoa} vPlane={m.swingV} show={{ vPlane: show.vPlane, aoa: show.aoa }} />
      {(show.top || show.side) && (
        <div className="club-3d__diagrams">
          {show.top && (
            <div className="panel">
              <HorizontalDeliveryDiagram clubPath={m.clubPath} faceToTarget={m.ftt} faceToPath={m.ftp} launchH={m.launchH} exaggerate={4} />
            </div>
          )}
          {show.side && (
            <div className="panel">
              <VerticalDeliveryDiagram title="Side view · everything" aoa={m.aoa} dynamicLoft={m.dynamicLoft} launchV={m.launchV}
                spinLoft={m.spinLoft} exaggerate={2} lowPoint={m.lowPoint} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
