import { flushSync } from 'react-dom';

/**
 * Runs `update` (a React state change) inside a view transition, so tiles glide to their new places instead of
 * jumping. Without View Transitions support, or with reduced motion, the change happens at once.
 */
export function withViewTransition(update: () => void): void {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
