// Regenerates the local API's TypeScript types from the backend, or (--check) fails if the committed copies are stale.
//
//   npm run api:types          write apps/web/src/local/openapi.json and api-types.ts
//   npm run api:types:check    regenerate into a temp folder and compare (part of ci:local)
//
// openapi-typescript needs TypeScript's JavaScript API, which TypeScript 7 does not have. It lives in the
// tools/api-typegen workspace with its own TypeScript 5.9.3, so it is resolved from there, never from the root.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const committed = {
  schema: join(root, 'apps/web/src/local/openapi.json'),
  types: join(root, 'apps/web/src/local/api-types.ts'),
};
const check = process.argv.includes('--check');

const fromTypegen = createRequire(join(root, 'tools/api-typegen/package.json'));
const cli = join(dirname(fromTypegen.resolve('openapi-typescript/package.json')), 'bin/cli.js');

const out = check ? mkdtempSync(join(tmpdir(), 'api-types-')) : null;
const target = out ? { schema: join(out, 'openapi.json'), types: join(out, 'api-types.ts') } : committed;

try {
  const schema = execFileSync('uv', ['run', '--project', 'apps/api', 'python', '-m', 'mygolfviz_api.openapi_dump'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  writeFileSync(target.schema, schema);
  execFileSync(process.execPath, [cli, target.schema, '-o', target.types], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

  if (check) {
    const stale = Object.keys(committed).filter(
      (k) => readFileSync(committed[k], 'utf8') !== readFileSync(target[k], 'utf8'),
    );
    if (stale.length) {
      console.error(`api-types: out of date: ${stale.map((k) => committed[k].slice(root.length + 1)).join(', ')}. Run \`npm run api:types\`.`);
      process.exit(1);
    }
    console.log('api-types: openapi.json and api-types.ts match the backend');
  } else {
    console.log('api-types: wrote apps/web/src/local/openapi.json and api-types.ts');
  }
} finally {
  if (out) rmSync(out, { recursive: true, force: true });
}
