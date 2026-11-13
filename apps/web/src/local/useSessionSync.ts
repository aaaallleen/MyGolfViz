import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { SessionDetails } from '@fsa/domain';
import { exclusionKey } from '@fsa/analytics';
import { useWorkingSet } from '../state/store';
import { patchExclusions, patchSession, type SessionPatch } from './api';

const DETAILS_DEBOUNCE_MS = 400;

const sameDetails = (a: SessionDetails, b: SessionDetails) =>
  a.name === b.name && a.date === b.date && a.notes === b.notes && a.handedness === b.handedness;

/** The changed fields that are fit to send: a name needs a non-blank value and a date cannot be cleared. */
function detailsPatch(now: SessionDetails, saved: SessionDetails): SessionPatch {
  const patch: SessionPatch = {};
  if (now.name !== saved.name && now.name.trim() !== '') patch.name = now.name;
  if (now.date !== saved.date && now.date !== null) patch.date = now.date;
  if (now.notes !== saved.notes) patch.notes = now.notes;
  if (now.handedness !== saved.handedness) patch.handedness = now.handedness;
  return patch;
}

/** The fields to send, and the details the server holds once they land; null when nothing is to be sent. */
function pendingDetails(now: SessionDetails, saved: SessionDetails): { patch: SessionPatch; sent: SessionDetails } | null {
  const patch = detailsPatch(now, saved);
  if (Object.keys(patch).length === 0) return null;
  const sent: SessionDetails = { ...now };
  for (const k of ['name', 'date'] as const) if (patch[k] === undefined) sent[k] = saved[k] as never;
  return { patch, sent };
}

/**
 * Saves detail edits (debounced) and exclusion changes (one request at a time) of the open saved session.
 * Mount once. Nothing is sent right after a session is loaded. Edits still waiting for the debounce are sent
 * when another session loads (to the old session), when the page is hidden or closed (keepalive), and on unmount.
 */
export function useSessionSync(): void {
  const ws = useWorkingSet();
  const { sessionId, workingSet, details, excluded, setDetails, setExcludedKeys } = ws;

  const latest = useRef({ sessionId, workingSet, details, excluded });
  latest.current = { sessionId, workingSet, details, excluded };
  const saved = useRef<{ sessionId: string | null; details: SessionDetails; excluded: ReadonlySet<string> }>({ sessionId, details, excluded });
  const loadedWorkingSet = useRef(workingSet);
  const exclusionsInFlight = useRef(false);
  const detailsInFlight = useRef<Promise<unknown> | null>(null);
  // The details the effect last saw, so a load can still send the old session's unsaved edits.
  const seen = useRef<{ sessionId: string | null; details: SessionDetails }>({ sessionId, details });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actions = useRef({ setDetails, setExcludedKeys });
  actions.current = { setDetails, setExcludedKeys };

  const pumpExclusions = useRef<() => void>(() => {});
  pumpExclusions.current = () => {
    if (exclusionsInFlight.current) return;
    const cur = latest.current;
    const sid = cur.sessionId;
    if (sid === null || sid !== saved.current.sessionId || !cur.workingSet) return;
    const base = saved.current.excluded;
    const target = cur.excluded;
    const added = [...target].filter((k) => !base.has(k));
    const removed = [...base].filter((k) => !target.has(k));
    if (added.length === 0 && removed.length === 0) return;
    const idOf = new Map<string, string>();
    const sha = new Map(cur.workingSet.files.map((f) => [f.id, f.sha256]));
    for (const s of cur.workingSet.shots) {
      const h = sha.get(s.fileId);
      if (h !== undefined) idOf.set(exclusionKey(h, s.sourceRow), s.id);
    }
    const ids = (keys: string[]) => keys.flatMap((k) => idOf.get(k) ?? []);
    exclusionsInFlight.current = true;
    patchExclusions(sid, { exclude: ids(added), include: ids(removed) }).then(
      () => {
        exclusionsInFlight.current = false;
        if (saved.current.sessionId !== sid) return pumpExclusions.current();
        saved.current.excluded = target;
        pumpExclusions.current();
      },
      () => {
        exclusionsInFlight.current = false;
        if (saved.current.sessionId !== sid) return pumpExclusions.current();
        toast.error("Couldn't save exclusions");
        actions.current.setExcludedKeys(saved.current.excluded);
      },
    );
  };

  const flushDetails = useRef<(opts?: { keepalive?: boolean }) => void>(() => {});
  flushDetails.current = (opts) => {
    const keepalive = opts?.keepalive === true;
    // A keepalive save cannot wait for the request in flight: the page may be going away.
    if (detailsInFlight.current && !keepalive) return;
    const cur = latest.current;
    const sid = cur.sessionId;
    if (sid === null || sid !== saved.current.sessionId) return;
    const next = pendingDetails(cur.details, saved.current.details);
    if (!next) return;
    if (keepalive && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const req = keepalive ? patchSession(sid, next.patch, { keepalive: true }) : patchSession(sid, next.patch);
    detailsInFlight.current = req;
    const settle = () => { if (detailsInFlight.current === req) detailsInFlight.current = null; };
    req.then(
      () => {
        settle();
        if (saved.current.sessionId === sid) saved.current.details = next.sent;
        flushDetails.current();
      },
      () => {
        settle();
        // Another session is open now: send its queued edits. The old session's were re-sent when it was replaced.
        if (saved.current.sessionId !== sid) return flushDetails.current();
        toast.error("Couldn't save session details");
        actions.current.setDetails(saved.current.details);
      },
    );
  };

  /** Sends the unsaved edits of the session being replaced, after any save in flight for it. */
  const flushReplaced = () => {
    const old = seen.current;
    const sid = old.sessionId;
    if (sid === null || sid !== saved.current.sessionId) return;
    const next = pendingDetails(old.details, saved.current.details);
    if (!next) return;
    (detailsInFlight.current ?? Promise.resolve())
      .catch(() => {})
      .then(() => patchSession(sid, next.patch))
      .catch(() => toast.error("Couldn't save session details"));
  };

  useEffect(() => {
    // A load replaces the working set: what was just loaded is by definition what is saved.
    if (loadedWorkingSet.current !== workingSet || saved.current.sessionId !== sessionId) {
      flushReplaced();
      seen.current = { sessionId, details };
      loadedWorkingSet.current = workingSet;
      saved.current = { sessionId, details, excluded };
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    seen.current = { sessionId, details };
    if (sessionId === null) return;
    pumpExclusions.current();
    if (!sameDetails(details, saved.current.details)) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flushDetails.current();
      }, DETAILS_DEBOUNCE_MS);
    }
  }, [sessionId, workingSet, details, excluded]);

  useEffect(() => {
    const hide = () => flushDetails.current({ keepalive: true });
    const onVisibility = () => { if (document.visibilityState === 'hidden') hide(); };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      flushDetails.current();
    };
  }, []);
}
