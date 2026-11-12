import { useMediaQuery } from './useMediaQuery';

/** True below 640 px. Defaults to false (desktop) where matchMedia is unavailable, e.g. jsdom. */
export function usePhone(): boolean {
  return useMediaQuery('(max-width: 639px)');
}
