import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

declare global {
  // Test hook that the app's main process sets when MYGOLFVIZ_E2E=1 (apps/desktop/src/main.ts).
  var __mygolfviz:
    | { backendPid(): number | null; appOrigin(): string | null; swaps(): string[] }
    | undefined;
}

const repoRoot = resolve(import.meta.dirname, '..');
const splashPage = /\/static\/splash\.html(\?.*)?$/;

export interface Launched {
  app: ElectronApplication;
  /** The first window: the splash, and the error page if the backend fails. The app opens in a window of its own. */
  page: Page;
  /** Content-Security-Policy violations in any of the app's windows, from the first page after the splash on. */
  cspViolations: string[];
}

/**
 * Launches the app on `dataDir`: the development app (`electron apps/desktop`), or the executable named by
 * MYGOLFVIZ_DESKTOP_EXECUTABLE (the packaged app). Returns once its first window exists, which may still be on the
 * splash.
 */
export async function launchApp(dataDir: string, extraEnv: Record<string, string> = {}): Promise<Launched> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'MYGOLFVIZ_TOKEN') env[key] = value;
  }
  env.MYGOLFVIZ_DATA_DIR = dataDir;
  env.MYGOLFVIZ_E2E = '1';
  Object.assign(env, extraEnv);

  const executable = process.env.MYGOLFVIZ_DESKTOP_EXECUTABLE;
  const app = await electron.launch(
    executable
      ? { executablePath: resolve(repoRoot, executable), env }
      : { args: [resolve(repoRoot, 'apps/desktop')], env },
  );
  try {
    const page = await app.firstWindow();
    // Tracked on the context, so the window the app opens in is covered from its first page.
    const cspViolations: string[] = [];
    const context = app.context();
    await context.exposeBinding('__cspReport', (_source, report: string) => void cspViolations.push(report));
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) =>
        (window as unknown as { __cspReport: (r: string) => void }).__cspReport(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    const watchConsole = (p: Page) =>
      p.on('console', (m) => {
        if (/content security policy/i.test(m.text())) cspViolations.push(`console: ${m.text()}`);
      });
    app.windows().forEach(watchConsole);
    app.on('window', watchConsole);
    // The window starts on about:blank, and reloading that could race main's load of the splash. Wait for a real page.
    await page.waitForURL((url) => url.href !== 'about:blank', { waitUntil: 'commit' });
    // The tracker applies from the next page on. Load again any page that was already past the splash.
    for (const open of app.windows()) {
      if (!open.isClosed() && open.url() !== 'about:blank' && !splashPage.test(open.url())) {
        await open.reload().catch(() => {}); // a window replaced meanwhile has closed
      }
    }
    return { app, page, cspViolations };
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

/**
 * Waits until the app's only window shows the library (its Sessions heading, or the empty state an empty library
 * shows in its place) and returns that window. The app opens in a new window that replaces the splash's, so this is
 * not the window `launchApp` returned when the app started on the splash.
 */
export async function libraryPage(app: ElectronApplication): Promise<Page> {
  let found: Page | null = null;
  await expect
    .poll(async () => {
      const open = app.windows().filter((p) => !p.isClosed());
      if (open.length !== 1) return false;
      const heading = open[0]!.getByRole('heading', { name: /^(Sessions|No sessions yet)$/ });
      if (!(await heading.isVisible().catch(() => false))) return false;
      found = open[0]!;
      return true;
    })
    .toBe(true);
  return found!;
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
