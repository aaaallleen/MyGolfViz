import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Measurements, Vec3 } from '@fsa/domain';
import { clubPhase, type ReplayScene } from '@fsa/analytics';
import { ProvenanceTag, SegmentedControl } from '@fsa/ui';
import { ReplayControls, useReplayClock } from '../ReplayControls';
import { Banner } from '../SceneChrome';
import { annotations3D, badges3D, type Annotation, type Badge } from './annotations';
import { camera3D } from './cameras';
import { cameraState, orbitKey } from './orbit';
import { frameCamera, toThreeCamera } from './renderer';
import { VIEWS_3D, type Mode3D, type View3D, type ViewCamera } from './types';
import { useClubRender } from './useClubRender';
import { Badges, StageLabels, ViewGallery, type GalleryLabel, type GalleryView } from './ViewGallery';

export interface ClubViews3DProps {
  scene: ReplayScene;
  m: Measurements;
  club: string;
  /** Other visible shots with the same club, for the "All shots" overlay. */
  others: ReplayScene[];
  large: View3D;
  onSelect(v: View3D): void;
  /** Four fixed measuring cameras, or one free 3D reconstruction you can drag. */
  mode: Mode3D;
  onMode(m: Mode3D): void;
}

const META: Record<View3D, { name: string; hint: string }> = {
  top: { name: 'Top', hint: 'Path, H-plane, face to path' },
  faceOn: { name: 'Face-on', hint: 'Attack angle, low point' },
  dtl: { name: 'Down the line', hint: 'Swing plane steepness' },
  overview: { name: '3/4 overview', hint: 'Everything in one picture' },
};
const PHASES = ['Downswing', 'Impact', 'Follow-through'];
const MODES: { value: Mode3D; label: string }[] = [{ value: 'views', label: 'Views' }, { value: 'reconstruction', label: '3D reconstruction' }];
const SLOT_ASPECT = 1.6; // the gallery's 16:10 stages
const RECON = 'reconstruction';
const FALLBACK_FRAME: Vec3[] = [[-0.6, -0.6, 0], [0.6, 0.6, 0.6]];

export const ariaFor = (name: string, badges: Badge[]) =>
  `${name}: ${badges.map((b) => `${b.label} ${b.text ?? 'not measured'}`).join(', ')}`;

/** The eight corners of an axis-aligned box. */
export function boxCorners(b: { min: Vec3; max: Vec3 }): Vec3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [0, 1, 2].map((i) => ((k >> i) & 1 ? b.max[i]! : b.min[i]!)) as Vec3);
}

/**
 * Points a measuring view must keep in frame: the arc, the ball, every wedge rim and, when given, the club head's
 * impact-pose box, so the whole head stays in frame for every shot, including a head that reaches below the ground.
 */
