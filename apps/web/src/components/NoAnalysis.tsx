import { useNavigate } from 'react-router';
import { useAppPaths } from '../paths';
import { Button, EmptyState } from '@fsa/ui';

export function NoAnalysis() {
  const navigate = useNavigate();
  const paths = useAppPaths();
  return (
    <EmptyState
      title="No analysis yet"
      body="Load one or more FlightScope CSV exports to see this view."
      action={<Button variant="primary" onClick={() => navigate(paths.load)}>Load Session CSV</Button>}
    />
  );
}
