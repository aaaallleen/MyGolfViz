import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackendProcess, BackendStartError } from './BackendProcess';

const fake = path.resolve(__dirname, '../../test/fake-backend.mjs');
const live: BackendProcess[] = [];
const pids: number[] = [];
let tmp: string | undefined;

function make(mode: string, extra: { startupTimeoutMs?: number; env?: NodeJS.ProcessEnv } = {}) {
  const bp = new BackendProcess({
    command: process.execPath,
    args: [fake, mode],
    env: { ...process.env, ...extra.env },
    startupTimeoutMs: extra.startupTimeoutMs,
  });
  live.push(bp);
  return bp;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

async function startedPid(bp: BackendProcess) {
  const r = await bp.start();
  pids.push(r.pid);
  return r;
}

afterEach(async () => {
  await Promise.all(live.splice(0).map((b) => b.stop(200).catch(() => {})));
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('BackendProcess', () => {
  it('starts, reports url and pid, and stops cleanly', async () => {
    const bp = make('ok');
    const { url, pid } = await startedPid(bp);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=t$/);
    expect(alive(pid)).toBe(true);
    const t0 = Date.now();
    await bp.stop();
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(await until(() => !alive(pid), 1000)).toBe(true);
  });

  it('keeps draining stdout and stderr after the port line', async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'bp-'));
    const marker = path.join(tmp, 'marker');
    const logs: string[] = [];
    const bp = new BackendProcess({
      command: process.execPath,
      args: [fake, 'chatty'],
      env: { ...process.env, FAKE_MARKER: marker },
      onLog: (l) => logs.push(l),
    });
    live.push(bp);
    await startedPid(bp);
    expect(await until(() => existsSync(marker), 5000)).toBe(true);
    expect(bp.stderrTail.length).toBeLessThanOrEqual(50);
    expect(bp.stderrTail.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.startsWith('[api] x'))).toBe(true);
    // stdout after the port line is drained but never logged (the API has its own access log).
    expect(logs.some((l) => l.startsWith('x'))).toBe(false);
  });

  it('maps exit 3 to already-running', async () => {
    const err = await make('exit3').start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('already-running');
    expect(err.exitCode).toBe(3);
  });

  it('maps exit 4 to failed and keeps the stderr tail', async () => {
    const bp = make('exit4');
    const err = await bp.start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('failed');
    expect(err.exitCode).toBe(4);
    expect(bp.stderrTail.join('\n')).toContain("MyGolfViz couldn't start: boom");
  });

  it('times out when no port line arrives and kills the child', async () => {
    const bp = make('silent', { startupTimeoutMs: 500 });
    const err = await bp.start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('timeout');
    expect(err.exitCode).toBeNull();
    // child must be gone shortly after rejection
    const gone = await until(() => bp.exited, 2000);
    expect(gone).toBe(true);
  });

  it('times out when health never returns 200', async () => {
    const bp = new BackendProcess({
      command: process.execPath,
      args: [fake, 'ok'],
      env: process.env,
      startupTimeoutMs: 500,
      fetchImpl: (async () => new Response('no', { status: 503 })) as typeof fetch,
    });
    live.push(bp);
    const err = await bp.start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('timeout');
    expect(await until(() => bp.exited, 2000)).toBe(true);
  });

  it('fires onUnexpectedExit once when the child is killed', async () => {
    const bp = make('ok');
    const calls: Array<[number | null, NodeJS.Signals | null]> = [];
    bp.onUnexpectedExit((c, s) => calls.push([c, s]));
    const { pid } = await startedPid(bp);
    process.kill(pid, 'SIGKILL');
    expect(await until(() => calls.length > 0, 3000)).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toEqual([[null, 'SIGKILL']]);
  });

  it('does not fire onUnexpectedExit after stop()', async () => {
    const bp = make('ok');
    let n = 0;
    bp.onUnexpectedExit(() => n++);
    await startedPid(bp);
    await bp.stop();
    await new Promise((r) => setTimeout(r, 200));
    expect(n).toBe(0);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const bp = make('ignore-term');
    const { pid } = await startedPid(bp);
    const t0 = Date.now();
    await bp.stop(500);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(await until(() => !alive(pid), 1000)).toBe(true);
  });

  it('reports failed (not timeout) when a grandchild keeps the pipes open after exit 4', async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'bp-'));
    const marker = path.join(tmp, 'gc-pid');
    const bp = make('grandchild', { env: { FAKE_MARKER: marker }, startupTimeoutMs: 5000 });
    try {
      const err = await bp.start().then(() => null, (e) => e);
      expect(err).toBeInstanceOf(BackendStartError);
      expect(err.kind).toBe('failed');
      expect(err.exitCode).toBe(4);
      expect(bp.stderrTail.join('\n')).toContain('grandchild');
    } finally {
      if (existsSync(marker)) {
        try {
          process.kill(Number(readFileSync(marker, 'utf8')), 'SIGKILL');
        } catch {
          /* gone */
        }
      }
    }
  });

  it('reports failed with a reason when the binary does not exist', async () => {
    const bp = new BackendProcess({ command: '/nonexistent/mygolfviz-api', args: [], env: process.env });
    live.push(bp);
    const err = await bp.start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('failed');
    expect(bp.stderrTail.join('\n')).toContain('ENOENT');
  });

  it('reports failed with its code when the child exits during the health poll', async () => {
    const bp = make('die-unhealthy', { startupTimeoutMs: 5000 });
    const err = await bp.start().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(BackendStartError);
    expect(err.kind).toBe('failed');
    expect(err.exitCode).toBe(5);
  });

  it('cancels the body of non-200 health responses', async () => {
    let cancelled = false;
    const bp = new BackendProcess({
      command: process.execPath,
      args: [fake, 'ok'],
      env: process.env,
      startupTimeoutMs: 600,
      fetchImpl: (async () =>
        new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), { status: 503 })) as typeof fetch,
    });
    live.push(bp);
    await bp.start().catch(() => {});
    expect(cancelled).toBe(true);
  });

  it('enforces the deadline even if fetchImpl ignores the abort signal', async () => {
    const bp = new BackendProcess({
      command: process.execPath,
      args: [fake, 'ok'],
      env: process.env,
      startupTimeoutMs: 500,
      fetchImpl: (() => new Promise(() => {})) as typeof fetch,
    });
    live.push(bp);
    const t0 = Date.now();
    const err = await bp.start().then(() => null, (e) => e);
    expect(err.kind).toBe('timeout');
    expect(Date.now() - t0).toBeLessThan(2500);
  });

  it('is single-use', async () => {
    const bp = make('ok');
    await startedPid(bp);
    await expect(bp.start()).rejects.toThrow(/single-use/);
  });

  it('stop() can be called twice', async () => {
    const bp = make('ok');
    await startedPid(bp);
    await Promise.all([bp.stop(), bp.stop()]);
    await expect(bp.stop()).resolves.toBeUndefined();
  });

  it('never fires onUnexpectedExit after a failed start', async () => {
    const bp = make('exit4');
    let n = 0;
    bp.onUnexpectedExit(() => n++);
    await bp.start().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    expect(n).toBe(0);
  });
});
