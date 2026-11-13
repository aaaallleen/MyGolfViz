import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ImportRow, SessionRow } from './api';

/** The saved rows behind the open session. SessionRoute sets it from the same response it gives the store. */
export type OpenSession = { session: SessionRow; imports: ImportRow[] };
export type OpenSessionApi = { open: OpenSession | null; setOpen(o: OpenSession): void };

export const OpenSessionContext = createContext<OpenSessionApi | null>(null);

/** Lives above the routes so the open session's rows survive navigating away and back. */
export function OpenSessionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenSession | null>(null);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <OpenSessionContext.Provider value={value}>{children}</OpenSessionContext.Provider>;
}

export function useOpenSession(): OpenSessionApi {
  const api = useContext(OpenSessionContext);
  if (!api) throw new Error('useOpenSession must be used inside an OpenSessionProvider');
  return api;
}
