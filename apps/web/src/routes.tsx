import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { NoAnalysis } from './components/NoAnalysis';
import { HelpPage } from './pages/HelpPage';
import { InspectorPage } from './pages/InspectorPage';
import { LoadPage } from './pages/LoadPage';
import { OverviewPage } from './pages/OverviewPage';
import { useWorkingSet } from './state/store';

function Gated({ title, Page }: { title: string; Page?: () => ReactNode }) {
  const { workingSet } = useWorkingSet();
  if (!workingSet) return <NoAnalysis />;
  if (Page) return <Page />;
  return <h1>{title}</h1>;
}

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LoadPage />} />
        <Route path="/overview" element={<Gated title="Overview" Page={OverviewPage} />} />
        <Route path="/inspect" element={<Gated title="Shot Inspector" Page={InspectorPage} />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
