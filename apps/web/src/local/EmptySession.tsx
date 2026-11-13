import { Link } from 'react-router';
import { EmptyState } from '@fsa/ui';
import { useWorkingSet } from '../state/store';
import { ImportsPanel } from './ImportsPanel';

/** A saved session with no shots: invites a CSV and still offers the files panel and Delete session. */
export function EmptySession() {
  const { sessionId } = useWorkingSet();
  return (
    <div className="empty-session">
      <EmptyState
        title="No shots in this session"
        body="Load one or more CSV exports into it."
        action={<Link className="fsa-btn fsa-btn--primary fsa-touch" to={`/import?session=${sessionId}`}>Load Session CSV</Link>}
      />
      <ImportsPanel />
    </div>
  );
}
