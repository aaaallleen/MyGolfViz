import { mkdtempSync, existsSync, rmSync } from 'node:fs';
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
    expect(logs.some((l) => l.startsWith('x'))).toBe(true);
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
});
