import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { EllipseKind } from '@fsa/analytics';
import { useWorkingSet } from '../state/store';
import { getSetting, putSetting } from './api';

export const ELLIPSE_KEY = 'ellipse.kind';

const isKind = (v: unknown): v is EllipseKind => v === 'sd1' || v === 'all';

/**
 * Keeps the Ellipse choice across launches. Loads the saved value once on mount, unless the user already
 * picked something by then, and saves every later change. Mount once, in the local build only.
 */
export function useEllipsePreference(): void {
  const { ellipseKind, setEllipseKind } = useWorkingSet();
  const current = useRef(ellipseKind);
  current.current = ellipseKind;
  const set = useRef(setEllipseKind);
  set.current = setEllipseKind;
  // What the store holds because of the load (or the default), so only a user change is saved.
  const synced = useRef<EllipseKind>(ellipseKind);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    getSetting<unknown>(ELLIPSE_KEY)
      .then((v) => {
        if (!live || touched.current || !isKind(v)) return;
        synced.current = v;
        set.current(v);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (ellipseKind === synced.current) return;
    touched.current = true;
    synced.current = ellipseKind;
    putSetting(ELLIPSE_KEY, ellipseKind).catch(() => toast.error("Couldn't save the ellipse choice"));
  }, [ellipseKind]);
}
