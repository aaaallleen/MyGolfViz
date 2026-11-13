import { describe, expect, it } from 'vitest';
import { startupErrorCopy } from './startupError';

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
});
