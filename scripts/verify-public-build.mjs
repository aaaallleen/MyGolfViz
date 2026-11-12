import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_EXT = new Set(['.csv', '.py', '.sqlite', '.sqlite3', '.db', '.env']);
const SCANNED_EXT = new Set(['.js', '.html', '.css']);
const FORBIDDEN_STRINGS = ['/api/', 'localStorage', 'sessionStorage', 'indexedDB', 'serviceWorker', 'document.cookie', 'sendBeacon'];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Static privacy check of a built dist directory. */
export function verifyPublicBuild(distDir) {
  const problems = [];
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) problems.push('index.html is missing');

  for (const file of walk(distDir)) {
    const rel = relative(distDir, file).split('\\').join('/');
    const ext = extname(file).toLowerCase();
    if (FORBIDDEN_EXT.has(ext) || rel.split('/').pop().toLowerCase() === '.env') {
      problems.push(`${rel}: forbidden file type ${ext || '.env'}`);
    }
    if (SCANNED_EXT.has(ext)) {
      const text = readFileSync(file, 'utf8');
      for (const s of FORBIDDEN_STRINGS) {
        if (text.includes(s)) problems.push(`${rel}: contains forbidden string "${s}"`);
      }
    }
  }

  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]*)/gi)) {
      problems.push(`index.html: external reference ${m[1]}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/verify-public-build.mjs <dist-dir>');
    process.exit(2);
  }
  const { ok, problems } = verifyPublicBuild(dir);
  if (!ok) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log(`verify-public-build: ${dir} is clean`);
}
