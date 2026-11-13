import { useEffect, useMemo } from 'react';
import type { Handedness, Measurements } from '@fsa/domain';
import type { ReplayScene } from '@fsa/analytics';
import { ProvenanceTag } from '@fsa/ui';
import { annotations2D, badges2D, type Annotation } from './annotations';
import { camera2D } from './cameras';
import { ariaFor, projectLabels } from './ClubViews3D';
import { toThreeCamera } from './renderer';
import { VIEWS_2D, type View2D } from './types';
import { useClubRender } from './useClubRender';
import { ViewGallery, type GalleryView } from './ViewGallery';

export interface ClubViews2DProps {
  scene: ReplayScene;
  m: Measurements;
  club: string;
  handedness: Handedness;
  large: View2D;
  onSelect(v: View2D): void;
}

const META: Record<View2D, { name: string; hint: string }> = {
  ftt: { name: 'Face to target', hint: 'Face angle against the target line' },
  ftp: { name: 'Face to path', hint: 'Face angle against the club path' },
  loft: { name: 'Dynamic loft', hint: 'Loft, launch and attack from the side' },
  spinAxis: { name: 'Spin axis', hint: 'Axis tilt seen from behind the ball' },
};
const IMPACT = 0.63;
const NO_OTHERS: ReplayScene[] = [];

export function ClubViews2D({ scene, m, club, handedness, large, onSelect }: ClubViews2DProps) {
  const r = useClubRender({ scene, m, club, others: NO_OTHERS, headScale: 1, mode: '2d' });
  const anns = useMemo(() => Object.fromEntries(VIEWS_2D.map((v) => [v, annotations2D(v, m)])) as Record<View2D, Annotation[]>, [m]);
  const aspect = 1.6; // the gallery's 16:10 slots

  useEffect(() => {
    const { clubScene, renderer } = r;
    if (!clubScene || !renderer.current) return;
    clubScene.setProgress(IMPACT);
    for (const v of VIEWS_2D) {
      const canvas = r.canvases.current.get(v);
      if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) continue;
      clubScene.setAnnotations(anns[v], v);
      clubScene.setClubOpacity(v === 'spinAxis' ? 0.3 : 1);
      renderer.current.draw(canvas, clubScene.root, toThreeCamera(camera2D(v, m, handedness), canvas.clientWidth / canvas.clientHeight));
    }
  });

  const views: GalleryView<View2D>[] = VIEWS_2D.map((v) => {
    const badges = badges2D(v, m);
    const labels = v === large && r.webgl ? projectLabels(anns[v], toThreeCamera(camera2D(v, m, handedness), aspect)) : undefined;
    return { id: v, ...META[v], badges, ariaLabel: ariaFor(META[v].name, badges), labels };
  });

  return (
    <div className="club-views club-views--2d">
      <ViewGallery<View2D> label="2D club views" views={views} large={large} onSelect={onSelect} canvasRef={r.setCanvas} webgl={r.webgl} />
      <p className="club-views__prov"><ProvenanceTag kind="illustrative" /> <span>Club head is a generic shape for its club type</span></p>
    </div>
  );
}
