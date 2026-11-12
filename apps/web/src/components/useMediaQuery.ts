import { useEffect, useState } from 'react';

/** Tracks a CSS media query. Defaults to false where matchMedia is unavailable, e.g. jsdom. */
export function useMediaQuery(query: string): boolean {
  const mql = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
  const [matches, setMatches] = useState(() => mql()?.matches ?? false);
  useEffect(() => {
    const m = mql();
    if (!m) return;
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}
