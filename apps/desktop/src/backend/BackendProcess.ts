import { spawn, type ChildProcess } from 'node:child_process';
import { parsePortLine, parseStatusLine } from './portLine';

const STDERR_TAIL_LINES = 50;
const MAX_PARTIAL_LINE = 64 * 1024;
const HEALTH_POLL_MS = 100;
const CLOSE_GRACE_MS = 200;

export class BackendStartError extends Error {
  constructor(
    public kind: 'already-running' | 'failed' | 'timeout' | 'update-timeout',
    public exitCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'BackendStartError';
  }
}

export interface BackendProcessOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** Limit for reaching the port line and a healthy backend; restarts once an upgrade is over. */
  startupTimeoutMs?: number;
  /** Limit for a database upgrade, which the backend announces before its port line. */
  migrationTimeoutMs?: number;
  onStatus?: (status: 'migrating') => void;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  onLog?: (line: string) => void;
}

/** Splits a stream into lines, never buffering more than MAX_PARTIAL_LINE of an unterminated line. */
function lineReader(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let partial = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    partial += chunk;
    let idx: number;
    while ((idx = partial.indexOf('\n')) >= 0) {
      onLine(partial.slice(0, idx).replace(/\r$/, ''));
      partial = partial.slice(idx + 1);
    }
    if (partial.length > MAX_PARTIAL_LINE) {
      onLine(partial);
      partial = '';
    }
  });
  stream.on('end', () => {
    if (partial) onLine(partial);
    partial = '';
  });
}

export class BackendProcess {
  readonly stderrTail: string[] = [];
  private child: ChildProcess | null = null;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  private stopping = false;
  private started = false;
  private unexpectedCb: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
  private exitWaiters: Array<() => void> = [];

  constructor(private readonly opts: BackendProcessOptions) {}

  /** True once the child process has exited. */
  get exited(): boolean {
    return this.exitInfo !== null;
  }

  onUnexpectedExit(cb: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.unexpectedCb = cb;
  }

  async start(): Promise<{ url: string; pid: number }> {
    const { command, args, env, onLog } = this.opts;
    const timeoutMs = this.opts.startupTimeoutMs ?? 30_000;
    const migrationTimeoutMs = this.opts.migrationTimeoutMs ?? 600_000;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const spawnImpl = this.opts.spawnImpl ?? spawn;
    if (this.child) throw new Error('BackendProcess is single-use: start() was already called');
    // The deadline moves: an upgrade announcement extends it, and the port line after an upgrade restarts it.
    let deadline = Date.now() + timeoutMs;
    let migrating = false;
    let timer: NodeJS.Timeout | undefined;
    let onTimeout: () => void = () => {};
    const timedOut = new Promise<void>((resolve) => (onTimeout = resolve));
    let settled = false;
    const armDeadline = (ms: number) => {
      if (settled) return; // start() is over: never leave a timer behind
      deadline = Date.now() + ms;
      clearTimeout(timer);
      timer = setTimeout(onTimeout, ms);
    };
    armDeadline(timeoutMs);

    const child = spawnImpl(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    const pid = child.pid;
    child.stdin?.on('error', () => {});

    let onPort: (p: { port: number; url: string }) => void = () => {};
    const portSeen = new Promise<{ port: number; url: string }>((resolve) => (onPort = resolve));
    let gotPort = false;

    lineReader(child.stdout!, (line) => {
      // After the port line stdout is only drained: the API's access log is in its own rotating log file.
      if (gotPort) return;
      const parsed = parsePortLine(line);
      if (parsed) {
        gotPort = true;
        if (migrating) {
          migrating = false;
          armDeadline(timeoutMs);
        }
        onPort(parsed);
      } else if (parseStatusLine(line) === 'migrating') {
        migrating = true;
        armDeadline(migrationTimeoutMs);
        onLog?.('backend is upgrading the database');
        this.opts.onStatus?.('migrating');
      } else {
        onLog?.(line);
      }
    });
    lineReader(child.stderr!, (line) => {
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
      onLog?.(`[api] ${line}`);
    });

    // Settles when the child is gone: on 'close' (stdio fully drained, so stderrTail is complete),
    // or CLOSE_GRACE_MS after 'exit' if something else (a grandchild) still holds the pipes open.
    let settleExit: () => void = () => {};
    const exitSettled = new Promise<void>((resolve) => (settleExit = resolve));
    child.once('close', () => settleExit());
    child.once('exit', (code, signal) => {
      this.exitInfo = { code, signal };
      for (const w of this.exitWaiters.splice(0)) w();
      setTimeout(settleExit, CLOSE_GRACE_MS).unref();
      if (this.started && !this.stopping) this.unexpectedCb?.(code, signal);
    });
    child.once('error', (err) => {
      // Only a failed spawn (no pid) means the process never ran; later errors (e.g. kill) do not.
      if (child.pid !== undefined) return;
      const line = `spawn failed: ${err.message}`;
      this.stderrTail.push(line);
      onLog?.(`[api] ${line}`);
      this.exitInfo = { code: null, signal: null };
      for (const w of this.exitWaiters.splice(0)) w();
      settleExit();
    });

    // The wait ended without success: a child that already exited is a failure, not a timeout.
    const failure = (msg: string): never => {
      if (this.exitInfo) return this.exitFailure(this.exitInfo.code);
      this.forceKill();
      if (migrating) throw new BackendStartError('update-timeout', null, 'Database upgrade did not finish in time');
      throw new BackendStartError('timeout', null, msg);
    };

    try {
      const first = await Promise.race([
        portSeen.then((p) => ({ p })),
        exitSettled.then(() => null),
        timedOut.then(() => null),
      ]);
      if (!first) return failure('Backend did not print a port line in time');

      const origin = `http://127.0.0.1:${first.p.port}`;
      const healthy = this.pollHealth(origin, fetchImpl, () => deadline);
      const ok = await Promise.race([
        healthy,
        exitSettled.then(() => false),
        timedOut.then(() => false),
      ]);
      if (!ok) return failure('Backend health check did not return 200 in time');
      this.started = true;
      return { url: first.p.url, pid: pid! };
    } finally {
      settled = true;
      clearTimeout(timer);
    }
  }

  /** Resolves true once health returns 200, false at the deadline. Stops early if the child exits. */
  private async pollHealth(origin: string, fetchImpl: typeof fetch, deadline: () => number): Promise<boolean> {
    while (Date.now() < deadline() && !this.exitInfo) {
      try {
        const remaining = Math.max(1, deadline() - Date.now());
        const res = await fetchImpl(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(Math.min(1000, remaining)) });
        if (res.status === 200) return true;
        void res.body?.cancel().catch(() => {});
      } catch {
        /* not ready yet */
      }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
    }
    return false;
  }

  private exitFailure(code: number | null): never {
    if (code === 3) {
      throw new BackendStartError('already-running', 3, 'MyGolfViz is already running with this data folder');
    }
    throw new BackendStartError('failed', code, `Backend exited during startup (code ${code})`);
  }

  private forceKill(): void {
    if (this.child && !this.exitInfo) this.child.kill('SIGKILL');
  }

  private waitForExit(ms: number): Promise<boolean> {
    if (this.exitInfo) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      this.exitWaiters.push(() => {
        clearTimeout(t);
        resolve(true);
      });
    });
  }

  async stop(timeoutMs = 5000): Promise<void> {
    const child = this.child;
    if (!child || this.exitInfo) return;
    this.stopping = true;
    child.stdin?.end();
    child.kill('SIGTERM');
    if (await this.waitForExit(timeoutMs)) return;
    child.kill('SIGKILL');
    await this.waitForExit(2000);
  }
}
