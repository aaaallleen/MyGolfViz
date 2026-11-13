import path from 'node:path';

/**
 * The data folder, as an absolute path: MYGOLFVIZ_DATA_DIR if set (a relative value is resolved
 * against the working directory), else `<appData>/MyGolfViz` (shared with `npm run local`).
 */
export function resolveDataDir(env: NodeJS.ProcessEnv, appData: string): string {
  const fromEnv = env.MYGOLFVIZ_DATA_DIR;
  return path.resolve(fromEnv ? fromEnv : path.join(appData, 'MyGolfViz'));
}
