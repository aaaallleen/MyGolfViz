import { act, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { REF_M, mOf, sceneOf } from './testFixtures';

// Pretend WebGL exists: a fake shared renderer, a fake OrbitControls and a fake ResizeObserver record their cleanup.
const h = vi.hoisted(() => ({
  renderers: [] as { draw: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; onLost?: () => void }[],
  controls: [] as { dispose: ReturnType<typeof vi.fn> }[],
  observers: [] as { disconnect: ReturnType<typeof vi.fn> }[],
  rendererFails: false,
}));

vi.mock('./renderer', async (orig) => {
  const real = await orig<typeof import('./renderer')>();
  return {
    ...real,
    webglAvailable: () => true,
    createSharedRenderer: (onLost?: () => void) => {
      if (h.rendererFails) return null;
      const r = { draw: vi.fn(), dispose: vi.fn(), onLost };
      h.renderers.push(r);
      return r;
    },
  };
});

vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const T = await import('three');
  class OrbitControls {
    target = new T.Vector3();
    domElement: HTMLElement;
    dispose = vi.fn();
    constructor(_cam: unknown, el: HTMLElement) { this.domElement = el; h.controls.push(this); }
    addEventListener() {}
    update() {}
  }
  return { OrbitControls };
});

const { ClubViews3D } = await import('./ClubViews3D');
const { ClubViews2D } = await import('./ClubViews2D');

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    constructor() { h.observers.push(this); }
    observe() {}
    unobserve() {}
  });
});
afterAll(() => {
  delete (HTMLCanvasElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLCanvasElement.prototype as { clientHeight?: number }).clientHeight;
  vi.unstubAllGlobals();
});
beforeEach(() => { h.renderers.length = 0; h.controls.length = 0; h.observers.length = 0; h.rendererFails = false; });

const scene = sceneOf(REF_M);
const view3D = (s = scene, mode: 'views' | 'reconstruction' = 'reconstruction') =>
  <ClubViews3D scene={s} m={REF_M} club="7 Iron" others={[]} large="faceOn" onSelect={() => {}} mode={mode} onMode={() => {}} />;

describe('club views lifecycle', () => {
  test('3D Views mode draws the four fixed cameras and creates no orbit controls', () => {
    render(view3D(scene, 'views'));
    expect(h.renderers[0]!.draw).toHaveBeenCalledTimes(4);
    expect(h.controls).toHaveLength(0);
  });

  test('switching from 3D reconstruction back to Views disposes the orbit controls', () => {
    const { rerender } = render(view3D());
    expect(h.controls).toHaveLength(1);
    rerender(view3D(scene, 'views'));
    expect(h.controls[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  test('3D reconstruction: unmounting disposes the renderer, orbit controls, resize observer and scene geometry', () => {
    const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const { unmount } = render(view3D());
    expect(h.renderers).toHaveLength(1);
    expect(h.renderers[0]!.draw).toHaveBeenCalled();
    expect(h.controls).toHaveLength(1);
    geoDispose.mockClear();
    unmount();
    expect(h.renderers[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(h.controls[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(h.observers.every((o) => o.disconnect.mock.calls.length > 0)).toBe(true);
    expect(geoDispose).toHaveBeenCalled();
    geoDispose.mockRestore();
  });

  test('3D: a new shot rebuilds the orbit controls and disposes the old ones and the old scene', () => {
    const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const { rerender } = render(view3D());
    geoDispose.mockClear();
    rerender(view3D(sceneOf(mOf({ swingH: 3, swingV: 58, aoa: -2, clubPath: 4 }), 'right', 'other-shot')));
    expect(h.controls).toHaveLength(2);
    expect(h.controls[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(h.controls[1]!.dispose).not.toHaveBeenCalled();
    expect(geoDispose).toHaveBeenCalled();
    geoDispose.mockRestore();
  });

  test('2D: unmounting disposes the renderer', () => {
    const { unmount } = render(<ClubViews2D scene={scene} m={REF_M} club="7 Iron" handedness="right" large="ftt" onSelect={() => {}} />);
    expect(h.renderers[0]!.draw).toHaveBeenCalledTimes(4);
    unmount();
    expect(h.renderers[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  test('a renderer that cannot be created shows the fallback message', () => {
    h.rendererFails = true;
    render(view3D());
    expect(screen.getByText(/needs WebGL/)).toBeInTheDocument();
  });

  test('a lost WebGL context switches to the fallback message', () => {
    render(view3D());
    expect(screen.queryByText(/needs WebGL/)).toBeNull();
    act(() => h.renderers[0]!.onLost!());
    expect(screen.getByText(/needs WebGL/)).toBeInTheDocument();
  });
});
