import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { clubCategory, type Measurements, type Vec3 } from '@fsa/domain';
import { clubFrame, type ReplayScene } from '@fsa/analytics';
import type { Annotation } from './annotations';
import { buildClubModel } from './clubModel';
import { arcCenter, headPose } from './headPose';
import { CLUB, MUTED, PLANE } from './palette';
import { GRID } from '../theme';

export interface ClubSceneInput {
  scene: ReplayScene;
  m: Measurements;
  club: string;
  /** Same-club arcs for the "All shots" overlay. */
  others: ReplayScene[];
  /** Club head and ball size multiplier: 3 in the 3D tab, 1 in the 2D tab. Angles are unaffected. */
  headScale: number;
  /** '2d' hides the ground grid, arc, swing plane and other shots; the target line stays. */
  mode: '3d' | '2d';
  annotations: Annotation[];
}

export interface ClubScene {
  root: THREE.Scene;
  /** Moves the club along the arc (impact pose between 0.60 and 0.66). */
  setProgress(p: number): void;
  setShowOthers(on: boolean): void;
  setPlaneVisible(on: boolean): void;
  /** Shows these annotations. With a `key`, the layer is built on first use and reused after. */
  setAnnotations(a: Annotation[], key?: string): void;
  dispose(): void;
}

const BALL_RADIUS_YD = 0.84 / 36;
const SHAFT_YD = 1.0;
const GRIP_YD = 0.3;
const ANNOTATION_ORDER = 10;

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

/** A pixel-width line (LineMaterial resolution is set per draw by the renderer). */
export function fatLine(points: Vec3[], color: string, opts: { width?: number; dashed?: boolean; opacity?: number; dash?: number; overlay?: boolean } = {}): Line2 {
  const geo = new LineGeometry();
  geo.setPositions(points.flat());
  const dash = opts.dash ?? 0.08;
  const mat = new LineMaterial({
    color, linewidth: opts.width ?? 2, dashed: !!opts.dashed, dashSize: dash, gapSize: dash * 0.75,
    transparent: (opts.opacity ?? 1) < 1 || !!opts.overlay, opacity: opts.opacity ?? 1,
    depthTest: !opts.overlay,
  });
  const line = new Line2(geo, mat);
  if (opts.dashed) line.computeLineDistances();
  if (opts.overlay) line.renderOrder = ANNOTATION_ORDER;
  return line;
}

function wedgeMesh(w: Extract<Annotation, { kind: 'wedge' }>): THREE.Object3D {
  const from = v3(w.from).normalize(), to = v3(w.to).normalize();
  const angle = from.angleTo(to);
  const axis = new THREE.Vector3().crossVectors(from, to);
  const group = new THREE.Group();
  if (angle < 1e-4 || axis.lengthSq() < 1e-12) return group;
  axis.normalize();
  const SEG = 24;
  const rim: Vec3[] = [];
  for (let i = 0; i <= SEG; i++) {
    const p = from.clone().applyAxisAngle(axis, (angle * i) / SEG).multiplyScalar(w.radius).add(v3(w.origin));
    rim.push([p.x, p.y, p.z]);
  }
  const pos: number[] = [];
  for (let i = 0; i < SEG; i++) pos.push(...w.origin, ...rim[i]!, ...rim[i + 1]!);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: w.color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));
  fill.renderOrder = ANNOTATION_ORDER;
  group.add(fill);
  group.add(fatLine([w.origin, ...rim, w.origin], w.color, { width: 1.5, overlay: true }));
  return group;
}

