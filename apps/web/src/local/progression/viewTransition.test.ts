import { afterEach, describe, expect, it, vi } from 'vitest';
import { withViewTransition } from './viewTransition';

/** Gives jsdom (which has no View Transitions) a stand-in `document.startViewTransition`. */
function supportViewTransitions(start: (cb: () => void) => void) {
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('withViewTransition', () => {
  it('runs the update inside a view transition when the browser supports one', () => {
    mockReducedMotion(false);
    const start = vi.fn((cb: () => void) => cb());
    supportViewTransitions(start);
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('updates at once with reduced motion', () => {
    mockReducedMotion(true);
    const start = vi.fn();
    supportViewTransitions(start);
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('updates at once without View Transitions support', () => {
    mockReducedMotion(false);
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
