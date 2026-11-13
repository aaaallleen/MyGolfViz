import fs from 'node:fs';
import path from 'node:path';

const TOKEN_RE = /(token=)[^&\s"'#]+/g;

export interface DesktopLog {
  /** Appends one timestamped line. Any `token=<value>` is redacted. */
  write(line: string): void;
  /** Flushes and closes the file; later writes are dropped. */
  close(): Promise<void>;
}

/** Appends lifecycle events and backend output to `<dataDir>/logs/mygolfviz-desktop.log`. */
export function openDesktopLog(file: string): DesktopLog {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { flags: 'a' });
  stream.on('error', () => {});
  let closed = false;
  return {
    write(line) {
      if (closed) return;
      stream.write(`${new Date().toISOString()} ${line.replace(TOKEN_RE, '$1REDACTED')}\n`);
    },
    close() {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise((resolve) => stream.end(() => resolve()));
    },
  };
}
