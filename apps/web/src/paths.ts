import { useWorkingSet } from './state/store';

export interface AppPaths {
  home: string;
  load: string;
  overview: string;
  inspect: string;
  /** The Compare page; null in the public build, which has none. */
  compare: string | null;
  /** The Gapping page; null in the public build, which has none. */
  gapping: string | null;
}

/** The app's own links, so shared components work in both the public and the local build. */
export function useAppPaths(): AppPaths {
  const { sessionId } = useWorkingSet();
  if (import.meta.env.VITE_APP_MODE === 'local') {
    if (!sessionId) return { home: '/sessions', load: '/import', overview: '/sessions', inspect: '/sessions', compare: '/compare', gapping: '/gapping' };
    const id = encodeURIComponent(sessionId);
    return { home: '/sessions', load: `/import?session=${id}`, overview: `/sessions/${id}`, inspect: `/sessions/${id}/inspect`, compare: '/compare', gapping: '/gapping' };
  }
  return { home: '/', load: '/', overview: '/overview', inspect: '/inspect', compare: null, gapping: null };
}
