import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { camera3D } from './cameras';
import { cameraState, orbitKey } from './orbit';
import { toThreeCamera } from './renderer';
import { REF_M, sceneOf } from './testFixtures';

describe('orbitKey', () => {
  test('changes with handedness for the same shot, so the large view re-mirrors', () => {
    const r = sceneOf(REF_M, 'right'), l = sceneOf(REF_M, 'left');
    expect(r.shotId).toBe(l.shotId);
    expect(orbitKey('top', r, 800, 500, 0)).not.toBe(orbitKey('top', l, 800, 500, 0));
  });
});

describe('cameraState', () => {
  const preset = camera3D('top', sceneOf(REF_M), REF_M);
  const fresh = () => toThreeCamera(preset, 1.6) as THREE.OrthographicCamera;

  test('on preset: neither rotated nor moved', () => {
    expect(cameraState(fresh(), new THREE.Vector3(...preset.target), preset)).toEqual({ rotated: false, moved: false });
  });

  test('zoom alone moves it off preset (Reset enabled) without the rotate note', () => {
    const c = fresh();
    c.zoom = 2;
    expect(cameraState(c, new THREE.Vector3(...preset.target), preset)).toEqual({ rotated: false, moved: true });
  });

  test('a pan moves it; a rotation also flags rotated', () => {
    const c = fresh();
    expect(cameraState(c, new THREE.Vector3(0.5, 0, 0), preset).moved).toBe(true);
    c.position.set(3, -3, 8);
    c.lookAt(0, 0, 0);
    expect(cameraState(c, new THREE.Vector3(...preset.target), preset)).toEqual({ rotated: true, moved: true });
  });
});
