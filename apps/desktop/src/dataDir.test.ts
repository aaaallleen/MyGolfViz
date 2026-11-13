import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDir } from './dataDir';

describe('resolveDataDir', () => {
  it('uses MYGOLFVIZ_DATA_DIR when set', () => {
    expect(resolveDataDir({ MYGOLFVIZ_DATA_DIR: '/tmp/golf-data' }, '/Users/x/Library/Application Support')).toBe(
      '/tmp/golf-data',
    );
  });

  it.each([{}, { MYGOLFVIZ_DATA_DIR: '' }])('falls back to <appData>/MyGolfViz (%o)', (env) => {
    expect(resolveDataDir(env, '/Users/x/Library/Application Support')).toBe(
      path.join('/Users/x/Library/Application Support', 'MyGolfViz'),
    );
  });
});