function annotationObject(a: Annotation, dash: number): THREE.Object3D | null {
  if (a.kind === 'label') return null; // labels are HTML overlays positioned from `at`
  const o = a.kind === 'line'
    ? fatLine([a.a, a.b], a.color, { width: a.width ?? 2, dashed: a.dashed, dash, overlay: true })
    : wedgeMesh(a);
  o.name = a.id;
  return o;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export function buildClubScene(input: ClubSceneInput): ClubScene {
  const { scene, m, headScale, mode } = input;
  const is2D = mode === '2d';
  const dash = is2D ? 0.006 : 0.08;
  const root = new THREE.Scene();

  root.add(new THREE.HemisphereLight(0xffffff, 0x1b2420, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, -3, 5);
  root.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-3, 4, 2);
  root.add(fill);

  const ground = new THREE.GridHelper(6, 12, GRID, GRID);
  ground.rotation.x = Math.PI / 2; // GridHelper lies in XZ; the ground is XY
  ground.name = 'ground';
  ground.visible = !is2D;
  root.add(ground);

  const len = is2D ? 0.5 : 3;
  const target = fatLine([[0, -len, 0], [0, len, 0]], MUTED, { dashed: true, dash, width: 1.5 });
  target.name = 'target-line';
  root.add(target);

  const arcGroup = new THREE.Group();
  arcGroup.name = 'arc';
  arcGroup.visible = !is2D;
  if (scene.clubArc) {
    arcGroup.add(fatLine(scene.clubArc.slice(0, scene.impactIndex + 1), CLUB, { width: 3.5 }));
    arcGroup.add(fatLine(scene.clubArc.slice(scene.impactIndex), CLUB, { width: 2.5, opacity: 0.45 }));
  }
  root.add(arcGroup);

  const others = new THREE.Group();
  others.name = 'others';
  others.visible = false;
  for (const o of input.others) if (o.clubArc) others.add(fatLine(o.clubArc, CLUB, { width: 1.5, opacity: 0.3 }));
  root.add(others);

  const plane = new THREE.Group();
  plane.name = 'swing-plane';
  plane.visible = false;
  if (scene.plane) {
    const { u, w } = scene.plane;
    const c = [v3(u).multiplyScalar(-1.6), v3(u).multiplyScalar(1.6), v3(u).multiplyScalar(1.6).add(v3(w).multiplyScalar(2)), v3(u).multiplyScalar(-1.6).add(v3(w).multiplyScalar(2))];
    const geo = new THREE.BufferGeometry().setFromPoints([c[0]!, c[1]!, c[2]!, c[0]!, c[2]!, c[3]!]);
    plane.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PLANE, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })));
    plane.add(fatLine([...c, c[0]!].map((p) => [p.x, p.y, p.z] as Vec3), PLANE, { width: 1.5, opacity: 0.6 }));
  }
  root.add(plane);

  // Club: pivot at the arc centre so the club swings around it; at impact the pivot is identity.
  const pose = headPose(m, scene);
  const g = scene.handedness === 'right' ? 1 : -1;
  const centre = scene.clubArc ? v3(arcCenter(scene.clubArc)) : new THREE.Vector3();
  const pivot = new THREE.Group();
  pivot.name = 'club-pivot';
  pivot.position.copy(centre);
  const club = new THREE.Group();
  club.name = 'club';
  club.position.copy(centre).multiplyScalar(-1);
  pivot.add(club);

  const ballR = BALL_RADIUS_YD * headScale;
  const head = buildClubModel(clubCategory(input.club), scene.handedness);
  const holder = new THREE.Group();
  const xAxis = v3(pose.toeDir).multiplyScalar(g);
  const yAxis = v3(pose.faceNormal);
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  holder.scale.setScalar(headScale);
  holder.position.copy(yAxis).multiplyScalar(-ballR); // face touches the back of the ball
  holder.add(head);
  club.add(holder);
  // Sit the sole on the ground: lift the head so its lowest point is at z = 0.
  holder.updateMatrixWorld(true);
  const bottom = new THREE.Box3().setFromObject(head.getObjectByName('club-head')!).min.z;
  holder.position.z -= bottom;

  holder.updateMatrix();
  head.updateMatrix();
  const hoselTop = (head.userData.hoselTop as THREE.Vector3).clone().applyMatrix4(head.matrix).applyMatrix4(holder.matrix);
  const shaftDir = v3(pose.shaftDir);
  const shaftR = 0.0045 * Math.max(1, headScale * 0.6);
  const segment = (from: THREE.Vector3, length: number, radius: number, color: string, name: string) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 }));
    mesh.name = name;
    mesh.position.copy(from).addScaledVector(shaftDir, length / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftDir);
    club.add(mesh);
  };
  segment(hoselTop, SHAFT_YD - GRIP_YD, shaftR, '#AEB7BF', 'club-shaft');
  segment(hoselTop.clone().addScaledVector(shaftDir, SHAFT_YD - GRIP_YD), GRIP_YD, shaftR * 1.6, '#15191C', 'club-grip');
  root.add(pivot);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 32, 20), new THREE.MeshStandardMaterial({ color: '#F4F6F5', roughness: 0.55 }));
  ball.name = 'ball';
  ball.position.z = ballR; // resting on the ground
  root.add(ball);

  const annotations = new THREE.Group();
  annotations.name = 'annotations';
  root.add(annotations);
  // Each key's layer is built once and then only shown or hidden, so swapping views per frame is cheap.
  const setAnnotations = (list: Annotation[], key?: string) => {
    const name = `layer:${key ?? ''}`;
    let layer = key === undefined ? undefined : annotations.getObjectByName(name);
    if (!layer) {
      if (key === undefined) {
        const old = annotations.getObjectByName(name);
        if (old) { annotations.remove(old); disposeTree(old); }
      }
      layer = new THREE.Group();
      layer.name = name;
      for (const a of list) { const o = annotationObject(a, dash); if (o) layer.add(o); }
      annotations.add(layer);
    }
    for (const c of annotations.children) c.visible = c === layer;
  };
  setAnnotations(input.annotations);

  const impact = new THREE.Vector3(0, 0, 0).sub(centre).normalize();
  return {
    root,
    setProgress(p) {
      const at = clubFrame(scene, p);
      if (!at || !scene.clubArc) { pivot.quaternion.identity(); return; }
      const now = v3(at).sub(centre).normalize();
      pivot.quaternion.setFromUnitVectors(impact, now);
    },
    setShowOthers(on) { others.visible = on && !is2D; },
    setPlaneVisible(on) { plane.visible = on && !is2D; },
    setAnnotations,
    dispose() { disposeTree(root); },
  };
}
