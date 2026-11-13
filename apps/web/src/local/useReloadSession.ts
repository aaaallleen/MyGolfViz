import { useCallback, useEffect, useRef } from 'react';
import { useWorkingSet } from '../state/store';
import { getSession, getShots } from './api';
import { sessionToWorkingSet } from './sessionToWorkingSet';

/** Re-fetches the open session and its shots and swaps them into the store, keeping the user's view. */
export function useReloadSession(): () => Promise<void> {
  const { sessionId, loadSession } = useWorkingSet();
  // Refs keep the returned function stable even though loadSession changes identity on every store update.
  const idRef = useRef(sessionId);
  const loadRef = useRef(loadSession);
  useEffect(() => {
    idRef.current = sessionId;
    loadRef.current = loadSession;
  });
  return useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const [{ session, imports }, shots] = await Promise.all([getSession(id), getShots(id)]);
    if (idRef.current !== id) return;
    loadRef.current({ sessionId: id, ...sessionToWorkingSet(session, imports, shots), keepView: true });
  }, []);
}
