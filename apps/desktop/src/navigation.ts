import { fileURLToPath } from 'node:url';

export type NavigationDecision = 'allow' | 'external' | 'block';

/**
 * Decides what to do with a navigation or window.open request.
 * Only the backend origin may load in the app window; other http(s) sites open in the
 * system browser; everything else (file:, javascript:, data:, garbage) is blocked.
 * While the backend origin is unknown (splash, error page) nothing may navigate.
 */
export function classifyNavigation(target: string, appOrigin: string | null): NavigationDecision {
  if (appOrigin === null) return 'block';
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return 'block';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'block';
  if (url.origin === appOrigin) return 'allow';
  // Another port on the loopback host is never "the web": it could be any local service.
  if (url.hostname === new URL(appOrigin).hostname) return 'block';
  return 'external';
}

/**
 * Whether a frame may use the preload API: the app page (backend origin) or one of the
 * bundled local pages (splash, error), compared by file path so the query string is ignored.
 */
export function isTrustedPage(frameUrl: string, appOrigin: string | null, localPages: string[]): boolean {
  let url: URL;
  try {
    url = new URL(frameUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'file:') {
    try {
      return localPages.includes(fileURLToPath(url));
    } catch {
      return false;
    }
  }
  return appOrigin !== null && (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === appOrigin;
}
