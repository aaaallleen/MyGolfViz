import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { NoAnalysis } from './components/NoAnalysis';
import { HelpPage } from './pages/HelpPage';
import { lazyPage } from './lazyPage';
import { LoadPage } from './pages/LoadPage';
import { useWorkingSet } from './state/store';

// Load and Help are in the main file; Overview and Inspector, the heavy pages, are separate files
// that preloadPages() fetches as soon as the app starts, so they still open after going offline.
const OverviewPage = lazyPage(() => import('./pages/OverviewPage').then((m) => m.OverviewPage));
const InspectorPage = lazyPage(() => import('./pages/InspectorPage').then((m) => m.InspectorPage));

export function preloadPages(): Promise<void> {
  return Promise.all([OverviewPage.preload(), InspectorPage.preload()]).then(() => undefined);
}

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
