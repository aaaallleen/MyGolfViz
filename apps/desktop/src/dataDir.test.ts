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

  it('resolves a relative MYGOLFVIZ_DATA_DIR against the working directory', () => {
    const r = resolveDataDir({ MYGOLFVIZ_DATA_DIR: 'golf-data' }, '/Users/x/Library/Application Support');
    expect(path.isAbsolute(r)).toBe(true);
    expect(r).toBe(path.resolve(process.cwd(), 'golf-data'));
  });

  it('always returns an absolute path', () => {
    expect(path.isAbsolute(resolveDataDir({}, 'Library/Application Support'))).toBe(true);
  });
});
