import { describe, expect, it } from 'vitest';
import { backendCommand } from './command';

const base = { resourcesPath: '/res', repoRoot: '/repo', dataDir: '/data' };
const env = { PATH: '/usr/bin', MYGOLFVIZ_TOKEN: 'secret', MYGOLFVIZ_DATA_DIR: '/other', HOME: '/h' };

describe('backendCommand', () => {
  it('uses the bundled binary when packaged', () => {
    const r = backendCommand({ ...base, packaged: true, env });
    expect(r.command).toBe('/res/api/mygolfviz-api/mygolfviz-api');
    expect(r.args).toEqual(['--data-dir', '/data', '--port', '0', '--static-dir', '/res/web', '--exit-with-stdin']);
  });

  it('uses the repo venv in development', () => {
    const r = backendCommand({ ...base, packaged: false, env });
    expect(r.command).toBe('/repo/apps/api/.venv/bin/mygolfviz-api');
    expect(r.args).toEqual([
      '--data-dir', '/data', '--port', '0', '--static-dir', '/repo/apps/web/dist-local', '--exit-with-stdin',
    ]);
  });

  it.each([true, false])('strips token and data dir but keeps PATH (packaged=%s)', (packaged) => {
    const r = backendCommand({ ...base, packaged, env });
    expect(r.env).not.toHaveProperty('MYGOLFVIZ_TOKEN');
    expect(r.env).not.toHaveProperty('MYGOLFVIZ_DATA_DIR');
    expect(r.env.PATH).toBe('/usr/bin');
    expect(r.env.HOME).toBe('/h');
    expect(env.MYGOLFVIZ_TOKEN).toBe('secret');
  });
});
