import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  gappingSessions, gappingTable, orderSessions, shotsForGapping, type EllipseKind, type GappingBasis, type ProgressionShot, type ShotsChoice,
} from '@fsa/analytics';
import { formatSessionDate } from '@fsa/domain';
import { Button, EmptyState, SegmentedControl, SelectField } from '@fsa/ui';
import { clubColors, DispersionPlot, patternXMax, PATTERN_WIDTH } from '@fsa/visualizations';
import { usePhone } from '../../components/usePhone';
import { useWorkingSet } from '../../state/store';
import * as api from '../api';
import type { SessionRow } from '../api';
import { toProgressionShot } from '../progression/scope';
import {
  basisLabel, chosenSession, DEFAULT_GAPPING_SCOPE, GAPPING_KEY, gappingLine, gappingQueryIds, parseGappingScope, type GappingScope,
} from './gappingScope';
import { GappingTable } from './GappingTable';
import './gapping.css';

const isUnauthorised = (e: unknown) => e instanceof api.ApiError && e.status === 401;

const BASIS_OPTIONS: { value: GappingBasis; label: string }[] = [
  { value: 'session', label: 'Selected session…' },
  { value: 'latest', label: 'Latest session' },
  { value: 'last3', label: 'Last 3 sessions' },
  { value: 'last10', label: 'Last 10 sessions' },
  { value: 'all', label: 'All time' },
];
/** Narrower viewBox on phones, so the plot text stays readable once scaled to the screen. */
const PHONE_WIDTH = 420;

/** The shots fetched for one basis, with what they were fetched for. */
interface Loaded { key: string; label: string; perClub: Map<string, string[]>; shots: ProgressionShot[] }

