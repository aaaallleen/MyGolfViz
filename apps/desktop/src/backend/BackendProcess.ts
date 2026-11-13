import { spawn, type ChildProcess } from 'node:child_process';
import { parsePortLine } from './portLine';

const STDERR_TAIL_LINES = 50;
const MAX_PARTIAL_LINE = 64 * 1024;
const HEALTH_POLL_MS = 100;

export class BackendStartError extends Error {
  constructor(
    public kind: 'already-running' | 'failed' | 'timeout',
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
  startupTimeoutMs?: number;
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
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const spawnImpl = this.opts.spawnImpl ?? spawn;
    const deadline = Date.now() + timeoutMs;

    const child = spawnImpl(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    const pid = child.pid;
    child.stdin?.on('error', () => {});

    let onPort: (p: { port: number; url: string }) => void = () => {};
    const portSeen = new Promise<{ port: number; url: string }>((resolve) => (onPort = resolve));
    let gotPort = false;

    lineReader(child.stdout!, (line) => {
      if (!gotPort) {
        const parsed = parsePortLine(line);
        if (parsed) {
          gotPort = true;
          onPort(parsed);
          return;
        }
      }
      onLog?.(line);
    });
    lineReader(child.stderr!, (line) => {
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
      onLog?.(`[api] ${line}`);
    });

    // 'close' (not 'exit') for start failure so stderr is fully read first.
    const closed = new Promise<{ code: number | null }>((resolve) => {
      child.once('close', (code) => resolve({ code }));
    });
    child.once('exit', (code, signal) => {
      this.exitInfo = { code, signal };
      for (const w of this.exitWaiters.splice(0)) w();
      if (this.started && !this.stopping) this.unexpectedCb?.(code, signal);
    });
    child.once('error', () => {
      // spawn failure: no 'exit' will fire, 'close' resolves the race below.
      if (!this.exitInfo) {
        this.exitInfo = { code: null, signal: null };
        for (const w of this.exitWaiters.splice(0)) w();
      }
    });

    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(0, deadline - Date.now()));
    });

    const fail = async (kind: 'failed' | 'timeout', exitCode: number | null, msg: string): Promise<never> => {
      this.forceKill();
      throw new BackendStartError(kind, exitCode, msg);
    };

    try {
      const first = await Promise.race([
        portSeen.then((p) => ({ t: 'port' as const, p })),
        closed.then((c) => ({ t: 'closed' as const, code: c.code })),
        timedOut.then(() => ({ t: 'timeout' as const })),
      ]);
      if (first.t === 'closed') return this.exitFailure(first.code);
      if (first.t === 'timeout') return await fail('timeout', null, 'Backend did not print a port line in time');

      const origin = `http://127.0.0.1:${first.p.port}`;
      const healthy = this.pollHealth(origin, fetchImpl, deadline);
      const second = await Promise.race([
        healthy.then((ok) => ({ t: 'health' as const, ok })),
        closed.then((c) => ({ t: 'closed' as const, code: c.code })),
      ]);
      if (second.t === 'closed') return this.exitFailure(second.code);
      if (!second.ok) {
        return await fail('timeout', null, 'Backend health check did not return 200 in time');
      }
      this.started = true;
      return { url: first.p.url, pid: pid! };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolves true once health returns 200, false at the deadline. Stops early if the child exits. */
  private async pollHealth(origin: string, fetchImpl: typeof fetch, deadline: number): Promise<boolean> {
    while (Date.now() < deadline && !this.exitInfo) {
      try {
        const remaining = Math.max(1, deadline - Date.now());
        const res = await fetchImpl(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(Math.min(1000, remaining)) });
        if (res.status === 200) return true;
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
