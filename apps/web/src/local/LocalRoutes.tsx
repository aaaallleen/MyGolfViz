import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { EmptyState } from '@fsa/ui';
import { AppShell } from '../layout/AppShell';
import { HelpPage } from '../pages/HelpPage';
import { listSessions, UNAUTHORISED_EVENT } from './api';

// Placeholders: the sessions, import and inspector pages arrive in later tasks.
const Placeholder = ({ title }: { title: string }) => <h1>{title}</h1>;

export default function LocalRoutes() {
  const [unauthorised, setUnauthorised] = useState(false);
  // Check the token on start: a 401 here shows the sign-in hint instead of a half-working app.
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
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route path="/sessions" element={<Placeholder title="Sessions" />} />
        <Route path="/sessions/:id" element={<Placeholder title="Session" />} />
        <Route path="/sessions/:id/inspect" element={<Placeholder title="Shot Inspector" />} />
        <Route path="/import" element={<Placeholder title="Load Session CSV" />} />
        <Route path="/import/result" element={<Placeholder title="Import result" />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Routes>
    </AppShell>
  );
}
