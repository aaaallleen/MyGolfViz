import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, SegmentedControl } from '@fsa/ui';
import * as api from './api';
import type { SessionRow } from './api';
import { DEFAULT_SORT, filterSessions, nextSort, readSort, sortSessions, type SortColumn } from './library';
import { LibraryCalendar } from './LibraryCalendar';
import { LibraryList } from './LibraryList';

export function LibraryPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  // In the URL, like the view, so a reload or Back from a session keeps the order.
  const sort = readSort(params.get('sort'));

  useEffect(() => {
    let live = true;
    setFailed(false);
    api.listSessions().then(
      (r) => { if (live) setRows(r); },
      (e: unknown) => {
        // A 401 is shown by the app shell as the sign-in hint.
        if (live && !(e instanceof api.ApiError && e.status === 401)) setFailed(true);
      },
    );
    return () => { live = false; };
  }, [attempt]);

  const shown = useMemo(() => sortSessions(filterSessions(rows ?? [], query), sort), [rows, query, sort]);
  if (rows === null) {
    if (!failed) return null;
    return (
      <div className="library">
        <EmptyState
          title="Couldn't load your sessions"
          body="Check that MyGolfViz is still running, then retry."
          action={<Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="library">
        <EmptyState
          title="No sessions yet"
          body="Load one or more FlightScope CSV exports. You choose the session they belong to and what it is called."
          action={<Link to="/import" className="fsa-btn fsa-btn--primary fsa-touch">Load Session CSV</Link>}
        />
      </div>
    );
  }

  const shots = rows.reduce((n, r) => n + r.shotCount, 0);
  const files = rows.reduce((n, r) => n + r.fileCount, 0);
  const setView = (v: 'list' | 'calendar') =>
    setParams((p) => { const next = new URLSearchParams(p); if (v === 'calendar') next.set('view', 'calendar'); else next.delete('view'); return next; });
  const sortBy = (column: SortColumn) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      const s = nextSort(sort, column);
      if (s === DEFAULT_SORT) next.delete('sort'); else next.set('sort', s);
      return next;
    }, { replace: true });

  return (
    <div className="library">
      <section className="library__head">
        <div className="library__title">
          <h1>Sessions</h1>
          <div className="lib-muted">{`${rows.length} sessions · ${shots} shots · ${files} source files`}</div>
        </div>
        <div className="library__controls">
          <div className="fsa-field library__search">
            <label htmlFor="library-search">Find a session</label>
            <input id="library-search" type="search" className="field__input fsa-touch" placeholder="Name, club or note" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="library__view">
          <SegmentedControl
            label="View"
            value={view}
            options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]}
            onChange={setView}
          />
        </div>
      </section>
      {view === 'calendar'
        ? <LibraryCalendar rows={shown} />
        : shown.length === 0
          ? <p className="lib-muted">No session matches that search.</p>
          : <LibraryList rows={shown} sort={sort} onSort={sortBy} onDeleted={(id) => setRows((r) => (r ?? []).filter((x) => x.id !== id))} />}
    </div>
  );
}
