import { createContext, useContext } from 'react';
import type { ImportRow, SessionRow } from './api';

/** The saved rows behind the open session. SessionRoute sets it from the same response it gives the store. */
export type OpenSession = { session: SessionRow; imports: ImportRow[] };
export type OpenSessionApi = { open: OpenSession | null; setOpen(o: OpenSession): void };

export const OpenSessionContext = createContext<OpenSessionApi>({ open: null, setOpen: () => {} });
export const useOpenSession = () => useContext(OpenSessionContext);
