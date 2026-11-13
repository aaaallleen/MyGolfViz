import { Link, Navigate, useLocation } from 'react-router';
import type { ImportResponse } from './api';

const REASONS: Record<string, string> = {
  in_other_session: 'Also in another session — not imported',
  storage_error: "Couldn't save this file",
};
const reasonText = (reason: string | null | undefined) => (reason ? REASONS[reason] : undefined) ?? 'Not a valid FlightScope export';

export function ImportResultPage() {
  const state = useLocation().state as ImportResponse | null;
  if (!state || !state.session || !Array.isArray(state.results)) return <Navigate to="/sessions" replace />;
  const { session, results } = state;
  const added = results.filter((r) => r.status === 'imported');
  const shotsAdded = added.reduce((n, r) => n + (r.shotCount ?? 0), 0);
  const skipped = results.filter((r) => r.status === 'skipped_duplicate').length;
  const invalid = results.filter((r) => r.status === 'invalid').length;
  return (
    <div className="import-result">
      <h1>{`Imported into “${session.name}”`}</h1>
      <p>{`${added.length} files added · ${shotsAdded} shots added · ${skipped} skipped · ${invalid} not imported`}</p>
      <ul className="import-result__files" aria-label="Files">
        {results.map((r) => (
          <li key={r.field}>
            <span className="import-result__name">{r.name}</span>
            {r.status === 'imported' && <span>{`Imported · ${r.shotCount ?? 0} shots`}</span>}
            {r.status === 'skipped_duplicate' && <span>Skipped · already in this session</span>}
            {r.status === 'invalid' && <span>{reasonText(r.reason)}</span>}
            {r.warnings.length > 0 && <span>{`${r.warnings.length} ${r.warnings.length === 1 ? 'warning' : 'warnings'}`}</span>}
          </li>
        ))}
      </ul>
      <div className="import-result__actions">
        <Link className="fsa-btn fsa-touch fsa-btn--primary" to={`/sessions/${session.id}`}>Open session</Link>
        <Link className="fsa-btn fsa-touch fsa-btn--secondary" to={`/import?session=${encodeURIComponent(session.id)}`}>Load more files</Link>
      </div>
    </div>
  );
}
