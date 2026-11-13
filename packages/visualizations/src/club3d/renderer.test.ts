import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { camera3D, projectOrtho } from './cameras';
import { createSharedRenderer, frameCamera, toThreeCamera, webglAvailable } from './renderer';
import { REF_M, sceneOf } from './testFixtures';

const scene = sceneOf(REF_M);

describe('renderer', () => {
  test('webglAvailable() is false under jsdom and createSharedRenderer() returns null', () => {
    expect(webglAvailable()).toBe(false);
    expect(createSharedRenderer()).toBeNull();
  });

  test.each([1.6, 0.6])('frameCamera fits the arc and ball inside 5–95 %% of a %s slot', (aspect) => {
    for (const v of ['top', 'faceOn', 'dtl'] as const) {
      const pts = [...scene.clubArc!, [0, 0, 0] as [number, number, number]];
      const cam = frameCamera(camera3D(v, scene, REF_M), pts, aspect);
      for (const p of pts) {
        const s = projectOrtho(cam, p, aspect);
        expect(s.x).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(s.x).toBeLessThanOrEqual(0.95 + 1e-9);
        expect(s.y).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(s.y).toBeLessThanOrEqual(0.95 + 1e-9);
      }
    }
  });

  test('frameCamera leaves a perspective camera unchanged', () => {
    const cam = camera3D('overview', scene, REF_M);
    expect(frameCamera(cam, scene.clubArc!, 1.6)).toEqual(cam);
  });

  test('toThreeCamera agrees with projectOrtho', () => {
    const cam = frameCamera(camera3D('top', scene, REF_M), scene.clubArc!, 1.6);
    const three = toThreeCamera(cam, 1.6);
    three.updateMatrixWorld();
    const p = scene.clubArc![5]!;
    const ndc = new THREE.Vector3(...p).project(three);
    const s = projectOrtho(cam, p, 1.6);
    expect((ndc.x + 1) / 2).toBeCloseTo(s.x, 6);
    expect((1 - ndc.y) / 2).toBeCloseTo(s.y, 6);
  });
});
