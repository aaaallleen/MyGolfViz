import { describe, expect, it } from 'vitest';
import { SPLASH_UPDATING, startupErrorCopy } from './startupError';

describe('startupErrorCopy', () => {
  it('already-running', () => {
    expect(startupErrorCopy('already-running')).toEqual({
      title: 'MyGolfViz is already running',
      body: 'Another copy is using your data folder (for example npm run local in a terminal). Quit it, then choose Restart backend.',
    });
  });
  it('failed', () => {
    expect(startupErrorCopy('failed')).toEqual({ title: "MyGolfViz couldn't start", body: 'Details are in the logs.' });
  });
  it('timeout', () => {
    expect(startupErrorCopy('timeout')).toEqual({
      title: "MyGolfViz couldn't start",
      body: 'It took too long to start. Details are in the logs.',
    });
  });
  it('crashed', () => {
    expect(startupErrorCopy('crashed')).toEqual({
      title: 'MyGolfViz stopped unexpectedly',
      body: 'Your saved sessions are safe. Restart the backend to continue.',
    });
  });
  it('update-timeout', () => {
    expect(startupErrorCopy('update-timeout')).toEqual({
      title: 'Updating your data took too long',
      body: 'MyGolfViz stopped the update after 10 minutes. Your data is as it was before the update. Restart the backend to try again; details are in the logs.',
    });
  });
});

describe('SPLASH_UPDATING', () => {
  it('tells the owner an upgrade is running', () => {
    expect(SPLASH_UPDATING).toBe('Updating your data… This can take a few minutes.');
  });
});
