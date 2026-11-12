import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCsvBytes, parseFlightScopeCsv, type ParseResult } from '@fsa/csv-parser';
import type { Shot } from '@fsa/domain';

export const FIXTURE_DIR = join(__dirname, '../../../fixtures/flightscope');

export function fixtureParse(name: string): ParseResult {
  const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, `${name}.csv`)));
  return parseFlightScopeCsv(decodeCsvBytes(bytes).text, `${name}.csv`);
}

/** `name` is the fixture file name without `.csv`, e.g. 'FlightScope Golf Session Sept 19 2022'. */
export function fixtureShots(name: string): Shot[] {
  return fixtureParse(name).shots.map((s) => ({ ...s, fileId: 'f1', id: `f1:${s.sourceRow}` }));
}

export const SEPT_19_2022 = 'FlightScope Golf Session Sept 19 2022';
export const ALL_FIXTURES = [
  'FlightScope Golf Session Sept 19 2022',
  'FlightScope Golf Session Sept 19',
  'FlightScope Golf Session',
];
