import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Measurements, Vec3 } from '@fsa/domain';
import { clubPhase, type ReplayScene } from '@fsa/analytics';
import { ProvenanceTag } from '@fsa/ui';
import { ReplayControls, useReplayClock } from '../ReplayControls';
import { Banner } from '../SceneChrome';
import { annotations3D, badges3D, type Annotation, type Badge } from './annotations';
import { camera3D, screenBasis } from './cameras';
import { frameCamera, toThreeCamera } from './renderer';
import { VIEWS_3D, type View3D, type ViewCamera } from './types';
import { useClubRender } from './useClubRender';
import { ViewGallery, type GalleryLabel, type GalleryView } from './ViewGallery';

export interface ClubViews3DProps {
  scene: ReplayScene;
  m: Measurements;
  club: string;
  /** Other visible shots with the same club, for the "All shots" overlay. */
  others: ReplayScene[];
  large: View3D;
  onSelect(v: View3D): void;
}

const META: Record<View3D, { name: string; hint: string }> = {
  top: { name: 'Top', hint: 'Path, H-plane, face to path' },
  faceOn: { name: 'Face-on', hint: 'Attack angle, low point' },
  dtl: { name: 'Down the line', hint: 'Swing plane steepness' },
  overview: { name: '3/4 overview', hint: 'Everything in one picture' },
};
const PHASES = ['Downswing', 'Impact', 'Follow-through'];
const OFF_PRESET_DEG = 0.5;
const OFF_PRESET_NOTE = 'rotate back to read true';
const FALLBACK_FRAME: Vec3[] = [[-0.6, -0.6, 0], [0.6, 0.6, 0.6]];

export const ariaFor = (name: string, badges: Badge[]) =>
  `${name}: ${badges.map((b) => `${b.label} ${b.text ?? 'not measured'}`).join(', ')}`;

/** Points a measuring view must keep in frame: the arc, the ball and every wedge rim. */
function framePoints(scene: ReplayScene, list: Annotation[]): Vec3[] {
  const pts: Vec3[] = scene.clubArc ? [...scene.clubArc, [0, 0, 0]] : [...FALLBACK_FRAME];
  for (const a of list) {
    if (a.kind === 'wedge') for (const d of [a.from, a.to]) {
      const l = Math.hypot(...d) || 1;
      pts.push([a.origin[0] + (d[0] / l) * a.radius * 1.3, a.origin[1] + (d[1] / l) * a.radius * 1.3, a.origin[2] + (d[2] / l) * a.radius * 1.3]);
    }
    if (a.kind === 'label') pts.push(a.at);
  }
  return pts;
}

export function projectLabels(list: Annotation[], cam: THREE.Camera): GalleryLabel[] {
  return list.flatMap((a) => {
    if (a.kind !== 'label') return [];
    const p = new THREE.Vector3(...a.at).project(cam);
    return [{ id: a.id, text: a.text, color: a.color, x: (p.x + 1) / 2, y: (1 - p.y) / 2 }];
  });
}

export function ClubViews3D({ scene, m, club, others, large, onSelect }: ClubViews3DProps) {
  const clock = useReplayClock({ initial: 0.63 });
  const [showOthers, setShowOthers] = useState(false);
  const r = useClubRender({ scene, m, club, others, headScale: 3, mode: '3d' });
  const anns = useMemo(() => Object.fromEntries(VIEWS_3D.map((v) => [v, annotations3D(v, scene, m)])) as Record<View3D, Annotation[]>, [scene, m]);
  const camFor = (v: View3D, aspect: number): ViewCamera => frameCamera(camera3D(v, scene, m), framePoints(scene, anns[v]), aspect);

  // Orbit state for the large view: its camera, preset and controls are rebuilt when the view, shot or size changes.
  const orbit = useRef<{ key: string; cam: THREE.Camera; preset: ViewCamera; controls: OrbitControls } | null>(null);
  const [offPreset, setOffPreset] = useState(false);
  const [orbitTick, setOrbitTick] = useState(0);
  const [resetTick, setResetTick] = useState(0);
  useEffect(() => () => { orbit.current?.controls.dispose(); orbit.current = null; }, []);

  useEffect(() => {
    const { clubScene, renderer } = r;
    if (!clubScene || !renderer.current) return;
    clubScene.setProgress(clock.progress);
    clubScene.setShowOthers(showOthers);
    for (const v of VIEWS_3D) {
      const canvas = r.canvases.current.get(v);
      if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) continue;
      const aspect = canvas.clientWidth / canvas.clientHeight;
      let cam: THREE.Camera;
      if (v === large) {
        const key = `${v}|${scene.shotId}|${canvas.clientWidth}x${canvas.clientHeight}|${resetTick}`;
        if (orbit.current?.key !== key || orbit.current.controls.domElement !== canvas) {
          orbit.current?.controls.dispose();
          const preset = camFor(v, aspect);
          const three = toThreeCamera(preset, aspect);
          const controls = new OrbitControls(three, canvas);
          controls.target.set(...preset.target);
          controls.enableDamping = false;
          controls.addEventListener('change', () => {
            const fwd = three.getWorldDirection(new THREE.Vector3());
            const want = new THREE.Vector3(...screenBasis(preset).forward);
            const off = (fwd.angleTo(want) * 180) / Math.PI > OFF_PRESET_DEG;
            setOffPreset(off);
            setOrbitTick((n) => n + 1);
          });
          controls.update();
          orbit.current = { key, cam: three, preset, controls };
          setOffPreset(false);
          setOrbitTick((n) => n + 1);
        }
        cam = orbit.current.cam;
      } else {
        cam = toThreeCamera(camFor(v, aspect), aspect);
      }
      clubScene.setAnnotations(anns[v], v);
      clubScene.setPlaneVisible(v === 'overview');
      renderer.current.draw(canvas, clubScene.root, cam);
    }
  });

  const views: GalleryView<View3D>[] = VIEWS_3D.map((v) => {
    const badges = badges3D(v, m).map((b) => (v === large && offPreset && v !== 'overview' ? { ...b, note: OFF_PRESET_NOTE } : b));
    const labels = v === large && orbit.current && orbitTick >= 0 ? projectLabels(anns[v], orbit.current.cam) : undefined;
    return { id: v, ...META[v], badges, ariaLabel: ariaFor(META[v].name, badges3D(v, m)), labels };
  });

  const toolbar = (
    <>
      <label className="view-gallery__toggle">
        <input type="checkbox" checked={showOthers} disabled={others.length === 0}
          title={others.length === 0 ? 'No other shots with this club' : undefined}
          onChange={(e) => setShowOthers(e.target.checked)} />All shots
      </label>
      <button type="button" className="view-gallery__reset" disabled={!offPreset} onClick={() => setResetTick((n) => n + 1)}>Reset view</button>
    </>
  );

  return (
    <div className="club-views club-views--3d">
      <Banner title="Illustrative reconstruction" copy="The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion." />
      <ViewGallery<View3D> label="3D club views" views={views} large={large} onSelect={onSelect}
        canvasRef={r.setCanvas} webgl={r.webgl} toolbar={toolbar}
        largeOverlay={offPreset && large !== 'overview' ? <p className="view-gallery__note">Rotated off the preset: Reset view to read angles true</p> : null} />
      <ReplayControls clock={clock} phases={PHASES} active={clubPhase(clock.progress)} />
      {!scene.plane && <p className="club-views__note">Club delivery not measured for this shot</p>}
      <p className="club-views__prov"><ProvenanceTag kind="illustrative" /> <span>Club head drawn 3× life size so it reads; angles are true</span></p>
    </div>
  );
}
