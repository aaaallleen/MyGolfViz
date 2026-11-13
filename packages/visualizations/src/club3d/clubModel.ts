import * as THREE from 'three';
import type { ClubCategory, Handedness } from '@fsa/domain';
import { FACE_OUTLINES } from '../faceOutlines';
import { parseOutline } from './headPose';

const IN = 1 / 36; // yards per inch
/** Front-to-back depth of the head, inches. */
const DEPTH_IN: Record<ClubCategory, number> = { driver: 4.2, wood: 3.0, hybrid: 2.3, iron: 0.6 };
const HEAD_COLOR = '#4A525B';
const FACE_COLOR = '#8A939C';
const HOSEL_COLOR = '#2B3036';

/**
 * Club head at true size in yards. Local frame: origin at the face centre, face normal +y,
 * toe +x (−x when left-handed), up +z. `userData.hoselTop` is the local point the shaft starts from.
 */
export function buildClubModel(category: ClubCategory, handedness: Handedness): THREE.Group {
  const o = FACE_OUTLINES[category];
  const k = (o.widthIn / o.frameWidth) * IN; // frame units to yards
  // Frame coords are face-on for a right-hander (toe on the left, y down): local x = toe, local z = up.
  const toLocal = ([fx, fy]: [number, number]) => new THREE.Vector2((o.centre.x - fx) * k, (o.centre.y - fy) * k);

  const shape = new THREE.Shape();
  for (const seg of parseOutline(o.d)) {
    const p = seg.pts.map(toLocal);
    if (seg.op === 'M') shape.moveTo(p[0]!.x, p[0]!.y);
    else if (seg.op === 'L') shape.lineTo(p[0]!.x, p[0]!.y);
    else if (seg.op === 'C') shape.bezierCurveTo(p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y, p[2]!.x, p[2]!.y);
    else shape.closePath();
  }
  const depth = DEPTH_IN[category] * IN;
  const bevel = Math.min(depth * 0.35, 0.12 * IN);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24,
  });
  geo.rotateX(Math.PI / 2); // shape y → up (+z), extrusion → back of the head (−y)
  geo.translate(0, -bevel, 0); // face surface at y = 0

  const model = new THREE.Group();
  model.name = 'club-head-model';
  const head = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: HEAD_COLOR, metalness: 0.35, roughness: 0.4 }));
  head.name = 'club-head';
  model.add(head);

  // A lighter face plate, just proud of the face, so the face reads in every view.
  const faceGeo = new THREE.ShapeGeometry(shape, 24);
  faceGeo.rotateX(Math.PI / 2);
  faceGeo.rotateZ(Math.PI); // ShapeGeometry faces +z before rotation; turn it to face +y
  faceGeo.scale(-1, 1, 1);
  faceGeo.translate(0, 0.002 * IN, 0);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: FACE_COLOR, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide }));
  face.name = 'club-face';
  model.add(face);

  if (o.grooves) {
    const pts: THREE.Vector3[] = [];
    for (const y of o.grooves.ys) {
      const a = toLocal([o.grooves.x1, y]), b = toLocal([o.grooves.x2, y]);
      pts.push(new THREE.Vector3(a.x, 0.004 * IN, a.y), new THREE.Vector3(b.x, 0.004 * IN, b.y));
    }
    const grooves = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: HOSEL_COLOR }));
    grooves.name = 'club-grooves';
    model.add(grooves);
  }

  // Hosel: the iron outline has one; woods get a short neck at the heel.
  const h = o.hosel ?? { x1: o.centre.x + o.frameWidth * 0.42, y1: o.centre.y - 20, x2: o.centre.x + o.frameWidth * 0.46, y2: o.centre.y - 70 };
  const a2 = toLocal([h.x1, h.y1]), b2 = toLocal([h.x2, h.y2]);
  const a = new THREE.Vector3(a2.x, -depth / 2, a2.y), b = new THREE.Vector3(b2.x, -depth / 2, b2.y);
  const len = a.distanceTo(b);
  const hoselGeo = new THREE.CylinderGeometry(0.2 * IN, 0.28 * IN, len, 16);
  const hosel = new THREE.Mesh(hoselGeo, new THREE.MeshStandardMaterial({ color: HOSEL_COLOR, metalness: 0.4, roughness: 0.4 }));
  hosel.name = 'club-hosel';
  hosel.position.copy(a.clone().add(b).multiplyScalar(0.5));
  hosel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  model.add(hosel);
  model.userData.hoselTop = b;

  const centre = new THREE.Object3D();
  centre.name = 'club-face-centre';
  model.add(centre);

  if (handedness === 'left') model.scale.x = -1;
  return model;
}
