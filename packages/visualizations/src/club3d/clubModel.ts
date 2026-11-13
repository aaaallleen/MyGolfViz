import * as THREE from 'three';
import type { ClubCategory, Handedness } from '@fsa/domain';
import { HEAD_SPECS } from '../heads/specs';
import { bodySurface, faceOutline, scoreLines } from '../heads/shape';

const IN = 1 / 36; // yards per inch
/** Body mesh resolution (around × front to back) for the wood kinds; blades ignore it. */
const BODY_NU = 48;
const BODY_NV = 32;
/** Body edges that turn by more than this stay hard (a blade's back and sole against its rim). The wood bodies
 *  turn by up to about 47° between neighbouring triangles on their squared-off toe and heel and stay smooth. */
const CREASE_RAD = (60 * Math.PI) / 180;
/** The face plate and score lines sit just proud of the face so they draw over it. */
const FACE_LIFT_IN = 0.002;
const LINES_LIFT_IN = 0.004;

/** What a club model carries in `userData`, so the scene can pose the head and draw its hosel and shaft. */
export interface ClubModelData {
  loftDeg: number;
  lieDeg: number;
  /** Where the hosel starts, in model-local yards, before the handedness mirror. */
  hoselBase: THREE.Vector3;
  hoselLengthYd: number;
  hoselRadiusYd: number;
  hoselColor: string;
  /** How far below the ground line the sole may sit before the shot is drawn on a tee, in inches (HeadSpec.turfIn). */
  turfIn: number;
}

interface HeadGeometry {
  head: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  grooves: THREE.BufferGeometry;
}

/** Built once per club type and shared by every model; scenes must not dispose them (`userData.shared`). */
const geometries = new Map<ClubCategory, HeadGeometry>();

/**
 * Club head at true size in yards.
 * Contract: origin = face centre, +y = face normal, +x = toe (scale.x = −1 when left-handed), +z = up along the face.
 * Children named club-head, club-face, club-grooves, club-face-centre. userData is ClubModelData.
 * Geometries are cached per category and carry userData.shared = true. A loaded model must meet the same contract.
 */
export function buildClubModel(category: ClubCategory, handedness: Handedness): THREE.Group {
  const spec = HEAD_SPECS[category];
  const geo = headGeometry(category);
  const { finish } = spec;

  const model = new THREE.Group();
  model.name = 'club-head-model';

  const head = new THREE.Mesh(geo.head, new THREE.MeshStandardMaterial({ color: finish.body, metalness: finish.metalness, roughness: finish.roughness }));
  head.name = 'club-head';
  model.add(head);

  const face = new THREE.Mesh(geo.face, new THREE.MeshStandardMaterial({ color: finish.face, metalness: 0.2, roughness: 0.55 }));
  face.name = 'club-face';
  model.add(face);

  const grooves = new THREE.LineSegments(geo.grooves, new THREE.LineBasicMaterial({ color: finish.lines }));
  grooves.name = 'club-grooves';
  model.add(grooves);

  const centre = new THREE.Object3D();
  centre.name = 'club-face-centre';
  model.add(centre);

  const data: ClubModelData = {
    loftDeg: spec.loftDeg,
    lieDeg: spec.lieDeg,
    hoselBase: new THREE.Vector3(...spec.hosel.base).multiplyScalar(IN),
    hoselLengthYd: spec.hosel.lengthIn * IN,
    hoselRadiusYd: spec.hosel.radiusIn * IN,
    hoselColor: finish.hosel,
    turfIn: spec.turfIn,
  };
  model.userData = data;

  if (handedness === 'left') model.scale.x = -1;
  return model;
}

function headGeometry(category: ClubCategory): HeadGeometry {
  const cached = geometries.get(category);
  if (cached) return cached;
  const spec = HEAD_SPECS[category];

  const body = bodySurface(spec, BODY_NU, BODY_NV);
  const head = splitAtCreases(body.positions.map((v) => v * IN), body.indices, CREASE_RAD);
  head.computeVertexNormals();

  // ShapeGeometry lies in its own (u, v) plane facing +w. The basis below sends u → −x, v → +z and w → +y
  // (a proper rotation, so the winding still faces the normal); the shape is drawn at u = −x to undo the flip.
  const shape = new THREE.Shape(faceOutline(spec).map(([x, z]) => new THREE.Vector2(-x * IN, z * IN)));
  const face = new THREE.ShapeGeometry(shape);
  face.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  face.translate(0, FACE_LIFT_IN * IN, 0);

  const y = LINES_LIFT_IN * IN;
  const grooves = new THREE.BufferGeometry().setFromPoints(
    scoreLines(spec).flatMap(({ z, x1, x2 }) => [new THREE.Vector3(x1 * IN, y, z * IN), new THREE.Vector3(x2 * IN, y, z * IN)]),
  );

  const built = { head, face, grooves };
  for (const g of Object.values(built)) g.userData.shared = true;
  geometries.set(category, built);
  return built;
}

/**
 * An indexed geometry in which a vertex is shared only by triangles that are all on the face plane (y = 0) or all
 * off it, and whose normals lie within `crease` of each other. `computeVertexNormals()` then shades the flat face
 * flat, keeps sharp body edges hard and smooths the rest.
 */
function splitAtCreases(positions: Float32Array, indices: Uint32Array, crease: number): THREE.BufferGeometry {
  const p = (v: number) => new THREE.Vector3(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]);
  const triangles = Array.from({ length: indices.length / 3 }, (_, t) => {
    const a = p(indices[3 * t]!), b = p(indices[3 * t + 1]!), c = p(indices[3 * t + 2]!);
    const onFace = a.y === 0 && b.y === 0 && c.y === 0;
    return { onFace, normal: new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize() };
  });
  const cosCrease = Math.cos(crease);
  // For every vertex, groups of its triangles that turn by less than the crease from the group's first one.
  const groups = new Map<number, { onFace: boolean; seed: THREE.Vector3; copy: number }[]>();
  const outPositions: number[] = [];
  const outIndices = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const v = indices[k]!, { onFace, normal } = triangles[Math.floor(k / 3)]!;
    const list = groups.get(v) ?? [];
    groups.set(v, list);
    let group = list.find((g) => g.onFace === onFace && g.seed.dot(normal) >= cosCrease);
    if (!group) {
      group = { onFace, seed: normal, copy: outPositions.length / 3 };
      outPositions.push(positions[3 * v]!, positions[3 * v + 1]!, positions[3 * v + 2]!);
      list.push(group);
    }
    outIndices[k] = group.copy;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
  geo.setIndex(new THREE.BufferAttribute(outIndices, 1));
  return geo;
}
