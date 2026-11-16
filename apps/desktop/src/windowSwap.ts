/** What a window can show. */
export type PageKind = 'splash' | 'app' | 'error';

/**
 * Whether the app should load in a hidden window that replaces the window once it has painted, rather than in the
 * window itself. Only when the window shows the splash: leaving it in place would unload it and freeze its animation
 * on its last frame until the app paints. A full-screen window loads in place, because a replacement would open
 * outside its full-screen Space.
 */
export function loadsBehindSplash(shown: PageKind | null, next: PageKind, fullScreen: boolean): boolean {
  return shown === 'splash' && next === 'app' && !fullScreen;
}

