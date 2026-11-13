import path from 'node:path';

/** The data folder: MYGOLFVIZ_DATA_DIR if set, else `<appData>/MyGolfViz` (shared with `npm run local`). */
export function resolveDataDir(env: NodeJS.ProcessEnv, appData: string): string {
  const fromEnv = env.MYGOLFVIZ_DATA_DIR;
  return fromEnv ? fromEnv : path.join(appData, 'MyGolfViz');
}
