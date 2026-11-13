import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Vec3 } from '@fsa/domain';
import { screenBasis } from './cameras';
import { SURFACE } from '../theme';
import type { ViewCamera } from './types';

const FILL = 0.9;
const MAX_DPR = 2;

/** True when the browser can create a WebGL context (false under jsdom). */
export function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function toThreeCamera(cam: ViewCamera, aspect: number): THREE.Camera {
  const three = cam.kind === 'ortho'
    ? new THREE.OrthographicCamera(-cam.size * aspect, cam.size * aspect, cam.size, -cam.size, 0.01, 100)
    : new THREE.PerspectiveCamera(cam.size, aspect, 0.05, 100);
  three.position.set(...cam.eye);
  three.up.set(...cam.up);
  three.lookAt(...cam.target);
  three.updateMatrixWorld();
  return three;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Re-centres an orthographic camera on `pts` and sizes it so they fill at most 90 % of the slot. Perspective cameras are returned unchanged. */
export function frameCamera(cam: ViewCamera, pts: Vec3[], aspect: number): ViewCamera {
  if (cam.kind !== 'ortho' || pts.length === 0) return cam;
  const { right, up } = screenBasis(cam);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    const x = dot(p, right), y = dot(p, up);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // Move the target within the screen plane only, keeping its depth along the view axis.
  const t0 = cam.target;
  const shiftX = cx - dot(t0, right), shiftY = cy - dot(t0, up);
  const target: Vec3 = [0, 1, 2].map((i) => t0[i]! + right[i]! * shiftX + up[i]! * shiftY) as Vec3;
  const eye: Vec3 = [0, 1, 2].map((i) => cam.eye[i]! - t0[i]! + target[i]!) as Vec3;
  const size = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect, 1e-3) / FILL;
  return { ...cam, eye, target, size };
}

export interface SharedRenderer {
  /** Renders `scene` through `camera` at `target`'s CSS size and copies the frame into `target`. */
  draw(target: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/** One WebGL context shared by every view slot of a tab; null when WebGL is unavailable. */
export function createSharedRenderer(): SharedRenderer | null {
  if (!webglAvailable()) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setClearColor(SURFACE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return {
    draw(target, scene, camera) {
      const w = Math.max(1, target.clientWidth), h = Math.max(1, target.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (mat instanceof LineMaterial) mat.resolution.set(w, h);
      });
      renderer.render(scene, camera);
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (target.width !== pw || target.height !== ph) { target.width = pw; target.height = ph; }
      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(renderer.domElement, 0, 0, pw, ph);
    },
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
