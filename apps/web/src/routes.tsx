import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { NoAnalysis } from './components/NoAnalysis';
import { HelpPage } from './pages/HelpPage';
import { useWorkingSet } from './state/store';

function LoadPage() {
  // Placeholder: replaced by the real Load page in Task 13.
  return <h1>Load Session CSV</h1>;
}

function Gated({ title }: { title: string }) {
  const { workingSet } = useWorkingSet();
  if (!workingSet) return <NoAnalysis />;
  // Placeholder until the Overview / Inspector pages land.
  return <h1>{title}</h1>;
}

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LoadPage />} />
        <Route path="/overview" element={<Gated title="Overview" />} />
        <Route path="/inspect" element={<Gated title="Shot Inspector" />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
