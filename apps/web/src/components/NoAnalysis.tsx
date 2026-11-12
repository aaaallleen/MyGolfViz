import { useNavigate } from 'react-router';
import { Button, EmptyState } from '@fsa/ui';

export function NoAnalysis() {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="No analysis yet"
      body="Load one or more FlightScope CSV exports to see this view."
      action={<Button variant="primary" onClick={() => navigate('/')}>Load Session CSV</Button>}
    />
  );
}
