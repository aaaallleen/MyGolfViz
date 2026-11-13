import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDesktopLog } from './desktopLog';

describe('openDesktopLog', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mygolfviz-desktoplog-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the logs folder and appends timestamped lines', async () => {
    const file = path.join(dir, 'logs', 'mygolfviz-desktop.log');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, 'earlier\n');
    const log = openDesktopLog(file);
    log.write('backend ready');
    log.write('[api] INFO started');
    await log.close();

    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(lines[0]).toBe('earlier');
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z backend ready$/);
    expect(lines[2]).toMatch(/ \[api\] INFO started$/);
  });

  it('creates a missing logs folder', async () => {
    const file = path.join(dir, 'logs', 'mygolfviz-desktop.log');
    const log = openDesktopLog(file);
    log.write('hello');
    await log.close();
    expect(fs.readFileSync(file, 'utf8')).toMatch(/ hello\n$/);
  });

  it('never writes a token', async () => {
    const file = path.join(dir, 'mygolfviz-desktop.log');
    const log = openDesktopLog(file);
    log.write("load failed: ERR_ABORTED loading 'http://127.0.0.1:5000/?token=s3cr3t-Value_1&x=1'");
    await log.close();
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toContain('s3cr3t');
    expect(text).toContain('token=REDACTED&x=1');
  });

  it('ignores writes after close', async () => {
    const file = path.join(dir, 'mygolfviz-desktop.log');
    const log = openDesktopLog(file);
    await log.close();
    expect(() => log.write('late')).not.toThrow();
  });
});
