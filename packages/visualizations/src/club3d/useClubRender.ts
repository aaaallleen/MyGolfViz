import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildClubScene, type ClubScene, type ClubSceneInput } from './buildScene';
import { createSharedRenderer, webglAvailable, type SharedRenderer } from './renderer';

type SceneSpec = Omit<ClubSceneInput, 'annotations'>;

/**
 * Owns one WebGL renderer and one club scene for a tab, plus the canvases the gallery hands back.
 * Everything is disposed on unmount or when the scene inputs change.
 */
export function useClubRender(spec: SceneSpec) {
  const [webgl, setWebgl] = useState(() => webglAvailable());
  const renderer = useRef<SharedRenderer | null>(null);
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const [size, setSize] = useState(0); // bumps on canvas resize so the owner redraws

  useEffect(() => {
    if (!webgl) return;
    // No renderer (creation failed) or a lost context falls back to the no-WebGL message.
    const r = createSharedRenderer(() => setWebgl(false));
    if (!r) { setWebgl(false); return; }
    renderer.current = r;
    return () => { r.dispose(); renderer.current = null; };
  }, [webgl]);

  const { scene, m, club, others, headScale, mode } = spec;
  const clubScene = useMemo<ClubScene | null>(
    () => (webgl ? buildClubScene({ scene, m, club, others, headScale, mode, annotations: [] }) : null),
    [webgl, scene, m, club, others, headScale, mode],
  );
  useEffect(() => () => clubScene?.dispose(), [clubScene]);

  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!webgl || typeof ResizeObserver === 'undefined') return;
    // Redraw only when a canvas's size really changed; a fresh observe() always reports once.
    const last = new WeakMap<Element, string>();
    observer.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const key = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
        if (last.get(e.target) !== key) { last.set(e.target, key); changed = true; }
      }
      if (changed) setSize((n) => n + 1);
    });
    for (const c of canvases.current.values()) observer.current.observe(c);
    return () => { observer.current?.disconnect(); observer.current = null; };
  }, [webgl]);

  const setCanvas = useCallback((id: string, el: HTMLCanvasElement | null) => {
    const prev = canvases.current.get(id);
    if (prev && prev !== el) observer.current?.unobserve(prev);
    if (el) { canvases.current.set(id, el); observer.current?.observe(el); } else canvases.current.delete(id);
  }, []);

  return { webgl, renderer, clubScene, canvases, setCanvas, sizeTick: size };
}
