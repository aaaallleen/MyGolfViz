import { useWorkingSet } from './state/store';

export interface AppPaths {
  home: string;
  load: string;
  overview: string;
  inspect: string;
}

/** The app's own links, so shared components work in both the public and the local build. */
export function useAppPaths(): AppPaths {
  const { sessionId } = useWorkingSet();
  if (import.meta.env.VITE_APP_MODE === 'local') {
    if (!sessionId) return { home: '/sessions', load: '/import', overview: '/sessions', inspect: '/sessions' };
    const id = encodeURIComponent(sessionId);
    return { home: '/sessions', load: `/import?session=${id}`, overview: `/sessions/${id}`, inspect: `/sessions/${id}/inspect` };
  }
  return { home: '/', load: '/', overview: '/overview', inspect: '/inspect' };
}
