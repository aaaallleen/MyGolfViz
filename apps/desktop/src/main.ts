import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BackendProcess, BackendStartError } from './backend/BackendProcess';
import { backendCommand } from './backend/command';
import { resolveDataDir } from './dataDir';
import { openDesktopLog, type DesktopLog } from './desktopLog';
import { buildMenuTemplate } from './menu';
import { allowedChannels, classifyNavigation } from './navigation';
import { SPLASH_UPDATING, startupErrorCopy, type StartupErrorKind } from './startupError';
import { clampToDisplays, loadWindowState, saveWindowState } from './windowState';

declare global {
  // Test hook, set only when MYGOLFVIZ_E2E=1.
  var __mygolfviz: { backendPid(): number | null; appOrigin(): string | null } | undefined;
}

const APP_NAME = 'MyGolfViz';
const DEFAULT_SIZE = { width: 1200, height: 800 };
const STOP_TIMEOUT_MS = 5000;
const DETAIL_LINES = 20;
const CRASH_RELOAD_INTERVAL_MS = 10_000;
const BACKGROUND = '#0d1210';

const staticDir = path.join(__dirname, '..', 'static');
const splashFile = path.join(staticDir, 'splash.html');
const errorFile = path.join(staticDir, 'error.html');
const repoRoot = path.resolve(__dirname, '..', '..', '..');

/** What the window shows, or would show if it were open. */
type Page =
  | { kind: 'splash'; message?: string }
  | { kind: 'app'; url: string }
  | { kind: 'error'; query: Record<string, string> };

let win: BrowserWindow | null = null;
let page: Page = { kind: 'splash' };
let backend: BackendProcess | null = null;
let backendPid: number | null = null;
let appOrigin: string | null = null;
/** Bumped by every start, restart and quit; a start whose generation is stale is ignored. */
let generation = 0;
let restarting: Promise<void> | null = null;
let lastCrashReload = 0;
let quitState: 'running' | 'stopping' | 'done' = 'running';

app.setName(APP_NAME);
const dataDir = resolveDataDir(process.env, app.getPath('appData'));
const userDataDir = path.join(dataDir, 'electron');
const logsDir = path.join(dataDir, 'logs');
const windowStateFile = path.join(userDataDir, 'window-state.json');

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Startup failed before the window and logs exist: the error page cannot work, so use a native dialog. */
function failStartup(reason: string): void {
  console.error(`MyGolfViz couldn't start: ${reason}`);
  dialog.showErrorBox("MyGolfViz couldn't start", reason);
  app.exit(1);
}

function main(): void {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    app.setPath('userData', userDataDir);
  } catch (err) {
    failStartup(`The data folder ${dataDir} could not be created: ${errorMessage(err)}`);
    return;
  }
  if (!app.requestSingleInstanceLock()) {
    // Another instance owns this data folder; it focuses its window on 'second-instance'.
    app.quit();
    return;
  }
  let log: DesktopLog;
  try {
    log = openDesktopLog(path.join(logsDir, 'mygolfviz-desktop.log'));
  } catch (err) {
    failStartup(`The logs folder ${logsDir} could not be created: ${errorMessage(err)}`);
    return;
  }
  run(log);
}

main();

