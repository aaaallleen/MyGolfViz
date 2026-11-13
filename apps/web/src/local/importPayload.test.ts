import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { decodeCsvBytes, parseFlightScopeCsv } from '@fsa/csv-parser';
import { toFileManifest } from './importPayload';

const FIXTURES = join(__dirname, '../../../../fixtures/flightscope');
const PAYLOADS = join(FIXTURES, 'payloads');
const csvs = readdirSync(FIXTURES).filter((f) => f.endsWith('.csv'));

function manifestFor(csv: string) {
  const bytes = new Uint8Array(readFileSync(join(FIXTURES, csv)));
  const { text } = decodeCsvBytes(bytes);
  return toFileManifest('file0', parseFlightScopeCsv(text, csv), false);
}

describe('import payload', () => {
  test('three fixtures', () => expect(csvs).toHaveLength(3));

  test.each(csvs)('payload fixtures are up to date: %s', (csv) => {
    const fresh = manifestFor(csv);
    const target = join(PAYLOADS, csv.replace(/\.csv$/, '.json'));
    if (process.env.UPDATE_PAYLOADS === '1') {
      mkdirSync(PAYLOADS, { recursive: true });
      writeFileSync(target, JSON.stringify(fresh, null, 2) + '\n');
    }
    expect(existsSync(target)).toBe(true);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh))); // JSON turns -0 into 0
  });

  test('manifest keeps nulls', () => {
    const m = manifestFor('FlightScope Golf Session Sept 19 2022.csv');
    expect(m.shots[0]!.m.impactLateral).toBeNull();
    expect(JSON.parse(JSON.stringify(m)).shots[0].m.impactLateral).toBeNull();
  });
});
