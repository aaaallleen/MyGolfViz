import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from '@fsa/csv-parser';
import { buildWorkingSet, stageFiles, type IncomingFile } from './staging';

const DIR = join(__dirname, '../../../../fixtures/flightscope');
const F1 = 'FlightScope Golf Session Sept 19 2022.csv';
const F2 = 'FlightScope Golf Session Sept 19.csv';
const F3 = 'FlightScope Golf Session.csv';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

async function incoming(fixture: string, name = fixture): Promise<IncomingFile> {
  const bytes = new Uint8Array(readFileSync(join(DIR, fixture)));
  const { text } = decodeCsvBytes(bytes);
  return { name, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes), parse: parseFlightScopeCsv(text, name) };
}
const counter = () => { let n = 0; return () => `k${++n}`; };

describe('staging', () => {
  test('same bytes under two names: second is duplicateOf first, include false', async () => {
    const a = await incoming(F1, 'a.csv');
    const b = await incoming(F1, 'b.csv');
    const s = stageFiles([], [a, b], counter());
    expect(s[0]).toMatchObject({ key: 'k1', duplicateOf: null, include: true });
    expect(s[1]).toMatchObject({ key: 'k2', duplicateOf: 'k1', include: false });
  });
  test('duplicates are detected against existing staged files', async () => {
    const mk = counter();
    const first = stageFiles([], [await incoming(F1)], mk);
    const next = stageFiles(first, [await incoming(F1, 'again.csv')], mk);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ duplicateOf: 'k1', include: false });
  });
  test('same name with different bytes is not a duplicate', async () => {
    const a = await incoming(F1, 'same.csv');
    const b = await incoming(F2, 'same.csv');
    const s = stageFiles([], [a, b], counter());
    expect(s[1]).toMatchObject({ duplicateOf: null, include: true });
  });
  test('invalid parse is staged with include false', async () => {
    const bad = parseFlightScopeCsv('', 'bad.csv');
    const f: IncomingFile = { name: 'bad.csv', byteLength: 0, sha256: 'deadbeef', parse: bad };
    const s = stageFiles([], [f], counter());
    expect(bad.ok).toBe(false);
    expect(s[0]).toMatchObject({ include: false, duplicateOf: null });
  });
  test('buildWorkingSet of the three fixtures in order', async () => {
    const s = stageFiles([], [await incoming(F1), await incoming(F2), await incoming(F3)], counter());
    const ws = buildWorkingSet(s);
    expect(ws.files.map((f) => f.ordinal)).toEqual([1, 2, 3]);
    expect(ws.files.map((f) => f.id)).toEqual(['k1', 'k2', 'k3']);
    expect(ws.files[0]!.parserVersion).toBe(s[0]!.parse.parserVersion);
    expect(ws.shots).toHaveLength(133);
    const first = ws.shots[0]!;
    expect(first.id).toBe('k1:2');
    expect(first.fileId).toBe('k1');
    expect(first.sourceRow).toBe(2);
    const last = ws.shots[132]!;
    expect(last.id).toBe('k3:104');
    expect(last.sourceRow).toBe(104);
  });
  test('excluded or duplicate files contribute no shots', async () => {
    const mk = counter();
    const s = stageFiles([], [await incoming(F1), await incoming(F1, 'dup.csv'), await incoming(F2)], mk);
    s[2] = { ...s[2]!, include: false };
    const ws = buildWorkingSet(s);
    expect(ws.files).toHaveLength(1);
    expect(ws.shots).toHaveLength(16);
  });
  test('ordinals skip excluded files', async () => {
    const s = stageFiles([], [await incoming(F1), await incoming(F1, 'dup.csv'), await incoming(F2)], counter());
    const ws = buildWorkingSet(s);
    expect(ws.files.map((f) => [f.id, f.ordinal])).toEqual([['k1', 1], ['k3', 2]]);
  });
});
