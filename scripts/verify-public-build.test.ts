import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
// @ts-expect-error plain .mjs module without type declarations
import { verifyPublicBuild } from './verify-public-build.mjs';

const verify = verifyPublicBuild as (dir: string) => { ok: boolean; problems: string[] };
const dirs: string[] = [];

function makeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fsa-dist-'));
  dirs.push(dir);
  const all = { 'index.html': '<!doctype html><script type="module" src="/fsa/assets/a.js"></script>', ...files };
  for (const [name, body] of Object.entries(all)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('verifyPublicBuild', () => {
  test('clean dist passes', () => {
    const dir = makeDist({ 'assets/a.js': 'console.log(1)' });
    expect(verify(dir)).toEqual({ ok: true, problems: [] });
  });

  test("a js file with 'localStorage.setItem' fails naming the file", () => {
    const dir = makeDist({ 'assets/bad.js': 'localStorage.setItem("a","b")' });
    const r = verify(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/assets\/bad\.js.*localStorage/);
  });

  test('a .csv in dist fails', () => {
    const dir = makeDist({ 'data/session.csv': 'a,b' });
    const r = verify(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/session\.csv/);
  });

  test('index.html with https:// script src fails', () => {
    const dir = makeDist({ 'index.html': '<script src="https://cdn.example.com/x.js"></script>' });
    const r = verify(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/https:\/\/cdn\.example\.com/);
  });

  test('missing index.html fails', () => {
    const dir = makeDist({});
    rmSync(join(dir, 'index.html'));
    expect(verify(dir).ok).toBe(false);
  });
});
