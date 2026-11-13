import { useCallback, useEffect, useRef } from 'react';
import { useWorkingSet } from '../state/store';
import { getSession, getShots } from './api';
import { useOpenSession } from './OpenSession';
import { sessionToWorkingSet } from './sessionToWorkingSet';

/** Re-fetches the open session and its shots and swaps them into the store, keeping the user's view. */
export function useReloadSession(): () => Promise<void> {
  const { sessionId, loadSession } = useWorkingSet();
  // Refs keep the returned function stable even though loadSession changes identity on every store update.
  const idRef = useRef(sessionId);
  const loadRef = useRef(loadSession);
  const { setOpen } = useOpenSession();
  const setOpenRef = useRef(setOpen);
  useEffect(() => {
    idRef.current = sessionId;
    loadRef.current = loadSession;
    setOpenRef.current = setOpen;
  });
  return useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const [{ session, imports }, shots] = await Promise.all([getSession(id), getShots(id)]);
    if (idRef.current !== id) return;
    // One response feeds both the store and the files panel.
    setOpenRef.current({ session, imports });
    loadRef.current({ sessionId: id, ...sessionToWorkingSet(session, imports, shots), keepView: true });
  }, []);
}
