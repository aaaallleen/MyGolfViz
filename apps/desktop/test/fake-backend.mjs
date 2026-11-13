// Fake backend for BackendProcess tests. Usage: node fake-backend.mjs <mode>
// Env: FAKE_MARKER = file written once the chatty output has fully flushed.
//      FAKE_MIGRATE_MS = how long the 'migrating' mode spends upgrading before it serves.
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const mode = process.argv[2] ?? 'ok';

if (mode === 'exit3') {
  process.stderr.write('MyGolfViz is already running with this data folder\n', () => process.exit(3));
} else if (mode === 'exit4') {
  process.stderr.write("MyGolfViz couldn't start: boom\n", () => process.exit(4));
} else if (mode === 'grandchild') {
  // A grandchild inherits stdout/stderr and outlives us, so 'close' lags 'exit'. Its pid goes to FAKE_MARKER.
  const gc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
  fs.writeFileSync(process.env.FAKE_MARKER, String(gc.pid));
  process.stderr.write("MyGolfViz couldn't start: grandchild\n", () => process.exit(4));
} else if (mode === 'migrating') {
  process.stdout.write(JSON.stringify({ status: 'migrating' }) + '\n');
  setTimeout(serve, Number(process.env.FAKE_MIGRATE_MS ?? 500));
} else if (mode === 'silent') {
  setInterval(() => {}, 1000);
} else {
  serve();
}

function serve() {
  const server = http.createServer((req, res) => {
    res.statusCode = req.url === '/api/v1/health' ? (mode === 'die-unhealthy' ? 503 : 200) : 404;
    res.end('{}');
  });
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    process.stdout.write(JSON.stringify({ port, url: `http://127.0.0.1:${port}/?token=t` }) + '\n');
    if (mode === 'die-unhealthy') setTimeout(() => process.exit(5), 150);
    if (mode === 'ignore-term') {
      process.on('SIGTERM', () => {});
      return;
    }
    process.on('SIGTERM', () => process.exit(0));
    process.stdin.on('end', () => process.exit(0));
    process.stdin.resume();
    if (mode === 'chatty') {
      const chunk = 'x'.repeat(1023) + '\n';
      const blob = chunk.repeat(4 * 1024);
      let pending = 2;
      const done = () => {
        if (--pending === 0 && process.env.FAKE_MARKER) fs.writeFileSync(process.env.FAKE_MARKER, 'done');
      };
      process.stdout.write(blob, done);
      process.stderr.write(blob, done);
    }
  });
}
