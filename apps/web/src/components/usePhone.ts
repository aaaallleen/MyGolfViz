import { useEffect, useState } from 'react';

const QUERY = '(max-width: 639px)';

/** True below 640 px. Defaults to false (desktop) where matchMedia is unavailable, e.g. jsdom. */
export function usePhone(): boolean {
  const mql = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);
  const [phone, setPhone] = useState(() => mql()?.matches ?? false);
  useEffect(() => {
    const m = mql();
    if (!m) return;
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