function run(log: DesktopLog): void {
  log.write(`app starting (version ${app.getVersion()}, ${app.isPackaged ? 'packaged' : 'development'})`);

  if (process.env.MYGOLFVIZ_E2E === '1') {
    globalThis.__mygolfviz = { backendPid: () => backendPid, appOrigin: () => appOrigin };
  }

  /** Origin or file name only: never a query string, so never the token. */
  function describeUrl(raw: string): string {
    try {
      const url = new URL(raw);
      if (url.protocol === 'file:') return `file ${path.basename(fileURLToPath(url))}`;
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : `${url.protocol} URL`;
    } catch {
      return 'unparsable URL';
    }
  }

  function show(next: Page): void {
    page = next;
    const w = win;
    if (!w || w.isDestroyed()) return;
    const load =
      next.kind === 'splash'
        ? w.loadFile(splashFile, next.message ? { query: { message: next.message } } : undefined)
        : next.kind === 'error'
          ? w.loadFile(errorFile, { query: next.query })
          : w.loadURL(next.url);
    load.catch((err: unknown) => {
      // A load superseded by the next one rejects with ERR_ABORTED; the log redacts any token.
      log.write(`window load failed: ${errorMessage(err)}`);
    });
  }

  function showError(kind: StartupErrorKind, detail?: string): void {
    appOrigin = null;
    const { title, body } = startupErrorCopy(kind);
    const query: Record<string, string> = { kind, title, body, logs: logsDir };
    if (detail) query.detail = detail;
    show({ kind: 'error', query });
  }

  async function startBackend(): Promise<void> {
    const gen = ++generation;
    appOrigin = null;
    backendPid = null;
    const cmd = backendCommand({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      repoRoot,
      dataDir,
      env: process.env,
    });
    const proc = new BackendProcess({
      ...cmd,
      onLog: (line) => log.write(line),
      onStatus: () => {
        if (gen === generation) show({ kind: 'splash', message: SPLASH_UPDATING });
      },
    });
    backend = proc;
    proc.onUnexpectedExit((code, signal) => {
      if (backend !== proc || quitState !== 'running') return;
      log.write(`backend exited unexpectedly (code ${code}, signal ${signal})`);
      backendPid = null;
      showError('crashed');
    });
    log.write(`starting backend ${cmd.command}`);
    try {
      const { url, pid } = await proc.start();
      if (gen !== generation) {
        // A restart or quit began while this one was starting.
        await proc.stop(STOP_TIMEOUT_MS);
        return;
      }
      backendPid = pid;
      appOrigin = new URL(url).origin;
      log.write(`backend ready (pid ${pid}) at ${appOrigin}`);
      show({ kind: 'app', url });
    } catch (err) {
      // stop() during start() rejects with kind 'failed'; when a restart or quit did that, show nothing.
      if (gen !== generation) return;
      if (err instanceof BackendStartError) {
        log.write(`backend failed to start: ${err.kind} (exit code ${err.exitCode})`);
        const detail = err.kind === 'failed' ? proc.stderrTail.slice(-DETAIL_LINES).join('\n') : undefined;
        showError(err.kind, detail);
      } else {
        log.write(`backend failed to start: ${errorMessage(err)}`);
        showError('failed');
      }
    }
  }

  function restartBackend(): Promise<void> {
    if (quitState !== 'running') return Promise.resolve();
    restarting ??= (async () => {
      log.write('restarting backend');
      generation++;
      appOrigin = null;
      backendPid = null;
      show({ kind: 'splash' });
      const old = backend;
      backend = null;
      try {
        await old?.stop(STOP_TIMEOUT_MS);
      } finally {
        restarting = null;
      }
      if (quitState === 'running') void startBackend();
    })();
    return restarting;
  }

  async function openFolder(dir: string): Promise<void> {
    fs.mkdirSync(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) log.write(`could not open ${path.basename(dir)} folder: ${error}`);
  }
  const openDataFolder = () => openFolder(dataDir);
  const openLogs = () => openFolder(logsDir);
  const fromMenu = (action: () => Promise<void>) => () => {
    action().catch((err: unknown) => log.write(`menu action failed: ${errorMessage(err)}`));
  };

  function guardNavigation(event: { preventDefault(): void }, url: string): void {
    const decision = classifyNavigation(url, appOrigin);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') {
      shell.openExternal(url).catch((err: unknown) => {
        log.write(`could not open ${describeUrl(url)} in the browser: ${errorMessage(err)}`);
      });
    } else {
      log.write(`blocked navigation to ${describeUrl(url)}`);
    }
  }

  function createWindow(): BrowserWindow {
    const primary = screen.getPrimaryDisplay();
    const workAreas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
    const bounds = clampToDisplays(loadWindowState(windowStateFile), workAreas, DEFAULT_SIZE);
    const w = new BrowserWindow({
      ...bounds,
      show: false,
      title: APP_NAME,
      backgroundColor: BACKGROUND,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        additionalArguments: [`--mygolfviz-app-version=${app.getVersion()}`],
      },
    });
    w.once('ready-to-show', () => w.show());
    w.webContents.on('will-navigate', (event) => guardNavigation(event, event.url));
    w.webContents.on('will-redirect', (event) => guardNavigation(event, event.url));
    w.webContents.setWindowOpenHandler(({ url }) => {
      guardNavigation({ preventDefault: () => {} }, url);
      return { action: 'deny' };
    });
    w.webContents.on('did-navigate', (_event, url) => log.write(`window loaded ${describeUrl(url)}`));
    w.webContents.on('render-process-gone', (_event, details) => {
      log.write(`renderer gone: ${details.reason}`);
      if (details.reason === 'clean-exit' || quitState !== 'running') return;
      const now = Date.now();
      if (now - lastCrashReload < CRASH_RELOAD_INTERVAL_MS) {
        // Crashing again right after a reload: do not loop, show the error page instead.
        if (page.kind === 'error' && page.query.kind === 'crashed') return;
        showError('crashed');
        return;
      }
      lastCrashReload = now;
      show(page);
    });
    w.on('close', () => {
      try {
        saveWindowState(windowStateFile, w.getNormalBounds());
      } catch (err) {
        log.write(`could not save window state: ${errorMessage(err)}`);
      }
    });
    w.on('closed', () => {
      if (win === w) win = null;
    });
    win = w;
    show(page);
    return w;
  }

  function isAllowedSender(event: IpcMainInvokeEvent, channel: string): boolean {
    const frame = event.senderFrame;
    if (!win || win.isDestroyed() || event.sender !== win.webContents || !frame || frame.parent !== null) return false;
    return allowedChannels(frame.url, appOrigin, [splashFile, errorFile]).includes(channel);
  }

  function handle(channel: string, action: () => unknown): void {
    ipcMain.handle(`mygolfviz:${channel}`, async (event) => {
      if (!isAllowedSender(event, channel)) {
        log.write(`rejected ${channel} from a page that may not use it`);
        throw new Error('Not allowed');
      }
      await action();
    });
  }

  handle('open-data-folder', openDataFolder);
  handle('open-logs', openLogs);
  handle('restart-backend', restartBackend);
  handle('quit', () => app.quit());

  app.on('second-instance', () => {
    if (!app.isReady() || quitState !== 'running') return;
    const w = win ?? createWindow();
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  app.on('before-quit', (event) => {
    if (quitState === 'done') return;
    event.preventDefault();
    if (quitState === 'stopping') return;
    quitState = 'stopping';
    generation++;
    log.write('quitting: stopping backend');
    const proc = backend;
    const pendingRestart = restarting;
    void (async () => {
      try {
        await proc?.stop(STOP_TIMEOUT_MS);
        await pendingRestart;
      } catch (err) {
        log.write(`error while stopping backend: ${errorMessage(err)}`);
      }
      backendPid = null;
      log.write('backend stopped; quitting');
      await log.close();
      quitState = 'done';
      app.quit();
    })();
  });

  app.on('window-all-closed', () => {
    // macOS apps stay open with no windows; 'activate' brings one back.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (app.isReady() && quitState === 'running' && !win) createWindow();
  });

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(buildMenuTemplate({
          appName: APP_NAME,
          isDev: !app.isPackaged,
          openDataFolder: fromMenu(openDataFolder),
          openLogs: fromMenu(openLogs),
        })),
    );
    createWindow();
    void startBackend();
  });
}
