import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { ProgressionShot } from '@fsa/analytics';
import type { Measurements } from '@fsa/domain';
import { Button, EmptyState } from '@fsa/ui';
import * as api from '../api';
import type { LibraryShot, SessionRow, TargetRange } from '../api';
import { MetricTile, TileFrame } from './MetricTile';
import { ScopeBar } from './ScopeBar';
import { DEFAULT_SCOPE, parseScope, resolveClub, SCOPE_KEY, scopeLine, sessionsForClub, type Scope } from './scope';
import { LAYOUT_KEY, parseLayout, TILES, type TileDef, type TileId } from './tiles';
import './progression.css';

/** The generated API types leave `m` untyped; the backend sends canonical measurements. */
export function toProgressionShot(s: LibraryShot): ProgressionShot {
  return { id: s.id, sessionId: s.sessionId, club: s.club, m: s.m as unknown as Measurements, excluded: s.excluded };
}

const isUnauthorised = (e: unknown) => e instanceof api.ApiError && e.status === 401;
const tileDef = (id: TileId): TileDef => TILES.find((t) => t.id === id)!;

export default function ProgressionPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [layout, setLayout] = useState<TileId[]>([]);
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [ranges, setRanges] = useState<TargetRange[]>([]);
  // The shots answer for one club + session set; another key means it is still loading.
  const [loaded, setLoaded] = useState<{ key: string; shots: ProgressionShot[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([api.listSessions(), api.getSetting(LAYOUT_KEY), api.getSetting(SCOPE_KEY), api.listTargetRanges()]).then(
      ([sessions, savedLayout, savedScope, savedRanges]) => {
        if (!live) return;
        setRows(sessions);
        setLayout(parseLayout(savedLayout));
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
    api.listLibraryShots({ club, sessionIds: shownIds }).then(
      (list) => { if (live) setLoaded({ key, shots: list.map(toProgressionShot) }); },
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

  const shots = loaded?.key === key ? loaded.shots : null;
  return (
    <div className="prog">
      <section className="prog__head">
        <h1>Progression</h1>
        <ScopeBar
          rows={rows}
          club={club}
          shown={shown}
          scope={scope}
          onChange={changeScope}
          line={shots ? scopeLine(shots, scope.shots) : null}
        />
      </section>
      {shots && (layout.length === 0 ? (
        <EmptyState title="No tiles on the dashboard" body="Add tiles to follow this club across sessions." />
      ) : (
        <div className="prog-grid">
          {layout.map((id) => {
            const def = tileDef(id);
            if (def.kind === 'metric' || def.kind === 'accuracy' || def.kind === 'variation') {
              const range = ranges.find((r) => r.club === club && r.metric === def.metric) ?? null;
              return <MetricTile key={id} def={def} sessions={shown} shots={shots} scope={scope} range={range} controls={null} />;
            }
            // Mishit, speed & smash, impact and gapping tiles come with their own views.
            return <TileFrame key={id} def={def} />;
          })}
        </div>
      ))}
    </div>
  );
}
