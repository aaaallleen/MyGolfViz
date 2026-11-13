export type StartupErrorKind = 'already-running' | 'failed' | 'timeout' | 'update-timeout' | 'crashed';

/** The splash's status line while the backend upgrades the database. */
export const SPLASH_UPDATING = 'Updating your data… This can take a few minutes.';

export function startupErrorCopy(kind: StartupErrorKind): { title: string; body: string } {
  switch (kind) {
    case 'already-running':
      return {
        title: 'MyGolfViz is already running',
        body: 'Another copy is using your data folder (for example npm run local in a terminal). Quit it, then choose Restart backend.',
      };
    case 'timeout':
      return { title: "MyGolfViz couldn't start", body: 'It took too long to start. Details are in the logs.' };
    case 'update-timeout':
      return {
        title: 'Updating your data took too long',
        body: 'MyGolfViz stopped the update after 10 minutes. Your data is as it was before the update. Restart the backend to try again; details are in the logs.',
      };
    case 'crashed':
      return {
        title: 'MyGolfViz stopped unexpectedly',
        body: 'Your saved sessions are safe. Restart the backend to continue.',
      };
    case 'failed':
      return { title: "MyGolfViz couldn't start", body: 'Details are in the logs.' };
  }
}
