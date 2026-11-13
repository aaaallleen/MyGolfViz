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

/**
 * Saves detail edits (debounced) and exclusion changes (one request at a time) of the open saved session.
 * Mount once. Nothing is sent right after a session is loaded.
 */
export function useSessionSync(): void {
  const ws = useWorkingSet();
  const { sessionId, workingSet, details, excluded, setDetails, setExcludedKeys } = ws;

  const latest = useRef({ sessionId, workingSet, details, excluded });
  latest.current = { sessionId, workingSet, details, excluded };
  const saved = useRef<{ sessionId: string | null; details: SessionDetails; excluded: ReadonlySet<string> }>({ sessionId, details, excluded });
  const loadedWorkingSet = useRef(workingSet);
  const exclusionsInFlight = useRef(false);
  const detailsInFlight = useRef(false);
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

  const flushDetails = useRef<() => void>(() => {});
  flushDetails.current = () => {
    if (detailsInFlight.current) return;
    const cur = latest.current;
    const sid = cur.sessionId;
    if (sid === null || sid !== saved.current.sessionId) return;
    const patch = detailsPatch(cur.details, saved.current.details);
    if (Object.keys(patch).length === 0) return;
    const sent: SessionDetails = { ...cur.details };
    for (const k of ['name', 'date'] as const) if (patch[k] === undefined) sent[k] = saved.current.details[k] as never;
    detailsInFlight.current = true;
    patchSession(sid, patch).then(
      () => {
        detailsInFlight.current = false;
        if (saved.current.sessionId === sid) saved.current.details = sent;
        flushDetails.current();
      },
      () => {
        detailsInFlight.current = false;
        if (saved.current.sessionId !== sid) return;
        toast.error("Couldn't save session details");
        actions.current.setDetails(saved.current.details);
      },
    );
  };

  useEffect(() => {
    // A load replaces the working set: what was just loaded is by definition what is saved.
    if (loadedWorkingSet.current !== workingSet || saved.current.sessionId !== sessionId) {
      loadedWorkingSet.current = workingSet;
      saved.current = { sessionId, details, excluded };
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return;
    }
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

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
}
