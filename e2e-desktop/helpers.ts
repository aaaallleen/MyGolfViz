import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { trackCspViolations } from '../e2e-local/helpers';

declare global {
  // Test hook that the app's main process sets when MYGOLFVIZ_E2E=1 (apps/desktop/src/main.ts).
  var __mygolfviz: { backendPid(): number | null; appOrigin(): string | null } | undefined;
}

const repoRoot = resolve(import.meta.dirname, '..');
const splashPage = /\/static\/splash\.html$/;

/**
 * Launches the app on `dataDir`: the development app (`electron apps/desktop`), or the executable named by
 * MYGOLFVIZ_DESKTOP_EXECUTABLE (the packaged app). Returns once its window exists, which may still be on the splash.
 * Content-Security-Policy violations of the window are recorded from the first page after the splash.
 */
export async function launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'MYGOLFVIZ_TOKEN') env[key] = value;
  }
  env.MYGOLFVIZ_DATA_DIR = dataDir;
  env.MYGOLFVIZ_E2E = '1';

  const executable = process.env.MYGOLFVIZ_DESKTOP_EXECUTABLE;
  const app = await electron.launch(
    executable
      ? { executablePath: resolve(repoRoot, executable), env }
      : { args: [resolve(repoRoot, 'apps/desktop')], env },
  );
  try {
    const page = await app.firstWindow();
    await trackCspViolations(page);
    // The tracker applies from the next page on. If the window has already left the splash, load that page again.
    if (!splashPage.test(page.url())) await page.reload();
    return { app, page };
  } catch (err) {
    await app.close();
    throw err;
  }
}

/** The pid of the app's current backend, or null while none is running. */
export const backendPid = (app: ElectronApplication): Promise<number | null> =>
  app.evaluate(() => globalThis.__mygolfviz!.backendPid());

/** The origin the app is showing, or null while it shows the splash or an error. */
export const appOrigin = (app: ElectronApplication): Promise<string | null> =>
  app.evaluate(() => globalThis.__mygolfviz!.appOrigin());

/** Whether a process with this pid exists. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Waits for the library: its Sessions heading, or the empty state that an empty library shows in its place. */
export async function expectLibrary(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /^(Sessions|No sessions yet)$/ })).toBeVisible();
}

/**
 * Starts a backend on `dataDir` the way `npm run local` does, so it holds that data folder's lock. Resolves once it
 * prints its port line.
 */
export async function startLocalBackend(dataDir: string): Promise<ChildProcess> {
  const env = { ...process.env };
  delete env.MYGOLFVIZ_TOKEN;
  delete env.MYGOLFVIZ_DATA_DIR;
  const child = spawn(resolve(repoRoot, 'apps/api/.venv/bin/mygolfviz-api'), ['--data-dir', dataDir, '--port', '0'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr: string[] = [];
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => stderr.push(chunk));
  const lines = createInterface({ input: child.stdout! });
  const exited = once(child, 'exit').then(([code]) => {
    throw new Error(`the backend exited (code ${code}) before its port line:\n${stderr.join('')}`);
  });
  try {
    await Promise.race([
      (async () => {
        for await (const line of lines) if (/"port"\s*:/.test(line)) return;
        throw new Error(`the backend closed its output before its port line:\n${stderr.join('')}`);
      })(),
      exited,
    ]);
  } catch (err) {
    await stopProcess(child);
    throw err;
  }
  // Keep draining stdout, so the backend never blocks on a full pipe.
  child.stdout!.resume();
  return child;
}

/** Stops `child` with SIGTERM (SIGKILL after 5 s) and waits for it to exit. */
export async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
}
