import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ProgressionShot } from '@fsa/analytics';
import type { Measurements } from '@fsa/domain';
import { Button, EmptyState } from '@fsa/ui';
import * as api from '../api';
import type { LibraryShot, SessionRow, TargetRange } from '../api';
import { AddTileMenu } from './AddTileMenu';
import { MetricTile, TileControls, TileFrame } from './MetricTile';
import { ScopeBar } from './ScopeBar';
import { DEFAULT_SCOPE, parseScope, resolveClub, SCOPE_KEY, scopeLine, sessionsForClub, type Scope } from './scope';
import { DEFAULT_LAYOUT, LAYOUT_KEY, moveTile, parseLayout, TILES, type TileDef, type TileId } from './tiles';
import './progression.css';

/** The generated API types leave `m` untyped; the backend sends canonical measurements. */
export function toProgressionShot(s: LibraryShot): ProgressionShot {
  return { id: s.id, sessionId: s.sessionId, club: s.club, m: s.m as unknown as Measurements, excluded: s.excluded };
}

const isUnauthorised = (e: unknown) => e instanceof api.ApiError && e.status === 401;
const tileDef = (id: TileId): TileDef => TILES.find((t) => t.id === id)!;
const sameLayout = (a: readonly TileId[], b: readonly TileId[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const rangeKey = (club: string, metric: string) => JSON.stringify([club, metric]);

/** One club's shots for one set of sessions, with what they were fetched for. */
interface Loaded { key: string; club: string; sessions: SessionRow[]; shots: ProgressionShot[] }

export default function ProgressionPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [layout, setLayout] = useState<TileId[]>([]);
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [ranges, setRanges] = useState<TargetRange[]>([]);
  // Club + metric keys with a target range save or clear in flight.
  const [rangeBusy, setRangeBusy] = useState<ReadonlySet<string>>(new Set());
  // The latest shots answer. Its key differs from the current one while a new answer loads; it stays on screen, dimmed.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The last layout the server confirmed, and the one save in flight (a newer change waits as `queued`).
  const confirmedLayout = useRef<TileId[]>([]);
  const layoutSave = useRef<{ inFlight: boolean; queued: TileId[] | null }>({ inFlight: false, queued: null });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([api.listSessions(), api.getSetting(LAYOUT_KEY), api.getSetting(SCOPE_KEY), api.listTargetRanges()]).then(
      ([sessions, savedLayout, savedScope, savedRanges]) => {
        if (!live) return;
        setRows(sessions);
        const parsed = parseLayout(savedLayout);
        confirmedLayout.current = parsed;
        setLayout(parsed);
        setScope(parseScope(savedScope));
        setRanges(savedRanges);
      },
      (e: unknown) => {
        // A 401 is shown by the app shell as the sign-in hint.
        if (live && !isUnauthorised(e)) setFailed(true);
      },
    );
    return () => { live = false; };
  }, [attempt]);

  const club = rows ? resolveClub(scope, rows) : null;
  const shown = useMemo(() => (rows && club ? sessionsForClub(rows, club, scope) : []), [rows, club, scope]);
  const shownIds = shown.map((s) => s.id);
  const key = club === null ? '' : JSON.stringify([club, shownIds]);

  useEffect(() => {
    if (club === null) return;
    let live = true;
    const sessions = shown;
    api.listLibraryShots({ club, sessionIds: shownIds }).then(
      // Only the answer for the current key lands: a change of key ends `live` for the older request.
      (list) => { if (live) setLoaded({ key, club, sessions, shots: list.map(toProgressionShot) }); },
      (e: unknown) => { if (live && !isUnauthorised(e)) setFailed(true); },
    );
    return () => { live = false; };
    // `key` covers the club and the shown session ids.
  }, [key, attempt]);

  const changeScope = (next: Scope) => {
    // The choice applies for this visit even when saving it fails.
    setScope(next);
    api.putSetting(SCOPE_KEY, next).catch(() => toast.error("Couldn't save the dashboard"));
  };

  const sendLayout = (next: TileId[]) => {
    const save = layoutSave.current;
    save.inFlight = true;
    api.putSetting(LAYOUT_KEY, { tiles: next })
      .then(
        () => { confirmedLayout.current = next; },
        () => {
          // A newer change is waiting and supersedes this one; only its outcome counts.
          if (save.queued) return;
          setLayout(confirmedLayout.current);
          toast.error("Couldn't save the dashboard");
        },
      )
      .finally(() => {
        const queued = save.queued;
        save.queued = null;
        if (queued) sendLayout(queued);
        else save.inFlight = false;
      });
  };
  /** Shows the change at once and saves it; one save at a time, so the server keeps the newest layout. */
  const changeLayout = (next: TileId[]) => {
    setLayout(next);
    if (layoutSave.current.inFlight) layoutSave.current.queued = next;
    else sendLayout(next);
  };

  /** Puts `range` (or none) in place of the club + metric's range on screen. */
  const placeRange = (club: string, metric: string, range: TargetRange | null) =>
    setRanges((cur) => [...cur.filter((r) => r.club !== club || r.metric !== metric), ...(range ? [range] : [])]);
  const markRangeBusy = (k: string, busy: boolean) =>
    setRangeBusy((cur) => {
      const next = new Set(cur);
      if (busy) next.add(k); else next.delete(k);
      return next;
    });
  const saveRange = (club: string, metric: string, previous: TargetRange | null, low: number | null, high: number | null) => {
    const k = rangeKey(club, metric);
    placeRange(club, metric, { id: previous?.id ?? '', club, metric, low, high, updatedAt: previous?.updatedAt ?? '' });
    markRangeBusy(k, true);
    api.putTargetRange({ club, metric, low, high })
      .then(
        (saved) => placeRange(club, metric, saved),
        () => {
          placeRange(club, metric, previous);
          toast.error("Couldn't save the target range");
        },
      )
      .finally(() => markRangeBusy(k, false));
  };
  const clearRange = (range: TargetRange) => {
    const k = rangeKey(range.club, range.metric);
    placeRange(range.club, range.metric, null);
    markRangeBusy(k, true);
    api.deleteTargetRange(range.id)
      .catch(() => {
        placeRange(range.club, range.metric, range);
        toast.error("Couldn't save the target range");
      })
      .finally(() => markRangeBusy(k, false));
  };

  if (failed) {
    return (
      <div className="prog">
        <EmptyState
          title="Couldn't load your sessions"
          body="Check that MyGolfViz is still running, then retry."
          action={<Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}
        />
      </div>
    );
  }
  if (rows === null) return null;
  if (club === null) {
    return (
      <div className="prog">
        <EmptyState
          title="No sessions yet"
          body="Load one or more FlightScope CSV exports to follow a club across sessions."
          action={<Link to="/import" className="fsa-btn fsa-btn--primary fsa-touch">Load Session CSV</Link>}
        />
      </div>
    );
  }

  const busy = loaded !== null && loaded.key !== key;
  const addTile = <AddTileMenu layout={layout} onAdd={(id) => changeLayout([...layout, id])} />;
  return (
    <div className="prog">
      <h1>Progression</h1>
      <ScopeBar
        rows={rows}
        club={club}
        shown={shown}
        scope={scope}
        onChange={changeScope}
        line={loaded ? scopeLine(loaded.shots, scope.shots) : null}
      />
      {loaded && (layout.length === 0 ? (
        <EmptyState title="No tiles on the dashboard" body="Add tiles to follow this club across sessions." action={addTile} />
      ) : (
        <>
          <div className="prog-toolbar">
            {addTile}
            <Button disabled={sameLayout(layout, DEFAULT_LAYOUT)} onClick={() => changeLayout([...DEFAULT_LAYOUT])}>
              Reset to default
            </Button>
          </div>
          <div className={`prog-grid${busy ? ' progression__grid--loading' : ''}`} aria-busy={busy}>
            {layout.map((id, i) => {
              const def = tileDef(id);
              const controls = (
                <TileControls
                  title={def.title}
                  first={i === 0}
                  last={i === layout.length - 1}
                  onMove={(delta) => changeLayout(moveTile(layout, id, delta))}
                  onRemove={() => changeLayout(layout.filter((x) => x !== id))}
                />
              );
              if (def.kind === 'metric' || def.kind === 'accuracy' || def.kind === 'variation') {
                const metric = def.metric!;
                const range = ranges.find((r) => r.club === loaded.club && r.metric === metric) ?? null;
                const rangeEditor = def.kind === 'variation' ? undefined : {
                  save: (low: number | null, high: number | null) => saveRange(loaded.club, metric, range, low, high),
                  clear: () => { if (range) clearRange(range); },
                  busy: rangeBusy.has(rangeKey(loaded.club, metric)),
                };
                return (
                  <MetricTile
                    key={id}
                    def={def}
                    sessions={loaded.sessions}
                    shots={loaded.shots}
                    scope={scope}
                    range={range}
                    controls={controls}
                    rangeEditor={rangeEditor}
                  />
                );
              }
              // Mishit, speed & smash, impact and gapping tiles come with their own views.
              return <TileFrame key={id} def={def} controls={controls} />;
            })}
          </div>
        </>
      ))}
    </div>
  );
}
