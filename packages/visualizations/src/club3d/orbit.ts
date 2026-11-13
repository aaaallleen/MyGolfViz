import * as THREE from 'three';
import type { ReplayScene } from '@fsa/analytics';
import { screenBasis } from './cameras';
import type { View3D, ViewCamera } from './types';

const ROTATED_DEG = 0.5;
const EPS = 1e-6;

/** Identity of the large view's orbit camera: a new key rebuilds it at its preset. */
export function orbitKey(view: View3D, scene: ReplayScene, width: number, height: number, resetTick: number): string {
  return `${view}|${scene.shotId}|${scene.handedness}|${width}x${height}|${resetTick}`;
}

/**
 * How far the orbit camera is from its preset. `rotated` (direction changed) means measured angles no longer
 * read true; `moved` (rotated, zoomed or panned) means Reset view has something to undo.
 */
export function cameraState(cam: THREE.Camera, target: THREE.Vector3, preset: ViewCamera): { rotated: boolean; moved: boolean } {
  const fwd = cam.getWorldDirection(new THREE.Vector3());
  const want = new THREE.Vector3(...screenBasis(preset).forward);
  const rotated = (fwd.angleTo(want) * 180) / Math.PI > ROTATED_DEG;
  const zoom = (cam as THREE.OrthographicCamera).zoom ?? 1;
  const moved = rotated
    || Math.abs(zoom - 1) > EPS
    || target.distanceTo(new THREE.Vector3(...preset.target)) > EPS
    || cam.position.distanceTo(new THREE.Vector3(...preset.eye)) > EPS;
  return { rotated, moved };
}