export function framePoints(scene: ReplayScene, list: Annotation[], head?: { min: Vec3; max: Vec3 }): Vec3[] {
  const pts: Vec3[] = scene.clubArc ? [...scene.clubArc, [0, 0, 0]] : [...FALLBACK_FRAME];
  if (head) pts.push(...boxCorners(head));
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

export function ClubViews3D({ scene, m, club, others, large, onSelect, mode, onMode }: ClubViews3DProps) {
  const clock = useReplayClock({ initial: 0.63 });
  const [showOthers, setShowOthers] = useState(false);
  const r = useClubRender({ scene, m, club, others, headScale: 3, mode: '3d' });
  const anns = useMemo(() => Object.fromEntries(VIEWS_3D.map((v) => [v, annotations3D(v, scene, m)])) as Record<View3D, Annotation[]>, [scene, m]);
  const camFor = (v: View3D, aspect: number): ViewCamera =>
    frameCamera(camera3D(v, scene, m), framePoints(scene, anns[v], r.clubScene?.headBounds), aspect);
  const reconRef = useCallback((el: HTMLCanvasElement | null) => r.setCanvas(RECON, el), [r.setCanvas]);

  // The 3D reconstruction's free camera: rebuilt (at the overview preset) when the shot, handedness, size or Reset changes.
  const orbit = useRef<{ key: string; cam: THREE.Camera; controls: OrbitControls } | null>(null);
  const [moved, setMoved] = useState(false); // rotated, zoomed or panned: Reset view has work to do
  const [orbitTick, setOrbitTick] = useState(0);
  const [resetTick, setResetTick] = useState(0);
  const dropOrbit = () => { orbit.current?.controls.dispose(); orbit.current = null; };
  useEffect(() => dropOrbit, []);

  useEffect(() => {
    const { clubScene, renderer } = r;
    if (!clubScene || !renderer.current) return;
    clubScene.setProgress(clock.progress);
    clubScene.setShowOthers(showOthers);
    if (mode === 'views') {
      if (orbit.current) { dropOrbit(); setMoved(false); }
      for (const v of VIEWS_3D) {
        const canvas = r.canvases.current.get(v);
        if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) continue;
        const aspect = canvas.clientWidth / canvas.clientHeight;
        clubScene.setAnnotations(anns[v], v);
        clubScene.setPlaneVisible(v === 'overview');
        renderer.current.draw(canvas, clubScene.root, toThreeCamera(camFor(v, aspect), aspect));
      }
      return;
    }
    const canvas = r.canvases.current.get(RECON);
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const key = orbitKey('overview', scene, canvas.clientWidth, canvas.clientHeight, resetTick);
    if (orbit.current?.key !== key || orbit.current.controls.domElement !== canvas) {
      dropOrbit();
      const preset = camera3D('overview', scene, m);
      const three = toThreeCamera(preset, aspect);
      const controls = new OrbitControls(three, canvas);
      controls.target.set(...preset.target);
      controls.enableDamping = false;
      controls.addEventListener('change', () => {
        setMoved(cameraState(three, controls.target, preset).moved);
        setOrbitTick((n) => n + 1);
      });
      controls.update();
      orbit.current = { key, cam: three, controls };
      setMoved(false);
      setOrbitTick((n) => n + 1);
    }
    clubScene.setAnnotations(anns.overview, 'overview');
    clubScene.setPlaneVisible(true);
    renderer.current.draw(canvas, clubScene.root, orbit.current.cam);
  });

  const allShots = (
    <label className="view-gallery__toggle">
      <input type="checkbox" checked={showOthers} disabled={others.length === 0}
        title={others.length === 0 ? 'No other shots with this club' : undefined}
        onChange={(e) => setShowOthers(e.target.checked)} />All shots
    </label>
  );
  const modeSwitch = <SegmentedControl<Mode3D> label="3D mode" options={MODES} value={mode} onChange={onMode} />;

  let content;
  if (mode === 'views') {
    const views: GalleryView<View3D>[] = VIEWS_3D.map((v) => {
      const badges = badges3D(v, m);
      const labels = v === large && r.webgl ? projectLabels(anns[v], toThreeCamera(camFor(v, SLOT_ASPECT), SLOT_ASPECT)) : undefined;
      return { id: v, ...META[v], badges, ariaLabel: ariaFor(META[v].name, badges), labels };
    });
    content = (
      <ViewGallery<View3D> label="3D club views" views={views} large={large} onSelect={onSelect}
        canvasRef={r.setCanvas} webgl={r.webgl} toolbar={<>{modeSwitch}{allShots}</>} />
    );
  } else {
    const badges = badges3D('overview', m);
    const labels = orbit.current && orbitTick >= 0 ? projectLabels(anns.overview, orbit.current.cam) : [];
    content = (
      <section className="view-gallery" aria-label="3D reconstruction">
        <div className="view-gallery__toolbar">
          {modeSwitch}{allShots}
          <button type="button" className="view-gallery__reset" disabled={!moved} onClick={() => setResetTick((n) => n + 1)}>Reset view</button>
        </div>
        <div className="view-gallery__large club-views__recon">
          <div className="view-gallery__stage">
            {r.webgl ? (
              <canvas ref={reconRef} role="img" aria-label={ariaFor('3D reconstruction', badges)} className="view-gallery__canvas" />
            ) : (
              <p className="view-gallery__fallback" role="img" aria-label={ariaFor('3D reconstruction', badges)}>
                This view needs WebGL, which this browser doesn't provide. The numbers are below.
              </p>
            )}
            {r.webgl && <StageLabels labels={labels} />}
          </div>
          <div className="view-gallery__caption">
            <h4 className="view-gallery__name">3D reconstruction</h4>
            <span className="view-gallery__hint">Drag to rotate · scroll or pinch to zoom</span>
          </div>
          <Badges badges={badges} />
        </div>
      </section>
    );
  }

  return (
    <div className="club-views club-views--3d">
      <Banner title="Illustrative reconstruction" copy="The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion." />
      {content}
      <ReplayControls clock={clock} phases={PHASES} active={clubPhase(clock.progress)} />
      {!scene.plane && (
        <p className="club-views__note">
          {m.swingH === null && m.swingV === null
            ? 'Club delivery not measured for this shot'
            : 'Swing arc not drawn: it needs both H-plane and V-plane'}
        </p>
      )}
      <p className="club-views__prov"><ProvenanceTag kind="illustrative" /> <span>Club head and ball drawn 3× life size so they read; angles are true in the Views cameras</span></p>
    </div>
  );
}
