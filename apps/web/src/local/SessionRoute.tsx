import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@fsa/ui';
import { InspectorPage, OverviewPage } from '../routes';
import { useWorkingSet } from '../state/store';
import { ApiError, getSession, getShots } from './api';
import { EmptySession } from './EmptySession';
import { sessionToWorkingSet } from './sessionToWorkingSet';

export function SessionRoute({ page }: { page: 'overview' | 'inspect' }) {
  const { id = '' } = useParams();
  const ws = useWorkingSet();
  const { sessionId, loadSession } = ws;
  const [failure, setFailure] = useState<{ id: string; notFound: boolean } | null>(null);

  useEffect(() => {
    if (sessionId === id) return;
    let cancelled = false;
    Promise.all([getSession(id), getShots(id)]).then(
      ([{ session, imports }, shots]) => {
        if (cancelled) return;
        setFailure(null);
        loadSession({ sessionId: id, ...sessionToWorkingSet(session, imports, shots), keepView: false });
      },
      (e: unknown) => {
        if (!cancelled) setFailure({ id, notFound: e instanceof ApiError && e.status === 404 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, sessionId, loadSession]);

  if (sessionId !== id) {
    if (failure?.id === id) {
      const back = <Link to="/sessions">Sessions</Link>;
      return failure.notFound ? (
        <EmptyState title="Session not found" body="It may have been deleted." action={back} />
      ) : (
        <EmptyState title="Couldn't open this session" body="Try again from the Sessions list." action={back} />
      );
    }
    return <p role="status">Loading session…</p>;
  }
  if (!ws.workingSet || ws.workingSet.shots.length === 0) return <EmptySession />;
  return page === 'overview' ? <OverviewPage /> : <InspectorPage />;
}
