import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The local build must contain the API client; if it does not, the local code was eliminated by mistake. */
export function verifyLocalBuild(distDir) {
  const problems = [];
  if (!existsSync(join(distDir, 'index.html'))) problems.push('index.html is missing');
  const found = existsSync(distDir) && walk(distDir).some((f) => extname(f) === '.js' && readFileSync(f, 'utf8').includes('/api/v1/'));
  if (!found) problems.push('no .js file contains "/api/v1/"');
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/verify-local-build.mjs <dist-dir>');
    process.exit(2);
  }
  const { ok, problems } = verifyLocalBuild(dir);
  if (!ok) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log(`verify-local-build: ${dir} contains the API client`);
}
