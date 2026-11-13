import path from 'node:path';

export function backendCommand(o: {
  packaged: boolean;
  resourcesPath: string;
  repoRoot: string;
  dataDir: string;
  env: NodeJS.ProcessEnv;
}): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const command = o.packaged
    ? path.join(o.resourcesPath, 'api', 'mygolfviz-api', 'mygolfviz-api')
    : path.join(o.repoRoot, 'apps', 'api', '.venv', 'bin', 'mygolfviz-api');
  const webDir = o.packaged ? path.join(o.resourcesPath, 'web') : path.join(o.repoRoot, 'apps', 'web', 'dist-local');
  const env = { ...o.env };
  delete env.MYGOLFVIZ_TOKEN;
  delete env.MYGOLFVIZ_DATA_DIR;
  return {
    command,
    args: ['--data-dir', o.dataDir, '--port', '0', '--static-dir', webDir, '--exit-with-stdin'],
    env,
  };
}
