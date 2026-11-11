import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = resolve(__dirname, '..');

const FIXTURE_SHA256: Record<string, string> = {
  'FlightScope Golf Session Sept 19 2022.csv': 'bb1cb2f252566342c034f6d9f6b3541894e7ccef1f0cd36ae82fd5ffd2975cdb',
  'FlightScope Golf Session Sept 19.csv': 'd84e6080c57fd31690c06465ea8d72ae7de93dda5a89bc14ced8498a8e4b2b95',
  'FlightScope Golf Session.csv': 'a879724ea351be55d638bd78a731f297929adba7113a0460caed46830203b797',
};

const PACKAGES = ['domain', 'csv-parser', 'analytics', 'visualizations', 'ui'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('repo scaffold', () => {
  test('fixtures are byte-identical copies of the demo exports', () => {
    const dir = join(ROOT, 'fixtures', 'flightscope');
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(Object.keys(FIXTURE_SHA256).sort());
    for (const [name, sha] of Object.entries(FIXTURE_SHA256)) {
      const hash = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
      expect(hash, name).toBe(sha);
    }
  });

  test.each(PACKAGES)('%s exposes src/index.ts', (pkg) => {
    expect(existsSync(join(ROOT, 'packages', pkg, 'src', 'index.ts'))).toBe(true);
  });

  test('shared packages never import the app, network clients or browser storage', () => {
    const forbidden = [
      /from\s+['"][^'"]*apps\//,
      /from\s+['"]@fsa\/web/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.serviceWorker/,
    ];
    const files = PACKAGES.flatMap((pkg) => walk(join(ROOT, 'packages', pkg, 'src')))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const re of forbidden) expect(re.test(text), `${f} matches ${re}`).toBe(false);
    }
  });
});
