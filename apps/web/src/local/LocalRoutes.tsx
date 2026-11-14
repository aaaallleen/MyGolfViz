import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { EmptyState } from '@fsa/ui';
import { AppShell } from '../layout/AppShell';
import { HelpPage } from '../pages/HelpPage';
import { LoadPage } from '../pages/LoadPage';
import { listSessions, UNAUTHORISED_EVENT } from './api';
import { ImportResultPage } from './ImportResultPage';
import { OpenSessionProvider } from './OpenSession';
import { LibraryPage } from './LibraryPage';
import { SessionRoute } from './SessionRoute';
import { useSessionSync } from './useSessionSync';

const ProgressionPage = lazy(() => import('./progression/ProgressionPage'));

export default function LocalRoutes() {
  const [unauthorised, setUnauthorised] = useState(false);
  useSessionSync();
  // Check the token on start (any route, including Help, which makes no call of its own): a 401 here shows the sign-in hint instead of a half-working app.
  useEffect(() => {
    listSessions().catch(() => {});
  }, []);
  useEffect(() => {
    const on = () => setUnauthorised(true);
    window.addEventListener(UNAUTHORISED_EVENT, on);
    return () => window.removeEventListener(UNAUTHORISED_EVENT, on);
  }, []);

  if (unauthorised) {
    return (
      <EmptyState
        title="Open MyGolfViz from the link printed in the terminal."
        body="This page only works with the private link the app prints when it starts."
      />
    );
  }
  return (
    <OpenSessionProvider>
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route path="/sessions" element={<LibraryPage />} />
        <Route path="/sessions/:id" element={<SessionRoute page="overview" />} />
        <Route path="/sessions/:id/inspect" element={<SessionRoute page="inspect" />} />
        <Route path="/progression" element={<Suspense fallback={null}><ProgressionPage /></Suspense>} />
        <Route path="/import" element={<LoadPage />} />
        <Route path="/import/result" element={<ImportResultPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Routes>
    </AppShell>
    </OpenSessionProvider>
  );
}
