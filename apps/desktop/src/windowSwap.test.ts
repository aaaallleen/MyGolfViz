import { describe, expect, it } from 'vitest';
import { loadsBehindSplash } from './windowSwap';

describe('loadsBehindSplash', () => {
  it('loads the app behind the splash, so the splash keeps spinning', () => {
    expect(loadsBehindSplash('splash', 'app', false)).toBe(true);
  });
  it('loads in place in a full-screen window', () => {
    expect(loadsBehindSplash('splash', 'app', true)).toBe(false);
  });
  it('loads in place when the window does not show the splash', () => {
    expect(loadsBehindSplash('app', 'app', false)).toBe(false); // a crashed renderer reloading
    expect(loadsBehindSplash('error', 'app', false)).toBe(false);
    expect(loadsBehindSplash(null, 'app', false)).toBe(false); // a new window, e.g. reopened from the Dock
  });
  it('loads the splash and the error page in place', () => {
    for (const shown of ['splash', 'app', 'error', null] as const) {
      expect(loadsBehindSplash(shown, 'splash', false)).toBe(false);
      expect(loadsBehindSplash(shown, 'error', false)).toBe(false);
    }
  });
});
