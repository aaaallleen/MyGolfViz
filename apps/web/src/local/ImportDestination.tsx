import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { SessionDetails } from '@fsa/domain';
import { Button } from '@fsa/ui';
import { SessionDetailsForm } from '../components/SessionDetailsForm';
import type { PreviewFile } from '../state/staging';
import { useWorkingSet } from '../state/store';
import * as api from './api';
import type { CheckResponse, SessionRow } from './api';
import type { ImportTarget } from './importPayload';
import { parseYmd } from '../components/calendarDates';
import { todayLocal, sortSessions } from './library';
import { useImportCommit } from './useImportCommit';
import { useOpenSession } from './OpenSession';

export type ImportDestinationValue = ImportTarget & { accept: Record<string, boolean> };
type NewSession = Extract<ImportTarget, { newSession: unknown }>['newSession'];

const isExisting = (v: ImportDestinationValue): v is { sessionId: string } & ImportDestinationValue => 'sessionId' in v;
const includedOf = (staged: readonly PreviewFile[]) => staged.filter((f) => f.include && f.parse.ok);

export function ImportDestination({ staged, value, onChange }: {
  staged: readonly PreviewFile[];
  value: ImportDestinationValue;
  onChange(v: ImportDestinationValue): void;
}) {
  const [params] = useSearchParams();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResponse['results'][number]>>({});
  const draft = useRef<NewSession>(isExisting(value) ? { name: '', date: todayLocal(), notes: '', handedness: 'right' } : value.newSession);
  const lastId = useRef('');
  if (!isExisting(value)) draft.current = value.newSession;
  else lastId.current = value.sessionId;
  const newest = useMemo(() => sortSessions(sessions ?? [], 'date-desc'), [sessions]);

  // On first render: ?session=<id> picks Existing session; otherwise a new session gets the ?date= from the library
  // calendar's "Add session data", or today's local date.
  useEffect(() => {
    const id = params.get('session');
    const date = params.get('date');
    if (id) onChange({ sessionId: id, accept: value.accept });
    else if (!isExisting(value) && value.newSession.date === '') {
      onChange({ ...value, newSession: { ...value.newSession, date: parseYmd(date) ? date! : todayLocal() } });
    }
  }, []);

  useEffect(() => {
    let live = true;
    api.listSessions().then(
      (r) => { if (live) setSessions(r); },
      (e: unknown) => {
        if (live && !(e instanceof api.ApiError && e.status === 401)) toast.error(e instanceof Error ? e.message : 'Could not load sessions.');
      },
    );
    return () => { live = false; };
  }, []);

  // Never auto-pick: an id that is not in the list (a stale link) is cleared, with a note, so files cannot land in another session.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (sessions && isExisting(value) && value.sessionId !== '' && !newest.some((s) => s.id === value.sessionId)) {
      setStale(true);
      onChange({ sessionId: '', accept: value.accept });
    }
  }, [sessions, value]);

  const hashes = [...new Set(includedOf(staged).map((f) => f.sha256))];
  const hashKey = hashes.join(',');
  const sid = isExisting(value) && value.sessionId ? value.sessionId : null;
  useEffect(() => {
    if (hashes.length === 0) {
      setChecks({});
      return;
    }
    let live = true;
    api.checkImports(hashes, sid).then(
      (r) => { if (live) setChecks(Object.fromEntries(r.results.map((x) => [x.sha256, x]))); },
      () => { if (live) setChecks({}); },
    );
    return () => { live = false; };
  }, [hashKey, sid]);

  const setNew = (patch: Partial<SessionDetails>) => {
    if (isExisting(value)) return;
    const next = { ...value.newSession, ...patch } as SessionDetails;
    onChange({ newSession: { name: next.name, date: next.date ?? '', notes: next.notes, handedness: next.handedness }, accept: value.accept });
  };
  // The draft may come from LoadPage's initial value (date '') when the page opened on ?session: a session date is required.
  const chooseNew = () => onChange({ newSession: { ...draft.current, date: draft.current.date || todayLocal() }, accept: value.accept });
  const chooseExisting = () => onChange({ sessionId: lastId.current, accept: value.accept });
  const existing = isExisting(value);

  return (
    <section className="import-destination" aria-labelledby="dest-h">
      <fieldset className="import-destination__choice">
        <legend id="dest-h">Add to</legend>
        <label><input type="radio" name="dest" checked={!existing} onChange={chooseNew} />New session</label>
        <label><input type="radio" name="dest" checked={existing} onChange={chooseExisting} />Existing session</label>
      </fieldset>
      {existing ? (
        <div className="import-destination__pick">
        <select
          aria-label="Existing session"
          className="fsa-select fsa-touch"
          value={value.sessionId}
          onChange={(e) => { setStale(false); onChange({ sessionId: e.target.value, accept: value.accept }); }}
        >
          <option value="">Choose a session</option>
          {newest.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {stale && value.sessionId === '' && <p role="status" className="import-destination__note">That session no longer exists. Choose another.</p>}
        </div>
      ) : (
        <SessionDetailsForm
          required
          value={{ ...value.newSession, date: value.newSession.date || null }}
          onChange={setNew}
        />
      )}
      {includedOf(staged).length > 0 && (
        <ul className="import-destination__checks" aria-label="Duplicate check">
          {includedOf(staged).map((f) => {
            const c = checks[f.sha256];
            if (!c) return null;
            const others = c.otherSessions.map((o) => `“${o.name}”`).join(', ');
            if (!c.inDestination && c.otherSessions.length === 0) return null;
            return (
              <li key={f.key}>
                <span className="import-destination__file">{f.name}</span>
                {c.inDestination ? (
                  <span>Already in this session — will be skipped</span>
                ) : (
                  <>
                    <span>{`Also in ${others}`}</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={value.accept[f.sha256] === true}
                        onChange={(e) => onChange({ ...value, accept: { ...value.accept, [f.sha256]: e.target.checked } })}
                      />
                      Import anyway
                    </label>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Footer buttons for the local build: Clear files and Import files. */
export function ImportActions({ dest, shotCount }: { dest: ImportDestinationValue; shotCount: number }) {
  const ws = useWorkingSet();
  const navigate = useNavigate();
  const { commit, busy } = useImportCommit();
  const { open, setOpen } = useOpenSession();
  const blankName = !isExisting(dest) && dest.newSession.name.trim() === '';
  const blankDate = !isExisting(dest) && dest.newSession.date === '';
  const noTarget = isExisting(dest) && dest.sessionId === '';
  const run = async () => {
    try {
      const { accept, ...target } = dest;
      const response = await commit(target as ImportTarget, ws.staged, accept);
      ws.clearStaged();
      // Files were added to the session that is open: drop its saved rows so opening it fetches the new ones.
      if (open?.session.id === response.session.id) setOpen(null);
      navigate('/import/result', { state: response });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The import failed.');
    }
  };
  return (
    <>
      <Button onClick={ws.clearStaged}>Clear files</Button>
      <Button variant="primary" disabled={shotCount === 0 || blankName || blankDate || noTarget || busy} onClick={() => void run()}>
        Import files
      </Button>
    </>
  );
}