export default function GappingPage() {
  const { ellipseKind, setEllipseKind } = useWorkingSet();
  const width = usePhone() ? PHONE_WIDTH : PATTERN_WIDTH;
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [scope, setScope] = useState<GappingScope>(DEFAULT_GAPPING_SCOPE);
  // The latest shots answer. Its key differs from the current one while a new answer loads; it stays on screen, dimmed.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [shotsFailedKey, setShotsFailedKey] = useState<string | null>(null);
  const [shotsAttempt, setShotsAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([api.listSessions(), api.getSetting(GAPPING_KEY)]).then(
      ([sessions, saved]) => {
        if (!live) return;
        setRows(sessions);
        setScope(parseGappingScope(saved));
      },
      (e: unknown) => {
        // A 401 is shown by the app shell as the sign-in hint.
        if (live && !isUnauthorised(e)) setFailed(true);
      },
    );
    return () => { live = false; };
  }, [attempt]);

  const ordered = useMemo(() => orderSessions(rows ?? []), [rows]);
  const session = rows ? chosenSession(rows, scope) : null;
  const perClub = useMemo(
    () => gappingSessions(rows ?? [], scope.basis, session?.id ?? null),
    [rows, scope.basis, session?.id],
  );
  const key = JSON.stringify([scope.basis, session?.id ?? null, [...perClub]]);

  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let live = true;
    setShotsFailedKey(null);
    const label = basisLabel(scope.basis, session);
    const sessionIds = gappingQueryIds(scope.basis, perClub);
    // No club in these sessions: an empty id list would ask for every shot.
    const request = sessionIds?.length === 0 ? Promise.resolve([]) : api.listLibraryShots(sessionIds ? { sessionIds } : {});
    request.then(
      // Only the answer for the current key lands: a change of key ends `live` for the older request.
      (list) => { if (live) setLoaded({ key, label, perClub, shots: list.map(toProgressionShot) }); },
      (e: unknown) => { if (live && !isUnauthorised(e)) setShotsFailedKey(key); },
    );
    return () => { live = false; };
    // `key` covers the basis, the chosen session and every club's sessions.
  }, [key, attempt, shotsAttempt]);

  const inBasis = useMemo(
    () => (loaded ? shotsForGapping(loaded.shots, loaded.perClub, 'all') : []),
    [loaded],
  );
  const used = useMemo(() => (scope.shots === 'stock' ? inBasis.filter((s) => !s.excluded) : inBasis), [inBasis, scope.shots]);
  const table = useMemo(() => gappingTable(used, ellipseKind), [used, ellipseKind]);
  const colors = useMemo(() => clubColors(table.map((r) => r.club)), [table]);

  const changeScope = (next: GappingScope) => {
    // The choice applies for this visit even when saving it fails.
    setScope(next);
    api.putSetting(GAPPING_KEY, next).catch(() => toast.error("Couldn't save the gapping choices"));
  };
  // Selected session starts from the session shown now (the latest), and stays on it as new sessions arrive.
  const pickBasis = (basis: GappingBasis) =>
    changeScope({ ...scope, basis, sessionId: basis === 'session' ? (session ?? ordered[ordered.length - 1])?.id ?? null : scope.sessionId });

  if (failed) {
    return (
      <div className="gapping">
        <EmptyState
          title="Couldn't load your sessions"
          body="Check that MyGolfViz is still running, then retry."
          action={<Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}
        />
      </div>
    );
  }
  if (rows === null) return null;
  if (rows.length === 0) {
    return (
      <div className="gapping">
        <EmptyState
          title="No saved sessions yet"
          body="Load a session CSV to see your gapping."
          action={<Link to="/import" className="fsa-btn fsa-btn--primary fsa-touch">Load Session CSV</Link>}
        />
      </div>
    );
  }

  const shotsFailed = shotsFailedKey === key;
  const busy = loaded !== null && loaded.key !== key;
  const line = loaded && !shotsFailed
    ? gappingLine(loaded.label, used.length, scope.shots === 'stock' ? inBasis.length - used.length : 0, scope.shots)
    : null;
  const longest = Math.max(0, ...table.flatMap((r) => r.dispersion.points.map((p) => p.y)));
  const clubOf = new Map(used.map((s) => [s.id, s.club ?? '']));

  return (
    <div className="gapping">
      <h1>Gapping</h1>
      <section className="gapping-scope" aria-label="Gapping choices">
        <div className="gapping-scope__controls">
          <SelectField label="Based on" value={scope.basis} options={BASIS_OPTIONS} onChange={(v) => pickBasis(v as GappingBasis)} />
          {scope.basis === 'session' && session && (
            <SelectField
              label="Session"
              value={session.id}
              options={[...ordered].reverse().map((r) => ({
                value: r.id,
                label: `${formatSessionDate(r.date, { setByYou: false })}${r.name ? ` · ${r.name}` : ''}`,
              }))}
              onChange={(sessionId) => changeScope({ ...scope, sessionId })}
            />
          )}
          <SegmentedControl<EllipseKind>
            label="Ellipse"
            value={ellipseKind}
            options={[{ value: 'sd1', label: '1 SD' }, { value: 'all', label: 'Every shot' }]}
            onChange={setEllipseKind}
          />
          <SegmentedControl<ShotsChoice>
            label="Shots"
            value={scope.shots}
            options={[{ value: 'all', label: 'All shots' }, { value: 'stock', label: 'Stock only' }]}
            onChange={(shots) => changeScope({ ...scope, shots })}
          />
        </div>
        {/* The live region stays in place; a stale line is hidden from it so only the current count is announced. */}
        <p className="gapping-scope__line" aria-live="polite">
          {line && (busy ? <span className="gapping--loading" aria-hidden="true">{line}</span> : line)}
        </p>
      </section>
      {shotsFailed ? (
        <EmptyState
          title="Couldn't load the shots"
          body="Check that MyGolfViz is still running, then retry."
          action={<Button variant="primary" onClick={() => setShotsAttempt((n) => n + 1)}>Retry</Button>}
        />
      ) : loaded && (
        <div className={`gapping-body${busy ? ' gapping--loading' : ''}`} aria-busy={busy}>
          {table.length === 0 ? (
            <p className="gapping-note">None of these shots have carry values.</p>
          ) : (
            <>
              <div className="panel gapping-plot">
                <DispersionPlot
                  mode="carry"
                  groups={table.map((r) => ({ club: r.club, color: colors.get(r.club)!, stats: r.dispersion }))}
                  xMax={patternXMax(longest)}
                  width={width}
                  selectedId={null}
                  // A row that left the table while hovered never sends its leave.
                  highlightClub={table.some((r) => r.club === highlight) ? highlight : null}
                  labelFor={(id) => clubOf.get(id) ?? ''}
                />
              </div>
              <GappingTable rows={table} colors={colors} sessions={ordered} onHighlight={setHighlight} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
