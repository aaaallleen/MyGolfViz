import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Vec3 } from '@fsa/domain';
import { screenBasis } from './cameras';
import { SURFACE } from '../theme';
import type { ViewCamera } from './types';

const FILL = 0.9;
const MAX_DPR = 2;

/** True when the browser can create a WebGL 2 context (three r163+ dropped WebGL 1; false under jsdom). The probe context is released. */
export function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const ctx = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!ctx) return false;
    ctx.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
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

export interface BufferPlan { w: number; h: number; dpr: number; resize: boolean }

/**
 * The shared drawing buffer only grows (to the largest slot seen) so alternating large and thumbnail draws
 * don't reallocate it every frame; smaller slots render into its top-left corner.
 */
export function planBuffer(prev: BufferPlan | null, w: number, h: number, dpr: number): BufferPlan {
  if (!prev || prev.dpr !== dpr) return { w, h, dpr, resize: true };
  const nw = Math.max(prev.w, w), nh = Math.max(prev.h, h);
  return { w: nw, h: nh, dpr, resize: nw !== prev.w || nh !== prev.h };
}

export interface SharedRenderer {
  /** Renders `scene` through `camera` at `target`'s CSS size and copies the frame into `target`. */
  draw(target: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/** One WebGL context shared by every view slot of a tab; null when WebGL is unavailable. `onLost` fires if the context is lost. */
export function createSharedRenderer(onLost?: () => void): SharedRenderer | null {
  if (!webglAvailable()) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    return null;
  }
  if (onLost) renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.setClearColor(SURFACE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let buf: BufferPlan | null = null;
  return {
    draw(target, scene, camera) {
      const w = Math.max(1, target.clientWidth), h = Math.max(1, target.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      buf = planBuffer(buf, w, h, dpr);
      if (buf.resize) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(buf.w, buf.h, false);
      }
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (mat instanceof LineMaterial) mat.resolution.set(w, h);
      });
      // Viewport origin is bottom-left; put this slot in the buffer's top-left corner.
      renderer.setViewport(0, buf.h - h, w, h);
      renderer.setScissor(0, buf.h - h, w, h);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (target.width !== pw || target.height !== ph) { target.width = pw; target.height = ph; }
      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, pw, ph);
      // Copy in the same task as render(), so the drawing buffer need not be preserved.
      ctx.drawImage(renderer.domElement, 0, 0, pw, ph, 0, 0, pw, ph);
    },
    dispose() {
      if (onLost) renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
